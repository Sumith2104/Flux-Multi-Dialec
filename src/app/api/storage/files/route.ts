import { NextRequest, NextResponse } from 'next/server';
import { getPgPool, handleDatabaseError } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import { deleteFromS3 } from '@/lib/storage';
import { ERROR_CODES } from '@/lib/error-codes';

// GET /api/storage/files?bucketId=xxx&projectId=xxx
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get('bucketId');
    const projectId = searchParams.get('projectId');

    if (!bucketId || !projectId) {
        return NextResponse.json({ success: false, error: { message: 'bucketId and projectId required', code: ERROR_CODES.BAD_REQUEST } }, { status: 400 });
    }

    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ success: false, error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } }, { status: 401 });

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ success: false, error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } }, { status: 404 });

    try {
        const pool = getPgPool();
        
        // Resolve bucket ID first (supports both ID or Name)
        const bucketQuery = await pool.query(
            `SELECT id FROM fluxbase_global.storage_buckets WHERE (id = $1 OR name = $1) AND project_id = $2`,
            [bucketId, projectId]
        );

        if (bucketQuery.rows.length === 0) {
            return NextResponse.json({ success: false, error: { message: 'Bucket not found', code: ERROR_CODES.BUCKET_NOT_FOUND } }, { status: 404 });
        }

        const actualBucketId = bucketQuery.rows[0].id;

        const result = await pool.query(
            `SELECT id, name, s3_key, size, mime_type, created_at
             FROM fluxbase_global.storage_objects
             WHERE bucket_id = $1 AND project_id = $2
             ORDER BY created_at DESC`,
            [actualBucketId, projectId]
        );

        return NextResponse.json({ success: true, files: result.rows });
    } catch (e) {
        return handleDatabaseError(e);
    }
}

// DELETE /api/storage/files  body: { fileId, s3Key, projectId }
export async function DELETE(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ success: false, error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } }, { status: 401 });

    const body = await req.json();
    const { fileId, s3Key, projectId } = body;

    if (!fileId || !s3Key || !projectId) {
        return NextResponse.json({ success: false, error: { message: 'fileId, s3Key and projectId required', code: ERROR_CODES.BAD_REQUEST } }, { status: 400 });
    }

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    try {
        const pool = getPgPool();
        // Verify the file belongs to this project
        const fileRes = await pool.query(
            `SELECT id FROM fluxbase_global.storage_objects WHERE id = $1 AND project_id = $2`,
            [fileId, projectId]
        );
        if (fileRes.rows.length === 0) return NextResponse.json({ success: false, error: { message: 'File not found', code: ERROR_CODES.FILE_NOT_FOUND } }, { status: 404 });

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
    } catch (e) {
        return handleDatabaseError(e);
    }
}
