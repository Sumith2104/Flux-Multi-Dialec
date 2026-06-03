import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import { type Project } from '@/lib/data';

// Declare global cache for external database pools to avoid leaking connections
declare global {
  var _externalPools: Record<string, any> | undefined;
  var _poolReaperStarted: boolean | undefined;
}

function getExternalPools(): Record<string, any> {
  if (!globalThis._externalPools) {
    globalThis._externalPools = {};
  }
  startPoolReaper();
  return globalThis._externalPools;
}

function startPoolReaper() {
  if (typeof window !== 'undefined') return;
  if (globalThis._poolReaperStarted) return;
  globalThis._poolReaperStarted = true;

  console.log('[TenantPools] Starting Pool Reaper...');
  const EVICTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  setInterval(async () => {
    const pools = globalThis._externalPools || {};
    const now = Date.now();
    for (const [poolId, entry] of Object.entries(pools)) {
      if (entry && entry.pool && entry.lastUsed) {
        if (now - entry.lastUsed > EVICTION_TIMEOUT_MS) {
          console.log(`[TenantPools] Reaper: Evicting inactive pool ${poolId} (unused for ${Math.round((now - entry.lastUsed) / 1000)}s)`);
          try {
            await entry.pool.end();
          } catch (e) {
            console.error(`[TenantPools] Reaper: Error closing inactive pool ${poolId}:`, e);
          }
          delete pools[poolId];
        }
      }
    }
  }, 60000); // Check every minute
}

export function getProjectDbAndSchema(project: Project) {
  const config = typeof project.connection_config === 'string'
    ? JSON.parse(project.connection_config)
    : project.connection_config || {};

  if (!project.connection_type || project.connection_type === 'internal') {
    return {
      dbName: `project_${project.project_id}`,
      schemaName: `project_${project.project_id}`
    };
  } else {
    let dbName = config.database || 'postgres';
    let schemaName = config.schema || 'public';

    if (project.connection_type === 'external_server') {
      if (project.active_db) {
        dbName = project.active_db;
      }
    }

    return {
      dbName,
      schemaName
    };
  }
}
/**
 * Dynamically resolves and caches the PostgreSQL pool for a project.
 */
