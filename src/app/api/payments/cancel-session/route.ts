import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { sessionId } = await req.json();

        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId parameter' }, { status: 400 });
        }

        const pool = getPgPool();

        // Expire/kill the session in DB
        await pool.query(
            `UPDATE fluxbase_global.payment_sessions 
             SET status = 'expired' 
             WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
            [parseInt(sessionId, 10), userId]
        );

        return NextResponse.json({ success: true, message: 'Payment session cancelled successfully.' });
    } catch (error: any) {
        console.error('[Cancel Session Error]:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
