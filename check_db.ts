import { config } from 'dotenv';
config({ path: '.env.local' });
import { getPgPool } from './src/lib/pg';

async function check() {
    const pool = getPgPool();
    const res = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'fluxbase_global';
    `);
    const tables = res.rows.map(r => r.table_name);
    console.log("---- TABLES START ----");
    tables.forEach(t => console.log(t));
    console.log("---- TABLES END ----");
    process.exit(0);
}
check().catch(console.error);
