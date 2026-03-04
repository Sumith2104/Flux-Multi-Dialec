require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function migrate() {
    console.log("Connecting to AWS RDS...");
    const pool = new Pool({
        connectionString: process.env.AWS_RDS_POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log("Creating fluxbase_global.otp_verifications table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.otp_verifications (
                email VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                password_hash VARCHAR(255),
                otp_code VARCHAR(6),
                expires_at TIMESTAMP
            );
        `);
        console.log("✅ Successfully created otp_verifications table!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await pool.end();
    }
}

migrate();
