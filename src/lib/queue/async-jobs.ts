import { getPgPool } from '@/lib/pg';
import crypto from 'crypto';
import logger from '@/lib/logger';

export type JobType = 
    | 'PROJECT_PROVISION'
    | 'SCHEMA_MIGRATION'
    | 'DATABASE_BACKUP'
    | 'DATABASE_RESTORE'
    | 'BULK_CSV_IMPORT';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobRecord {
    id: string;
    job_type: JobType;
    status: JobStatus;
    progress: number;
    user_id: string | null;
    project_id: string | null;
    payload: any;
    result: any;
    error_message: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

let tableEnsured = false;

async function ensureJobsTable() {
    if (tableEnsured) return;
    try {
        const pool = getPgPool();
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.fluxbase_async_jobs (
                id VARCHAR(64) PRIMARY KEY,
                job_type VARCHAR(64) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                progress INT NOT NULL DEFAULT 0,
                user_id VARCHAR(64),
                project_id VARCHAR(64),
                payload JSONB,
                result JSONB,
                error_message TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_async_jobs_user ON fluxbase_global.fluxbase_async_jobs(user_id);
            CREATE INDEX IF NOT EXISTS idx_async_jobs_project ON fluxbase_global.fluxbase_async_jobs(project_id);
            CREATE INDEX IF NOT EXISTS idx_async_jobs_status ON fluxbase_global.fluxbase_async_jobs(status);
        `);
        tableEnsured = true;
    } catch (err: any) {
        logger.error('[AsyncJobs] Failed to ensure jobs table:', err);
    }
}

export async function createAsyncJob(
    jobType: JobType,
    payload: any,
    userId?: string | null,
    projectId?: string | null
): Promise<string> {
    await ensureJobsTable();
    const jobId = 'job_' + crypto.randomBytes(16).toString('hex');
    const pool = getPgPool();

    await pool.query(`
        INSERT INTO fluxbase_global.fluxbase_async_jobs 
        (id, job_type, status, progress, user_id, project_id, payload)
        VALUES ($1, $2, 'pending', 0, $3, $4, $5)
    `, [jobId, jobType, userId || null, projectId || null, JSON.stringify(payload || {})]);

    logger.info(`[AsyncJobs] Registered job ${jobId} of type ${jobType}`);
    return jobId;
}

export async function updateJobProgress(jobId: string, progress: number, status: JobStatus = 'processing') {
    await ensureJobsTable();
    const pool = getPgPool();
    await pool.query(`
        UPDATE fluxbase_global.fluxbase_async_jobs
        SET status = $1, progress = $2, updated_at = NOW()
        WHERE id = $3
    `, [status, progress, jobId]);
}

export async function completeJob(jobId: string, result: any) {
    await ensureJobsTable();
    const pool = getPgPool();
    await pool.query(`
        UPDATE fluxbase_global.fluxbase_async_jobs
        SET status = 'completed', progress = 100, result = $1, completed_at = NOW(), updated_at = NOW()
        WHERE id = $2
    `, [JSON.stringify(result || {}), jobId]);
    logger.info(`[AsyncJobs] Job ${jobId} completed successfully`);
}

export async function failJob(jobId: string, error: any) {
    await ensureJobsTable();
    const pool = getPgPool();
    const errorMessage = error instanceof Error ? error.message : String(error);
    await pool.query(`
        UPDATE fluxbase_global.fluxbase_async_jobs
        SET status = 'failed', error_message = $1, completed_at = NOW(), updated_at = NOW()
        WHERE id = $2
    `, [errorMessage, jobId]);
    logger.error(`[AsyncJobs] Job ${jobId} failed:`, errorMessage);
}

export async function getJobStatus(jobId: string): Promise<JobRecord | null> {
    await ensureJobsTable();
    const pool = getPgPool();
    const { rows } = await pool.query(`
        SELECT * FROM fluxbase_global.fluxbase_async_jobs WHERE id = $1
    `, [jobId]);

    if (rows.length === 0) return null;
    return rows[0];
}

/**
 * Dispatch an asynchronous job in the background and return immediately.
 */
export async function dispatchAsyncJob<T = any>(
    jobType: JobType,
    payload: any,
    handler: (jobId: string, update: (pct: number) => Promise<void>) => Promise<T>,
    userId?: string | null,
    projectId?: string | null
): Promise<{ jobId: string }> {
    const jobId = await createAsyncJob(jobType, payload, userId, projectId);

    // Execute asynchronously without blocking caller
    (async () => {
        try {
            await updateJobProgress(jobId, 5, 'processing');
            const result = await handler(jobId, async (pct: number) => {
                await updateJobProgress(jobId, pct, 'processing');
            });
            await completeJob(jobId, result);
        } catch (err: any) {
            await failJob(jobId, err);
        }
    })().catch(err => {
        logger.error(`[AsyncJobs] Unhandled dispatch crash on ${jobId}:`, err);
    });

    return { jobId };
}
