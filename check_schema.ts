import { config } from 'dotenv';
config({ path: '.env.local' });
import { getPgPool } from './src/lib/pg';

async function check() {
    const pool = getPgPool();
    const res = await pool.query(`
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'fluxbase_global'
        ORDER BY table_name, ordinal_position;
    `);
    res.rows.forEach(r => console.log(`${r.table_name}.${r.column_name} (${r.data_type})`));
    process.exit(0);
}
check().catch(console.error);
