import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function migrate() {
    const pool = new Pool({
        connectionString: process.env.AWS_RDS_POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pool.query(`
            CREATE SCHEMA IF NOT EXISTS fluxbase_global;
            
            CREATE TABLE IF NOT EXISTS fluxbase_global.project_members (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id VARCHAR(255) REFERENCES fluxbase_global.projects(project_id) ON DELETE CASCADE,
                user_id VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'developer',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, user_id)
            );
            
            -- Backfill existing project owners as admins
            INSERT INTO fluxbase_global.project_members (project_id, user_id, role)
            SELECT project_id, user_id, 'admin'
            FROM fluxbase_global.projects p
            WHERE NOT EXISTS (
                SELECT 1 FROM fluxbase_global.project_members pm 
                WHERE pm.project_id = p.project_id AND pm.user_id = p.user_id
            );

            CREATE TABLE IF NOT EXISTS fluxbase_global.audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id VARCHAR(255),
                user_id VARCHAR(255),
                action VARCHAR(50),
                statement TEXT,
                metadata JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Security & RBAC Tables Successfully Deployed");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await pool.end();
    }
}

migrate();
