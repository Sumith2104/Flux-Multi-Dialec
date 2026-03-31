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

    // Get project members including the owner
    const res = await pool.query(`
        SELECT u.id as "userId", u.email, u.display_name as "displayName", 
               'admin' as role, 
               p.created_at as "joinedAt"
        FROM fluxbase_global.projects p
        JOIN fluxbase_global.users u ON u.id = p.user_id
        WHERE p.project_id = $1
        UNION
        SELECT u.id as "userId", u.email, u.display_name as "displayName", pm.role, pm.created_at as "joinedAt"
        FROM fluxbase_global.project_members pm
        JOIN fluxbase_global.users u ON u.id = pm.user_id
        WHERE pm.project_id = $1
        ORDER BY "joinedAt" ASC
    `, [projectId]);

    return NextResponse.json({ members: res.rows });
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectId, email, role } = body;
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const pool = getPgPool();

        // 1. Verify that the requester is an ADMIN
        const requesterRes = await pool.query(`
            SELECT CASE WHEN p.user_id = $2 THEN 'admin' ELSE pm.role END as role
            FROM fluxbase_global.projects p
            LEFT JOIN fluxbase_global.project_members pm ON p.project_id = pm.project_id AND pm.user_id = $2
            WHERE p.project_id = $1 AND (p.user_id = $2 OR pm.user_id = $2)
        `, [projectId, auth.userId]);

        const requesterRole = requesterRes.rows[0]?.role;
        if (requesterRole !== 'admin') {
            return NextResponse.json({ success: false, error: 'Insufficient Permissions: Only Admins can manage team members.' }, { status: 403 });
        }

        // 2. Find user by email
        const userRes = await pool.query(`SELECT id FROM fluxbase_global.users WHERE email = $1`, [email]);
        if (userRes.rows.length === 0) return NextResponse.json({ success: false, error: `No user found with email "${email}". They must have a Fluxbase account.` }, { status: 404 });

        const memberId = userRes.rows[0].id;
        if (memberId === auth.userId) return NextResponse.json({ success: false, error: 'You cannot invite yourself' }, { status: 400 });

        await pool.query(
            `INSERT INTO fluxbase_global.project_members (project_id, user_id, role)
             VALUES ($1, $2, $3) ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
            [projectId, memberId, role]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPgPool();

    // Verify requester is admin
    const requesterRes = await pool.query(`
        SELECT CASE WHEN p.user_id = $2 THEN 'admin' ELSE pm.role END as role
        FROM fluxbase_global.projects p
        LEFT JOIN fluxbase_global.project_members pm ON p.project_id = pm.project_id AND pm.user_id = $2
        WHERE p.project_id = $1 AND (p.user_id = $2 OR pm.user_id = $2)
    `, [projectId, auth.userId]);

    if (requesterRes.rows[0]?.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Insufficient Permissions: Only Admins can manage team members.' }, { status: 403 });
    }

    await pool.query(`DELETE FROM fluxbase_global.project_members WHERE project_id = $1 AND user_id = $2`, [projectId, userId]);
    return NextResponse.json({ success: true });
}
