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
            max: 20, // Now safe as real-time uses exactly 1 shared connection
            idleTimeoutMillis: 1000, // Close idle connections after 1s to free up the pool faster
            connectionTimeoutMillis: 15000, // Wait up to 15s for a free connection
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
        });

        globalForPg.pgPool.on('error', (err) => {
            console.error('[pg pool] Unexpected error on idle client:', err.message);
        });

        // Initialize RLS support (auth schema and auth.uid function)
        setupRlsSupport(globalForPg.pgPool).catch(err => {
            console.error('[pg pool] Failed to initialize RLS support:', err.message);
        });
    }
    return globalForPg.pgPool;
}

/**
 * Ensures the 'auth' schema and 'auth.uid()' convenience function exist in the target database.
 * This function allows RLS policies to use auth.uid() just like Supabase.
 */
async function setupRlsSupport(pool: Pool) {
    const client = await pool.connect();
    try {
        await client.query('CREATE SCHEMA IF NOT EXISTS auth');
        await client.query(`
            CREATE OR REPLACE FUNCTION auth.uid() RETURNS text AS $$
                BEGIN
                    RETURN current_setting('fluxbase.auth_uid', true)::text;
                END;
            $$ LANGUAGE plpgsql STABLE;
        `);
    } finally {
        client.release();
    }
}

