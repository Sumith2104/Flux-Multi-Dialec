import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest, getCurrentUserId } from '@/lib/auth';
import { sendTeamInviteEmail } from '@/lib/email';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const scope = searchParams.get('scope'); // 'project' or 'my-invites'
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPgPool();

    if (scope === 'my-invites') {
        const res = await pool.query(`
            SELECT pi.id, pi.role, pi.created_at as "invitedAt",
                   p.display_name as "projectName", 
                   u.display_name as "inviterName"
            FROM fluxbase_global.project_invitations pi
            JOIN fluxbase_global.projects p ON p.project_id = pi.project_id
            JOIN fluxbase_global.users u ON u.id = pi.invited_by
            WHERE pi.email = $1 AND pi.status = 'pending'
        `, [auth.email]);
        return NextResponse.json({ invites: res.rows });
    }

    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

    // 1. Get project members
    const membersRes = await pool.query(`
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

    // 2. Get pending invites for this project (Admins only)
    const invitesRes = await pool.query(`
        SELECT pi.id, pi.email, pi.role, pi.created_at as "invitedAt"
        FROM fluxbase_global.project_invitations pi
        WHERE pi.project_id = $1 AND pi.status = 'pending'
    `, [projectId]);

    return NextResponse.json({ 
        members: membersRes.rows,
        invites: invitesRes.rows 
    });
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

        // 3. Create Invitation
        const inviteId = crypto.randomUUID();
        await pool.query(
            `INSERT INTO fluxbase_global.project_invitations (id, project_id, email, invited_by, role)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (project_id, email) WHERE status = 'pending' 
             DO UPDATE SET role = EXCLUDED.role, created_at = CURRENT_TIMESTAMP`,
            [inviteId, projectId, email, auth.userId, role]
        );

        // 4. Send Email
        const inviterRes = await pool.query(`SELECT display_name FROM fluxbase_global.users WHERE id = $1`, [auth.userId]);
        const projectRes = await pool.query(`SELECT display_name FROM fluxbase_global.projects WHERE project_id = $1`, [projectId]);
        
        const inviterName = inviterRes.rows[0]?.display_name || 'A team member';
        const projectName = projectRes.rows[0]?.display_name || 'a project';

        await sendTeamInviteEmail(email, inviterName, projectName, role);

        return NextResponse.json({ success: true, invited: true });
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
