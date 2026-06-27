import { redis } from '@/lib/redis';

type AnalyticsType = 'api_call' | 'sql_execution' | 'storage_read' | 'storage_write' | 'sql_select' | 'sql_insert' | 'sql_update' | 'sql_delete' | 'sql_alter';

export async function trackApiRequest(projectId: string, type: AnalyticsType) {
    if (!projectId) return;

    try {
        const d = new Date();
        d.setMinutes(0, 0, 0); // truncate to current hour
        const periodStartMs = d.getTime();
        
        // Format: analytics_rollup:{projectId}:{periodStartMs}:{type}
        const key = `analytics_rollup:${projectId}:${periodStartMs}:${type}`;

        const p = redis.pipeline();
        p.incr(key);
        p.sadd('analytics_keys_to_flush', key);
        await p.exec();

    } catch (error) {
        // We don't want to fail the actual user request just because analytics failed
        console.error(`Failed to track analytics in Redis for project ${projectId}:`, error);
    }
}
