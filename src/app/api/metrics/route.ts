import { NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getExternalPools } from '@/lib/tenant-pools';

export const dynamic = 'force-dynamic';

/**
 * GET /api/metrics
 * 
 * Prometheus-compatible metrics endpoint.
 * Returns metrics in the standard Prometheus text format.
 */
export async function GET() {
    try {
        const metrics: string[] = [];
        const now = Date.now();

        // --- System metrics ---
        metrics.push(`# HELP fluxbase_uptime_seconds Time since server start`);
        metrics.push(`# TYPE fluxbase_uptime_seconds gauge`);
        const uptimeSec = Math.floor(now / 1000);
        metrics.push(`fluxbase_uptime_seconds ${uptimeSec}`);

        // --- Memory usage ---
        const memUsage = process.memoryUsage();
        metrics.push(`# HELP fluxbase_memory_rss_bytes RSS memory in bytes`);
        metrics.push(`# TYPE fluxbase_memory_rss_bytes gauge`);
        metrics.push(`fluxbase_memory_rss_bytes ${memUsage.rss}`);
        metrics.push(`# HELP fluxbase_memory_heap_used_bytes Heap memory used in bytes`);
        metrics.push(`# TYPE fluxbase_memory_heap_used_bytes gauge`);
        metrics.push(`fluxbase_memory_heap_used_bytes ${memUsage.heapUsed}`);

        // --- PostgreSQL pool metrics ---
        try {
            const pool = getPgPool();
            metrics.push(
                `# HELP fluxbase_pg_pool_total Total PG connections in pool`
            );
            metrics.push(`# TYPE fluxbase_pg_pool_total gauge`);
            const totalConns = (pool as any).totalCount || 0;
            const idleConns = (pool as any).idleCount || 0;
            const waitingConns = (pool as any).waitingCount || 0;
            metrics.push(`fluxbase_pg_pool_total ${totalConns}`);
            metrics.push(`fluxbase_pg_pool_idle ${idleConns}`);
            metrics.push(`fluxbase_pg_pool_waiting ${waitingConns}`);
        } catch {
            // Pool not available
        }

        // --- External tenant pool metrics ---
        const pools = getExternalPools();
        const poolCount = Object.keys(pools).length;
        metrics.push(`# HELP fluxbase_external_pools Number of external database pools`);
        metrics.push(`# TYPE fluxbase_external_pools gauge`);
        metrics.push(`fluxbase_external_pools ${poolCount}`);

        // --- GC metrics ---
        // @ts-ignore - Node.js global
        if (global.gc) {
            metrics.push(`# HELP nodejs_gc_runs_total Total GC runs`);
            metrics.push(`# TYPE nodejs_gc_runs_total counter`);
            // This would require perf_hooks integration for real GC stats
        }

        const metricsText = metrics.join('\n') + '\n';
        return new NextResponse(metricsText, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: { message: 'Failed to collect metrics', code: 'INTERNAL_ERROR' } },
            { status: 500 }
        );
    }
}
