import { config } from 'dotenv';
config({ path: '.env.local' });
import { getPgPool } from './src/lib/pg';

async function migrate() {
    const pool = getPgPool();
    console.log("Ensuring fluxbase_global.alerts table exists...");
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.alerts (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            metric TEXT NOT NULL,
            condition TEXT NOT NULL,
            threshold NUMERIC NOT NULL,
            notify_email TEXT,
            notify_webhook TEXT,
            enabled BOOLEAN DEFAULT true,
            last_triggered_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            FOREIGN KEY (project_id) REFERENCES fluxbase_global.projects(project_id) ON DELETE CASCADE
        )
    `);
    console.log("Table created or verified successfully.");
    process.exit(0);
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
