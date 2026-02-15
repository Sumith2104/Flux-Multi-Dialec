
import { NextResponse } from 'next/server';
import { listApiKeys } from '@/lib/api-keys';

export async function GET() {
    // The user ID we found that owns the project
    const targetUserId = '8Zx6fKHOWBcyCxVMESw3qq7hLbD2';

    try {
        const projectId = 'tygeNt1kN5juQ6jGyjTP';
        // Generate a test key
        const { generateApiKey } = await import('@/lib/api-keys');
        const newKey = await generateApiKey(targetUserId, 'Test Scoped Key ' + Date.now(), projectId, 'Test Project');

        return NextResponse.json({
            message: 'Generated new scoped key',
            newKey: newKey.key,
            scope: projectId
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
