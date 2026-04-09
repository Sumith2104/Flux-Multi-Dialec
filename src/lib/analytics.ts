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
        
        // Probabilistic SADD: the key only needs to be registered ONCE per hour for the cron to pick it up.
        // Sending SADD on every request is idempotent but Upstash still counts it as a write command.
        // A 10% probability ensures registration happens quickly while cutting SADD volume by 90%.
        if (Math.random() < 0.10) {
            p.sadd('analytics_keys_to_flush', key);
        }
        
        await p.exec();

    } catch (error) {
        // We don't want to fail the actual user request just because analytics failed
        console.error(`Failed to track analytics in Redis for project ${projectId}:`, error);
    }
}
