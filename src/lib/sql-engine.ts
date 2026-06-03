import { Parser } from 'node-sql-parser';
import { type Project, getColumnsForTable, getProjectById } from '@/lib/data';
import { getCurrentUserId } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { getPgPool } from '@/lib/pg';
import { ERROR_CODES, FluxbaseError, FluxbaseErrorCode } from '@/lib/error-codes';
import { getTenantPgPool, getTenantMysqlPool, getProjectDbAndSchema } from '@/lib/tenant-pools';

// --- 1. Distributed Rate Limiting Configuration ---
const tenantRateLimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.tokenBucket(
        parseInt(process.env.FLUX_TENANT_RATE_LIMIT_TOKENS || '200', 10),
        '1 s',
        parseInt(process.env.FLUX_TENANT_RATE_LIMIT_REFILL || '50', 10)
    ),
    analytics: false,
});

const globalRateLimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.tokenBucket(
        parseInt(process.env.FLUX_GLOBAL_RATE_LIMIT_TOKENS || '8000', 10),
        '1 s',
        parseInt(process.env.FLUX_GLOBAL_RATE_LIMIT_REFILL || '2000', 10)
    ),
    analytics: false,
});

export interface SqlResult {
    rows: any[];
    columns: string[];
    message?: string;
    explanation?: string[];
}

export class SqlEngine {
    private projectId: string;
    private userId: string | null = null;
    private projectTimezone?: string;
    private projectDialect?: string;
    private parser: Parser;
    private scopes: string[] | null = null;
    private role: string | null = null;
    private projectObj?: Project | null;

    constructor(projectId: string, userId?: string, scopes?: string[], role?: string, project?: Project) {
        this.projectId = projectId;
        this.userId = userId || null;
        this.parser = new Parser();
        this.scopes = scopes || null;
        this.role = role || null;
        this.projectObj = project;
    }

    private async init() {
        if (!this.userId) {
            this.userId = await getCurrentUserId();
        }
        if (!this.userId) throw new FluxbaseError("Unauthorized", ERROR_CODES.UNAUTHORIZED, 401);

        if (!this.projectObj) {
            this.projectObj = await getProjectById(this.projectId, this.userId);
        }
        const project = this.projectObj;
        if (!this.projectTimezone || !this.projectDialect) {
            if (project?.timezone) {
                this.projectTimezone = project.timezone;
            }
            if (!this.role && project?.role) {
                this.role = project.role;
            }
            this.projectDialect = project?.dialect || 'postgresql';
        }
    }

