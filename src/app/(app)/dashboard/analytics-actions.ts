'use server';

import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';

export async function getAnalyticsStatsAction(projectId: string) {
    const userId = await getCurrentUserId();
    if (!userId || !projectId) return null;

    try {
        const pool = getPgPool();
        // Sum up all rollups for this project
        const result = await pool.query(`
            SELECT event_type, SUM(count) as total
            FROM fluxbase_global.analytics_rollups
            WHERE project_id = $1
            GROUP BY event_type
        `, [projectId]);

        const stats = {
            total_requests: 0,
            type_api_call: 0,
            type_sql_execution: 0,
            type_storage_read: 0,
            type_storage_write: 0,
            type_sql_select: 0,
            type_sql_insert: 0,
            type_sql_update: 0,
            type_sql_delete: 0,
            type_sql_alter: 0
        };

        for (const row of result.rows) {
            const type = row.event_type;
            const count = parseInt(row.total);
            stats.total_requests += count;

            if (type === 'api_call') stats.type_api_call = count;
            if (type === 'sql_execution') stats.type_sql_execution = count;
            if (type === 'storage_read') stats.type_storage_read = count;
            if (type === 'storage_write') stats.type_storage_write = count;
            if (type === 'sql_select') stats.type_sql_select = count;
            if (type === 'sql_insert') stats.type_sql_insert = count;
            if (type === 'sql_update') stats.type_sql_update = count;
            if (type === 'sql_delete') stats.type_sql_delete = count;
            if (type === 'sql_alter') stats.type_sql_alter = count;
        }

        return stats;
    } catch (e) {
        console.error('getAnalyticsStatsAction error:', e);
        return null;
    }
}

export async function getRealtimeHistoryAction(projectId: string) {
    // Return empty mock for now to satisfy the line chart without crashing.
    // We would ideally query the last 60 minutes from a finer-grained table.
    return [];
}

export async function getProjectHistoryAction(projectId: string) {
    // Return empty mock for the aggregate project history.
    return {
        daily: {},
        monthly: {},
        yearly: {},
        requests: Array(24).fill({ val: 0 }),
        apiCalls: Array(24).fill({ val: 0 })
    };
}
