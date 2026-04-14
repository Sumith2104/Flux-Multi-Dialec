import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import { uploadToS3, buildS3Key, PLAN_STORAGE_LIMITS } from '@/lib/storage';
import { ERROR_CODES } from '@/lib/error-codes';
import crypto from 'crypto';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) return NextResponse.json({ success: false, error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } }, { status: 401 });

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ success: false, error: { message: 'Invalid form data. Ensure Multipart encoding.', code: ERROR_CODES.BAD_REQUEST } }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    const bucketId = formData.get('bucketId') as string | null;
    const projectId = formData.get('projectId') as string | null;

    if (!file || !bucketId || !projectId) {
        return NextResponse.json({ success: false, error: { message: 'file, bucketId and projectId are required', code: ERROR_CODES.MISSING_FIELD } }, { status: 400 });
    }

    // Validate project access
    const project = await getProjectById(projectId, auth.userId);
    if (!project) return NextResponse.json({ success: false, error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } }, { status: 404 });

    // Validate bucket ownership (supports both ID or Name)
    const pool = getPgPool();
    const bucketRes = await pool.query(
        `SELECT id, name FROM fluxbase_global.storage_buckets WHERE (id = $1 OR name = $1) AND project_id = $2`,
        [bucketId, projectId]
    );
    if (bucketRes.rows.length === 0) return NextResponse.json({ success: false, error: { message: 'Bucket not found', code: ERROR_CODES.BUCKET_NOT_FOUND } }, { status: 404 });
    
    // IMPORTANT: use the canonical UUID from the database for consistency in S3 keys and metadata
    const actualBucketId = bucketRes.rows[0].id;

    // Automatically accept any file type
    const mimeType = file.type || 'application/octet-stream';

    // Validate file size against plan
    const pool2 = getPgPool();
    const userPlanRes = await pool2.query(`SELECT plan_type FROM fluxbase_global.users WHERE id = $1`, [auth.userId]);
    const planType = (userPlanRes.rows[0]?.plan_type || 'free') as keyof typeof PLAN_STORAGE_LIMITS;
    const maxSize = PLAN_STORAGE_LIMITS[planType] ?? PLAN_STORAGE_LIMITS.free;

    if (file.size > maxSize) {
        const mb = (maxSize / 1024 / 1024).toFixed(0);
        return NextResponse.json({
            success: false,
            error: {
                message: `File too large. Your ${planType} plan allows up to ${mb} MB per file.`,
                code: ERROR_CODES.FILE_SIZE_EXCEEDED
            }
        }, { status: 413 });
    }

    // Upload to S3
    const buffer = Buffer.from(await file.arrayBuffer());
    const s3Key = buildS3Key(projectId, actualBucketId, file.name);

    try {
        await uploadToS3(s3Key, buffer, mimeType);
    } catch (e: any) {
        console.error('S3 upload error:', e);
        return NextResponse.json({ success: false, error: { message: 'S3 storage backend failure', code: ERROR_CODES.INTERNAL_ERROR } }, { status: 500 });
    }

    // Save metadata to DB
    const id = crypto.randomUUID();
    const result = await pool.query(
        `INSERT INTO fluxbase_global.storage_objects (id, bucket_id, project_id, name, s3_key, size, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, actualBucketId, projectId, file.name, s3Key, file.size, mimeType]
    );

    return NextResponse.json({ success: true, file: result.rows[0] });
}
