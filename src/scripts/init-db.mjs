import 'dotenv/config'; // Loads .env.local by default if available, but let's be explicit
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

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

async function initDb() {
    console.log("🔌 Connecting to AWS RDS to provision Global Schemas...");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log("🔨 Creating Schema: fluxbase_global");
        await client.query('CREATE SCHEMA IF NOT EXISTS fluxbase_global');

        console.log("🔨 Creating Table: fluxbase_global.users");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.users (
                id VARCHAR(128) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                display_name VARCHAR(255),
                photo_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Phase 1 Migration: Add Subscription Columns
        console.log("🔨 Migrating Table: fluxbase_global.users (Adding Subscription Columns)");
        await client.query(`
            ALTER TABLE fluxbase_global.users 
            ADD COLUMN IF NOT EXISTS razorpay_customer_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS razorpay_subscription_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS plan_type VARCHAR(50) DEFAULT 'free',
            ADD COLUMN IF NOT EXISTS billing_cycle_end TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
        `);

        console.log("🔨 Creating Table: fluxbase_global.projects");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.projects (
                project_id VARCHAR(128) PRIMARY KEY,
                user_id VARCHAR(128) NOT NULL REFERENCES fluxbase_global.users(id) ON DELETE CASCADE,
                display_name VARCHAR(255) NOT NULL,
                dialect VARCHAR(50) DEFAULT 'mysql',
                timezone VARCHAR(100) DEFAULT 'UTC',
                ai_allow_destructive BOOLEAN DEFAULT false,
                ai_schema_inference BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Phase 2 Migration: Add AI Preferences Columns to projects table
        console.log("🔨 Migrating Table: fluxbase_global.projects (Adding AI Preference Columns)");
        await client.query(`
            ALTER TABLE fluxbase_global.projects 
            ADD COLUMN IF NOT EXISTS ai_allow_destructive BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_schema_inference BOOLEAN DEFAULT true;
        `);

        // Phase 3 Migration: Add Resource Limits Constraints
        console.log("🔨 Migrating Table: fluxbase_global.projects (Adding Custom Resource Limits Columns)");
        await client.query(`
            ALTER TABLE fluxbase_global.projects
            ADD COLUMN IF NOT EXISTS custom_api_limit INTEGER,
            ADD COLUMN IF NOT EXISTS custom_row_limit INTEGER,
            ADD COLUMN IF NOT EXISTS custom_request_limit INTEGER,
            ADD COLUMN IF NOT EXISTS alert_email VARCHAR(255),
            ADD COLUMN IF NOT EXISTS alert_threshold_percent INTEGER DEFAULT 80,
            ADD COLUMN IF NOT EXISTS last_api_alert_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS last_row_alert_at TIMESTAMP WITH TIME ZONE;
        `);

        console.log("🔨 Creating Table: fluxbase_global.api_keys");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.api_keys (
                id VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(128) NOT NULL REFERENCES fluxbase_global.users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                project_id VARCHAR(128),
                project_name VARCHAR(255),
                preview VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP WITH TIME ZONE
            )
        `);

        console.log("🔨 Creating Table: fluxbase_global.webhooks");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.webhooks (
                webhook_id VARCHAR(128) PRIMARY KEY,
                project_id VARCHAR(128) NOT NULL REFERENCES fluxbase_global.projects(project_id) ON DELETE CASCADE,
                user_id VARCHAR(128) NOT NULL REFERENCES fluxbase_global.users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                url TEXT NOT NULL,
                event VARCHAR(50) NOT NULL,
                table_id VARCHAR(255) NOT NULL,
                secret VARCHAR(255),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("🔨 Creating Table: fluxbase_global.analytics_rollups");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.analytics_rollups (
                project_id VARCHAR(128) NOT NULL REFERENCES fluxbase_global.projects(project_id) ON DELETE CASCADE,
                period_start TIMESTAMP WITH TIME ZONE NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                count INTEGER DEFAULT 1,
                PRIMARY KEY (project_id, period_start, event_type)
            )
        `);

        console.log("🔨 Creating Table: fluxbase_global.login_history");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.login_history (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(128) NOT NULL REFERENCES fluxbase_global.users(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL,
                ip VARCHAR(45) NOT NULL,
                user_agent TEXT NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("🔨 Creating Table: fluxbase_global.storage_buckets");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.storage_buckets (
                id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
                project_id VARCHAR(128) NOT NULL REFERENCES fluxbase_global.projects(project_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                is_public BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (project_id, name)
            )
        `);

        console.log("🔨 Creating Table: fluxbase_global.storage_objects");
        await client.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.storage_objects (
                id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
                bucket_id VARCHAR(128) NOT NULL REFERENCES fluxbase_global.storage_buckets(id) ON DELETE CASCADE,
                project_id VARCHAR(128) NOT NULL REFERENCES fluxbase_global.projects(project_id) ON DELETE CASCADE,
                name VARCHAR(1024) NOT NULL,
                s3_key TEXT NOT NULL UNIQUE,
                size BIGINT NOT NULL DEFAULT 0,
                mime_type VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query('COMMIT');
        console.log("✅ SUCCESS: Global Schemas and Metadata Tables Provisioned.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ ERROR failed to provision schemas:", e);
    } finally {
        client.release();
        await pool.end();
    }
}

initDb();
