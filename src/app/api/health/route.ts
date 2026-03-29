import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
    const results: Record<string, boolean | string> = {};

    // Check Postgres
    try {
        const pool = getPgPool();
        await Promise.race([
            pool.query('SELECT 1'),
            new Promise((_, rej) => setTimeout(() => rej('timeout'), 2000))
        ]);
        results.database = true;
    } catch {
        results.database = false;
    }

    // Check Redis
    try {
        await redis.ping();
        results.redis = true;
    } catch {
        results.redis = false;
    }

    results.api = true;
    results.timestamp = new Date().toISOString();

    const allHealthy = results.database === true && results.redis === true;
    return NextResponse.json(results, { status: allHealthy ? 200 : 503 });
}
