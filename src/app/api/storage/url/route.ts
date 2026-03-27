import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import { getPresignedUrl } from '@/lib/storage';

import { ERROR_CODES } from '@/lib/error-codes';

// GET /api/storage/url?s3Key=xxx&projectId=xxx
// Returns a 15-minute presigned download URL for a private S3 object
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const s3KeyParam = searchParams.get('s3Key') || searchParams.get('fileId') || searchParams.get('id');
    const projectId = searchParams.get('projectId');

    if (!s3KeyParam || !projectId) {
        return NextResponse.json({ success: false, error: { message: 's3Key (or fileId) and projectId required', code: ERROR_CODES.BAD_REQUEST } }, { status: 400 });
    }

    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ success: false, error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } }, { status: 401 });

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ success: false, error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } }, { status: 404 });

    // Verify the file belongs to this project by exact S3 Key OR unique File ID
    const pool = getPgPool();
    const fileRes = await pool.query(
        `SELECT id, s3_key FROM fluxbase_global.storage_objects WHERE (s3_key = $1 OR id = $1) AND project_id = $2`,
        [s3KeyParam, projectId]
    );
    if (fileRes.rows.length === 0) {
        return NextResponse.json({ success: false, error: { message: 'File not found', code: ERROR_CODES.FILE_NOT_FOUND } }, { status: 404 });
    }
    
    const actualS3Key = fileRes.rows[0].s3_key;

    try {
        const url = await getPresignedUrl(actualS3Key, 900); // 15 minutes
        return NextResponse.json({ success: true, url, expiresIn: 900 });
    } catch (e: any) {
        console.error('Presign error:', e);
        return NextResponse.json({ success: false, error: { message: 'Failed to generate URL', code: ERROR_CODES.INTERNAL_ERROR } }, { status: 500 });
    }
}
