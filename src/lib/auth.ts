'use server';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';

export interface User {
    id: string;
    email: string;
    password?: string;
    created_at: string;
}

/**
 * Retrieves the current user's ID from the Firebase session cookie.
 */
export async function getCurrentUserId(): Promise<string | null> {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) {
        return null;
    }

    try {
        const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
        return decodedClaims.uid;
    } catch (error) {
        console.error("Failed to verify session cookie:", error);
        return null;
    }
}

/**
 * Creates a session cookie from an ID token.
 * This should be called by an API route after client-side login.
 */
export async function createSessionCookie(idToken: string) {
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days

    try {
        const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
        const isSecure = process.env.NEXT_PUBLIC_SECURE_COOKIES === 'true';

        (await cookies()).set('session', sessionCookie, {
            maxAge: expiresIn,
            httpOnly: true,
            secure: isSecure,
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
