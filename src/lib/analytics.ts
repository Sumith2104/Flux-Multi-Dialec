import { getPgPool } from '@/lib/pg';

type AnalyticsType = 'api_call' | 'sql_execution' | 'storage_read' | 'storage_write' | 'sql_select' | 'sql_insert' | 'sql_update' | 'sql_delete' | 'sql_alter';

export async function trackApiRequest(projectId: string, type: AnalyticsType) {
    if (!projectId) return;

    try {
        const pool = getPgPool();

        // Highly optimized Postgres "Upsert" for hourly rollups
        // This avoids writing millions of individual raw event rows
        const query = `
            INSERT INTO fluxbase_global.analytics_rollups (project_id, period_start, event_type, count)
            VALUES ($1, DATE_TRUNC('hour', CURRENT_TIMESTAMP), $2, 1)
            ON CONFLICT (project_id, period_start, event_type)
            DO UPDATE SET count = fluxbase_global.analytics_rollups.count + 1;
        `;

        // Fire and forget
        pool.query(query, [projectId, type]).catch(err => {
            console.error(`[Analytics Upsert Error] Project ${projectId}:`, err);
        });

    } catch (error) {
        // We don't want to fail the request just because analytics failed
        console.error(`Failed to track analytics for project ${projectId}:`, error);
    }
}
