import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import { jsonError, requireProjectAccess } from '@/lib/project-auth';
import { assertReadOnlySelectQuery, quoteMysqlProjectSchema, quotePgProjectSchema } from '@/lib/sql-safety';
import { ERROR_CODES, FluxbaseError } from '@/lib/error-codes';

export async function POST(req: Request) {
    try {
        const auth = await getAuthContextFromRequest(req);
        const { projectId, query } = await req.json();
        if (!projectId || !query) {
            throw new FluxbaseError('Missing projectId or query', ERROR_CODES.MISSING_FIELD, 400);
        }

        const project = await requireProjectAccess(projectId, auth);
        assertReadOnlySelectQuery(query, project.dialect);

        if (project.dialect === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            const connection = await mysqlPool.getConnection();
            try {
                await connection.query(`USE ${quoteMysqlProjectSchema(projectId)}`);
                await connection.query('START TRANSACTION READ ONLY');
                const [rows]: any = await connection.query(query);
                await connection.query('COMMIT');
                return NextResponse.json({ data: Array.isArray(rows) ? rows : [rows] });
            } catch (error) {
                await connection.query('ROLLBACK').catch(() => undefined);
                throw error;
            } finally {
                connection.release();
            }
        }

        const pool = getPgPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN READ ONLY');
            await client.query(`SET LOCAL search_path TO ${quotePgProjectSchema(projectId)}`);
            const res = await client.query(query);
            await client.query('COMMIT');
            return NextResponse.json({ data: res.rows });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Analytics Execute Error:', error);
        const { body, status } = jsonError(error);
        return NextResponse.json(body, { status });
    }
}
