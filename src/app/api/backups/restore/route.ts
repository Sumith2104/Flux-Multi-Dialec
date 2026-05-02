import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getMysqlPool } from '@/lib/mysql';
import { getAuthContextFromRequest } from '@/lib/auth';
import { jsonError, requireProjectAccess } from '@/lib/project-auth';
import {
    quoteMysqlIdentifier,
    quoteMysqlProjectSchema,
    quotePgIdentifier,
    quotePgProjectSchema,
} from '@/lib/sql-safety';
import { ERROR_CODES, FluxbaseError } from '@/lib/error-codes';

export const dynamic = 'force-dynamic';

function safeColumnType(value: unknown): string {
    const type = String(value || '').trim();
    if (!type || type.length > 80 || !/^[A-Za-z0-9_(),\s]+$/.test(type)) {
        throw new FluxbaseError('Backup contains an invalid column type.', ERROR_CODES.BAD_REQUEST, 400);
    }
    return type;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, backupId } = body;
        const auth = await getAuthContextFromRequest(req);

        if (!projectId || !backupId) {
            throw new FluxbaseError('projectId and backupId are required', ERROR_CODES.MISSING_FIELD, 400);
        }

        const project = await requireProjectAccess(projectId, auth, ['admin']);
        const globalPool = getPgPool();

        const backupRes = await globalPool.query(
            `SELECT data FROM fluxbase_global.backups WHERE id = $1 AND project_id = $2`,
            [backupId, projectId]
        );

        if (backupRes.rows.length === 0 || !backupRes.rows[0].data) {
            return NextResponse.json({ success: false, error: 'Backup not found or has no data' }, { status: 404 });
        }

        const backupData = backupRes.rows[0].data;
        const tables = (backupData as any).tables;
        if (!tables || typeof tables !== 'object') {
            throw new FluxbaseError('Backup data is invalid.', ERROR_CODES.BAD_REQUEST, 400);
        }

        const isMysql = project.dialect?.toLowerCase() === 'mysql';

        if (isMysql) {
            const mysqlPool = getMysqlPool();
            const schemaIdent = quoteMysqlProjectSchema(projectId);

            await mysqlPool.query(`DROP DATABASE IF EXISTS ${schemaIdent}`);
            await mysqlPool.query(`CREATE DATABASE ${schemaIdent}`);

            for (const [tableName, tableInfo] of Object.entries(tables)) {
                const { columns, rows } = tableInfo as any;
                if (!Array.isArray(columns) || !Array.isArray(rows)) {
                    throw new FluxbaseError('Backup table data is invalid.', ERROR_CODES.BAD_REQUEST, 400);
                }

                const tableIdent = quoteMysqlIdentifier(tableName, 'tableName');
                const colDefs = columns.map((c: any) => {
                    let type = safeColumnType(c.data_type).toUpperCase();
                    if (type === 'NUMBER' || type === 'NUMERIC') type = 'DOUBLE';
                    else if (type === 'VARCHAR') type = 'VARCHAR(255)';
                    else if (type === 'BOOLEAN') type = 'TINYINT(1)';
                    else if (type === 'JSONB') type = 'JSON';

                    return `${quoteMysqlIdentifier(c.column_name, 'columnName')} ${type}`;
                }).join(', ');

                await mysqlPool.query(`CREATE TABLE ${schemaIdent}.${tableIdent} (${colDefs})`);

                if (rows.length > 0) {
                    const colNamesArr = columns.map((c: any) => c.column_name);
                    const colNamesStr = colNamesArr.map((name: string) => quoteMysqlIdentifier(name, 'columnName')).join(', ');

                    for (const rowData of rows) {
                        const values = colNamesArr.map((name: string) => (rowData as any)[name]);
                        const placeholders = values.map(() => '?').join(', ');
                        await mysqlPool.query(
                            `INSERT INTO ${schemaIdent}.${tableIdent} (${colNamesStr}) VALUES (${placeholders})`,
                            values
                        );
                    }
                }
            }
        } else {
            const schemaIdent = quotePgProjectSchema(projectId);
            const client = await globalPool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`DROP SCHEMA IF EXISTS ${schemaIdent} CASCADE`);
                await client.query(`CREATE SCHEMA ${schemaIdent}`);

                for (const [tableName, tableInfo] of Object.entries(tables)) {
                    const { columns, rows } = tableInfo as any;
                    if (!Array.isArray(columns) || !Array.isArray(rows)) {
                        throw new FluxbaseError('Backup table data is invalid.', ERROR_CODES.BAD_REQUEST, 400);
                    }

                    const tableIdent = quotePgIdentifier(tableName, 'tableName');
                    const colDefs = columns.map((c: any) => `${quotePgIdentifier(c.column_name, 'columnName')} ${safeColumnType(c.data_type)}`).join(', ');
                    await client.query(`CREATE TABLE ${schemaIdent}.${tableIdent} (${colDefs})`);

                    if (rows.length > 0) {
                        const colNamesArr = columns.map((c: any) => c.column_name);
                        const colNamesStr = colNamesArr.map((name: string) => quotePgIdentifier(name, 'columnName')).join(', ');

                        for (const rowData of rows) {
                            const values = colNamesArr.map((name: string) => (rowData as any)[name]);
                            const placeholders = values.map((_: any, i: number) => `$${i + 1}`).join(', ');
                            await client.query(
                                `INSERT INTO ${schemaIdent}.${tableIdent} (${colNamesStr}) VALUES (${placeholders})`,
                                values
                            );
                        }
                    }
                }

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Restore failed:', error);
        const { body, status } = jsonError(error);
        return NextResponse.json(body, { status });
    }
}
