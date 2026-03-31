import { NextRequest, NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fluxbase_dev_secret_key_123';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Issue a short-lived token (1 minute) for WebSocket handshake
        const token = jwt.sign(
            { uid: auth.userId, type: 'ws_ticket' },
            JWT_SECRET,
            { expiresIn: '1m' }
        );

        return NextResponse.json({ token });
    } catch (error) {
        console.error('[Realtime Token] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
