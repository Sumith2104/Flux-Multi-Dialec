import { NextResponse } from 'next/server';
import { getCurrentUserId, getAuthContextFromRequest } from '@/lib/auth';
import { SqlEngine } from '@/lib/sql-engine';
import { getProjectById } from '@/lib/data';
import { createHash } from 'crypto';

export const maxDuration = 60; // 1 minute

// Local burst cache for frequent identical queries (e.g. from external dashboards)
interface CacheEntry {
    result: any;
    explanation: any;
    executionInfo: any;
    expiresAt: number;
}
const queryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15000; // 15 seconds to catch duplicate concurrent loads while maintaining freshness

export async function POST(request: Request) {
    const startTime = Date.now();
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: { message: 'User not authenticated', code: 'AUTH_REQUIRED' } }, { status: 401 });
        const { userId, allowedProjectId } = auth;

        let { projectId, query } = await request.json();

        // Enforce Scope
        if (allowedProjectId) {
            if (projectId && projectId !== allowedProjectId) {
                return NextResponse.json({ success: false, error: { message: `API Key is scoped to project ${allowedProjectId}, but request specified ${projectId}`, code: 'SCOPE_MISMATCH' } }, { status: 403 });
            }
            // Auto-inject if missing
            if (!projectId) {
                projectId = allowedProjectId;
            }
        }

        if (!projectId || !query) {
            return NextResponse.json({ success: false, error: { message: 'Missing projectId or query', code: 'BAD_REQUEST' } }, { status: 400 });
        }

        // Burst Caching Logic
        const isSelect = typeof query === 'string' && query.trim().toUpperCase().startsWith('SELECT');
        let cacheKey = '';

        if (isSelect) {
            cacheKey = createHash('sha256').update(`${projectId}_${userId}_${query}`).digest('hex');
            const cached = queryCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                console.log(`[DEBUG] Serving cached result for query: ${query.substring(0, 50)}...`);
                return NextResponse.json({
                    success: true,
                    result: cached.result,
                    explanation: cached.explanation,
                    executionInfo: {
                        ...cached.executionInfo,
                        time: '0ms (Cached)'
                    }
                });
            }
        }

        console.log('[DEBUG] execute-sql Project Found Check:');
        console.log(`[DEBUG] Requested Project ID: ${projectId}`);
        console.log(`[DEBUG] Authenticated User ID: ${userId}`);

        const project = await getProjectById(projectId, userId);

        console.log(`[DEBUG] Project Found: ${!!project}`);
        if (!project) {
            console.error(`[DEBUG] Project Not Found. UserId: ${userId}, ProjectId: ${projectId}`);
            return NextResponse.json({ success: false, error: { message: 'Project not found', code: 'NOT_FOUND' } }, { status: 404 });
        }

        // Use the new SQL Engine
        const engine = new SqlEngine(projectId, userId);

        // Split multiple queries if any (semicolon) - basic support
        // The parser handles one statement at a time mostly, so we might need a loop if the UI sends multiple.
        // For now, assume single query or let parser handle first one.
        // If we want multiple statements, we'd need to split by ; not in quotes. 
        // Let's rely on the engine executing the single blob. The engine uses `astify` which returns array if multiple.
        // But our `execute` method currently handles the first AST. 
        // That is acceptable for now.

        let result;
        try {
            result = await engine.execute(query);
        } catch (e: any) {
            // Distinguish syntax errors from execution errors if possible
            return NextResponse.json({
                success: false,
                error: {
                    message: e.message || 'SQL Execution Error',
                    code: 'EXECUTION_ERROR',
                    hint: 'Check syntax and table names.'
                }
            }, { status: 200 });
        }

        const duration = Date.now() - startTime;

        const responseData = {
            success: true,
            result: {
                rows: result.rows || [],     // Ensure array
                columns: result.columns || [], // Ensure array
                message: result.message
            },
            explanation: result.explanation || [],
            executionInfo: {
                time: `${duration}ms`,
                rowCount: result.rows?.length || 0
            }
        };

        if (isSelect && cacheKey) {
            queryCache.set(cacheKey, {
                result: responseData.result,
                explanation: responseData.explanation,
                executionInfo: responseData.executionInfo,
                expiresAt: Date.now() + CACHE_TTL_MS
            });

            // Periodically clean up expired items to prevent memory leaks in long-running functions
            if (queryCache.size > 100) {
                const now = Date.now();
                for (const [k, v] of queryCache.entries()) {
                    if (v.expiresAt < now) queryCache.delete(k);
                }
            }
        }

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error('SQL Execution Failed:', error);
        return NextResponse.json({
            success: false,
            error: {
                message: error.message || 'An unexpected error occurred',
                code: 'INTERNAL_ERROR'
            }
        }, { status: 200 });
    }
}
