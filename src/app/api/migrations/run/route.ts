import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { projectId, migrationId, direction } = await req.json();
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPgPool();

    // Get migration details
    const mRes = await pool.query(`SELECT * FROM fluxbase_global.migrations WHERE id = $1 AND project_id = $2`, [migrationId, projectId]);
    if (mRes.rows.length === 0) return NextResponse.json({ error: 'Migration not found' }, { status: 404 });
    const m = mRes.rows[0];

    const sql = direction === 'up' ? m.up_sql : m.down_sql;
    if (!sql) return NextResponse.json({ error: 'No SQL for this direction' }, { status: 400 });

    const schemaName = `project_${projectId}`;
    const client = await pool.connect();

    try {
        await client.query(`SET search_path TO "${schemaName}"`);
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');

        await pool.query(
            `UPDATE fluxbase_global.migrations SET status = $1, applied_at = $2, error = NULL WHERE id = $3`,
            [direction === 'up' ? 'applied' : 'pending', direction === 'up' ? new Date().toISOString() : null, migrationId]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        await client.query('ROLLBACK');
        await pool.query(
            `UPDATE fluxbase_global.migrations SET status = 'failed', error = $1 WHERE id = $2`,
            [e.message, migrationId]
        );
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    } finally {
        client.release();
    }
}
