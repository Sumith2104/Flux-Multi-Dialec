import { Pool } from 'pg';
import { FluxbaseError, ERROR_CODES } from './error-codes';
import { NextResponse } from 'next/server';

// --- GLOBAL POOL SINGLETON (Serverless Optimization) ---
declare global {
    var _pool: Pool | undefined;
}

export const pool = global._pool || new Pool({
    connectionString: process.env.AWS_RDS_POSTGRES_URL,
    // [STABILITY FIX]: Enable SSL automatically if connecting to RDS, even in local dev.
    // RDS rejects unencrypted connections with "no pg_hba.conf entry... no encryption".
    ssl: process.env.AWS_RDS_POSTGRES_URL?.includes('rds.amazonaws.com') 
        ? { rejectUnauthorized: false } 
        : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
    max: 3, // Increased slightly for stability
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000, // Increased timeout for cross-region stability
    keepAlive: true,
});

if (!global._pool) {
    global._pool = pool;
}

// Keep backward compatibility for existing routes
export function getPgPool(): Pool {
    return pool;
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

/**
 * Standard utility to handle database connectivity errors and return 503 instead of 500.
 */
export function handleDatabaseError(e: any) {
    console.error('[Database Error Details]:', {
        message: e.message,
        code: e.code,
        syscall: e.syscall,
        hostname: e.hostname
    });

    const isConnectivityError = 
        e.code === 'ENOTFOUND' || 
        e.code === 'ECONNRESET' || 
        e.code === 'ETIMEDOUT' ||
        e.message?.includes('Connection terminated');

    if (isConnectivityError) {
        return NextResponse.json({
            success: false,
            error: {
                message: "Database host unreachable. Our infrastructure is currently experiencing a DNS or connectivity spike. Please try again in a few moments.",
                code: ERROR_CODES.DATABASE_CONNECTION_ERROR
            }
        }, { status: 503 });
    }

    // Default error response
    return NextResponse.json({
        success: false,
        error: {
            message: e.message || "An unexpected database error occurred.",
            code: ERROR_CODES.INTERNAL_ERROR
        }
    }, { status: 500 });
}

