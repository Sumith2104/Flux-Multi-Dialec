import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getMysqlPool } from '@/lib/mysql';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getProjectById } from '@/lib/data';

export const dynamic = 'force-dynamic';

const ensureTable = async (pool: any) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.backups (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            project_id TEXT NOT NULL,
            label TEXT NOT NULL,
            type TEXT DEFAULT 'manual',
            status TEXT DEFAULT 'in_progress',
            size_bytes BIGINT,
            data JSONB,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    
    // Ensure the data column exists if the table was created before the schema update
    await pool.query(`
        ALTER TABLE fluxbase_global.backups 
        ADD COLUMN IF NOT EXISTS data JSONB
    `);
};

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPgPool();
    await ensureTable(pool);

    const res = await pool.query(
        `SELECT id, label, type, status, size_bytes as "sizeBytes", expires_at as "expiresAt", created_at as "createdAt"
         FROM fluxbase_global.backups WHERE project_id = $1 ORDER BY created_at DESC`,
        [projectId]
    );
    return NextResponse.json({ backups: res.rows });
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectId } = body;
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId || !projectId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const pool = getPgPool();
        await ensureTable(pool);

        const project = await getProjectById(projectId, auth.userId);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        const isMysql = project.dialect?.toLowerCase() === 'mysql';
        const schemaName = `project_${projectId}`;
        const label = `Manual Backup — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

        const backupData: any = { tables: {} };
        let totalSizeBytes = 0;

        if (isMysql) {
            const mysqlPool = getMysqlPool();
            const [tables]: any = await mysqlPool.query(
                `SELECT TABLE_NAME as table_name, (DATA_LENGTH + INDEX_LENGTH) as size 
                 FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
                [schemaName]
            );

            for (const table of tables) {
                const tableName = table.table_name;
                const [rows]: any = await mysqlPool.query(`SELECT * FROM \`${schemaName}\`.\`${tableName}\``);
                const [cols]: any = await mysqlPool.query(
                    `SELECT COLUMN_NAME as column_name, DATA_TYPE as data_type 
                     FROM information_schema.columns WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
                    [schemaName, tableName]
                );

                backupData.tables[tableName] = {
                    columns: cols,
                    rows: rows
                };
                totalSizeBytes += Number(table.size || 0);
            }
        } else {
            // 1. Fetch all tables in the project schema
            const tablesRes = await pool.query(
                `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
                [schemaName]
            );

            // 2. Dump each table's data
            for (const row of tablesRes.rows) {
                const tableName = row.table_name;
                const dataRes = await pool.query(`SELECT * FROM "${schemaName}"."${tableName}"`);
                
                // Get columns and types for reconstruction
                const colRes = await pool.query(
                    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
                    [schemaName, tableName]
                );

                backupData.tables[tableName] = {
                    columns: colRes.rows,
                    rows: dataRes.rows
                };
            }

            // Calculate size for PG
            const sizeRes = await pool.query(
                `SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(table_schema)||'.'||quote_ident(table_name))), 0) as size
                 FROM information_schema.tables WHERE table_schema = $1`,
                [schemaName]
            ).catch(() => ({ rows: [{ size: 0 }] }));
            totalSizeBytes = Number(sizeRes.rows[0].size);
        }

        // 3. Record backup with data
        const res = await pool.query(
            `INSERT INTO fluxbase_global.backups (project_id, label, type, status, data, size_bytes, expires_at)
             VALUES ($1, $2, 'manual', 'completed', $3, $4, NOW() + INTERVAL '30 days')
             RETURNING id`,
            [projectId, label, JSON.stringify(backupData), totalSizeBytes]
        );

        return NextResponse.json({ success: true, id: res.rows[0].id });
    } catch (e: any) {
        console.error('Backup failed:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const backupId = searchParams.get('backupId');
    const auth = await getAuthContextFromRequest(req);

    if (!auth?.userId || !projectId || !backupId) {
        return NextResponse.json({ error: 'Unauthorized or missing parameters' }, { status: 401 });
    }

    try {
        const pool = getPgPool();
        const res = await pool.query(
            `DELETE FROM fluxbase_global.backups WHERE id = $1 AND project_id = $2`,
            [backupId, projectId]
        );

        if (res.rowCount === 0) {
            return NextResponse.json({ success: false, error: 'Backup not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Delete backup failed:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
