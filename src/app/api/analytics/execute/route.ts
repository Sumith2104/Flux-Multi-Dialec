import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import { jsonError, requireProjectAccess } from '@/lib/project-auth';
import { assertReadOnlySelectQuery, quoteMysqlProjectSchema, quotePgProjectSchema } from '@/lib/sql-safety';
import { ERROR_CODES, FluxbaseError } from '@/lib/error-codes';
import { redis } from '@/lib/redis';
import crypto from 'crypto';

export async function POST(req: Request) {
    try {
        const auth = await getAuthContextFromRequest(req);
        const { projectId, query, refresh } = await req.json();
        if (!projectId || !query) {
            throw new FluxbaseError('Missing projectId or query', ERROR_CODES.MISSING_FIELD, 400);
        }

        const project = await requireProjectAccess(projectId, auth);
        assertReadOnlySelectQuery(query, project.dialect);

        // Generate cache key
        const queryHash = crypto.createHash('sha256').update(query).digest('hex');
        const cacheKey = `analytics_cache:${projectId}:${queryHash}`;

        // Return cached data if not refreshing
        if (!refresh) {
            try {
                const cachedData = await redis.get<string>(cacheKey);
                if (cachedData) {
                    const parsed = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
                    return NextResponse.json({ data: parsed });
                }
            } catch (cacheError) {
                console.warn('[Analytics Cache Read Error]:', cacheError);
            }
        }

        let resultRows: any[] = [];

        if (project.dialect?.toLowerCase() === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const connection = await mysqlPool.getConnection();
            try {
                await connection.query(`USE ${quoteMysqlProjectSchema(projectId)}` as any);
                await connection.query('START TRANSACTION READ ONLY' as any);
                const [rows]: any = await connection.query(query as any);
                await connection.query('COMMIT' as any);
                resultRows = Array.isArray(rows) ? rows : [rows];
            } catch (error) {
                await connection.query('ROLLBACK').catch(() => undefined);
                throw error;
            } finally {
                connection.release();
            }
        } else {
            const pool = getPgPool();
            const client = await pool.connect();
            try {
                await client.query('BEGIN READ ONLY');
                await client.query(`SET LOCAL search_path TO ${quotePgProjectSchema(projectId)}`);
                const res = await client.query(query);
                await client.query('COMMIT');
                resultRows = res.rows;
            } catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            } finally {
                client.release();
            }
        }

        // Cache results in Redis for 5 minutes (300 seconds)
        try {
            await redis.set(cacheKey, JSON.stringify(resultRows), { ex: 300 });
        } catch (cacheError) {
            console.warn('[Analytics Cache Write Error]:', cacheError);
        }

        return NextResponse.json({ data: resultRows });

    } catch (error) {
        console.error('Analytics Execute Error:', error);
        const { body, status } = jsonError(error);
        return NextResponse.json(body, { status });
    }
}
