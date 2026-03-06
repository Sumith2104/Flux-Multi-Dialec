'use server';

import { createProject } from '@/lib/data';
import { provisionDatabaseInstance } from '@/lib/aws-rds';
import crypto from 'crypto';

export async function createProjectAction(formData: FormData) {
  const projectName = formData.get('projectName') as string;
  const dialect = formData.get('dialect') as string;
  const timezone = formData.get('timezone') as string;
  const instanceSize = formData.get('instanceSize') as string;
  const region = formData.get('region') as string;

  if (!projectName) {
    return { error: 'Project name is required.' };
  }

  try {
    // 1. Create the project entry in the metadata table
    const project = await createProject(projectName, "No description provided", dialect || 'postgresql', timezone);

    // 2. Provision the AWS RDS instance if size is specified (meaning it's from the new UI and wants dedicated hardware)
    if (instanceSize) {
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
