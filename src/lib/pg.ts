import { Pool } from 'pg';
import { ERROR_CODES } from './error-codes';
import { NextResponse } from 'next/server';

// --- GLOBAL POOL SINGLETON (Serverless Optimization) ---
declare global {
    var _pool: Pool | undefined;
}

const isServerless = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const defaultPoolMax = isServerless ? '2' : '30';

const connectionString = process.env.AWS_RDS_POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

const needsSsl = !!(
    connectionString?.includes('rds.amazonaws.com') ||
    connectionString?.includes('supabase') ||
    connectionString?.includes('neon.tech') ||
    connectionString?.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production'
);

export const pool = global._pool || new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DATABASE_POOL_MAX || defaultPoolMax, 10),
    idleTimeoutMillis: isServerless ? 10000 : 600000, // 10s in serverless, 10m in local dev
    connectionTimeoutMillis: 5000, // Rapid 5s timeout to prevent requests from hanging endlessly
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

