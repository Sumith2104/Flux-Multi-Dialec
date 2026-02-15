'use server';

import { generateApiKey, listApiKeys, revokeApiKey } from '@/lib/api-keys';
import { getCurrentUserId } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

import { getProjectById, getProjectsForCurrentUser } from '@/lib/data';

export async function createApiKeyAction(name: string, projectId?: string) {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
        let projectName: string | undefined;

        if (projectId) {
            const project = await getProjectById(projectId);
            if (!project || project.user_id !== userId) {
                return { success: false, error: "Project not found or unauthorized" };
            }
            projectName = project.display_name;
        }

        const result = await generateApiKey(userId, name, projectId, projectName);
        // revalidatePath('/settings'); // Don't revalidate, let client handle state to keep the secret key visible
        return { success: true, data: result };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getApiKeysAction() {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
        const keys = await listApiKeys(userId);
        return { success: true, data: keys };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function revokeApiKeyAction(keyId: string) {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
        await revokeApiKey(userId, keyId);
        revalidatePath('/settings');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getProjectsAction() {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
        const projects = await getProjectsForCurrentUser();
        return { success: true, data: projects };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
