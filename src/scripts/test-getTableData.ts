import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const pool = new Pool({
        connectionString: process.env.AWS_RDS_POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const schemasRes = await pool.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'project_%'`);
        const schemas = schemasRes.rows.map(r => r.schema_name);

        for (const schema of schemas) {
            try {
                const res = await pool.query(`SELECT * FROM "${schema}"."gym_requests"`);
                if (res.rows.length > 0) {
                    console.log(`FOUND PROJECT UUID: ${schema.replace('project_', '')}`);
                    const projectId = schema.replace('project_', '');

                    // Now test getTableData
                    const { getTableData } = await import('@/lib/data');
                    console.log('Testing getTableData...');
                    const tableData = await getTableData(projectId, 'gym_requests', 50, 0);
                    console.log('getTableData Rows Length:', tableData.rows.length);
                    console.log('getTableData TotalRows:', tableData.totalRows);
                }
            } catch (e: any) {
                console.error("DEBUG ERROR in schema scan:", e.message);
                require('fs').writeFileSync('error.txt', e.stack || e.message);
            }
        }
    } catch (error) {
        console.error("Connection Error:", error);
    } finally {
        await pool.end();
    }
}

main();
