import { NextRequest, NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { SqlEngine } from '@/lib/sql-engine';
import { getProjectById, logAuditAction, ensureNotSuspended } from '@/lib/data';
import { invalidateTableCache } from '@/lib/cache';
import { fireWebhooks } from '@/lib/webhooks';
import { ERROR_CODES, FluxbaseError } from '@/lib/error-codes';
import { redis } from '@/lib/redis';
import { getPgPool, handleDatabaseError } from '@/lib/pg';
import { type WebhookEvent } from '@/lib/webhooks';
import { Parser } from 'node-sql-parser';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 30; // 30s burst cache for identical SELECTs

interface CacheEntry {
    result: any;
    explanation: string[];
    executionInfo: any;
    expiresAt: number;
}

export async function POST(req: NextRequest) {
    try {
        // --- 1. Robust JSON Parsing ---
        let body;
        try {
            body = await req.json();
        } catch (e) {
            console.error('[API JSON Error] Malformed body received:', e);
            throw new FluxbaseError(
                "Malformed JSON. Ensure your client is sending valid, completed JSON bodies.",
                ERROR_CODES.BAD_REQUEST,
                400
            );
        }

        if (!body || typeof body !== 'object') {
            throw new FluxbaseError("Invalid request body. Expected a JSON object.", ERROR_CODES.BAD_REQUEST, 400);
        }

        const { query, params, projectId: bodyProjectId } = body;
        const { searchParams } = new URL(req.url);
        const projectId = bodyProjectId || searchParams.get('projectId');

        // --- 2. Strict Field Validation ---
        if (!query || typeof query !== 'string') {
            throw new FluxbaseError("The 'query' field is required and must be a string.", ERROR_CODES.MISSING_FIELD, 400);
        }
        if (!projectId || typeof projectId !== 'string') {
            throw new FluxbaseError("The 'projectId' field is required (either in body or as query param).", ERROR_CODES.MISSING_FIELD, 400);
        }
        if (params !== undefined && params !== null && !Array.isArray(params)) {
            throw new FluxbaseError("The 'params' field must be an array.", ERROR_CODES.BAD_REQUEST, 400);
        }

        // --- 3. Intelligent Bulk Insert Validation & Transformation ---
        let finalParams = params;
        if (query.toLowerCase().includes('jsonb_to_recordset')) {
            try {
                // Extract column names from the 'AS x(col1 type, col2 type)' clause
                const columnMatch = query.match(/AS\s+[a-zA-Z0-9_]+\s*\(([^)]+)\)/i);
                if (columnMatch && params && Array.isArray(params[0])) {
                    const columnsRaw = columnMatch[1];
                    const expectedKeys = columnsRaw.split(',').map(c => c.trim().split(/\s+/)[0].replace(/["`]/g, ''));
                    const rawData = params[0];

                    if (Array.isArray(rawData) && rawData.length > 0) {
                        // Case: Client sent Array of Arrays (Matrix), e.g. [[1, '..'], [2, '..']]
                        if (Array.isArray(rawData[0])) {
                            console.log(`[SqlEngine] Auto-Transforming Matrix to Objects for ${expectedKeys.join(', ')}`);
                            finalParams = [
                                rawData.map((row: any[]) => {
                                    const obj: Record<string, any> = {};
                                    expectedKeys.forEach((key, idx) => {
                                        obj[key] = row[idx] !== undefined ? row[idx] : null;
                                    });
                                    return obj;
                                })
                            ];
                        }
                        // Case: Client sent Array of Objects (Correct, but validate keys)
                        else if (typeof rawData[0] === 'object' && rawData[0] !== null) {
                            const firstRow = rawData[0];
                            const missingKeys = expectedKeys.filter(k => !(k in firstRow));
                            if (missingKeys.length > 0) {
                                throw new FluxbaseError(
                                    `Invalid bulk insert payload. Expected objects with keys: ${expectedKeys.join(', ')}. Missing: ${missingKeys.join(', ')}`,
                                    ERROR_CODES.BAD_REQUEST,
                                    400
                                );
                            }
                        }
                    }
                }
            } catch (err: any) {
                if (err instanceof FluxbaseError) throw err;
                console.warn('[Validation Error] Failed to parse bulk insert metadata:', err);
                // Continue to DB if it's an unknown parsing error, let DB handle it
            }
        }


        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) throw new FluxbaseError("Unauthorized", ERROR_CODES.UNAUTHORIZED, 401);

        // Project-level suspension check is handled more granularly later after fetching the project.
        // But we keep the global check for immediate block.
        if (auth.status === 'suspended') {
            throw new FluxbaseError("Organization suspended. Please resume in Settings.", ERROR_CODES.FORBIDDEN, 403);
        }

        const userId = auth.userId;

        // Optimization: Burst Cache (Reads only)
        const isSelect = query.trim().toUpperCase().startsWith('SELECT');
        const cacheKey = isSelect ? `sql_cache:${projectId}:${Buffer.from(query + JSON.stringify(params || [])).toString('base64').substring(0, 100)}` : null;

        // Pre-Flight Optimization: Parallelize Auth, Burst Cache, and Traffic Limits
        const { checkProjectTrafficLimits } = await import('@/lib/limits');

        const [cachedResult, project, trafficLimitResult] = await Promise.all([
            isSelect ? redis.get<CacheEntry>(cacheKey!) : Promise.resolve(null),
            getProjectById(projectId, userId),
            checkProjectTrafficLimits(projectId).then(() => ({ success: true })).catch(e => ({ success: false, error: e }))
        ]);

        if (!trafficLimitResult.success) throw new FluxbaseError(`Infrastructure limit: ${trafficLimitResult.error.message}`, ERROR_CODES.RATE_LIMIT_EXCEEDED, 429);
        if (!project) throw new FluxbaseError("Project not found", ERROR_CODES.PROJECT_NOT_FOUND, 404);

        // Granular Project Suspension Check
        await ensureNotSuspended(project);

        if (cachedResult && cachedResult.expiresAt > Date.now()) {
            return NextResponse.json({
                success: true,
                result: cachedResult.result,
                explanation: [...cachedResult.explanation, 'Served via Upstash Global Edge Cache'],
                executionInfo: { ...cachedResult.executionInfo, cached: true }
            });
        }

        const startTime = Date.now();
        const engine = new SqlEngine(projectId, userId, auth.scopes, auth.role, project);
        const result = await engine.execute(query, finalParams);
        const duration = Date.now() - startTime;

        const backgroundTasks: Promise<any>[] = [];

        // 1. Post-Execution Pipeline Optimization: Do NOT await side-effects
        if (result) {
            backgroundTasks.push(
                logAuditAction(projectId, userId, 'SQL_EXECUTION', query, {
                    duration_ms: duration,
                    rows_affected: result.rows?.length || 0,
                    status: 'success'
                }).catch(e => console.error('[Audit Error]', e))
            );

            // --- ABSOLUTE TABLE DETECTION (AST-BASED) ---
            const uppercaseQuery = typeof query === 'string' ? query.trim().toUpperCase() : '';
            let mutatedTable: string | null = null;
            let newDataParsed: Record<string, any> | undefined = undefined;

            try {
                const parser = new Parser();
                const ast: any = parser.astify(query);
                const sqlAst = Array.isArray(ast) ? ast[0] : ast;

                if (sqlAst) {
                    if (sqlAst.type === 'insert' || sqlAst.type === 'update' || sqlAst.type === 'delete') {
                        const tableObj = sqlAst.table ? sqlAst.table[0] : (sqlAst.from ? sqlAst.from[0] : null);
                        if (tableObj) {
                            mutatedTable = typeof tableObj === 'string' ? tableObj : (tableObj.table || tableObj.expr?.value);
                        }
                    }

                    if (sqlAst.type === 'insert' && Array.isArray(sqlAst.columns)) {
                        const cols = sqlAst.columns;
                        const valsNode = Array.isArray(sqlAst.values) ? sqlAst.values : sqlAst.values?.values;
                        if (Array.isArray(valsNode) && valsNode.length > 0) {
                            const rowVals = valsNode[0].value;
                            newDataParsed = {};
                            for (let i = 0; i < cols.length; i++) {
                                newDataParsed[cols[i]] = rowVals[i]?.value ?? null;
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('[AST Parser Fallback] Falling back to regex for mutation detection:', err);
                const tblMatch = query.match(/(?:INTO|UPDATE|FROM)\s+["'\`]?(?:[a-zA-Z0-9_]+\.)?["'\`]?([a-zA-Z0-9_]+)["'\`]?/i);
                if (tblMatch) mutatedTable = tblMatch[1];
            }

            if (mutatedTable) {
                const cleanMutatedTable = mutatedTable.toLowerCase();

                backgroundTasks.push((async () => {
                    await invalidateTableCache(projectId, cleanMutatedTable).catch(err => {
                        console.warn(`[Upstash Invalidation Error] Failed to invalidate cache for ${cleanMutatedTable}:`, err);
                    });

                    const webhookEvent = uppercaseQuery.startsWith('INSERT') ? 'row.inserted' : uppercaseQuery.startsWith('UPDATE') ? 'row.updated' : 'row.deleted';

                    await fireWebhooks(
                        projectId,
                        userId,
                        cleanMutatedTable,
                        webhookEvent as WebhookEvent,
                        newDataParsed || (uppercaseQuery.startsWith('INSERT') && Array.isArray(params) ? { raw_params: params } : undefined)
                    ).catch(err => console.error(`[Webhook Dispatch Error]`, err));

                    const pool = getPgPool();
                    const payload = {
                        event_type: 'raw_sql_mutation',
                        table_id: cleanMutatedTable,
                        table_name: cleanMutatedTable,
                        operation: cleanMutatedTable ? (uppercaseQuery.startsWith('INSERT') ? 'INSERT' : uppercaseQuery.startsWith('UPDATE') ? 'UPDATE' : 'DELETE') : 'UNKNOWN',
                        timestamp: new Date().toISOString(),
                        project_id: projectId,
                        data: {
                            new: newDataParsed || (uppercaseQuery.startsWith('INSERT') && Array.isArray(params) ? { raw_params: params } : undefined)
                        }
                    };
                    const payloadString = JSON.stringify(payload).replace(/'/g, "''");
                    await pool.query(`NOTIFY flux_realtime, '${payloadString}'`).catch(err => {
                        console.warn(`[SSE Broadcast Error] Failed to fire NOTIFY:`, err);
                    });
                })());
            }

            const isSchemaChange = uppercaseQuery.includes('CREATE ') || uppercaseQuery.includes('DROP ') || uppercaseQuery.includes('ALTER ') || uppercaseQuery.includes('RENAME ');
            if (isSchemaChange) {
                backgroundTasks.push((async () => {
                    await redis.del(`schema_inference_${projectId}`).catch(err => console.warn('Cache del error:', err));

                    const pool = getPgPool();
                    const payload = {
                        event_type: 'schema_update',
                        timestamp: new Date().toISOString(),
                        project_id: projectId
                    };
                    const payloadString = JSON.stringify(payload).replace(/'/g, "''");
                    await pool.query(`NOTIFY flux_realtime, '${payloadString}'`).catch(err => {
                        console.warn(`[SSE Broadcast Error] Failed to fire schema_update NOTIFY:`, err);
                    });
                })());
            }
        }

        const responseData = {
            success: true,
            result: {
                rows: result.rows || [],
                columns: result.columns || [],
                message: result.message
            },
            explanation: result.explanation || [],
            executionInfo: {
                time: `${duration}ms`,
                rowCount: result.rows?.length || 0
            }
        };

        if (isSelect && cacheKey) {
            backgroundTasks.push(
                redis.set(cacheKey, {
                    result: responseData.result,
                    explanation: responseData.explanation,
                    executionInfo: responseData.executionInfo,
                    expiresAt: Date.now() + (CACHE_TTL_SECONDS * 1000)
                }, { ex: CACHE_TTL_SECONDS }).catch(redisErr => {
                    console.warn('[Redis Error] Failed to write to global cache:', redisErr);
                })
            );
        }

        // Fire background tasks
        Promise.all(backgroundTasks).catch(e => console.error('[Background Task Group Error]', e));

        return NextResponse.json(responseData, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
        });

    } catch (error: any) {
        console.error('SQL Execution Failed:', error);
        if (error instanceof FluxbaseError) {
            return NextResponse.json(error.toJSON(), { status: error.status });
        }
        return handleDatabaseError(error);
    }
}

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
