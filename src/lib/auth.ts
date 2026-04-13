'use server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { validateApiKey } from '@/lib/api-keys';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'fluxbase_dev_secret_key_123';

// Cache user suspension status for 30s — avoids a DB query on every API request.
// If a user is suspended it takes at most 30s to take effect, which is acceptable.
const _userStatusCache = new LRUCache<string, string>({ max: 1000, ttl: 30_000 });

// Cache the full AuthContext for cookie-based sessions for 30s.
// Keyed on a SHA-256 hash of the JWT so we never store the raw token in memory.
// AuthContext is declared below in this same file — TS hoists interface declarations.
// eslint-disable-next-line @typescript-eslint/no-use-before-define
const _authContextCache = new LRUCache<string, AuthContext | null>({ max: 1000, ttl: 30_000 });

export interface User {
    id: string;
    email: string;
    display_name?: string;
    password?: string;
    created_at: string;
}

/**
 * Retrieves the current user's core auth state from the JWT session cookie.
 */
export async function getCurrentUserId(): Promise<string | null> {
    const context = await getSessionContext();
    return context?.uid || null;
}

export async function getSessionContext(): Promise<{ uid: string; mfa?: boolean } | null> {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) return null;

    try {
        const decoded = jwt.verify(sessionCookie, JWT_SECRET) as { uid: string; mfa?: boolean };
        return { uid: decoded.uid, mfa: decoded.mfa };
    } catch (error) {
        console.error("Failed to verify session cookie:", error);
        return null;
    }
}

/**
 * Creates a JWT session cookie from a raw user ID.
 * @param uid The user ID
 * @param isMfaVerified Whether 2FA has been completed for this session
 */
export async function createSessionCookie(uid: string, isMfaVerified: boolean = false) {
    const expiresIn = 60 * 60 * 24 * 30; // 30 days in seconds
    try {
        const sessionCookie = jwt.sign({ uid, mfa: isMfaVerified }, JWT_SECRET, { expiresIn });
        const isProduction = process.env.NODE_ENV === 'production';
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        (await cookies()).set('session', sessionCookie, {
            expires: expiresAt,
            maxAge: expiresIn,
            httpOnly: true,
            secure: isProduction,
            path: '/',
            sameSite: 'lax',
        });
    } catch (error) {
        console.error("Failed to create session cookie:", error);
        throw new Error("Authentication failed");
    }
}

/**
 * Logs out the user by clearing the session cookie.
 */
export async function logout() {
    (await cookies()).delete('session');
}

/**
 * Retrieves the user ID from the request, checking both session cookies and API keys.
 * enhancing security for API routes.
 */

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
    const context = await getAuthContextFromRequest(request);
    return context?.userId || null;
}

export interface AuthContext {
    userId: string;
    email: string;
    allowedProjectId?: string; // If present, the user is restricted to this project
    scopes?: string[]; // If present (API access), these define permitted actions
    status?: string; // Organization status
}

export async function getAuthContextFromRequest(request: Request): Promise<AuthContext | null> {
    // Cached helper — avoids 1 DB query per request just to check suspension status.
    const fetchUserStatus = async (uid: string): Promise<{ status: string; email: string }> => {
        const cached = _userStatusCache.get(uid);
        if (cached !== undefined) {
             const [status, email] = cached.split(':');
             return { status, email };
        }
        try {
            const { getPgPool } = await import('@/lib/pg');
            const pool = getPgPool();
            const res = await pool.query('SELECT status, email FROM fluxbase_global.users WHERE id = $1', [uid]);
            const status = res.rows[0]?.status || 'active';
            const email = res.rows[0]?.email || '';
            _userStatusCache.set(uid, `${status}:${email}`);
            return { status, email };
        } catch {
            return { status: 'active', email: '' };
        }
    };

    // 1. Check Session Cookie (Browser Access)
    const userId = await getCurrentUserId();
    if (userId) {
        // Cache the full context keyed on userId for cookie sessions.
        // This eliminates the fetchUserStatus DB hit on every API request.
        const cached = _authContextCache.get(`cookie:${userId}`);
        if (cached !== undefined) return cached;

        const { status, email } = await fetchUserStatus(userId);
        const ctx: AuthContext = { userId, email, status };
        _authContextCache.set(`cookie:${userId}`, ctx);
        return ctx;
    }

    // 2. Check Authorization Header OR URL Search Params (API Access)
    let apiKey = '';
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.split('Bearer ')[1].trim();
    } else {
        // Fallback for EventSource which cannot send headers cross-origin
        try {
            const url = new URL(request.url);
            apiKey = url.searchParams.get('apiKey') || '';
        } catch (e) {}
    }

    const headerProjectId = request.headers.get('x-project-id');

    if (apiKey) {
        // Cache API key auth context keyed on hash of key (never raw key in memory).
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
        const cacheKey = `apikey:${keyHash}`;
        const cached = _authContextCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const result = await validateApiKey(apiKey);
        if (result) {
            const isNoisyRoute = request.url.includes('/api/realtime/subscribe');
            if (result.projectId && !isNoisyRoute) {
                const { trackSession } = await import('@/lib/track-session');
                await trackSession(result.projectId, result.userId);
            }

            const { status, email } = await fetchUserStatus(result.userId);
            const ctx: AuthContext = {
                userId: result.userId,
                email,
                allowedProjectId: result.projectId || headerProjectId || undefined,
                scopes: result.scopes,
                status
            };
            _authContextCache.set(cacheKey, ctx);
            return ctx;
        }
    }

    return null;
}
