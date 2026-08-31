import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectsForCurrentUser } from '@/lib/data';
import logger from '@/lib/logger';

export async function GET(req: Request) {
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const projects = await getProjectsForCurrentUser();
        return NextResponse.json({ success: true, projects });
    } catch (error: any) {
        logger.error('API /api/projects error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
