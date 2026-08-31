import { NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';
import logger from '@/lib/logger';

export async function POST(req: Request) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { utr, plan, sessionId } = await req.json();

        if (!utr || !plan) {
            return NextResponse.json({ error: 'Missing UTR or Plan' }, { status: 400 });
        }

        // Clean UTR and validate it is 12 digits
        const cleanUtr = utr.trim();
        if (!/^\d{12}$/.test(cleanUtr)) {
            return NextResponse.json({ error: 'Invalid UTR format. Must be a 12-digit number.' }, { status: 400 });
        }

        const cleanPlan = plan.toLowerCase();
        if (cleanPlan !== 'pro' && cleanPlan !== 'max') {
            return NextResponse.json({ error: 'Invalid plan type.' }, { status: 400 });
        }

        const pool = getPgPool();
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // A user-entered reference is not proof of payment. It must first
            // have been received through an authenticated payment webhook.
            const verifiedPayment = await client.query(
                `SELECT amount FROM fluxbase_global.bank_payments WHERE utr = $1 FOR UPDATE`,
                [cleanUtr]
            );
            if (verifiedPayment.rows.length === 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Payment reference has not been verified by the payment provider.' }, { status: 409 });
            }
            const alreadyConsumed = await client.query(
                `SELECT 1 FROM fluxbase_global.payments WHERE razorpay_payment_id = $1 LIMIT 1`,
                [`manual_utr_${cleanUtr}`]
            );
            if (alreadyConsumed.rows.length > 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Payment reference has already been used.' }, { status: 409 });
            }

            // 1. Check active session or existing scraped records
            let sessionAmount = 0;
            let activeSessionId = sessionId ? parseInt(sessionId, 10) : null;

            if (activeSessionId) {
                const sessRes = await client.query(
                    `SELECT amount FROM fluxbase_global.payment_sessions WHERE id = $1 AND user_id = $2`,
                    [activeSessionId, userId]
                );
                if (sessRes.rows.length > 0) {
                    sessionAmount = parseFloat(sessRes.rows[0].amount);
                }
            }

            if (!sessionAmount) {
                const sessRes = await client.query(
                    `SELECT id, amount FROM fluxbase_global.payment_sessions 
                     WHERE user_id = $1 AND status = 'pending' AND expires_at > NOW() 
                     ORDER BY created_at DESC LIMIT 1`,
                    [userId]
                );
                if (sessRes.rows.length > 0) {
                    activeSessionId = sessRes.rows[0].id;
                    sessionAmount = parseFloat(sessRes.rows[0].amount);
                }
            }

            if (!activeSessionId || sessionAmount <= 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'No active checkout session found.' }, { status: 409 });
            }

            const amountToLog = parseFloat(verifiedPayment.rows[0].amount);
            if (amountToLog !== sessionAmount) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Payment amount does not match the checkout session.' }, { status: 409 });
            }

            // 2. Mark the independently verified notification as consumed.

            await client.query(`
                CREATE TABLE IF NOT EXISTS fluxbase_global.scraped_sms (
                    id SERIAL PRIMARY KEY,
                    sms_body TEXT,
                    sender VARCHAR(100),
                    utr VARCHAR(64) UNIQUE,
                    amount NUMERIC(10, 2),
                    is_used BOOLEAN DEFAULT false,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `).catch(() => {});

            await client.query(
                `UPDATE fluxbase_global.scraped_sms SET is_used = true WHERE utr = $1`,
                [cleanUtr]
            );

            // 3. Complete the payment session if present
            if (activeSessionId) {
                const completeSession = await client.query(
                    `UPDATE fluxbase_global.payment_sessions
                     SET status = 'completed'
                     WHERE id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > NOW()`,
                    [activeSessionId, userId]
                );
                if (completeSession.rowCount !== 1) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Checkout session is no longer pending.' }, { status: 409 });
                }
            }

            // 4. Log record in payments table
            await client.query(
                `INSERT INTO fluxbase_global.payments (user_id, amount, currency, status, razorpay_payment_id)
                 VALUES ($1, $2, 'INR', 'completed', $3)`,
                [userId, amountToLog, `manual_utr_${cleanUtr}`]
            );

            // 5. Upgrade user plan settings
            await client.query(
                `UPDATE fluxbase_global.users 
                 SET plan_type = $1, billing_cycle_end = NOW() + INTERVAL '1 month', status = 'active'
                 WHERE id = $2`,
                [cleanPlan, userId]
            );

            await client.query('COMMIT');
            logger.info(`[Manual UTR Entry] Successfully stored UTR ${cleanUtr} in DB and upgraded User ${userId} to ${cleanPlan}`);
            
            return NextResponse.json({ 
                success: true, 
                message: `Manual UTR ${cleanUtr} saved to DB and verified! Your account is upgraded to ${cleanPlan.toUpperCase()}.` 
            });

        } catch (txnError) {
            await client.query('ROLLBACK');
            throw txnError;
        } finally {
            client.release();
        }

    } catch (err: any) {
        logger.error('[Verify UTR Error]:', err);
        return NextResponse.json({ error: err.message || 'Internal server error occurred while verifying payment.' }, { status: 500 });
    }
}
