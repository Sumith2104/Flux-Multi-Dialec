'use server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { validateApiKey } from '@/lib/api-keys';

const JWT_SECRET = process.env.JWT_SECRET || 'fluxbase_dev_secret_key_123';

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
    allowedProjectId?: string; // If present, the user is restricted to this project
    scopes?: string[]; // If present (API access), these define permitted actions
    status?: string; // Organization status
}

export async function getAuthContextFromRequest(request: Request): Promise<AuthContext | null> {
    // Helper to fetch user status to enforce suspension
    const fetchUserStatus = async (uid: string) => {
        try {
            const { getPgPool } = await import('@/lib/pg');
            const pool = getPgPool();
            const res = await pool.query('SELECT status FROM fluxbase_global.users WHERE id = $1', [uid]);
            return res.rows[0]?.status || 'active';
        } catch {
            return 'active';
        }
    };

    // 1. Check Session Cookie (Browser Access)
    const userId = await getCurrentUserId();
    if (userId) {
        const status = await fetchUserStatus(userId);
        return { userId, status };
    }

    // 2. Check Authorization Header OR URL Search Params (API Access for SSE/WebSockets)
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

    if (apiKey) {
        const result = await validateApiKey(apiKey);
        if (result) {
            // Track session for API key users (they have a specific project context)
            if (result.projectId) {
                const { trackSession } = await import('@/lib/track-session');
                await trackSession(result.projectId, result.userId);
            }
            
            const status = await fetchUserStatus(result.userId);

            return { 
                userId: result.userId, 
                allowedProjectId: result.projectId,
                scopes: result.scopes,
                status
            };
        }
    }

    return null;
}
