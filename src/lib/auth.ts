'use server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fluxbase_dev_secret_key_123';

export interface User {
    id: string;
    email: string;
    display_name?: string;
    password?: string;
    created_at: string;
}

/**
 * Retrieves the current user's ID from the JWT session cookie.
 */
export async function getCurrentUserId(): Promise<string | null> {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) {
        return null;
    }

    try {
        const decoded = jwt.verify(sessionCookie, JWT_SECRET) as { uid: string };
        return decoded.uid;
    } catch (error) {
        console.error("Failed to verify session cookie:", error);
        return null;
    }
}

/**
 * Creates a JWT session cookie from a raw user ID.
 */
export async function createSessionCookie(uid: string) {
    const expiresIn = 60 * 60 * 24 * 30; // 30 days in seconds
    try {
        const sessionCookie = jwt.sign({ uid }, JWT_SECRET, { expiresIn });
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
import { validateApiKey } from '@/lib/api-keys';

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
    const context = await getAuthContextFromRequest(request);
    return context?.userId || null;
}

export interface AuthContext {
    userId: string;
    allowedProjectId?: string; // If present, the user is restricted to this project
}

export async function getAuthContextFromRequest(request: Request): Promise<AuthContext | null> {
    // 1. Check Session Cookie (Browser Access)
    const userId = await getCurrentUserId();
    if (userId) return { userId };

    // 2. Check Authorization Header (API Access)
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const apiKey = authHeader.split('Bearer ')[1].trim();
        if (apiKey) {
            const result = await validateApiKey(apiKey);
            if (result) {
                return { userId: result.userId, allowedProjectId: result.projectId };
            }
        }
    }

    return null;
}
