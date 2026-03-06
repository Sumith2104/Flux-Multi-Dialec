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
            // Connection pool settings — tuned for long-running serverless + small RDS
            max: 10,
            idleTimeoutMillis: 60000,        // Close idle connections after 60s
            connectionTimeoutMillis: 10000,  // Wait up to 10s for a free connection
            keepAlive: true,                 // Send TCP keepalive packets to detect dead connections
            keepAliveInitialDelayMillis: 10000, // Start keepalive after 10s idle
        });

        // Prevent unhandled pool errors from crashing the process
        globalForPg.pgPool.on('error', (err) => {
            console.error('[pg pool] Unexpected error on idle client:', err.message);
        });
    }
    return globalForPg.pgPool;
}
