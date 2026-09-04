import { Pool } from 'pg';
import { ERROR_CODES } from './error-codes';
import { NextResponse } from 'next/server';

// --- GLOBAL POOL SINGLETON (Serverless Optimization) ---
declare global {
    var _pool: Pool | undefined;
}

const isServerless = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const defaultPoolMax = isServerless ? '5' : '15';

const connectionString = process.env.AWS_RDS_POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

const needsSsl = !!(
    connectionString?.includes('rds.amazonaws.com') ||
    connectionString?.includes('supabase') ||
    connectionString?.includes('neon.tech') ||
    connectionString?.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production'
);

const isNewPool = !global._pool;

export const pool: Pool = global._pool || new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: parseInt(process.env.DATABASE_POOL_MAX || defaultPoolMax, 10),
    idleTimeoutMillis: 10000, // Reclaim idle connections after 10s
    connectionTimeoutMillis: 10000, // 10s timeout to allow AWS RDS TLS handshake
    keepAlive: true,
});

if (process.env.NODE_ENV !== 'production') {
    global._pool = pool;
}

// Trap idle connection errors and handle shutdown only on initial instantiation to prevent MaxListenersExceededWarning
if (isNewPool) {
    pool.on('error', (err: any) => {
        console.warn('[PostgreSQL Pool] Idle client warning (handled safely):', err?.message || err);
    });

    if (typeof process !== 'undefined') {
        const handleShutdown = async () => {
            try {
                await pool.end();
            } catch {}
        };
        process.once('SIGTERM', handleShutdown);
        process.once('SIGINT', handleShutdown);
    }
}

// Keep backward compatibility for existing routes
export function getPgPool(): Pool {
    return pool;
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

