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
            max: 10,
            idleTimeoutMillis: 60000,
            connectionTimeoutMillis: 10000,
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

