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

        let found = false;
        for (const schema of schemas) {
            try {
                const res = await pool.query(`SELECT * FROM "${schema}"."gym_requests"`);
                if (res.rows.length > 0) {
                    console.log(`\n--- Found gym_requests in ${schema} ---`);
                    console.log(`TOTAL ROWS: ${res.rows.length}`);
                    console.log(JSON.stringify(res.rows, null, 2));
                    found = true;
                }
            } catch (e) {
                // Ignore missing tables
            }
        }
        if (!found) console.log("No data found in any gym_requests table.");
    } catch (error) {
        console.error("Connection Error:", error);
    } finally {
        await pool.end();
    }
}

main();
