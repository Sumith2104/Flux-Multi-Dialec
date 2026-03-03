import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPgPool(): Pool {
    if (!pool) {
        if (!process.env.AWS_RDS_POSTGRES_URL) {
            throw new Error("Missing AWS_RDS_POSTGRES_URL environment variable");
        }
        pool = new Pool({
            connectionString: process.env.AWS_RDS_POSTGRES_URL,
            ssl: {
                rejectUnauthorized: false
            },
            // Configure connection pool behavior suitable for serverless / small instances
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
    }
    return pool;
}
