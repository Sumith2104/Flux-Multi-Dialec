import { NextRequest, NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { SignJWT } from 'jose';
import logger from '@/lib/logger';

function getWsSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim() === '') {
        throw new Error('JWT_SECRET environment variable is required.');
    }
    return new TextEncoder().encode(secret);
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Issue a short-lived token (1 minute) for WebSocket handshake
        const token = await new SignJWT({ uid: auth.userId, type: 'ws_ticket' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('1m')
            .sign(getWsSecret());

        return NextResponse.json({ token });
    } catch (error) {
        logger.error('[Realtime Token] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
