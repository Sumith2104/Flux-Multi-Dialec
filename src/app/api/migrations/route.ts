import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { jsonError, requireProjectAccess } from '@/lib/project-auth';
import { ERROR_CODES, FluxbaseError } from '@/lib/error-codes';

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
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get('projectId');
        const auth = await getAuthContextFromRequest(req);
        if (!projectId) throw new FluxbaseError('projectId is required', ERROR_CODES.MISSING_FIELD, 400);

        await requireProjectAccess(projectId, auth);

        const pool = getPgPool();
        await ensureTable(pool);

        const res = await pool.query(
            `SELECT id, version, name, up_sql as "upSql", down_sql as "downSql", status, applied_at as "appliedAt", error
             FROM fluxbase_global.migrations WHERE project_id = $1 ORDER BY version DESC`,
            [projectId]
        );
        return NextResponse.json({ migrations: res.rows });
    } catch (error) {
        const { body, status } = jsonError(error);
        return NextResponse.json(body, { status });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, name, upSql, downSql } = body;
        const auth = await getAuthContextFromRequest(req);
        if (!projectId || !name || !upSql) {
            throw new FluxbaseError('projectId, name, and upSql are required', ERROR_CODES.MISSING_FIELD, 400);
        }

        await requireProjectAccess(projectId, auth, ['admin', 'developer']);

        const pool = getPgPool();
        await ensureTable(pool);

        const safeName = String(name).trim().slice(0, 80);
        const version = new Date().toISOString().replace(new RegExp('[' + '-:T.Z' + ']', 'g'), '').slice(0, 14);
        const id = `${version}_${safeName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'migration'}`;

        await pool.query(
            `INSERT INTO fluxbase_global.migrations (id, project_id, version, name, up_sql, down_sql) VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, projectId, version, safeName, upSql, downSql || null]
        );
        return NextResponse.json({ success: true });
    } catch (error) {
        const { body, status } = jsonError(error);
        return NextResponse.json(body, { status });
    }
}
