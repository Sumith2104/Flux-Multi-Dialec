'use server';

import { getCurrentUserId } from '@/lib/auth';
import { deleteProject } from '@/lib/data';
import { deleteUserAccount } from '@/lib/auth-actions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function deleteProjectAction(projectId: string) {
    const userId = await getCurrentUserId();
    if (!projectId || !userId) {
        return { error: 'Missing required fields for project deletion.' };
    }

    try {
        await deleteProject(projectId);

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
        await deleteUserAccount(userId);

        // No revalidate needed as we redirect
        return { success: true };

    } catch (error) {
        console.error('Failed to clear organization:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}
