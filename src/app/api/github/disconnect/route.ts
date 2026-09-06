import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { revokeGitHubToken } from '@/lib/github-token';
import logger from '@/lib/logger';

export async function POST(request: NextRequest) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await revokeGitHubToken(userId);
        logger.info(`[GitHub Disconnect] Revoked GitHub connection for user ${userId}`);

        // Invalidate redis cache for repos if any
        try {
            const { redis } = await import('@/lib/redis');
            const keys = await redis.keys(`github_repos:${userId}:*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch {}

        return NextResponse.json({ success: true, message: 'GitHub disconnected successfully' });
    } catch (err: any) {
        logger.error('[GitHub Disconnect API] Error:', err);
        return NextResponse.json({ success: false, error: err.message || 'Failed to disconnect' }, { status: 500 });
    }
}
