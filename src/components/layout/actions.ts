'use server';

import { createProject } from '@/lib/data';
import { provisionDatabaseInstance } from '@/lib/aws-rds';
import { checkInstanceSizeLimit, getUserPlan } from '@/lib/limits';
import { getCurrentUserId } from '@/lib/auth';
import crypto from 'crypto';

export async function createProjectAction(formData: FormData) {
  const projectName = formData.get('projectName') as string;
  const dialect = formData.get('dialect') as string;
  const timezone = formData.get('timezone') as string;
  const instanceSize = formData.get('instanceSize') as string;
  const connectionType = (formData.get('connectionType') as string) || 'internal';
  const connectionConfigRaw = formData.get('connectionConfig') as string;
  const connectionConfig = connectionConfigRaw ? JSON.parse(connectionConfigRaw) : {};
  const importMode = (formData.get('importMode') as string) || 'direct';

  if (!projectName) {
    return { error: 'Project name is required.' };
  }

  const actualConnectionType = (connectionType !== 'internal' && importMode === 'import')
    ? 'internal'
    : connectionType;

  try {
    const userId = await getCurrentUserId();
    if (!userId) return { error: 'Unauthorized login required to create a project.' };

    if (instanceSize && actualConnectionType === 'internal') {
        await checkInstanceSizeLimit(userId, instanceSize);
    }

    // 1. Create the project entry in the metadata table
    const project = await createProject(
      projectName, 
      "No description provided", 
      dialect || 'postgresql', 
      timezone,
      actualConnectionType as any,
      actualConnectionType === 'internal' ? {} : connectionConfig
    );

    // If copying database to internal cloud, run the schema & data replication helper
    if (connectionType !== 'internal' && importMode === 'import') {
      try {
        const { replicateExternalDatabase } = await import('@/lib/tenant-pools');
        await replicateExternalDatabase(project.project_id, dialect, connectionConfig);
      } catch (replicationError: any) {
        // Cleanup projects table entry on replication failure
        const { getPgPool } = await import('@/lib/pg');
        const pool = getPgPool();
        await pool.query('DELETE FROM fluxbase_global.projects WHERE project_id = $1', [project.project_id]);
        throw replicationError;
      }
    }

    // 2. Provision the AWS RDS instance if size is specified and it's internal
    if (instanceSize && actualConnectionType === 'internal') {
      const masterUsername = 'fluxadmin_' + crypto.randomBytes(4).toString('hex');
      const masterPassword = 'Flux' + crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'A1!';
      const instanceIdentifier = `fluxbase-tenant-${project.project_id.toLowerCase()}-${Date.now()}`;

      // Trigger the asynchronous AWS RDS API builder
      provisionDatabaseInstance({
        instanceIdentifier,
        engine: dialect === 'mysql' ? 'mysql' : 'postgres',
        masterUsername,
        masterPassword,
        instanceClass: instanceSize
      }).catch(err => {
        console.error(`[AWS Provisioning Error in Background] Project ${project.project_id}:`, err);
      });

      // We can expose this safely mapping the password, or just let them know it's provisioning
      console.log(`[AWS Lifecycle] Spinning up RDS ${instanceIdentifier} for ${project.project_id}`);
    }

    return { success: true, project: project };
  } catch (error: any) {
    console.error('Project creation failed:', error);
    return { error: error.message || 'Failed to create project.' };
  }
}

export async function getAllowedInstanceSizesAction() {
  const userId = await getCurrentUserId();
  if (!userId) return { allowedSizes: ['db.t3.micro'] as string[] }; // Default safe fallback

  try {
    const plan = await getUserPlan(userId);
    // Fetch directly from limits logic to avoid duplication
    switch (plan) {
      case 'max': return { allowedSizes: ['db.t3.micro', 'db.t3.medium', 'db.t3.large'] as string[] };
      case 'pro': return { allowedSizes: ['db.t3.micro', 'db.t3.medium'] as string[] };
      case 'free':
      default: return { allowedSizes: ['db.t3.micro'] as string[] };
    }
  } catch {
    return { allowedSizes: ['db.t3.micro'] as string[] };
  }
}

export async function testExternalConnectionAction(dialect: string, config: any) {
  try {
    if (dialect === 'postgresql') {
      const { Pool } = await import('pg');
      const client = new Pool({
        host: config.host,
        port: parseInt(config.port, 10) || 5432,
        user: config.user,
        password: config.password,
        database: config.database || 'postgres',
        ssl: config.ssl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 5000,
      });
      await client.query('SELECT 1');
      await client.end();
    } else {
      const mysql = await import('mysql2/promise');
      const connection = await mysql.createConnection({
        host: config.host,
        port: parseInt(config.port, 10) || 3306,
        user: config.user,
        password: config.password,
        database: config.database || undefined,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 5000,
      });
      await connection.ping();
      await connection.end();
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to connect to database' };
  }
}

export async function listExternalDatabasesAction(dialect: string, config: any) {
  try {
    if (dialect === 'postgresql') {
      const { Pool } = await import('pg');
      const client = new Pool({
        host: config.host,
        port: parseInt(config.port, 10) || 5432,
        user: config.user,
        password: config.password,
        database: config.database || 'postgres', // default admin db to query list
        ssl: config.ssl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 5000,
      });
      const res = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;');
      await client.end();
      return { success: true, databases: res.rows.map(r => r.datname) };
    } else {
      const mysql = await import('mysql2/promise');
      const connection = await mysql.createConnection({
        host: config.host,
        port: parseInt(config.port, 10) || 3306,
        user: config.user,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 5000,
      });
      const [rows]: any = await connection.query('SHOW DATABASES;');
      await connection.end();
      return { success: true, databases: rows.map((r: any) => Object.values(r)[0]) };
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to list databases' };
  }
}

export async function getProjectDatabasesAction(projectId: string) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    const { getProjectById } = await import('@/lib/data');
    const project = await getProjectById(projectId, userId);
    if (!project) return { success: false, error: 'Project not found' };

    if (project.connection_type !== 'external_server') {
      return { success: false, error: 'Project is not connected to an external server' };
    }

    const config = typeof project.connection_config === 'string'
      ? JSON.parse(project.connection_config)
      : project.connection_config;

    return await listExternalDatabasesAction(project.dialect || 'postgresql', config);
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to list databases' };
  }
}


