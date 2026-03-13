'use server';

import { getCurrentUserId } from '@/lib/auth';
import { deleteProject } from '@/lib/data';
import { deleteUserAccount } from '@/lib/auth-actions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function getUserPlanAction(): Promise<{ success: boolean; plan?: string; error?: string }> {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return { success: false, error: 'Unauthorized' };

        const { getPgPool } = await import('@/lib/pg');
        const pool = getPgPool();
        const { rows } = await pool.query(
            'SELECT plan_type FROM fluxbase_global.users WHERE id = $1',
            [userId]
        );

        return { success: true, plan: rows[0]?.plan_type || 'free' };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateProjectSettingsAction(projectId: string, timezone: string) {
    const userId = await getCurrentUserId();
    if (!projectId || !userId || !timezone) {
        return { error: 'Missing required fields for project update.' };
    }

    try {
        const { getPgPool } = await import('@/lib/pg');
        const pool = getPgPool();
        await pool.query('UPDATE fluxbase_global.projects SET timezone = $1 WHERE project_id = $2 AND user_id = $3', [timezone, projectId, userId]);

        revalidatePath('/api');
        return { success: true };
    } catch (error) {
        console.error('Failed to update project settings:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}

export async function updateProjectAiSettingsAction(projectId: string, allowDestructive: boolean, schemaInference: boolean) {
    const userId = await getCurrentUserId();
    if (!projectId || !userId) {
        return { error: 'Missing required fields for AI settings update.' };
    }

    try {
        const { getPgPool } = await import('@/lib/pg');
        const pool = getPgPool();
        await pool.query(
            'UPDATE fluxbase_global.projects SET ai_allow_destructive = $1, ai_schema_inference = $2 WHERE project_id = $3 AND user_id = $4', 
            [allowDestructive, schemaInference, projectId, userId]
        );

        return { success: true };
    } catch (error) {
        console.error('Failed to update AI settings:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}

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

// --- Webhooks Actions ---

import { createWebhook, deleteWebhook, getWebhooksForProject, updateWebhook, type WebhookEvent } from '@/lib/webhooks';

export async function getWebhooksAction(projectId: string) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) throw new Error("Unauthorized");
        const webhooks = await getWebhooksForProject(projectId, userId);
        return { success: true, data: webhooks };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function createWebhookAction(projectId: string, name: string, url: string, event: WebhookEvent, tableId: string, secret?: string) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) throw new Error("Unauthorized");
        const webhook = await createWebhook(projectId, userId, { name, url, event, table_id: tableId, secret, is_active: true });
        return { success: true, data: webhook };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function toggleWebhookAction(projectId: string, webhookId: string, isActive: boolean) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) throw new Error("Unauthorized");
        await updateWebhook(projectId, userId, webhookId, { is_active: isActive });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteWebhookAction(projectId: string, webhookId: string) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) throw new Error("Unauthorized");
        await deleteWebhook(projectId, userId, webhookId);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
