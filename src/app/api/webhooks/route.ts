import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import { ERROR_CODES } from '@/lib/error-codes';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
        return NextResponse.json(
            { success: false, error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } },
            { status: 401 }
        );
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { success: false, error: { message: 'Invalid JSON body', code: ERROR_CODES.BAD_REQUEST } },
            { status: 400 }
        );
    }

    const { projectId, name, url, event, table_id, secret, is_active } = body;

    if (!projectId || !name || !url || !event || !table_id) {
        return NextResponse.json(
            { success: false, error: { message: 'Missing required fields: projectId, name, url, event, table_id', code: ERROR_CODES.MISSING_FIELD } },
            { status: 400 }
        );
    }

    // Validate project access & role
    const project = await getProjectById(projectId, auth.userId);
    if (!project) {
        return NextResponse.json(
            { success: false, error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } },
            { status: 404 }
        );
    }

    if (project.role === 'viewer') {
        return NextResponse.json(
            { success: false, error: { message: 'Insufficient Permissions: Viewers cannot create webhooks.', code: ERROR_CODES.FORBIDDEN } },
            { status: 403 }
        );
    }

    // Validate URL
    try {
        new URL(url);
    } catch {
        return NextResponse.json(
            { success: false, error: { message: 'Invalid webhook URL', code: ERROR_CODES.BAD_REQUEST } },
            { status: 400 }
        );
    }

    const webhookId = crypto.randomUUID();
    const active = is_active !== undefined ? Boolean(is_active) : true;
    const pool = getPgPool();

    try {
        await pool.query(
            `INSERT INTO fluxbase_global.webhooks 
            (webhook_id, project_id, user_id, name, url, event, table_id, secret, is_active) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [webhookId, projectId, auth.userId, name, url, event, table_id, secret || null, active]
        );

        return NextResponse.json({
            success: true,
            webhook: {
                id: webhookId,
                projectId,
                name,
                url,
                event,
                table_id,
                is_active: active
            }
        });
    } catch (e: any) {
        console.error("Error creating webhook:", e);
        return NextResponse.json(
            { success: false, error: { message: 'Failed to create webhook', code: 'INTERNAL_ERROR' } },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
        return NextResponse.json(
            { success: false, error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } },
            { status: 401 }
        );
    }

    const projectId = req.nextUrl.searchParams.get('projectId');
    if (!projectId) {
        return NextResponse.json(
            { success: false, error: { message: 'projectId query parameter is required', code: ERROR_CODES.MISSING_FIELD } },
            { status: 400 }
        );
    }

    const project = await getProjectById(projectId, auth.userId);
    if (!project) {
        return NextResponse.json(
            { success: false, error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } },
            { status: 404 }
        );
    }

    const pool = getPgPool();
    try {
        const res = await pool.query(
            `SELECT webhook_id as id, name, url, event, table_id, secret, is_active, created_at 
             FROM fluxbase_global.webhooks 
             WHERE project_id = $1
             ORDER BY created_at DESC`,
            [projectId]
        );

        return NextResponse.json({
            success: true,
            webhooks: res.rows
        });
    } catch (e: any) {
        console.error("Error fetching webhooks:", e);
        return NextResponse.json(
            { success: false, error: { message: 'Failed to fetch webhooks', code: 'INTERNAL_ERROR' } },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
        return NextResponse.json(
            { success: false, error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } },
            { status: 401 }
        );
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { success: false, error: { message: 'Invalid JSON body', code: ERROR_CODES.BAD_REQUEST } },
            { status: 400 }
        );
    }

    const { projectId, webhookId } = body;

    if (!projectId || !webhookId) {
        return NextResponse.json(
            { success: false, error: { message: 'Missing required fields: projectId, webhookId', code: ERROR_CODES.MISSING_FIELD } },
            { status: 400 }
        );
    }

    const project = await getProjectById(projectId, auth.userId);
    if (!project) {
        return NextResponse.json(
            { success: false, error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } },
            { status: 404 }
        );
    }

    if (project.role === 'viewer') {
        return NextResponse.json(
            { success: false, error: { message: 'Insufficient Permissions: Viewers cannot delete webhooks.', code: ERROR_CODES.FORBIDDEN } },
            { status: 403 }
        );
    }

    const pool = getPgPool();
    try {
        // Allow admins/developers to delete any project webhook, not just their own
        const res = await pool.query(
            `DELETE FROM fluxbase_global.webhooks WHERE webhook_id = $1 AND project_id = $2 RETURNING webhook_id`,
            [webhookId, projectId]
        );

        if (res.rowCount === 0) {
            return NextResponse.json(
                { success: false, error: { message: 'Webhook not found', code: 'NOT_FOUND' } },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error("Error deleting webhook:", e);
        return NextResponse.json(
            { success: false, error: { message: 'Failed to delete webhook', code: 'INTERNAL_ERROR' } },
            { status: 500 }
        );
    }
}
