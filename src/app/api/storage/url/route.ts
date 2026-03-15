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
    const s3Key = searchParams.get('s3Key');
    const projectId = searchParams.get('projectId');

    if (!s3Key || !projectId) {
        return NextResponse.json({ success: false, error: { message: 's3Key and projectId required', code: ERROR_CODES.BAD_REQUEST } }, { status: 400 });
    }

    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ success: false, error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } }, { status: 401 });

    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ success: false, error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } }, { status: 404 });

    // Verify the s3Key belongs to this project
    const pool = getPgPool();
    const fileRes = await pool.query(
        `SELECT id FROM fluxbase_global.storage_objects WHERE s3_key = $1 AND project_id = $2`,
        [s3Key, projectId]
    );
    if (fileRes.rows.length === 0) {
        return NextResponse.json({ success: false, error: { message: 'File not found', code: ERROR_CODES.FILE_NOT_FOUND } }, { status: 404 });
    }

    try {
        const url = await getPresignedUrl(s3Key, 900); // 15 minutes
        return NextResponse.json({ success: true, url, expiresIn: 900 });
    } catch (e: any) {
        console.error('Presign error:', e);
        return NextResponse.json({ success: false, error: { message: 'Failed to generate URL', code: ERROR_CODES.INTERNAL_ERROR } }, { status: 500 });
    }
}
