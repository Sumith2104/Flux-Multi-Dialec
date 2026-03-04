require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function run() {
    console.log("Adding password_hash to users table...");
    const pool = new Pool({
        connectionString: process.env.AWS_RDS_POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pool.query(`
            ALTER TABLE fluxbase_global.users 
            ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
        `);
        console.log("✅ Successfully added password_hash column!");
    } catch (e) {
        console.error("Failed to add column:", e);
    } finally {
        await pool.end();
    }
}
run();
