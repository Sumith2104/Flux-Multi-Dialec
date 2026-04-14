import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
    if (!s3Client) {
        s3Client = new S3Client({
            region: process.env.AWS_S3_REGION || process.env.AWS_REGION || 'ap-south-1',
            credentials: {
                accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY!,
            },
        });
    }
    return s3Client;
}

export function getS3Bucket(): string {
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) throw new Error('AWS_S3_BUCKET environment variable is not set');
    return bucket;
}

/**
 * Builds the S3 key for a file in a project bucket.
 * Format: project_{projectId}/buckets/{bucketId}/{filename}
 */
export function buildS3Key(projectId: string, bucketId: string, filename: string): string {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._\-\/]/g, '_');
    return `project_${projectId}/buckets/${bucketId}/${Date.now()}_${safeFilename}`;
}

export async function uploadToS3(
    key: string,
    buffer: Buffer,
    mimeType: string
): Promise<void> {
    const client = getS3Client();
    const bucket = getS3Bucket();
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        // Explicitly private
        ACL: undefined,
    }));
}

export async function deleteFromS3(key: string): Promise<void> {
    const client = getS3Client();
    const bucket = getS3Bucket();
    await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    }));
}

/**
 * Generates a short-lived presigned GET URL for a private S3 object.
 * Default: 15 minutes (900 seconds)
 */
export async function getPresignedUrl(
    key: string,
    expiresIn: number = 900
): Promise<string> {
    const client = getS3Client();
    const bucket = getS3Bucket();
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    return getSignedUrl(client, command, { expiresIn });
}

// Plan-based size limits (in bytes)
export const PLAN_STORAGE_LIMITS = {
    free: 50 * 1024 * 1024,   // 50 MB per file
    pro: 500 * 1024 * 1024,   // 500 MB per file
    max: 2 * 1024 * 1024 * 1024, // 2 GB per file
} as const;
