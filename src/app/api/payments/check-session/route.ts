import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';
import logger from '@/lib/logger';

export async function GET(req: NextRequest) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('sessionId');

        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId parameter' }, { status: 400 });
        }

        const pool = getPgPool();

        // Query status of the session, ensuring it belongs to the authenticated user
        const result = await pool.query(
            `SELECT status, expires_at, amount, plan_type FROM fluxbase_global.payment_sessions 
             WHERE id = $1 AND user_id = $2`,
            [parseInt(sessionId, 10), userId]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Checkout session not found' }, { status: 404 });
        }

        const session = result.rows[0];
        let status = session.status;

        // If the session is still pending but has passed its expiration time, dynamically treat it as expired
        if (status === 'pending' && new Date() > new Date(session.expires_at)) {
            status = 'expired';
            // Optionally update the status in the DB
            await pool.query(
                `UPDATE fluxbase_global.payment_sessions 
                 SET status = 'expired' 
                 WHERE id = $1`,
                [parseInt(sessionId, 10)]
            );
        }

        const pricingRes = await pool.query(`SELECT upi_id FROM fluxbase_global.pricing_configs ORDER BY id DESC LIMIT 1`);
        const upiMerchantVpa = pricingRes.rows[0]?.upi_id || 'sumith0909@axl';

        return NextResponse.json({
            success: true,
            status,
            amount: parseFloat(session.amount),
            planType: session.plan_type,
            expiresAt: session.expires_at,
            upiMerchantVpa
        });

    } catch (error: any) {
        logger.error('[Check Session Error]:', error);
        return NextResponse.json({ error: 'Internal server error occurred while checking status.' }, { status: 500 });
    }
}