export async function getTenantPgPool(project: Project): Promise<Pool> {
  if (!project.connection_type || project.connection_type === 'internal') {
    const { getPgPool } = await import('./pg');
    return getPgPool();
  }

  const { dbName } = getProjectDbAndSchema(project);
  const poolId = `pg_${project.project_id}_${dbName}`;
  const pools = getExternalPools();
  if (!pools[poolId]) {
    const config = typeof project.connection_config === 'string'
      ? JSON.parse(project.connection_config)
      : project.connection_config;

    console.log(`[TenantPools] Creating new Postgres pool for external project ${project.project_id} (Host: ${config.host}, Database: ${dbName})`);
    
    const pool = new Pool({
      host: config.host,
      port: parseInt(config.port, 10) || 5432,
      user: config.user,
      password: config.password,
      database: dbName,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 5, // smaller pool for external databases to respect serverless limits
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pools[poolId] = {
      pool,
      lastUsed: Date.now(),
      type: 'pg'
    };
  } else {
    if (!pools[poolId].pool) {
      pools[poolId] = {
        pool: pools[poolId],
        lastUsed: Date.now(),
        type: 'pg'
      };
    } else {
      pools[poolId].lastUsed = Date.now();
    }
  }
  return pools[poolId].pool;
}

/**
 * Dynamically resolves and caches the MySQL pool for a project.
 */
export async function getTenantMysqlPool(project: Project): Promise<mysql.Pool> {
  if (!project.connection_type || project.connection_type === 'internal') {
    const { getMysqlPool } = await import('./mysql');
    return getMysqlPool();
  }

  const { dbName } = getProjectDbAndSchema(project);
  const poolId = `mysql_${project.project_id}_${dbName}`;
  const pools = getExternalPools();
  if (!pools[poolId]) {
    const config = typeof project.connection_config === 'string'
      ? JSON.parse(project.connection_config)
      : project.connection_config;

    console.log(`[TenantPools] Creating new MySQL pool for external project ${project.project_id} (Host: ${config.host}, Database: ${dbName})`);

    const pool = mysql.createPool({
      host: config.host,
      port: parseInt(config.port, 10) || 3306,
      user: config.user,
      password: config.password,
      database: dbName,
      connectionLimit: 5,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: false, // Turn off TCP keep-alive to allow idle connections to close
      idleTimeout: 30000,     // Close idle connections after 30 seconds
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });

    pools[poolId] = {
      pool,
      lastUsed: Date.now(),
      type: 'mysql'
    };
  } else {
    if (!pools[poolId].pool) {
      pools[poolId] = {
        pool: pools[poolId],
        lastUsed: Date.now(),
        type: 'mysql'
      };
    } else {
      pools[poolId].lastUsed = Date.now();
    }
  }
  return pools[poolId].pool;
}

/**
 * Closes and evicts a cached pool if it exists.
 */
export async function closeTenantPool(projectId: string): Promise<void> {
  const pools = getExternalPools();
  const keys = Object.keys(pools);

  for (const key of keys) {
    if (key.startsWith(`pg_${projectId}_`) || key === `pg_${projectId}`) {
      console.log(`[TenantPools] Releasing Postgres pool: ${key}`);
      try {
        const entry = pools[key];
        const pool = entry && entry.pool ? entry.pool : entry;
        await pool.end();
      } catch (e) {
        console.error('[TenantPools] Error closing Postgres pool:', e);
      }
      delete pools[key];
    }
    if (key.startsWith(`mysql_${projectId}_`) || key === `mysql_${projectId}`) {
      console.log(`[TenantPools] Releasing MySQL pool: ${key}`);
      try {
        const entry = pools[key];
        const pool = entry && entry.pool ? entry.pool : entry;
        await pool.end();
      } catch (e) {
        console.error('[TenantPools] Error closing MySQL pool:', e);
      }
      delete pools[key];
    }
  }
}

/**
 * Replicates an external database schema and data into the internal Fluxbase Cloud database.
 */
export async function replicateExternalDatabase(
  projectId: string,
  dialect: string,
  config: any
): Promise<void> {
  const isPostgres = dialect.toLowerCase() === 'postgresql';

  if (isPostgres) {
    const { getPgPool } = await import('./pg');
    const internalPool = getPgPool();
    const externalPool = new Pool({
      host: config.host,
      port: parseInt(config.port, 10) || 5432,
      user: config.user,
      password: config.password,
      database: config.database || 'postgres',
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    });

    try {
      const extSchema = config.schema || 'public';
      const intSchema = `project_${projectId}`;

      // 1. Get all tables
      const tablesRes = await externalPool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '\\_flux\\_internal\\_%'
      `, [extSchema]);

      const tables = tablesRes.rows.map(r => r.table_name);

      for (const table of tables) {
        // 2. Fetch columns
        const colsRes = await externalPool.query(`
          SELECT column_name, data_type, is_nullable, character_maximum_length, numeric_precision, numeric_scale, column_default
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `, [extSchema, table]);

        // 3. Fetch primary keys
        const pkeysRes = await externalPool.query(`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name 
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' 
            AND tc.table_schema = $1 
            AND tc.table_name = $2
        `, [extSchema, table]);

        const primaryKeys = pkeysRes.rows.map(r => r.column_name);

        // Build columns DDL
        const colDefinitions = colsRes.rows.map(col => {
          let typeStr = col.data_type;
          const isAutoIncrement = col.column_default && col.column_default.includes('nextval');

          if (isAutoIncrement) {
            if (col.data_type === 'bigint') {
              typeStr = 'BIGSERIAL';
            } else {
              typeStr = 'SERIAL';
            }
          } else {
            if (col.character_maximum_length) {
              typeStr = `${col.data_type}(${col.character_maximum_length})`;
            } else if (col.data_type === 'numeric' && col.numeric_precision !== null) {
              typeStr = `numeric(${col.numeric_precision}, ${col.numeric_scale || 0})`;
            }
          }

          const nullable = col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL';
          
          if (isAutoIncrement) {
            return `"${col.column_name}" ${typeStr}`;
          }
          return `"${col.column_name}" ${typeStr} ${nullable}`;
        });

        if (primaryKeys.length > 0) {
          const pkCols = primaryKeys.map(k => `"${k}"`).join(', ');
          colDefinitions.push(`CONSTRAINT "pk_${projectId}_${table}" PRIMARY KEY (${pkCols})`);
        }

        const createTableSql = `CREATE TABLE "${intSchema}"."${table}" (\n  ${colDefinitions.join(',\n  ')}\n);`;
        await internalPool.query(createTableSql);

        // 4. Fetch data from remote
        const dataRes = await externalPool.query(`SELECT * FROM "${extSchema}"."${table}"`);
        const rows = dataRes.rows;

        if (rows.length > 0) {
          const colNames = colsRes.rows.map(c => c.column_name);
          const quotedColNames = colNames.map(c => `"${c}"`).join(', ');
          
          // Insert in batches of 500 rows
          const batchSize = 500;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const valueClauses: string[] = [];
            const flatValues: any[] = [];
            let paramIdx = 1;

            for (const row of batch) {
              const rowPlaceholders = colNames.map(c => {
                flatValues.push(row[c]);
                return `$${paramIdx++}`;
              }).join(', ');
              valueClauses.push(`(${rowPlaceholders})`);
            }

            const insertSql = `INSERT INTO "${intSchema}"."${table}" (${quotedColNames}) VALUES ${valueClauses.join(', ')}`;
            await internalPool.query(insertSql, flatValues);
          }
        }
      }
    } catch (err) {
      console.error(`[Replication Error] Failed to import PG schema/data for ${projectId}:`, err);
      // Cleanup partially created schema
      try {
        await internalPool.query(`DROP SCHEMA IF EXISTS "project_${projectId}" CASCADE`);
      } catch (cleanErr) {
        console.error('[Replication Cleanup Error]', cleanErr);
      }
      throw err;
    } finally {
      await externalPool.end();
    }
  } else {
    // MySQL Dialect
    const { getMysqlPool } = await import('./mysql');
    const internalPool = getMysqlPool();
    const externalConnection = await mysql.createConnection({
      host: config.host,
      port: parseInt(config.port, 10) || 3306,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectTimeout: 10000,
    });

    try {
      const extDb = config.database;
      const intDb = `project_${projectId}`;

      // 1. Get all tables
      const [tablesRes]: any = await externalConnection.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = ? AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '\\_flux\\_internal\\_%'
      `, [extDb]);

      const tables = tablesRes.map((r: any) => r.TABLE_NAME || r.table_name);

      for (const table of tables) {
        // 2. Fetch columns
        const [colsRes]: any = await externalConnection.query(`
          SELECT column_name, column_type, is_nullable, extra
          FROM information_schema.columns
          WHERE table_schema = ? AND table_name = ?
          ORDER BY ordinal_position
        `, [extDb, table]);

        // 3. Fetch primary keys
        const [pkeysRes]: any = await externalConnection.query(`
          SELECT column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name 
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' 
            AND tc.table_schema = ? 
            AND tc.table_name = ?
        `, [extDb, table]);

        const primaryKeys = pkeysRes.map((r: any) => r.COLUMN_NAME || r.column_name);

        // Build columns DDL
        const colDefinitions = colsRes.map((col: any) => {
          const colName = col.COLUMN_NAME || col.column_name;
          const colType = col.COLUMN_TYPE || col.column_type;
          const isNullable = col.IS_NULLABLE || col.is_nullable;
          const extra = col.EXTRA || col.extra || '';

          const nullable = isNullable === 'NO' ? 'NOT NULL' : 'NULL';
          const autoInc = extra.toLowerCase().includes('auto_increment') ? 'AUTO_INCREMENT' : '';
          
          return `\`${colName}\` ${colType} ${nullable} ${autoInc}`;
        });

        if (primaryKeys.length > 0) {
          const pkCols = primaryKeys.map((k: any) => `\`${k}\``).join(', ');
          colDefinitions.push(`PRIMARY KEY (${pkCols})`);
        }

        const createTableSql = `CREATE TABLE \`${intDb}\`.\`${table}\` (\n  ${colDefinitions.join(',\n  ')}\n);`;
        await internalPool.query(createTableSql);

        // 4. Fetch data from remote
        const [dataRes]: any = await externalConnection.query(`SELECT * FROM \`${extDb}\`.\`${table}\``);
        const rows = dataRes;

        if (rows.length > 0) {
          const colNames = colsRes.map((c: any) => c.COLUMN_NAME || c.column_name);
          const quotedColNames = colNames.map((c: any) => `\`${c}\``).join(', ');
          
          // Insert in batches of 500 rows
          const batchSize = 500;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const valueClauses: string[] = [];
            const flatValues: any[] = [];

            for (const row of batch) {
              const rowPlaceholders = colNames.map(() => {
                return '?';
              }).join(', ');
              
              colNames.forEach((c: any) => {
                flatValues.push(row[c]);
              });
              
              valueClauses.push(`(${rowPlaceholders})`);
            }

            const insertSql = `INSERT INTO \`${intDb}\`.\`${table}\` (${quotedColNames}) VALUES ${valueClauses.join(', ')}`;
            await internalPool.query(insertSql, flatValues);
          }
        }
      }
    } catch (err) {
      console.error(`[Replication Error] Failed to import MySQL schema/data for ${projectId}:`, err);
      // Cleanup partially created DB
      try {
        await internalPool.query(`DROP DATABASE IF EXISTS \`project_${projectId}\``);
      } catch (cleanErr) {
        console.error('[Replication Cleanup Error]', cleanErr);
      }
      throw err;
    } finally {
      await externalConnection.end();
    }
  }
}

