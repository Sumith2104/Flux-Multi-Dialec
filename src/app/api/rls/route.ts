import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPgPool();
    const schemaName = `project_${projectId}`;

    // Get tables
    const tablesRes = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
        [schemaName]
    );

    // Get existing RLS policies stored in our catalog
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.rls_policies (
            id SERIAL PRIMARY KEY,
            project_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            policy_name TEXT NOT NULL,
            command TEXT NOT NULL DEFAULT 'ALL',
            expression TEXT NOT NULL DEFAULT 'true',
            enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(project_id, table_name, policy_name)
        )
    `);

    const policiesRes = await pool.query(
        `SELECT id, table_name as "tableName", policy_name as "policyName", command, expression, enabled, created_at as "createdAt"
         FROM fluxbase_global.rls_policies WHERE project_id = $1 ORDER BY table_name, policy_name`,
        [projectId]
    );

    return NextResponse.json({
        tables: tablesRes.rows.map(r => r.table_name),
        policies: policiesRes.rows,
    });
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectId, tableName, policyName, command, expression } = body;
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const pool = getPgPool();
        await pool.query(
            `INSERT INTO fluxbase_global.rls_policies (project_id, table_name, policy_name, command, expression)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (project_id, table_name, policy_name) DO UPDATE SET expression = EXCLUDED.expression, command = EXCLUDED.command`,
            [projectId, tableName, policyName, command, expression]
        );
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const tableName = searchParams.get('tableName');
    const policyName = searchParams.get('policyName');
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPgPool();
    await pool.query(
        `DELETE FROM fluxbase_global.rls_policies WHERE project_id = $1 AND table_name = $2 AND policy_name = $3`,
        [projectId, tableName, policyName]
    );
    return NextResponse.json({ success: true });
}
