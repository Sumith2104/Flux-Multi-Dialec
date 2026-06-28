import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';

const NOTIFICATION_WEBHOOK_SECRET = process.env.NOTIFICATION_WEBHOOK_SECRET || process.env.SMS_WEBHOOK_SECRET || 'my_super_secure_secret_token';

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization');
        const expected = `Bearer ${NOTIFICATION_WEBHOOK_SECRET}`;
        const expectedAlternative = NOTIFICATION_WEBHOOK_SECRET;

        if (authHeader !== expected && authHeader !== expectedAlternative) {
            console.warn(`[Notification Webhook] Unauthorized request. Received Authorization: "${authHeader}". Expected: "${expected}" or "${expectedAlternative}"`);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: any = {};
        let rawText = '';
        try {
            rawText = await req.text();
            body = JSON.parse(rawText);
        } catch (e) {
            body = { text: rawText };
        }

        const text = body.text || body.utr || body.sms_body || body.message || rawText;
        const app = body.app || body.source || 'Scraper';

        if (!text) {
            return NextResponse.json({ error: 'Missing notification text' }, { status: 400 });
        }

        const title = body.title || '';
        console.log(`[Notification Webhook] Intercepted from ${app || 'Unknown App'}: Title: "${title}", Text: "${text}"`);

        // 1. Parse amount from notification using robust multi-pattern fallback
        const amountMatch = 
            text.match(/(?:credited with INR|credited|received|payment\s+of|deposited|INR|rs\.?|₹|\?)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
            text.match(/([\d,]+(?:\.\d{1,2})?)\s*[^0-9]*?(?:credited|received|deposited)/i) ||
            text.match(/([\d]+(?:\.\d{1,2})?)/);

        const rawAmount = amountMatch ? amountMatch[1].replace(/,/g, '') : '0.00';
        const amount = parseFloat(rawAmount) || 0;

        // 2. Try to parse 12-digit UTR from the notification text
        const utrMatch = text.match(/(?:UPI|IMPS|Ref|UTR|Txn)[:\s;]*(\d{12})/i) || text.match(/\b(\d{12})\b/);
        const utr = utrMatch ? utrMatch[1] : null;

        const pool = getPgPool();

        if (utr) {
            // Save the transaction into scraped_sms database so the user can verify it manually in the UI via UTR
            await pool.query(`
                CREATE TABLE IF NOT EXISTS fluxbase_global.scraped_sms (
                    id SERIAL PRIMARY KEY,
                    sms_body TEXT,
                    sender VARCHAR(100),
                    utr VARCHAR(64) UNIQUE,
                    amount NUMERIC(10, 2),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
                INSERT INTO fluxbase_global.scraped_sms (sms_body, sender, utr, amount)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (utr) DO NOTHING
            `, [text, app || 'Notification Scraper', utr, amount]).catch(() => {});
            console.log(`[SCRAPER RECEIVE 📥] Channel: ${app.toUpperCase()} | UTR: ${utr} | Amount: ₹${amount}`);
        }

        // 3. Try to match the exact decimal amount to an active pending payment session
        const sessionQuery = await pool.query(
            `SELECT id, user_id, plan_type FROM fluxbase_global.payment_sessions 
             WHERE amount = $1 AND status = 'pending' AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [amount]
        );

        if (sessionQuery.rows.length > 0) {
            const session = sessionQuery.rows[0];
            const userId = session.user_id;
            const planType = session.plan_type;

            console.log(`[Notification Webhook] Matching session found! Session ID: ${session.id}, User: ${userId}, Plan: ${planType}, Amount: ₹${amount}`);

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // A. Mark session as completed
                await client.query(
                    `UPDATE fluxbase_global.payment_sessions 
                     SET status = 'completed' 
                     WHERE id = $1`,
                    [session.id]
                );

                // B. Insert record in payments table
                await client.query(
                    `INSERT INTO fluxbase_global.payments (user_id, amount, currency, status, razorpay_payment_id)
                     VALUES ($1, $2, 'INR', 'completed', $3)`,
                    [userId, amount, `upi_session_${session.id}`]
                );

                // C. Upgrade user plan settings
                await client.query(
                    `UPDATE fluxbase_global.users 
                     SET plan_type = $1, billing_cycle_end = NOW() + INTERVAL '1 month', status = 'active'
                     WHERE id = $2`,
                    [planType, userId]
                );

                await client.query('COMMIT');
                console.log(`[Notification Webhook] Successfully processed session ${session.id}. User upgraded to ${planType}`);

                return NextResponse.json({ 
                    success: true, 
                    message: 'Payment verified and user upgraded successfully via session matching.',
                    sessionId: session.id,
                    amount
                });

            } catch (txnError) {
                await client.query('ROLLBACK');
                throw txnError;
            } finally {
                client.release();
            }
        }

        // 4. Try to parse the custom Note/Description (Session ID or Payment ID)
        // Matches "Note: pay_12345" or "Note: 123-abc-456"
        const noteMatch = text.match(/(?:Note|Remark|For):\s*([a-zA-Z0-9_\-]+)/i);
        const paymentId = noteMatch ? noteMatch[1] : null;

        if (paymentId) {
            console.log(`[Notification Webhook] Extracted Payment ID = ${paymentId}, Amount = ₹${amount}`);
            
            const isNumericId = /^\d+$/.test(paymentId);
            let paymentQuery;
            if (isNumericId) {
                paymentQuery = await pool.query(
                    `SELECT id, user_id, amount, status FROM fluxbase_global.payments 
                     WHERE id = $1 AND status = 'pending'`,
                    [parseInt(paymentId, 10)]
                );
            } else {
                paymentQuery = await pool.query(
                    `SELECT id, user_id, amount, status FROM fluxbase_global.payments 
                     WHERE razorpay_payment_id = $1 AND status = 'pending'`,
                    [paymentId]
                );
            }

            if (paymentQuery.rows.length > 0) {
                const payment = paymentQuery.rows[0];
                const userId = payment.user_id;

                // Validate the amount
                if (parseFloat(payment.amount) === amount) {
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        await client.query(
                            `UPDATE fluxbase_global.payments 
                             SET status = 'completed', updated_at = NOW() 
                             WHERE id = $1`,
                            [payment.id]
                        );

                        const pricingRes = await client.query(
                            `SELECT pro_price, discount_pro_price 
                             FROM fluxbase_global.pricing_configs 
                             ORDER BY id DESC LIMIT 1`
                        );
                        let planType = 'max';
                        if (pricingRes.rows.length > 0) {
                            const pricingConf = pricingRes.rows[0];
                            const dbStandardPro = parseFloat(pricingConf.pro_price);
                            const dbDiscountPro = parseFloat(pricingConf.discount_pro_price);
                            planType = (amount === dbStandardPro || amount === dbDiscountPro) ? 'pro' : 'max';
                        }

                        await client.query(
                            `UPDATE fluxbase_global.users 
                             SET plan_type = $1, billing_cycle_end = NOW() + INTERVAL '1 month', status = 'active'
                             WHERE id = $2`,
                            [planType, userId]
                        );

                        await client.query('COMMIT');
                        console.log(`[Notification Webhook] Auto-upgraded Payment ${payment.id} for User ${userId} to ${planType}`);
                        return NextResponse.json({ success: true, message: 'Payment successfully processed and auto-upgraded' });
                    } catch (txnError) {
                        await client.query('ROLLBACK');
                        throw txnError;
                    } finally {
                        client.release();
                    }
                } else {
                    console.warn(`[Notification Webhook] Amount mismatch for payment ${payment.id}. Expected ₹${payment.amount}, received ₹${amount}`);
                }
            } else {
                console.warn(`[Notification Webhook] No pending payment found for ID: ${paymentId}`);
            }
        }

        // If we reached here, either there was no note, or the note didn't match any pending payment.
        // But if we successfully parsed and saved a UTR, it's still a success!
        if (utr) {
            return NextResponse.json({ 
                success: true, 
                message: 'Notification logged successfully via UTR.',
                utr,
                amount 
            });
        }

        // If we couldn't match a pending payment and had no UTR to log, return error
        return NextResponse.json({ 
            success: false, 
            message: 'No matching pending payment found and no UTR to log.' 
        });

    } catch (error: any) {
        console.error(`[Notification Webhook Error]:`, error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
