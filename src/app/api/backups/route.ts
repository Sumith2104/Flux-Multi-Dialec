import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ensureTable = async (pool: any) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.backups (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            project_id TEXT NOT NULL,
            label TEXT NOT NULL,
            type TEXT DEFAULT 'manual',
            status TEXT DEFAULT 'in_progress',
            size_bytes BIGINT,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
};

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPgPool();
    await ensureTable(pool);

    const res = await pool.query(
        `SELECT id, label, type, status, size_bytes as "sizeBytes", expires_at as "expiresAt", created_at as "createdAt"
         FROM fluxbase_global.backups WHERE project_id = $1 ORDER BY created_at DESC`,
        [projectId]
    );
    return NextResponse.json({ backups: res.rows });
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectId } = body;
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const pool = getPgPool();
        await ensureTable(pool);

        const label = `Manual Backup — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

        // Record backup initiation — in production this would trigger a pg_dump job
        const res = await pool.query(
            `INSERT INTO fluxbase_global.backups (project_id, label, type, status, expires_at)
             VALUES ($1, $2, 'manual', 'completed', NOW() + INTERVAL '30 days')
             RETURNING id`,
            [projectId, label]
        );

        // Estimate size based on schema
        const schemaName = `project_${projectId}`;
        const sizeRes = await pool.query(
            `SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(table_schema)||'.'||quote_ident(table_name))), 0) as size
             FROM information_schema.tables WHERE table_schema = $1`,
            [schemaName]
        ).catch(() => ({ rows: [{ size: 0 }] }));

        await pool.query(
            `UPDATE fluxbase_global.backups SET size_bytes = $1 WHERE id = $2`,
            [sizeRes.rows[0].size, res.rows[0].id]
        );

        return NextResponse.json({ success: true, id: res.rows[0].id });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
}
