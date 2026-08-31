/**
 * Shared CORS utilities for API routes.
 * Never use wildcard '*' for Access-Control-Allow-Origin in production.
 */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

/**
 * Get the CORS origin header value for a request.
 * Returns the matching allowed origin, or undefined if none match.
 */
export function getCorsOrigin(requestOrigin: string | null): string | undefined {
    if (!requestOrigin) return undefined;
    if (ALLOWED_ORIGINS.length === 0) return undefined; // No origins configured = no CORS headers
    return ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : undefined;
}

/**
 * Build CORS headers object with a specific allowed origin.
 */
export function buildCorsHeaders(origin: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-project-id, x-api-key, apiKey, projectId',
        'Access-Control-Max-Age': '86400',
    };
    if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Vary'] = 'Origin';
    }
    return headers;
}

/**
 * Build a CORS preflight response (OPTIONS).
 */
export function corsPreflightResponse(origin: string | undefined) {
    return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin),
    });
}