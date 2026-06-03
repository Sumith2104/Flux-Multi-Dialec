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

        // Step 1: Fetch list of tables in the backup
        const tablesListRes = await globalPool.query(
            `SELECT jsonb_object_keys(data->'tables') as table_name 
             FROM fluxbase_global.backups 
             WHERE id = $1 AND project_id = $2`,
            [backupId, projectId]
        );

        if (tablesListRes.rows.length === 0) {
            return NextResponse.json({ success: false, error: 'Backup not found or has no data' }, { status: 404 });
        }

        const tableNames = tablesListRes.rows.map(r => r.table_name);
        const isMysql = project.dialect?.toLowerCase() === 'mysql';

        if (isMysql) {
            const mysqlPool = getMysqlPool();
            const schemaIdent = quoteMysqlProjectSchema(projectId);

            await mysqlPool.query(`DROP DATABASE IF EXISTS ${schemaIdent}` as any);
            await mysqlPool.query(`CREATE DATABASE ${schemaIdent}` as any);

            for (const tableName of tableNames) {
                // Fetch columns metadata for this table
                const colRes = await globalPool.query(
                    `SELECT data->'tables'->$3->'columns' as columns 
                     FROM fluxbase_global.backups 
                     WHERE id = $1 AND project_id = $2`,
                    [backupId, projectId, tableName]
                );
                const columns = colRes.rows[0]?.columns;
                if (!Array.isArray(columns)) {
                    throw new FluxbaseError(`Backup table columns data for ${tableName} is invalid.`, ERROR_CODES.BAD_REQUEST, 400);
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

                await mysqlPool.query(`CREATE TABLE ${schemaIdent}.${tableIdent} (${colDefs})` as any);

                // Fetch total rows count for this table
                const countRes = await globalPool.query(
                    `SELECT jsonb_array_length(data->'tables'->$3->'rows') as rows_count 
                     FROM fluxbase_global.backups 
                     WHERE id = $1 AND project_id = $2`,
                    [backupId, projectId, tableName]
                );
                const rowsCount = countRes.rows[0]?.rows_count || 0;

                if (rowsCount > 0) {
                    const colNamesArr = columns.map((c: any) => c.column_name);
                    const colNamesStr = colNamesArr.map((name: string) => quoteMysqlIdentifier(name, 'columnName')).join(', ');

                    const BATCH_SIZE = 5000;
                    for (let start = 1; start <= rowsCount; start += BATCH_SIZE) {
                        const end = Math.min(rowsCount, start + BATCH_SIZE - 1);

                        // Fetch slice from PostgreSQL
                        const sliceRes = await globalPool.query(
                            `SELECT jsonb_agg(elem) as slice
                             FROM (
                               SELECT elem
                               FROM (
                                 SELECT data->'tables'->$3->'rows' as rows_arr
                                 FROM fluxbase_global.backups
                                 WHERE id = $1 AND project_id = $2
                               ) b,
                               jsonb_array_elements(rows_arr) WITH ORDINALITY AS t(elem, ord)
                               WHERE ord BETWEEN $4 AND $5
                             ) sub`,
                            [backupId, projectId, tableName, start, end]
                        );

                        const batchRows = sliceRes.rows[0]?.slice || [];
                        if (batchRows.length === 0) continue;

                        const values: any[] = [];
                        const valuePlaceholders: string[] = [];

                        for (const rowData of batchRows) {
                            const rowPlaceholders = colNamesArr.map((name: string) => {
                                values.push((rowData as any)[name]);
                                return '?';
                            });
                            valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
                        }

                        const query = `INSERT INTO ${schemaIdent}.${tableIdent} (${colNamesStr}) VALUES ${valuePlaceholders.join(', ')}`;
                        await mysqlPool.query(query as any, values);
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

                for (const tableName of tableNames) {
                    // Fetch columns metadata for this table
                    const colRes = await globalPool.query(
                        `SELECT data->'tables'->$3->'columns' as columns 
                         FROM fluxbase_global.backups 
                         WHERE id = $1 AND project_id = $2`,
                        [backupId, projectId, tableName]
                    );
                    const columns = colRes.rows[0]?.columns;
                    if (!Array.isArray(columns)) {
                        throw new FluxbaseError(`Backup table columns data for ${tableName} is invalid.`, ERROR_CODES.BAD_REQUEST, 400);
                    }

                    const tableIdent = quotePgIdentifier(tableName, 'tableName');
                    const colDefs = columns.map((c: any) => `${quotePgIdentifier(c.column_name, 'columnName')} ${safeColumnType(c.data_type)}`).join(', ');
                    await client.query(`CREATE TABLE ${schemaIdent}.${tableIdent} (${colDefs})`);

                    // Fetch total rows count for this table
                    const countRes = await globalPool.query(
                        `SELECT jsonb_array_length(data->'tables'->$3->'rows') as rows_count 
                         FROM fluxbase_global.backups 
                         WHERE id = $1 AND project_id = $2`,
                        [backupId, projectId, tableName]
                    );
                    const rowsCount = countRes.rows[0]?.rows_count || 0;

                    if (rowsCount > 0) {
                        const colNamesArr = columns.map((c: any) => c.column_name);
                        const colNamesStr = colNamesArr.map((name: string) => quotePgIdentifier(name, 'columnName')).join(', ');

                        const BATCH_SIZE = 5000;
                        for (let start = 1; start <= rowsCount; start += BATCH_SIZE) {
                            const end = Math.min(rowsCount, start + BATCH_SIZE - 1);

                            // Fetch slice from PostgreSQL
                            const sliceRes = await globalPool.query(
                                `SELECT jsonb_agg(elem) as slice
                                 FROM (
                                   SELECT elem
                                   FROM (
                                     SELECT data->'tables'->$3->'rows' as rows_arr
                                     FROM fluxbase_global.backups
                                     WHERE id = $1 AND project_id = $2
                                   ) b,
                                   jsonb_array_elements(rows_arr) WITH ORDINALITY AS t(elem, ord)
                                   WHERE ord BETWEEN $4 AND $5
                                 ) sub`,
                                [backupId, projectId, tableName, start, end]
                            );

                            const batchRows = sliceRes.rows[0]?.slice || [];
                            if (batchRows.length === 0) continue;

                            const values: any[] = [];
                            const valuePlaceholders: string[] = [];
                            let valIdx = 1;

                            for (const rowData of batchRows) {
                                const rowPlaceholders = colNamesArr.map((name: string) => {
                                    values.push((rowData as any)[name]);
                                    return `$${valIdx++}`;
                                });
                                valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
                            }

                            const query = `INSERT INTO ${schemaIdent}.${tableIdent} (${colNamesStr}) VALUES ${valuePlaceholders.join(', ')}`;
                            await client.query(query, values);
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
