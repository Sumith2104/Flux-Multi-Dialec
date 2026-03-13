import { Parser } from 'node-sql-parser';
import { getColumnsForTable, getProjectById } from '@/lib/data';
import { getCurrentUserId } from '@/lib/auth';
import { trackApiRequest } from '@/lib/analytics';
import { Semaphore } from 'async-mutex';
import { LRUCache } from 'lru-cache';
import { performance } from 'perf_hooks';
import { getPgPool } from '@/lib/pg';

// --- 1. Environment-Aware Concurrency Tuning ---
const GLOBAL_LIMIT = parseInt(process.env.FLUX_GLOBAL_IN_FLIGHT_LIMIT || '8000', 10);
const TENANT_LIMIT = parseInt(process.env.FLUX_TENANT_IN_FLIGHT_LIMIT || '2000', 10);

const GLOBAL_SEMAPHORE = new Semaphore(GLOBAL_LIMIT);

// --- 2. Tenant Semaphore Eviction Safety ---
const tenantSemaphores = new LRUCache<string, Semaphore>({
    max: 5000,
    ttl: 1000 * 60 * 60, // 1 hour TTL
    dispose: (value: Semaphore, key: string, reason: string) => {
        if (value.isLocked() || value.getValue() !== TENANT_LIMIT) {
            console.error(`[CRITICAL] Evicting active semaphore for tenant ${key} via ${reason}. This implies an LRU sizing leak.`);
        }
    }
});

function getTenantSemaphore(projectId: string): Semaphore {
    let sem = tenantSemaphores.get(projectId);
    if (!sem) {
        sem = new Semaphore(TENANT_LIMIT);
        tenantSemaphores.set(projectId, sem);
    }
    return sem;
}

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

    constructor(projectId: string, userId?: string) {
        this.projectId = projectId;
        this.userId = userId || null;
        this.parser = new Parser();
    }

    private async init() {
        if (!this.userId) {
            this.userId = await getCurrentUserId();
        }
        if (!this.userId) throw new Error("Unauthorized");

        if (!this.projectTimezone || !this.projectDialect) {
            const project = await getProjectById(this.projectId, this.userId);
            if (project?.timezone) {
                this.projectTimezone = project.timezone;
            }
            this.projectDialect = project?.dialect || 'postgresql';
        }
    }

    public async execute(query: string, params?: any[]): Promise<SqlResult> {
        await this.init();
        if (!this.userId) throw new Error("Unauthorized");

        const queryCleaned = query
            .replace(/--.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .replace(/\/[a-zA-Z0-9_]+\./g, '') // Strip corrupted schema prefixes like /c8.TableName
            .replace(/project_[a-zA-Z0-9_]+\./g, ''); // Ensure users don't hardcode other tenant IDs

        if (!queryCleaned.trim()) return { rows: [], columns: [] };

        // Bypass parser for custom GENERATE_DATA command
        const generateMatch = queryCleaned.match(/^CALL\s+GENERATE_DATA\s*\(\s*'([^']+)'\s*,\s*(\d+)\s*\)/i);
        if (generateMatch) {
            const tableName = generateMatch[1];
            const count = parseInt(generateMatch[2], 10);
            return this.handleGenerateData(tableName, count);
        }

        let lastResult: SqlResult = { rows: [], columns: [], explanation: [] };
        const startTime = performance.now();

        // Gateway Concurrency Queuing
        const tenantSem = getTenantSemaphore(this.projectId);
        const [[, globalRelease], [, tenantRelease]] = await Promise.all([
            GLOBAL_SEMAPHORE.acquire(),
            tenantSem.acquire()
        ]);

        try {
            await trackApiRequest(this.projectId, 'api_call');
            await trackApiRequest(this.projectId, 'sql_execution');

            if (this.projectDialect?.toLowerCase() === 'mysql') {
                const { getMysqlPool } = await import('@/lib/mysql');
                const mysqlPool = getMysqlPool();
                const connection = await mysqlPool.getConnection();

                try {
                    // 1. Lock session to this tenant's isolated DB
                    await connection.query(`USE \`project_${this.projectId}\``);

                    // 2. Execute raw SQL natively on MySQL engine
                    // Using query() instead of execute() for raw multiple statements
                    const [queryResult, fields]: any = await connection.query(queryCleaned, params || []);

                    const executionTime = (performance.now() - startTime).toFixed(2);
                    let explanation = [`Executed via Native AWS MySQL in ${executionTime}ms`];

                    // 3. Format Native Result
                    let formattedRows = [];
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
                const pool = getPgPool();
                const client = await pool.connect();

                try {
                    // 1. Lock the session securely to this tenant's isolated schema
                    await client.query(`SET search_path TO "project_${this.projectId}"`);

                    // 2. Execute the raw SQL directly on the Postgres engine
                    const result = await client.query(queryCleaned, params || []);

                    const executionTime = (performance.now() - startTime).toFixed(2);
                    let explanation = [`Executed via Native AWS PostgreSQL in ${executionTime}ms`];

                    // 3. Format Native Result to Fluxbase SqlResult
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

            // Quick Telemetry Inference
            const firstWord = queryCleaned.trim().split(/\s+/)[0].toUpperCase();
            if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALTER', 'CREATE', 'DROP'].includes(firstWord)) {
                await trackApiRequest(this.projectId, `sql_${firstWord.toLowerCase()}` as any);
            }
            
            // Invalidate AI Schema Cache on structural changes
            if (['ALTER', 'CREATE', 'DROP'].includes(firstWord)) {
                try {
                    const { redis } = await import('@/lib/redis');
                    await redis.del(`schema_inference_${this.projectId}`);
                } catch (e) {
                    console.warn('Failed to invalidate AI schema cache:', e);
                }
            }

        } catch (e: any) {
            console.error("[AWS Native Proxy Error]", e);
            throw new Error(`AWS Database Error: ${e.message}`);
        } finally {
            // Guarantee all acquired locks are fully released back to the event-loop queue
            tenantRelease();
            globalRelease();
        }

        return lastResult;
    }

    private async handleGenerateData(tableName: string, count: number): Promise<SqlResult> {
        try {
            const columns = await getColumnsForTable(this.projectId, tableName, this.userId!);
            if (columns.length === 0) throw new Error("Table not found or has no columns");

            let generatedCount = 0;

            if (this.projectDialect?.toLowerCase() === 'mysql') {
                const { getMysqlPool } = await import('@/lib/mysql');
                const mysqlPool = getMysqlPool();
                const dbName = 'project_' + this.projectId;
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
                            val = new Date().toISOString().slice(0, 19).replace('T', ' '); // MySQL format
                        }

                        if (val !== null || col.is_nullable) {
                            ObjectCols.push(`\`${col.column_name}\``);
                            ObjectVals.push(`?`);
                            ObjectParams.push(val);
                        }
                    }

                    if (ObjectCols.length > 0) {
                        const ddl = `INSERT INTO \`${dbName}\`.\`${safeTableName}\` (${ObjectCols.join(', ')}) VALUES (${ObjectVals.join(', ')})`;
                        await mysqlPool.query(ddl, ObjectParams);
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
                const pool = getPgPool();
                const schemaName = 'project_' + this.projectId;
                const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');

                // To be purely Postgres native, rely on PG for loops or parameterized queries
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
                        await pool.query(ddl, ObjectParams);
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
}
