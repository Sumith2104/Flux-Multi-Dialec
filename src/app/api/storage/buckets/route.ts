import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import crypto from 'crypto';

// GET /api/storage/buckets?projectId=xxx  - list buckets
// POST /api/storage/buckets               - create bucket
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const pool = getPgPool();
    const result = await pool.query(
        `SELECT id, name, is_public, created_at FROM fluxbase_global.storage_buckets WHERE project_id = $1 ORDER BY created_at ASC`,
        [projectId]
    );
    return NextResponse.json({ success: true, buckets: result.rows });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { projectId, name, isPublic = false } = body;
    if (!projectId || !name) return NextResponse.json({ error: 'projectId and name required' }, { status: 400 });

    // Validate bucket name
    if (!/^[a-z0-9][a-z0-9\-_]{0,62}$/.test(name)) {
        return NextResponse.json({
            error: 'Bucket name must be lowercase alphanumeric, hyphens or underscores, 1-63 chars'
        }, { status: 400 });
    }

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const pool = getPgPool();
    const id = crypto.randomUUID();
    try {
        const result = await pool.query(
            `INSERT INTO fluxbase_global.storage_buckets (id, project_id, name, is_public) VALUES ($1, $2, $3, $4) RETURNING *`,
            [id, projectId, name, isPublic]
        );
        return NextResponse.json({ success: true, bucket: result.rows[0] });
    } catch (e: any) {
        if (e.code === '23505') {
            return NextResponse.json({ error: 'A bucket with this name already exists' }, { status: 409 });
        }
        throw e;
    }
}

export async function PATCH(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { bucketId, projectId, name } = body;
    if (!bucketId || !projectId || !name) return NextResponse.json({ error: 'bucketId, projectId, and name required' }, { status: 400 });

    if (!/^[a-z0-9][a-z0-9\-_]{0,62}$/.test(name)) {
        return NextResponse.json({ error: 'Invalid bucket name' }, { status: 400 });
    }

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const pool = getPgPool();
    try {
        const result = await pool.query(
            `UPDATE fluxbase_global.storage_buckets SET name = $1 WHERE id = $2 AND project_id = $3 RETURNING *`,
            [name, bucketId, projectId]
        );
        if (result.rows.length === 0) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
        return NextResponse.json({ success: true, bucket: result.rows[0] });
    } catch (e: any) {
        if (e.code === '23505') return NextResponse.json({ error: 'Bucket name already exists' }, { status: 409 });
        throw e;
    }
}

export async function DELETE(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { bucketId, projectId } = body;
    if (!bucketId || !projectId) return NextResponse.json({ error: 'bucketId and projectId required' }, { status: 400 });

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Since we don't have bulk S3 delete easily accessible here and keeping API fast,
    // we just delete bucket from DB. 'storage_objects' cascades,
    // S3 cleanup can be a cron job later, or if bucket is empty.
    const pool = getPgPool();
    
    // Optional: Only allow deleting empty buckets for now to prevent S3 orphans
    const countRes = await pool.query(`SELECT COUNT(*) as count FROM fluxbase_global.storage_objects WHERE bucket_id = $1`, [bucketId]);
    if (parseInt(countRes.rows[0].count) > 0) {
        return NextResponse.json({ error: 'Bucket is not empty. Delete all files inside first.' }, { status: 400 });
    }

    const result = await pool.query(`DELETE FROM fluxbase_global.storage_buckets WHERE id = $1 AND project_id = $2 RETURNING id`, [bucketId, projectId]);
    if (result.rows.length === 0) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });

    return NextResponse.json({ success: true });
}
