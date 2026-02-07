'use server';

import { createProject } from '@/lib/data';

export async function createProjectAction(formData: FormData) {
  const projectName = formData.get('projectName') as string;
  const dialect = formData.get('dialect') as string;

  if (!projectName) {
    return { error: 'Project name is required.' };
  }

  try {
    const project = await createProject(projectName, dialect || 'postgresql');
    return { success: true, projectId: project.project_id };
  } catch (error) {
    console.error('Project creation failed:', error);
    return { error: 'Failed to create project.' };
  }
}
