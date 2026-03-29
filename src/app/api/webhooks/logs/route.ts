import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ensureTable = async (pool: any) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.webhook_delivery_logs (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            project_id TEXT NOT NULL,
            webhook_id TEXT NOT NULL,
            webhook_name TEXT,
            event TEXT,
            url TEXT,
            status_code INT,
            response_ms INT,
            success BOOLEAN DEFAULT false,
            error TEXT,
            payload JSONB,
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
        `SELECT id, webhook_id as "webhookId", webhook_name as "webhookName", event, url,
         status_code as "statusCode", response_ms as "responseMs", success, error, created_at as "createdAt"
         FROM fluxbase_global.webhook_delivery_logs
         WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [projectId]
    );
    return NextResponse.json({ logs: res.rows });
}
