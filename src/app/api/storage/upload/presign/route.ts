import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import { getS3Client, getS3Bucket, buildS3Key, PLAN_STORAGE_LIMITS, PLAN_STORAGE_TOTAL_LIMITS } from '@/lib/storage';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ERROR_CODES } from '@/lib/error-codes';

export async function POST(req: NextRequest) {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
        return NextResponse.json({ success: false, error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } }, { status: 401 });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: { message: 'Invalid JSON body', code: ERROR_CODES.BAD_REQUEST } }, { status: 400 });
    }

    const { fileName, fileSize, mimeType, bucketId, projectId } = body;
    if (!fileName || fileSize === undefined || !mimeType || !bucketId || !projectId) {
        return NextResponse.json({ success: false, error: { message: 'fileName, fileSize, mimeType, bucketId and projectId are required', code: ERROR_CODES.MISSING_FIELD } }, { status: 400 });
    }

    // Validate project access
    const project = await getProjectById(projectId, auth.userId);
    if (!project) {
        return NextResponse.json({ success: false, error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } }, { status: 404 });
    }

    // Validate bucket ownership
    const pool = getPgPool();
    const bucketRes = await pool.query(
        `SELECT id FROM fluxbase_global.storage_buckets WHERE (id = $1 OR name = $1) AND project_id = $2`,
        [bucketId, projectId]
    );
    if (bucketRes.rows.length === 0) {
        return NextResponse.json({ success: false, error: { message: 'Bucket not found', code: ERROR_CODES.BUCKET_NOT_FOUND } }, { status: 404 });
    }
    const actualBucketId = bucketRes.rows[0].id;

    // Validate file size against plan
    const userPlanRes = await pool.query(`SELECT plan_type FROM fluxbase_global.users WHERE id = $1`, [auth.userId]);
    const planType = (userPlanRes.rows[0]?.plan_type || 'free') as keyof typeof PLAN_STORAGE_LIMITS;
    const maxSize = PLAN_STORAGE_LIMITS[planType] ?? PLAN_STORAGE_LIMITS.free;

    if (fileSize > maxSize) {
        const mb = (maxSize / 1024 / 1024).toFixed(0);
        return NextResponse.json({
            success: false,
            error: {
                message: `File too large. Your ${planType} plan allows up to ${mb} MB per file.`,
                code: ERROR_CODES.FILE_SIZE_EXCEEDED
            }
        }, { status: 413 });
    }

    // Validate total storage limit
    const totalLimit = PLAN_STORAGE_TOTAL_LIMITS[planType] ?? PLAN_STORAGE_TOTAL_LIMITS.free;
    const sizeRes = await pool.query(
        `SELECT COALESCE(SUM(size), 0) as total_size 
         FROM fluxbase_global.storage_objects 
         WHERE project_id IN (
             SELECT project_id FROM fluxbase_global.projects WHERE user_id = $1
         )`,
        [auth.userId]
    );
    const currentTotalSize = parseInt(sizeRes.rows[0].total_size, 10);

    if (currentTotalSize + fileSize > totalLimit) {
        const currentMB = (currentTotalSize / 1024 / 1024).toFixed(1);
        const limitGB = (totalLimit / 1024 / 1024 / 1024).toFixed(0);
        return NextResponse.json({
            success: false,
            error: {
                message: `Storage limit exceeded. You are using ${currentMB} MB of your ${limitGB} GB limit. Upgrading your plan will increase this limit.`,
                code: ERROR_CODES.STORAGE_QUOTA_EXCEEDED
            }
        }, { status: 403 });
    }

    // Build S3 Key & generate presigned PUT URL
    const s3Key = buildS3Key(projectId, actualBucketId, fileName);
    const s3Client = getS3Client();
    const s3Bucket = getS3Bucket();

    try {
        const command = new PutObjectCommand({
            Bucket: s3Bucket,
            Key: s3Key,
            ContentType: mimeType,
        });
        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour expiration
        return NextResponse.json({ success: true, uploadUrl, s3Key, actualBucketId });
    } catch (e: any) {
        console.error('Presigned URL generation error:', e);
        return NextResponse.json({ success: false, error: { message: 'Failed to generate S3 upload URL', code: ERROR_CODES.INTERNAL_ERROR } }, { status: 500 });
    }
}
