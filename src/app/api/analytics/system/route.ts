import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const auth = await getAuthContextFromRequest(req);

    if (!auth?.userId || !projectId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pool = getPgPool();

    try {
        // 1. Heatmap: Queries per day (Last 30 days)
        const heatmapResult = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM fluxbase_global.audit_logs
            WHERE project_id = $1 AND created_at > NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [projectId]);

        // 2. Latency Distribution: Ranges (<50ms, 50-200ms, 200-500ms, >500ms)
        const latencyResult = await pool.query(`
            SELECT 
                CASE 
                    WHEN duration_ms < 50 THEN 'Fast (<50ms)'
                    WHEN duration_ms BETWEEN 50 AND 200 THEN 'Normal (50-200ms)'
                    WHEN duration_ms BETWEEN 200 AND 500 THEN 'Slower (200-500ms)'
                    ELSE 'Slow (>500ms)'
                END as range,
                COUNT(*) as count
            FROM fluxbase_global.audit_logs
            WHERE project_id = $1 AND created_at > NOW() - INTERVAL '7 days'
            GROUP BY range
        `, [projectId]);

        // 3. Status Breakdown
        const statusResult = await pool.query(`
            SELECT 
                success,
                COUNT(*) as count
            FROM fluxbase_global.audit_logs
            WHERE project_id = $1 AND created_at > NOW() - INTERVAL '7 days'
            GROUP BY success
        `, [projectId]);

        return NextResponse.json({
            heatmap: heatmapResult.rows.map(r => ({ date: r.date.toISOString().split('T')[0], count: parseInt(r.count) })),
            latency: latencyResult.rows.map(r => ({ range: r.range, count: parseInt(r.count) })),
            status: statusResult.rows.map(r => ({ success: r.success, count: parseInt(r.count) }))
        });

    } catch (e: any) {
        console.error('Failed to fetch system metrics:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
