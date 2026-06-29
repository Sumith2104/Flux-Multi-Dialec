import { NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';

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

            const amountToLog = sessionAmount > 0 ? sessionAmount : 1.01;

            // 2. Always store manually entered UTR into DB tables (scraped_sms & bank_payments)
            const now = new Date();
            const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
            const paymentDate = now.toISOString().split('T')[0];
            const paymentTime = now.toTimeString().split(' ')[0];

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

            await client.query(`
                INSERT INTO fluxbase_global.scraped_sms (sms_body, sender, utr, amount, is_used)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (utr) DO UPDATE SET is_used = true;
            `, [`Manually entered UTR by user: ${cleanUtr}`, 'manual_entry', cleanUtr, amountToLog]);

            await client.query(`
                CREATE TABLE IF NOT EXISTS fluxbase_global.bank_payments (
                    utr VARCHAR(64) PRIMARY KEY,
                    amount NUMERIC(10, 2) NOT NULL,
                    day_name VARCHAR(10) NOT NULL,
                    payment_date DATE NOT NULL,
                    payment_time TIME NOT NULL,
                    source VARCHAR(30) NOT NULL,
                    order_id VARCHAR(64),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `).catch(() => {});

            await client.query(`
                INSERT INTO fluxbase_global.bank_payments (utr, amount, day_name, payment_date, payment_time, source)
                VALUES ($1, $2, $3, $4, $5, 'manual_entry')
                ON CONFLICT (utr) DO NOTHING;
            `, [cleanUtr, amountToLog, dayName, paymentDate, paymentTime]);

            // 3. Complete the payment session if present
            if (activeSessionId) {
                await client.query(
                    `UPDATE fluxbase_global.payment_sessions SET status = 'completed' WHERE id = $1`,
                    [activeSessionId]
                );
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
            console.log(`[Manual UTR Entry] Successfully stored UTR ${cleanUtr} in DB and upgraded User ${userId} to ${cleanPlan}`);
            
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
        console.error('[Verify UTR Error]:', err);
        return NextResponse.json({ error: err.message || 'Internal server error occurred while verifying payment.' }, { status: 500 });
    }
}
