import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ensureTable = async (pool: any) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.migrations (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            version TEXT NOT NULL,
            name TEXT NOT NULL,
            up_sql TEXT NOT NULL,
            down_sql TEXT,
            status TEXT DEFAULT 'pending',
            applied_at TIMESTAMPTZ,
            error TEXT,
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
        `SELECT id, version, name, up_sql as "upSql", down_sql as "downSql", status, applied_at as "appliedAt", error
         FROM fluxbase_global.migrations WHERE project_id = $1 ORDER BY version DESC`,
        [projectId]
    );
    return NextResponse.json({ migrations: res.rows });
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectId, name, upSql, downSql } = body;
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const pool = getPgPool();
        await ensureTable(pool);

        // Auto-generate version as timestamp
        const version = new Date().toISOString().replace(new RegExp('[' + '-:T.Z' + ']', 'g'), '').slice(0, 14);
        const id = `${version}_${name.toLowerCase().replace(/\s+/g, '_')}`;

        await pool.query(
            `INSERT INTO fluxbase_global.migrations (id, project_id, version, name, up_sql, down_sql) VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, projectId, version, name, upSql, downSql || null]
        );
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
}
