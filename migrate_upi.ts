import { config } from 'dotenv';
config({ path: '.env.local' });
import { getPgPool } from './src/lib/pg';

async function migrate() {
    const pool = getPgPool();
    console.log("Ensuring fluxbase_global.scraped_sms table exists...");
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.scraped_sms (
            id SERIAL PRIMARY KEY,
            sms_body TEXT NOT NULL,
            sender VARCHAR(50) NOT NULL,
            utr VARCHAR(50) UNIQUE NOT NULL,
            amount NUMERIC NOT NULL,
            is_used BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    console.log("Table created or verified successfully.");
    process.exit(0);
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
