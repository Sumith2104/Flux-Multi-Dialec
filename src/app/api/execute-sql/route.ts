import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getCurrentUserId, getAuthContextFromRequest } from '@/lib/auth';
import { SqlEngine } from '@/lib/sql-engine';
import { getProjectById, logAuditAction } from '@/lib/data';
import { createHash } from 'crypto';
import { redis } from '@/lib/redis';
import { invalidateTableCache } from '@/lib/cache';
import { Ratelimit } from '@upstash/ratelimit';
import { ERROR_CODES, FluxbaseError } from '@/lib/error-codes';
import { fireWebhooks, WebhookEvent } from '@/lib/webhooks';

export const maxDuration = 60; // 1 minute

// Upstash Burst cache for frequent identical queries (e.g. from external dashboards)
interface CacheEntry {
    result: any;
    explanation: any;
    executionInfo: any;
    expiresAt: number;
}
const CACHE_TTL_SECONDS = 15; // 15 seconds to catch duplicate concurrent loads while maintaining freshness

export async function POST(request: Request) {
    const startTime = Date.now();
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: { message: 'User not authenticated or token expired', code: ERROR_CODES.AUTH_REQUIRED } }, { status: 401 });
        const { userId, allowedProjectId } = auth;

        let { projectId, query, params } = await request.json();

        // Enforce Scope
        if (allowedProjectId) {
            if (projectId && projectId !== allowedProjectId) {
                return NextResponse.json({ success: false, error: { message: `API Key is scoped to project ${allowedProjectId}, but request specified ${projectId}`, code: ERROR_CODES.SCOPE_MISMATCH } }, { status: 403 });
            }
            // Auto-inject if missing
            if (!projectId) {
                projectId = allowedProjectId;
            }
        }

        if (!projectId || !query) {
            return NextResponse.json({ success: false, error: { message: 'Missing projectId or query', code: ERROR_CODES.BAD_REQUEST } }, { status: 400 });
        }

        // Global API Rate Limiting Setup
        const ratelimit = new Ratelimit({
            redis: redis,
            limiter: Ratelimit.slidingWindow(30, '10 s'), // 30 requests per 10 seconds per user-project pairing
            analytics: true,
        });

        const { success: rlSuccess } = await ratelimit.limit(`ratelimit_flux_query_${projectId}_${userId}`);
        if (!rlSuccess) {
            return NextResponse.json({
                success: false,
                error: { message: 'Too many simultaneous queries executing. Rate limit exceeded.', code: ERROR_CODES.RATE_LIMIT_EXCEEDED }
            }, { status: 429 });
        }

        // Burst Caching Logic
        const isSelect = typeof query === 'string' && query.trim().toUpperCase().startsWith('SELECT');
        let cacheKey = '';

        if (isSelect) {
            const paramsString = params ? JSON.stringify(params) : '';
            cacheKey = createHash('sha256').update(`fluxQuery_${projectId}_${userId}_${query}_${paramsString}`).digest('hex');

            try {
                const cached = await redis.get<CacheEntry>(cacheKey);
                if (cached && cached.expiresAt > Date.now()) {
                    return NextResponse.json({
                        success: true,
                        result: cached.result,
                        explanation: cached.explanation,
                        executionInfo: {
                            ...cached.executionInfo,
                            time: '0ms (Global Cache)'
                        }
                    });
                }
            } catch (redisErr) {
                console.warn('[Redis Error] Cache read failed, falling back to DB:', redisErr);
            }
        }

        const project = await getProjectById(projectId, userId);

        if (!project) {
            return NextResponse.json({ success: false, error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } }, { status: 404 });
        }

        try {
            const { checkProjectTrafficLimits } = await import('@/lib/limits');
            await checkProjectTrafficLimits(projectId);
        } catch (limitErr: any) {
             return NextResponse.json({
                success: false,
                error: { message: limitErr.message || 'Limit Exceeded', code: ERROR_CODES.RATE_LIMIT_EXCEEDED }
            }, { status: 403 });
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
            result = await engine.execute(query, params);
        } catch (e: any) {
            // Check if it's a FluxbaseError
            if (e instanceof FluxbaseError) {
                return NextResponse.json(e.toJSON(), { status: e.status });
            }
            return NextResponse.json({
                success: false,
                error: {
                    message: e.message || 'SQL Execution Error',
                    code: ERROR_CODES.SQL_EXECUTION_ERROR,
                    hint: 'Check syntax and table names.'
                }
            }, { status: 200 });
        }

        const duration = Date.now() - startTime;

        if (!isSelect) {
            // Synchronously await audit logging to prevent Next.js serverless early termination
            await logAuditAction(projectId, userId, 'SQL_EXECUTION', query, {
                duration_ms: duration,
                rows_affected: result.rows?.length || 0,
                status: 'success'
            }).catch(e => console.error(e));

            // Aggressive Cache Invalidation (Extracted from Regex)
            const uppercaseQuery = typeof query === 'string' ? query.trim().toUpperCase() : '';
            let mutatedTable = null;

            const optSchema = `(?:["'\`]?[a-zA-Z0-9_]+["'\`]?\\.)?`;
            const tblName = `["'\`]?([a-zA-Z0-9_]+)["'\`]?`;

            const insertMatch = query.match(new RegExp(`INTO\\s+${optSchema}${tblName}`, 'i'));
            const updateMatch = query.match(new RegExp(`UPDATE\\s+${optSchema}${tblName}`, 'i'));
            const deleteMatch = query.match(new RegExp(`FROM\\s+${optSchema}${tblName}`, 'i')); // Simple heuristic for DELETE FROM

            if (insertMatch && insertMatch[1]) mutatedTable = insertMatch[1];
            else if (updateMatch && updateMatch[1]) mutatedTable = updateMatch[1];
            else if (uppercaseQuery.startsWith('DELETE') && deleteMatch && deleteMatch[1]) mutatedTable = deleteMatch[1];

            if (mutatedTable) {
                await invalidateTableCache(projectId, mutatedTable.toLowerCase()).catch(err => {
                    console.warn(`[Upstash Invalidation Error] Failed to invalidate cache for ${mutatedTable}:`, err);
                });

                // Fire Outbound Webhooks and Real-Time SSE
                const webhookEvent = uppercaseQuery.startsWith('INSERT') 
                    ? 'row.inserted' 
                    : uppercaseQuery.startsWith('UPDATE') 
                        ? 'row.updated' 
                        : 'row.deleted';

                let newDataParsed: Record<string, any> | undefined = undefined;

                if (webhookEvent === 'row.inserted') {
                    try {
                        const { Parser } = require('node-sql-parser');
                        const parser = new Parser();
                        const ast: any = parser.astify(query);
                        const insertAst = Array.isArray(ast) ? ast[0] : ast;
                        
                        if (insertAst && insertAst.type === 'insert' && Array.isArray(insertAst.columns)) {
                            const cols = insertAst.columns;
                            const valsNode = Array.isArray(insertAst.values) ? insertAst.values : insertAst.values?.values;
                            
                            if (Array.isArray(valsNode) && valsNode.length > 0) {
                                const rowVals = valsNode[0].value;
                                newDataParsed = {};
                                for (let i = 0; i < cols.length; i++) {
                                    newDataParsed[cols[i]] = rowVals[i]?.value ?? null;
                                }
                            }
                        }
                    } catch (parserErr) {
                        console.error('[AST Webhook Parser] Failed to parse INSERT row data:', parserErr);
                    }
                }

                // We await fireWebhooks so Vercel does not terminate the lambda before outbound POSTs complete
                await fireWebhooks(
                    projectId, 
                    userId, 
                    mutatedTable.toLowerCase(), 
                    webhookEvent as WebhookEvent,
                    newDataParsed || (uppercaseQuery.startsWith('INSERT') && Array.isArray(params) ? { raw_params: params } : undefined)
                ).catch(err => console.error(`[Webhook Dispatch Error]`, err));

                // Fire SSE Live Broadcast for Vercel
                try {
                    const pool = getPgPool();
                    const payload = {
                        event_type: 'raw_sql_mutation',
                        table_id: mutatedTable.toLowerCase(),
                        table_name: mutatedTable.toLowerCase(),
                        operation: uppercaseQuery.startsWith('INSERT') ? 'INSERT' : uppercaseQuery.startsWith('UPDATE') ? 'UPDATE' : 'DELETE',
                        timestamp: new Date().toISOString(),
                        project_id: projectId,
                        data: {}
                    };
                    const payloadString = JSON.stringify(payload).replace(/'/g, "''");
                    await pool.query(`NOTIFY fluxbase_live, '${payloadString}'`).catch(err => {
                        console.warn(`[SSE Broadcast Error] Failed to fire NOTIFY for ${mutatedTable}:`, err);
                    });
                } catch (e) {
                    // Ignore broadcast errors
                }
            }

            // Detect Structural DDL Changes
            const isSchemaChange = uppercaseQuery.includes('CREATE ') || uppercaseQuery.includes('DROP ') || uppercaseQuery.includes('ALTER ') || uppercaseQuery.includes('RENAME ');
            if (isSchemaChange) {
                try {
                    const pool = getPgPool();
                    const payload = {
                        event_type: 'schema_update',
                        timestamp: new Date().toISOString(),
                        project_id: projectId
                    };
                    const payloadString = JSON.stringify(payload).replace(/'/g, "''");
                    await pool.query(`NOTIFY fluxbase_live, '${payloadString}'`).catch(err => {
                        console.warn(`[SSE Broadcast Error] Failed to fire schema_update NOTIFY:`, err);
                    });
                } catch (e) {}
            }
        }

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
            try {
                await redis.set(cacheKey, {
                    result: responseData.result,
                    explanation: responseData.explanation,
                    executionInfo: responseData.executionInfo,
                    expiresAt: Date.now() + (CACHE_TTL_SECONDS * 1000)
                }, { ex: CACHE_TTL_SECONDS });
            } catch (redisErr) {
                console.warn('[Redis Error] Failed to write to global cache:', redisErr);
            }
        }

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error('SQL Execution Failed:', error);
        if (error instanceof FluxbaseError) {
            return NextResponse.json(error.toJSON(), { status: error.status });
        }
        return NextResponse.json({
            success: false,
            error: {
                message: error.message || 'An unexpected error occurred',
                code: ERROR_CODES.INTERNAL_ERROR
            }
        }, { status: 500 });
    }
}

// Explicit CORS Preflight Support for Next.js App Router
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        },
    });
}
