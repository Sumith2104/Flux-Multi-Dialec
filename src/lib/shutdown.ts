import { pool } from './pg';
import logger from '@/lib/logger';

let _shuttingDown = false;

export function isShuttingDown(): boolean {
    return _shuttingDown;
}

/**
 * Registers graceful shutdown handlers for SIGTERM and SIGINT.
 * Call once at app startup (e.g., in instrumentation.ts or server entry).
 */
export function registerGracefulShutdown(): void {
    if (typeof process === 'undefined') return;

    const shutdown = async (signal: string) => {
        if (_shuttingDown) return;
        _shuttingDown = true;
        logger.info(`[Shutdown] Received ${signal}. Draining connections...`);

        try {
            // Close PostgreSQL pool
            await pool.end();
            logger.info('[Shutdown] PostgreSQL pool closed.');
        } catch (e) {
            logger.error('[Shutdown] Error closing PostgreSQL pool:', e);
        }

        // Give the process 5 seconds to finish any in-flight work, then force exit
        setTimeout(() => {
            logger.info('[Shutdown] Forcing exit after drain timeout.');
            process.exit(0);
        }, 5000).unref();
    };

    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Returns a Next.js middleware-compatible response if the server is shutting down.
 * Use in API routes to reject new requests during shutdown.
 */
export function rejectIfShuttingDown(): { shouldReject: true; response: import('next/server').NextResponse } | { shouldReject: false } {
    if (_shuttingDown) {
        return {
            shouldReject: true,
            response: new (require('next/server')).NextResponse.json(
                { success: false, error: { message: 'Server is shutting down. Please retry.', code: 'SHUTTING_DOWN' } },
                { status: 503 }
            ),
        };
    }
    return { shouldReject: false };
}
