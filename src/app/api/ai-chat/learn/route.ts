import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { recordAiErrorSolution } from '@/lib/ai-memory';

export async function POST(req: Request) {
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { projectId, dialect, errorCategory, errorMessage, failedQuery, verifiedFix } = body;

        if (!errorMessage || !failedQuery) {
            return NextResponse.json({ success: false, error: 'Missing required error parameters' }, { status: 400 });
        }

        const success = await recordAiErrorSolution(
            projectId,
            dialect || 'postgresql',
            errorCategory || 'sql_execution_error',
            errorMessage,
            failedQuery,
            verifiedFix || 'Review SQL syntax and constraint types.'
        );

        return NextResponse.json({ success });
    } catch (e: any) {
        console.error('[AI Memory Route Error]:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
