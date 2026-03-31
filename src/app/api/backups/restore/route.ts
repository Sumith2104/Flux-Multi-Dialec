import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getMysqlPool } from '@/lib/mysql';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectById } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectId, backupId } = body;
    const auth = await getAuthContextFromRequest(req);
    
    if (!auth?.userId || !projectId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pool = getPgPool();

    try {
        const globalPool = getPgPool();
        // 1. Fetch backup data
        const backupRes = await globalPool.query(
            `SELECT data FROM fluxbase_global.backups WHERE id = $1 AND project_id = $2`,
            [backupId, projectId]
        );

        if (backupRes.rows.length === 0 || !backupRes.rows[0].data) {
            return NextResponse.json({ success: false, error: 'Backup not found or has no data' }, { status: 404 });
        }

        const backupData = backupRes.rows[0].data;
        const project = await getProjectById(projectId, auth.userId);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        const isMysql = project.dialect?.toLowerCase() === 'mysql';
        const schemaName = `project_${projectId}`;

        if (isMysql) {
            const mysqlPool = getMysqlPool();
            
            // Wipe and recreate DB
            await mysqlPool.query(`DROP DATABASE IF EXISTS \`${schemaName}\``);
            await mysqlPool.query(`CREATE DATABASE \`${schemaName}\``);

            // Reconstruct tables and data
            for (const [tableName, tableInfo] of Object.entries((backupData as any).tables)) {
                const { columns, rows } = tableInfo as any;
                
                // Create table
                const colDefs = columns.map((c: any) => {
                    let type = c.data_type.toUpperCase();
                    // Basic MySQL type mapping for common PG types found in older backups
                    if (type === 'NUMBER' || type === 'NUMERIC') type = 'DOUBLE';
                    else if (type === 'VARCHAR') type = 'VARCHAR(255)';
                    else if (type === 'BOOLEAN') type = 'TINYINT(1)';
                    else if (type === 'JSONB') type = 'JSON';
                    
                    return `\`${c.column_name}\` ${type}`;
                }).join(', ');
                
                await mysqlPool.query(`CREATE TABLE \`${schemaName}\`.\`${tableName}\` (${colDefs})`);

                // Insert rows
                if (rows.length > 0) {
                    const colNamesArr = columns.map((c: any) => c.column_name);
                    const colNamesStr = colNamesArr.map((n: string) => `\`${n}\``).join(', ');
                    
                    for (const rowData of rows) {
                        const values = colNamesArr.map((name: string) => (rowData as any)[name]);
                        const placeholders = values.map(() => '?').join(', ');
                        await mysqlPool.query(
                            `INSERT INTO \`${schemaName}\`.\`${tableName}\` (${colNamesStr}) VALUES (${placeholders})`,
                            values
                        );
                    }
                }
            }
        } else {
            // PostgreSQL path
            const client = await globalPool.connect();
            try {
                await client.query('BEGIN');

                // 3. Drop existing schema
                await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
                await client.query(`CREATE SCHEMA "${schemaName}"`);

                // 4. Reconstruct tables and data
                for (const [tableName, tableInfo] of Object.entries((backupData as any).tables)) {
                    const { columns, rows } = tableInfo as any;
                    
                    // Create table
                    const colDefs = columns.map((c: any) => `"${c.column_name}" ${c.data_type}`).join(', ');
                    await client.query(`CREATE TABLE "${schemaName}"."${tableName}" (${colDefs})`);

                    // Insert rows
                    if (rows.length > 0) {
                        const colNamesArr = columns.map((c: any) => c.column_name);
                        const colNamesStr = colNamesArr.map((n: string) => `"${n}"`).join(', ');
                        
                        for (const rowData of rows) {
                            const values = colNamesArr.map((name: string) => (rowData as any)[name]);
                            const placeholders = values.map((_: any, i: number) => `$${i + 1}`).join(', ');
                            await client.query(
                                `INSERT INTO "${schemaName}"."${tableName}" (${colNamesStr}) VALUES (${placeholders})`,
                                values
                            );
                        }
                    }
                }

                await client.query('COMMIT');
            } catch (e: any) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Restore failed:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
