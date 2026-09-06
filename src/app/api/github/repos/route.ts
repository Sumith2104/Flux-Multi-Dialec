import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getGitHubToken } from '@/lib/github-token';
import { GitHubClient } from '@/lib/github-client';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = await getGitHubToken(userId);
    if (!token) {
        return NextResponse.json({
            success: false,
            connected: false,
            error: 'GitHub account is not connected. Please connect your GitHub account first.'
        }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(100, parseInt(searchParams.get('per_page') || '30', 10));
    const sort = searchParams.get('sort') || 'updated';
    const search = searchParams.get('search')?.trim() || '';

    // Check Redis cache for standard pagination
    const cacheKey = `github_repos:${userId}:${page}:${perPage}:${sort}:${search}`;
    try {
        const { redis } = await import('@/lib/redis');
        const cached = await redis.get(cacheKey);
        if (cached) {
            const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
            return NextResponse.json({ success: true, connected: true, ...parsed });
        }
    } catch {
        // Redis error/not configured — continue without cache
    }

    try {
        const client = new GitHubClient(token);
        let repos: import('@/lib/github-client').GitHubRepo[] = [];

        if (search) {
            repos = await client.searchUserRepos(search);
        } else {
            repos = await client.listRepos(page, perPage, sort);
        }

        const resultData = {
            repos,
            hasMore: repos.length === perPage,
            page,
            perPage
        };

        // Cache for 60 seconds
        try {
            const { redis } = await import('@/lib/redis');
            await redis.set(cacheKey, JSON.stringify(resultData), { ex: 60 });
        } catch {}

        return NextResponse.json({
            success: true,
            connected: true,
            ...resultData
        });
    } catch (err: any) {
        logger.error('[GitHub Repos API] Error:', err);
        return NextResponse.json({
            success: false,
            connected: true,
            error: err.message || 'Failed to fetch GitHub repositories'
        }, { status: 500 });
    }
}
