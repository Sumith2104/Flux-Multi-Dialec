import 'dotenv/config';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env.local');

// 1. Manually load .env.local
if (fs.existsSync(envPath)) {
    console.log(`Loading environment from ${envPath}`);
    dotenv.config({ path: envPath });
} else {
    console.warn(`.env.local not found at ${envPath}, relying on system boundaries.`);
}

const connectionString = process.env.AWS_RDS_POSTGRES_URL;

if (!connectionString) {
    console.error("❌ ERROR: AWS_RDS_POSTGRES_URL is missing in environment variables.");
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function initScrapers() {
    console.log("🔌 Connecting to AWS RDS to provision Scraper Tables...");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log("🔨 Creating Schema: fluxbase_global (if not exists)");
        await client.query('CREATE SCHEMA IF NOT EXISTS fluxbase_global');

        console.log("🔨 Creating Table: fluxbase_global.fluxbase_scrapers");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.fluxbase_scrapers (
                id UUID PRIMARY KEY,
                user_id VARCHAR(128) NOT NULL,
                project_id VARCHAR(128) NOT NULL,
                url TEXT NOT NULL,
                selectors JSONB NOT NULL,
                table_name TEXT NOT NULL,
                schedule TEXT DEFAULT 'manual',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'idle',
                last_run TIMESTAMP WITH TIME ZONE,
                next_run TIMESTAMP WITH TIME ZONE
            );
        `);

        console.log("🔨 Creating Table: fluxbase_global.fluxbase_scraper_runs");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.fluxbase_scraper_runs (
                id UUID PRIMARY KEY,
                scraper_id UUID REFERENCES fluxbase_global.fluxbase_scrapers(id) ON DELETE CASCADE,
                rows_inserted INT DEFAULT 0,
                status TEXT NOT NULL,
                duration_ms INT,
                error_message TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indexes for faster queries
        console.log("⚡ Creating Indexes...");
        await client.query(`CREATE INDEX IF NOT EXISTS idx_scrapers_project ON fluxbase_global.fluxbase_scrapers(project_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_scrapers_user ON fluxbase_global.fluxbase_scrapers(user_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_scraper_runs_parent ON fluxbase_global.fluxbase_scraper_runs(scraper_id);`);

        await client.query('COMMIT');
        console.log("✅ Scraper schemas provisioned successfully.");

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("❌ Transaction Failed, rolling back.", error);
    } finally {
        client.release();
    }
}

initScrapers()
    .then(() => {
        pool.end();
        console.log("🔌 Disconnected.");
    })
    .catch((err) => {
        console.error("Critical Failure:", err);
        pool.end();
        process.exit(1);
    });
