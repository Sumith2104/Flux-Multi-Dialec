
import { NextResponse } from 'next/server';
import { listApiKeys } from '@/lib/api-keys';

export async function GET() {
    // The user ID we found that owns the project
    const targetUserId = '8Zx6fKHOWBcyCxVMESw3qq7hLbD2';

    try {
        const keys = await listApiKeys(targetUserId);
        return NextResponse.json({
            userId: targetUserId,
            keyCount: keys.length,
            keys: keys.map(k => ({
                id: k.id,
                name: k.name,
                projectId: k.projectId,
                preview: k.preview,
                createdAt: k.createdAt
            }))
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
