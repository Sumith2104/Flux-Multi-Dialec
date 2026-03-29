import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ensureTable = async (pool: any) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.alerts (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            metric TEXT NOT NULL,
            condition TEXT NOT NULL,
            threshold NUMERIC NOT NULL,
            notify_email TEXT,
            notify_webhook TEXT,
            enabled BOOLEAN DEFAULT true,
            last_triggered_at TIMESTAMPTZ,
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
        `SELECT id, name, metric, condition, threshold::float, notify_email as "notifyEmail", notify_webhook as "notifyWebhook",
         enabled, last_triggered_at as "lastTriggeredAt", created_at as "createdAt"
         FROM fluxbase_global.alerts WHERE project_id = $1 ORDER BY created_at DESC`,
        [projectId]
    );
    return NextResponse.json({ alerts: res.rows });
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectId, name, metric, condition, threshold, notifyEmail, notifyWebhook } = body;
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const pool = getPgPool();
        await ensureTable(pool);
        await pool.query(
            `INSERT INTO fluxbase_global.alerts (project_id, name, metric, condition, threshold, notify_email, notify_webhook)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [projectId, name, metric, condition, threshold, notifyEmail || null, notifyWebhook || null]
        );
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const id = searchParams.get('id');
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPgPool();
    await pool.query(`DELETE FROM fluxbase_global.alerts WHERE id = $1 AND project_id = $2`, [id, projectId]);
    return NextResponse.json({ success: true });
}
