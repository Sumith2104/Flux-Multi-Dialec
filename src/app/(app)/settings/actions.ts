
'use server';

import fs from 'fs/promises';
import path from 'path';
import { getCurrentUserId } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const DB_PATH = path.join(process.cwd(), 'src', 'database');

async function readCsvFile(filePath: string): Promise<string[][]> {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data.trim().split('\n').map(row => row.split(','));
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function writeCsvFile(filePath: string, data: string[][]): Promise<void> {
    const content = data.map(row => row.join(',')).join('\n');
    await fs.writeFile(filePath, content, 'utf8');
}


export async function deleteProjectAction(projectId: string) {
    const userId = await getCurrentUserId();
    if (!projectId || !userId) {
        return { error: 'Missing required fields for project deletion.' };
    }

    try {
        const userPath = path.join(DB_PATH, userId);
        const projectPath = path.join(userPath, projectId);

        // 1. Remove the project directory and all its contents
        await fs.rm(projectPath, { recursive: true, force: true });

        // 2. Remove the project from the user's projects.csv file
        const projectsCsvPath = path.join(userPath, 'projects.csv');
        const projectsData = await readCsvFile(projectsCsvPath);
        if (projectsData.length > 0) {
            const newProjectsData = projectsData.filter(row => row[0] !== projectId);
            await writeCsvFile(projectsCsvPath, newProjectsData);
        }

        revalidatePath('/dashboard');
        revalidatePath('/dashboard/projects');
        return { success: true };

    } catch (error) {
        console.error('Failed to delete project:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}


export async function clearOrganizationAction() {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { error: 'User not authenticated.' };
    }

    try {
        const userPath = path.join(DB_PATH, userId);

        // 1. Delete the entire user folder
        await fs.rm(userPath, { recursive: true, force: true });
        
        // 2. Remove the user from the root users.csv file
        const usersCsvPath = path.join(DB_PATH, 'users.csv');
        const usersData = await readCsvFile(usersCsvPath);
        if(usersData.length > 0) {
            const newUsersData = usersData.filter(row => row[0] !== userId);
            await writeCsvFile(usersCsvPath, newUsersData);
        }

        return { success: true };

    } catch (error) {
        console.error('Failed to clear organization:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}
