/**
 * fluxdb-logger.ts
 * 
 * Sends structured log entries to FluxDB desktop app's live webhook receiver.
 * 
 * Configure in .env.local:
 *   FLUXDB_WEBHOOK_URL=http://127.0.0.1:7779/client-log
 * 
 * Set this ONLY during local development. Leave it unset in production
 * so the helper is a no-op and adds zero overhead.
 */

export interface FluxDBLogEntry {
    level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    component?: string;
    message: string;
    user_id?: string;
    session_id?: string;
    email?: string;
    project_id?: string;
    [key: string]: unknown; // allow any extra fields
}

/**
 * Fire-and-forget: sends a log entry to the FluxDB desktop webhook.
 * Never throws — safe to call from anywhere without try/catch.
 * No-op if FLUXDB_WEBHOOK_URL is not set.
 */
export function logToFluxDB(entry: FluxDBLogEntry): void {
    const url = process.env.FLUXDB_WEBHOOK_URL;
    if (!url) return; // disabled in production — zero overhead

    const payload = JSON.stringify({
        level: 'INFO',
        component: 'CLIENT',
        ts: new Date().toISOString(),
        ...entry,
    });

    // Use native fetch (Node.js 18+ / Next.js runtime)
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(3000),
        // @ts-ignore – Next.js-specific: don't cache this
        cache: 'no-store',
    }).catch(() => {
        // Silently ignore — FluxDB might not be running
    });
}

/**
 * Async version if you need to await the delivery (e.g. in tests).
 */
export async function logToFluxDBAsync(entry: FluxDBLogEntry): Promise<void> {
    const url = process.env.FLUXDB_WEBHOOK_URL;
    if (!url) return;

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: 'INFO',
                component: 'CLIENT',
                ts: new Date().toISOString(),
                ...entry,
            }),
            signal: AbortSignal.timeout(3000),
            cache: 'no-store',
        });
    } catch {
        // Silently ignore
    }
}
