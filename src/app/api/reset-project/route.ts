
import { NextResponse } from 'next/server';
import { resetProjectData } from '@/lib/data';
import { getCurrentUserId } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        const { projectId } = await request.json();
        if (!projectId) {
            return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
        }

        await resetProjectData(projectId);

        return NextResponse.json({ success: true, message: 'Database reset successfully.' });

    } catch (error: any) {
        console.error('Failed to reset database:', error);
        return NextResponse.json({ error: error.message || 'Failed to reset database' }, { status: 500 });
    }
}
