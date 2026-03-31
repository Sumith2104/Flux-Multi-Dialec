import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const search = searchParams.get('search') || '';
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPgPool();

    const q = search
        ? `SELECT al.id, al.user_id as "userId", u.email as "userEmail", al.action, al.statement, al.created_at as "createdAt", al.metadata
           FROM fluxbase_global.audit_logs al
           LEFT JOIN fluxbase_global.users u ON u.id = al.user_id
           WHERE al.project_id = $1::text AND (al.statement ILIKE $2::text OR al.action ILIKE $2::text)
           ORDER BY al.created_at DESC LIMIT 200`
        : `SELECT al.id, al.user_id as "userId", u.email as "userEmail", al.action, al.statement, al.created_at as "createdAt", al.metadata
           FROM fluxbase_global.audit_logs al
           LEFT JOIN fluxbase_global.users u ON u.id = al.user_id
           WHERE al.project_id = $1::text
           ORDER BY al.created_at DESC LIMIT 200`;

    const params = search ? [projectId, `%${search}%`] : [projectId];
    const res = await pool.query(q, params);
    return NextResponse.json({ logs: res.rows });
}
