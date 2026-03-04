import { Pool } from 'pg';

const globalForPg = globalThis as unknown as {
    pgPool: Pool | undefined;
};

export function getPgPool(): Pool {
    if (!globalForPg.pgPool) {
        if (!process.env.AWS_RDS_POSTGRES_URL) {
            throw new Error("Missing AWS_RDS_POSTGRES_URL environment variable");
        }
        globalForPg.pgPool = new Pool({
            connectionString: process.env.AWS_RDS_POSTGRES_URL,
            ssl: {
                rejectUnauthorized: false
            },
            // Configure connection pool behavior suitable for serverless / small instances
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000, // Slightly higher to prevent immediate timeouts under load
        });
    }
    return globalForPg.pgPool;
}