    public async execute(
        query: string, 
        params?: any[], 
        options: { skipTracking?: boolean; allowMulti?: boolean } = {}
    ): Promise<SqlResult> {
        await this.init();
        if (!this.userId) throw new FluxbaseError("Unauthorized", ERROR_CODES.UNAUTHORIZED, 401);

        const queryCleaned = query
            .replace(/--.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .replace(/\/[a-zA-Z0-9_]+\./g, '') // Strip corrupted schema prefixes like /c8.TableName
            .replace(/project_[a-zA-Z0-9_]+\./g, ''); // Ensure users don't hardcode other tenant IDs

        if (!queryCleaned.trim()) return { rows: [], columns: [] };

        this.validateAstScope(queryCleaned, options.allowMulti);

        const firstWord = queryCleaned.trim().split(/\s+/)[0].toUpperCase();

        // Bypass parser for custom GENERATE_DATA command
        const generateMatch = queryCleaned.match(/^CALL\s+GENERATE_DATA\s*\(\s*'([^']+)'\s*,\s*(\d+)\s*\)/i);
        if (generateMatch) {
            const tableName = generateMatch[1];
            const count = parseInt(generateMatch[2], 10);
            return this.handleGenerateData(tableName, count);
        }

        let lastResult: SqlResult = { rows: [], columns: [], explanation: [] };
        const startTime = Date.now();

        // Distributed rate limiting checks via Upstash Redis
        const [globalLimitRes, tenantLimitRes] = await Promise.all([
            globalRateLimit.limit('sql_global_rate_limit'),
            tenantRateLimit.limit(`sql_tenant_rate_limit:${this.projectId}`)
        ]);

        if (!globalLimitRes.success) {
            throw new FluxbaseError(
                "Too Many Requests: Global SQL execution capacity limit reached. Please try again in a few moments.", 
                ERROR_CODES.RATE_LIMIT_EXCEEDED, 
                429
            );
        }

        if (!tenantLimitRes.success) {
            throw new FluxbaseError(
                "Too Many Requests: SQL execution rate limit exceeded for this project. Please wait a moment and try again.", 
                ERROR_CODES.RATE_LIMIT_EXCEEDED, 
                429
            );
        }

        try {
            // Batch all analytics tracking into ONE pipeline round-trip to Redis
            if (!options.skipTracking) {
                const d = new Date();
                d.setMinutes(0, 0, 0);
                const period = d.getTime();
                const keys = [
                    `analytics_rollup:${this.projectId}:${period}:api_call`,
                    `analytics_rollup:${this.projectId}:${period}:sql_execution`,
                ];
                const sqlType = `sql_${firstWord.toLowerCase()}`;
                const validSqlTypes = ['sql_select', 'sql_insert', 'sql_update', 'sql_delete', 'sql_alter', 'sql_create', 'sql_drop'];
                if (validSqlTypes.includes(sqlType)) {
                    keys.push(`analytics_rollup:${this.projectId}:${period}:${sqlType}`);
                }
                
                const pipe = redis.pipeline();
                for (const key of keys) {
                    pipe.incr(key);
                }
                // Probabilistic registration
                if (Math.random() < 0.10) {
                    for (const key of keys) {
                        pipe.sadd('analytics_keys_to_flush', key);
                    }
                }
                pipe.exec().catch(e => console.warn('[SqlEngine] Analytics batch failed:', e));
            }

            if (this.projectDialect?.toLowerCase() === 'mysql') {
                const mysqlPool = await getTenantMysqlPool(this.projectObj!);
                const { dbName } = getProjectDbAndSchema(this.projectObj!);
                const connection = await mysqlPool.getConnection();

                try {
                    await connection.query(`USE \`${dbName}\`` as any);
                    
                    if (this.projectTimezone) {
                        connection.query(`SET time_zone = ?` as any, [this.projectTimezone]).catch(() => {});
                    }

                    const [queryResult, fields]: any = await connection.query(queryCleaned as any, params || []);

                    const executionTime = Date.now() - startTime;
                    const explanation = [`Executed via Native AWS MySQL in ${executionTime}ms`];

                    let formattedRows: any[] = [];
                    let formattedColumns: string[] = [];
                    let rowCount = 0;

                    if (Array.isArray(queryResult)) {
                        if (queryResult.length === 0) {
                        } else if (Array.isArray(queryResult[0]) || queryResult[0]?.constructor?.name === 'ResultSetHeader' || (queryResult[0] && typeof queryResult[0] === 'object' && 'affectedRows' in queryResult[0])) {
                            let targetRes = queryResult[queryResult.length - 1];
                            let targetFields = fields && fields.length > 0 ? fields[fields.length - 1] : undefined;

                            for (let i = queryResult.length - 1; i >= 0; i--) {
                                if (Array.isArray(queryResult[i])) {
                                    targetRes = queryResult[i];
                                    targetFields = fields && fields.length > i ? fields[i] : undefined;
                                    break;
                                }
                            }

                            if (Array.isArray(targetRes)) {
                                formattedRows = targetRes;
                                if (targetFields && Array.isArray(targetFields)) {
                                    formattedColumns = targetFields.map((f: any) => f.name);
                                }
                                rowCount = targetRes.length;
                            } else if (targetRes && typeof targetRes === 'object') {
                                rowCount = targetRes.affectedRows || 0;
                            }
                        } else {
                            formattedRows = queryResult;
                            if (fields && Array.isArray(fields)) {
                                formattedColumns = fields.filter((f: any) => f != null).map((f: any) => f.name);
                            }
                            rowCount = queryResult.length;
                        }
                    } else if (queryResult && typeof queryResult === 'object') {
                        rowCount = queryResult.affectedRows || 0;
                    }

                    lastResult = {
                        rows: formattedRows,
                        columns: formattedColumns,
                        explanation,
                        message: `Affected ${rowCount} rows`
                    };

                } finally {
                    connection.release();
                }

            } else {
                const pool = await getTenantPgPool(this.projectObj!);
                const { schemaName } = getProjectDbAndSchema(this.projectObj!);
                const client = await pool.connect();

                try {
                    const sessionSetupSql = `
                        SELECT set_config('search_path', $1, false), 
                               set_config('fluxbase.auth_uid', $2, true), 
                               set_config('timezone', $3, false),
                               set_config('role', 'authenticated', true),
                               set_config('request.jwt.claims', $4, true);
                    `;
                    const claimsJson = JSON.stringify({ sub: this.userId || '', role: 'authenticated' });
                    const sessionParams = [
                        schemaName, 
                        this.userId || '', 
                        this.projectTimezone || 'UTC', 
                        claimsJson
                    ];
                    
                    await client.query(sessionSetupSql, sessionParams);
                    const result = await client.query(queryCleaned, params || []);

                    const executionTime = Date.now() - startTime;
                    const explanation = [`Executed via Batch-Initialized AWS PostgreSQL in ${executionTime}ms`];

                    if (Array.isArray(result)) {
                        const finalRes = result[result.length - 1];
                        lastResult = {
                            rows: finalRes.rows || [],
                            columns: finalRes.fields ? finalRes.fields.map((f: any) => f.name) : [],
                            explanation,
                            message: `Affected ${finalRes.rowCount || 0} rows`
                        };
                    } else {
                        lastResult = {
                            rows: result.rows || [],
                            columns: result.fields ? result.fields.map((f: any) => f.name) : [],
                            explanation,
                            message: `Affected ${result.rowCount || 0} rows`
                        };
                    }
                } finally {
                    client.release();
                }
            }

            const durationMs = Date.now() - startTime;
            if (!options.skipTracking) {
                const pool = getPgPool();
                pool.query(
                    `INSERT INTO fluxbase_global.audit_logs (project_id, user_id, action, statement, duration_ms, success) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [this.projectId, this.userId, firstWord, queryCleaned, durationMs, true]
                ).catch(err => console.error('[SqlEngine] Audit log failed:', err));
            }

            if (['ALTER', 'CREATE', 'DROP'].includes(firstWord)) {
                try {
                    await redis.del(`schema_inference_${this.projectId}`);
                } catch (e) {
                    console.warn('Failed to invalidate AI schema cache:', e);
                }
            }

        } catch (e: any) {
            console.error("[AWS Native Proxy Error]", e);
            
            const errorMessage = e.message || '';
            let code: FluxbaseErrorCode = ERROR_CODES.SQL_EXECUTION_ERROR;
            let status = 500;
            
            if (errorMessage.toLowerCase().includes('syntax error') || 
                errorMessage.toLowerCase().includes('check the manual that corresponds to your mysql server version') ||
                errorMessage.toLowerCase().includes('invalid input syntax')) {
                code = ERROR_CODES.SQL_SYNTAX;
                status = 400;
            } else if (errorMessage.toLowerCase().includes('connection') || errorMessage.toLowerCase().includes('econnrefused')) {
                code = ERROR_CODES.DATABASE_CONNECTION_ERROR;
                status = 503;
            }

            const durationMs = Date.now() - startTime;
            if (!options.skipTracking) {
                const pool = getPgPool();
                pool.query(
                    `INSERT INTO fluxbase_global.audit_logs (project_id, user_id, action, statement, duration_ms, success, error) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [this.projectId, this.userId, firstWord, queryCleaned, durationMs, false, errorMessage]
                ).catch(err => console.error('[SqlEngine] Audit log failure track failed:', err));
            }

            throw new FluxbaseError(`AWS Database Error: ${errorMessage}`, code, status);
        }

        return lastResult;
    }

    private async handleGenerateData(tableName: string, count: number): Promise<SqlResult> {
        try {
            const columns = await getColumnsForTable(this.projectId, tableName, this.userId!);
            if (columns.length === 0) throw new Error("Table not found or has no columns");

            let generatedCount = 0;

            if (this.projectDialect?.toLowerCase() === 'mysql') {
                const mysqlPool = await getTenantMysqlPool(this.projectObj!);
                const { dbName } = getProjectDbAndSchema(this.projectObj!);
                const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');

                for (let i = 0; i < count; i++) {
                    const ObjectCols: string[] = [];
                    const ObjectVals: string[] = [];
                    const ObjectParams: any[] = [];

                    for (const col of columns) {
                        if (col.column_name === 'id' || col.column_name === '_id') continue;

                        let val: any = null;
                        const type = col.data_type.toUpperCase();
                        if (type.includes('VARCHAR') || type.includes('TEXT') || type.includes('STRING')) {
                            val = 'Gen_' + Math.random().toString(36).substring(7);
                        } else if (type.includes('INT') || type.includes('NUMBER') || type.includes('DOUBLE') || type.includes('FLOAT')) {
                            val = Math.floor(Math.random() * 1000);
                        } else if (type.includes('BOOL') || type.includes('TINYINT')) {
                            val = Math.random() > 0.5 ? 1 : 0;
                        } else if (type.includes('DATE') || type.includes('TIME')) {
                            val = new Date().toISOString().slice(0, 19).replace('T', ' '); 
                        }

                        if (val !== null || col.is_nullable) {
                            ObjectCols.push(`\`${col.column_name}\``);
                            ObjectVals.push(`?`);
                            ObjectParams.push(val);
                        }
                    }

                    if (ObjectCols.length > 0) {
                        const ddl = `INSERT INTO \`${dbName}\`.\`${safeTableName}\` (${ObjectCols.join(', ')}) VALUES (${ObjectVals.join(', ')})`;
                        await mysqlPool.query(ddl as any, ObjectParams);
                        generatedCount++;
                    }
                }

                return {
                    rows: [],
                    columns: [],
                    message: `Successfully generated ${generatedCount} rows for ${tableName}`,
                    explanation: ['Native MySQL Bulk Insertion']
                };

            } else {
                const pool = await getTenantPgPool(this.projectObj!);
                const { schemaName } = getProjectDbAndSchema(this.projectObj!);
                const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');

                for (let i = 0; i < count; i++) {
                    const ObjectCols: string[] = [];
                    const ObjectVals: string[] = [];
                    const ObjectParams: any[] = [];
                    let pIdx = 1;

                    for (const col of columns) {
                        if (col.column_name === 'id' || col.column_name === '_id') continue;

                        let val: any = null;
                        const type = col.data_type.toUpperCase();
                        if (type === 'VARCHAR' || type === 'TEXT' || type === 'STRING') {
                            val = 'Gen_' + Math.random().toString(36).substring(7);
                        } else if (type === 'INT' || type === 'NUMBER' || type === 'NUMERIC') {
                            val = Math.floor(Math.random() * 1000);
                        } else if (type === 'BOOLEAN' || type.includes('BOOL')) {
                            val = Math.random() > 0.5;
                        } else if (type === 'DATE' || type === 'DATETIME' || type === 'TIMESTAMP' || type.includes('TIME')) {
                            val = new Date().toISOString();
                        }

                        if (val !== null || col.is_nullable) {
                            ObjectCols.push(`"${col.column_name}"`);
                            ObjectVals.push(`$${pIdx++}`);
                            ObjectParams.push(val);
                        }
                    }

                    if (ObjectCols.length > 0) {
                        const ddl = `INSERT INTO "${schemaName}"."${safeTableName}" (${ObjectCols.join(', ')}) VALUES (${ObjectVals.join(', ')})`;
                        await pool.query(ddl as any, ObjectParams);
                        generatedCount++;
                    }
                }

                return {
                    rows: [],
                    columns: [],
                    message: `Successfully generated ${generatedCount} rows for ${tableName}`,
                    explanation: ['Native Postgres Bulk Insertion']
                };
            }
        } catch (e: any) {
            console.error('Generate Data Error:', e);
            throw new Error('Data Generation Failed: ' + e.message);
        }
    }

    private validateAstScope(queryCleaned: string, allowMulti = false) {
        let ast: any;
        try {
            ast = this.parser.astify(queryCleaned, {
                database: this.projectDialect?.toLowerCase() === 'mysql' ? 'MySQL' : 'Postgresql',
            } as any);
        } catch (e: any) {
            throw new FluxbaseError(`SQL Parsing/Syntax Error: ${e.message}`, ERROR_CODES.SQL_SYNTAX, 400);
        }

        const statements = Array.isArray(ast) ? ast : [ast];

        if (statements.length > 1 && !allowMulti) {
            throw new FluxbaseError(
                "Multi-statement queries are not authorized for execution.", 
                ERROR_CODES.FORBIDDEN, 
                403
            );
        }

        const readOps = ['select', 'show', 'desc', 'describe', 'explain'];
        const writeOps = ['insert', 'update', 'delete', 'call', 'replace'];
        const adminOps = ['create', 'drop', 'alter', 'truncate', 'rename', 'grant', 'revoke'];

        for (const stmt of statements) {
            const stmtType = (stmt.type || '').toLowerCase();

            if (this.role === 'viewer') {
                if (!readOps.includes(stmtType)) {
                    throw new FluxbaseError(
                        `Insufficient Permissions: Your role (Viewer) is restricted to read-only operations. You cannot execute ${stmtType.toUpperCase()} commands.`,
                        ERROR_CODES.FORBIDDEN,
                        403
                    );
                }
            }

            if (!this.scopes) continue;

            if (readOps.includes(stmtType)) {
                if (!this.scopes.includes('read') && !this.scopes.includes('write') && !this.scopes.includes('admin')) {
                    throw new FluxbaseError(
                        `Insufficient Permissions: Scope 'read' is required for ${stmtType.toUpperCase()} operations. Please update your API key in the Fluxbase settings.`,
                        ERROR_CODES.FORBIDDEN,
                        403
                    );
                }
            } else if (writeOps.includes(stmtType)) {
                if (!this.scopes.includes('write') && !this.scopes.includes('admin')) {
                    throw new FluxbaseError(
                        `Insufficient Permissions: Scope 'write' is required for ${stmtType.toUpperCase()} operations. Please update your API key in the Fluxbase settings.`,
                        ERROR_CODES.FORBIDDEN,
                        403
                    );
                }
            } else if (adminOps.includes(stmtType)) {
                if (!this.scopes.includes('admin')) {
                    throw new FluxbaseError(
                        `Insufficient Permissions: Scope 'admin' is required for ${stmtType.toUpperCase()} operations. Please update your API key in the Fluxbase settings.`,
                        ERROR_CODES.FORBIDDEN,
                        403
                    );
                }
            } else {
                if (!this.scopes.includes('admin')) {
                    throw new FluxbaseError(
                        `Insufficient Permissions: Scope 'admin' is required for the unknown operation: ${stmtType.toUpperCase()}. Please update your API key in the Fluxbase settings.`,
                        ERROR_CODES.FORBIDDEN,
                        403
                    );
                }
            }
        }
    }
}
