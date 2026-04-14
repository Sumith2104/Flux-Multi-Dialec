const { Pool } = require('pg');
require('dotenv').config({ path: './.env.local' });

async function check() {
    const pool = new Pool({
        connectionString: process.env.AWS_RDS_POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        console.log("Checking tables in fluxbase_global...");
        const res = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'fluxbase_global'
        `);
        console.table(res.rows);

        console.log("\nDescribing project_invitations...");
        const cols = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'fluxbase_global' AND table_name = 'project_invitations'
        `);
        console.table(cols.rows);

        const data = await pool.query(`SELECT * FROM fluxbase_global.project_invitations LIMIT 5`);
        console.log("\nSample Data from project_invitations:");
        console.table(data.rows);

    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await pool.end();
    }
}

check();
