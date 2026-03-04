require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');

async function run() {
    const pool = new Pool({
        connectionString: process.env.AWS_RDS_POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'fluxbase_global' AND table_name = 'users';
        `);
        fs.writeFileSync('schema.json', JSON.stringify(res.rows, null, 2), 'utf8');
        console.log("Schema written to schema.json");
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
