import { NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
    const results: Record<string, any> = {};

    // Check Postgres Latency
    const dbStart = Date.now();
    try {
        const pool = getPgPool();
        await Promise.race([
            pool.query('SELECT 1'),
            new Promise((_, rej) => setTimeout(() => rej('timeout'), 2000))
        ]);
        results.database = true;
        results.dbLatencyMs = Date.now() - dbStart;
    } catch {
        results.database = false;
        results.dbLatencyMs = -1;
    }

    // Check Redis Latency
    const redisStart = Date.now();
    try {
        await redis.ping();
        results.redis = true;
        results.redisLatencyMs = Date.now() - redisStart;
    } catch {
        results.redis = false;
        results.redisLatencyMs = -1;
    }

    results.api = true;
    results.status = results.database ? 'healthy' : 'degraded';
    results.timestamp = new Date().toISOString();

    const isHealthy = results.database === true;
    return NextResponse.json(results, { status: isHealthy ? 200 : 503 });
}
