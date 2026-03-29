import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { getPgPool } from '@/lib/pg';

export const maxDuration = 60; // 1 minute max for cron execution

export async function GET(request: Request) {
    try {
        // Only allow manual local exec or secure production cron triggers
        const authHeader = request.headers.get('authorization');
        if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const keys = await redis.smembers('analytics_keys_to_flush');
        if (!keys || keys.length === 0) {
            return NextResponse.json({ success: true, processed: 0 });
        }

        const values = await redis.mget(...keys);
        
        // Secure keys from Set immediately so we don't accidentally sync twice concurrently
        await redis.srem('analytics_keys_to_flush', ...keys);

        const pool = getPgPool();
        let inserted = 0;

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const val = parseInt(values[i] as string || '0', 10);
            if (val === 0) continue;

            const parts = key.split(':');
            // Format: analytics_rollup:{projectId}:{periodStartMs}:{type}
            const projectId = parts[1];
            const periodStartMs = parseInt(parts[2], 10);
            const periodStartISO = new Date(periodStartMs).toISOString();
            const eventType = parts[3];

            const query = `
                INSERT INTO fluxbase_global.analytics_rollups (project_id, period_start, event_type, count)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (project_id, period_start, event_type)
                DO UPDATE SET count = fluxbase_global.analytics_rollups.count + EXCLUDED.count;
            `;

            try {
                await pool.query(query, [projectId, periodStartISO, eventType, val]);
            } catch (err: any) {
                // Silently skip if project doesn't exist anymore, no need to spam logs
            }
            
            // Clear the actual counter safely post-sync
            await redis.del(key);
            inserted++;
        }

        return NextResponse.json({ success: true, processed: inserted });

    } catch (e: any) {
        console.error('Flush Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
