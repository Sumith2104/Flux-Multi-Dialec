import { NextResponse } from 'next/server';
import { getJobStatus } from '@/lib/queue/async-jobs';
import { getAuthContextFromRequest } from '@/lib/auth';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ jobId: string }> }
) {
    try {
        const auth = await getAuthContextFromRequest(request);
        const resolvedParams = await params;
        const jobId = resolvedParams?.jobId;

        if (!jobId) {
            return NextResponse.json({ success: false, error: 'Job ID required' }, { status: 400 });
        }

        const job = await getJobStatus(jobId);
        if (!job) {
            return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
        }

        // Security check: if job has a user_id, ensure caller matches or is system admin
        if (job.user_id && auth && auth.userId !== job.user_id) {
            return NextResponse.json({ success: false, error: 'Unauthorized to view this job' }, { status: 403 });
        }

        return NextResponse.json({
            success: true,
            job: {
                id: job.id,
                type: job.job_type,
                status: job.status,
                progress: job.progress,
                result: job.result,
                error: job.error_message,
                createdAt: job.created_at,
                updatedAt: job.updated_at,
                completedAt: job.completed_at
            }
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'Failed to fetch job' }, { status: 500 });
    }
}
