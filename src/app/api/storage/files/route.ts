import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import { deleteFromS3 } from '@/lib/storage';

// GET /api/storage/files?bucketId=xxx&projectId=xxx
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get('bucketId');
    const projectId = searchParams.get('projectId');

    if (!bucketId || !projectId) {
        return NextResponse.json({ error: 'bucketId and projectId required' }, { status: 400 });
    }

    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const pool = getPgPool();
    const result = await pool.query(
        `SELECT id, name, s3_key, size, mime_type, created_at
         FROM fluxbase_global.storage_objects
         WHERE bucket_id = $1 AND project_id = $2
         ORDER BY created_at DESC`,
        [bucketId, projectId]
    );

    return NextResponse.json({ success: true, files: result.rows });
}

// DELETE /api/storage/files  body: { fileId, s3Key, projectId }
export async function DELETE(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { fileId, s3Key, projectId } = body;

    if (!fileId || !s3Key || !projectId) {
        return NextResponse.json({ error: 'fileId, s3Key and projectId required' }, { status: 400 });
    }

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const pool = getPgPool();
    // Verify the file belongs to this project
    const fileRes = await pool.query(
        `SELECT id FROM fluxbase_global.storage_objects WHERE id = $1 AND project_id = $2`,
        [fileId, projectId]
    );
    if (fileRes.rows.length === 0) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    // Delete from S3 first
    try {
        await deleteFromS3(s3Key);
    } catch (e: any) {
        console.error('S3 delete error:', e);
        // Continue to delete from DB even if S3 fails (orphan cleanup later)
    }

    // Delete from DB
    await pool.query(`DELETE FROM fluxbase_global.storage_objects WHERE id = $1`, [fileId]);

    return NextResponse.json({ success: true });
}
