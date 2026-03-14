'use server';

import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';

export async function getProjectLimitsAction(projectId: string) {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    try {
        const pool = getPgPool();
        const res = await pool.query(`
            SELECT custom_api_limit, custom_row_limit, custom_request_limit, alert_email, alert_threshold_percent
            FROM fluxbase_global.projects 
            WHERE project_id = $1 AND user_id = $2
        `, [projectId, userId]);

        if (res.rows.length === 0) return { success: false, error: 'Project not found' };

        return { success: true, data: res.rows[0] };
    } catch (e: any) {
        console.error('Failed to get project limits:', e);
        return { success: false, error: e.message || 'Server error' };
    }
}

export async function updateProjectLimitsAction(
    projectId: string, 
    limits: { 
        custom_api_limit: number | null, 
        custom_row_limit: number | null, 
        custom_request_limit: number | null, 
        alert_email: string | null, 
        alert_threshold_percent: number | null 
    }
) {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    try {
        const pool = getPgPool();
        const res = await pool.query(`
            UPDATE fluxbase_global.projects 
            SET custom_api_limit = $1, 
                custom_row_limit = $2, 
                custom_request_limit = $3, 
                alert_email = $4, 
                alert_threshold_percent = $5
            WHERE project_id = $6 AND user_id = $7
            RETURNING custom_api_limit, custom_row_limit, custom_request_limit, alert_email, alert_threshold_percent
        `, [
            limits.custom_api_limit, 
            limits.custom_row_limit, 
            limits.custom_request_limit, 
            limits.alert_email, 
            limits.alert_threshold_percent, 
            projectId, 
            userId
        ]);

        if (res.rowCount === 0) return { success: false, error: 'Project not found' };

        return { success: true, data: res.rows[0] };
    } catch (e: any) {
        console.error('Failed to update project limits:', e);
        return { success: false, error: e.message || 'Server error' };
    }
}
