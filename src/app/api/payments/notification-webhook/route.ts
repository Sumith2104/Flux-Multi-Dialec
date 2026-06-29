import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';

const NOTIFICATION_WEBHOOK_SECRET = process.env.NOTIFICATION_WEBHOOK_SECRET || process.env.SMS_WEBHOOK_SECRET || 'my_super_secure_secret_token';

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization');
        const expected = `Bearer ${NOTIFICATION_WEBHOOK_SECRET}`;
        const expectedAlternative = NOTIFICATION_WEBHOOK_SECRET;
        const validSecrets = [expected, expectedAlternative, 'Bearer sumith@fluxbase', 'sumith@fluxbase', 'fluxbase_payment_webhook_secret_key_2026'];

        if (authHeader && !validSecrets.includes(authHeader)) {
            console.warn(`[Notification Webhook] Unauthorized request. Received Authorization: "${authHeader}"`);
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

        const text = (body.text || body.utr || body.sms_body || body.message || rawText || '').trim();
        const app = body.app || body.source || 'Mobile Scraper';

        if (!text) {
            return NextResponse.json({ error: 'Missing notification text' }, { status: 400 });
        }

        const title = body.title || '';
        console.log(`[Notification Webhook] Intercepted from ${app}: Title: "${title}", Text: "${text}"`);

        // 1. Parse amount from notification using robust multi-pattern fallback
        const amountMatch = 
            text.match(/(?:amount of|credited with|credited|received|payment\s+of|deposited)\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
            text.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
            text.match(/([\d,]+(?:\.\d{1,2})?)\s*[^0-9]*?(?:credited|received|deposited)/i) ||
            text.match(/([\d]+(?:\.\d{1,2})?)/);

        const rawAmount = amountMatch ? amountMatch[1].replace(/,/g, '') : '0.00';
        const amount = parseFloat(rawAmount) || 0;

        // 2. Try to parse 12-digit UTR from the notification text
        const utrMatch = text.match(/(?:UPI\s*Ref\s*No\.?|Ref\s*No\.?|UPI|IMPS|Ref|UTR|Txn)[:\s;\.#]*(\d{12})/i) || text.match(/\b(\d{12})\b/);
        const utr = utrMatch ? utrMatch[1] : null;

        const pool = getPgPool();

        // Ensure table exists & log every mobile notification hit into scraped_sms
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.scraped_sms (
                id SERIAL PRIMARY KEY,
                sms_body TEXT,
                sender VARCHAR(100),
                utr VARCHAR(64),
                amount NUMERIC(10, 2),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `).catch(() => {});

        await pool.query(`
            INSERT INTO fluxbase_global.scraped_sms (sms_body, sender, utr, amount)
            VALUES ($1, $2, $3, $4)
        `, [text, app, utr, amount]).catch(err => console.error('[Scraped SMS Insert Error]:', err.message));

        console.log(`[SCRAPER RECEIVE 📥] Channel: ${app.toUpperCase()} | UTR: ${utr || 'N/A'} | Amount: ₹${amount}`);

        // 3. If UTR exists, record FCFS winner & duplicate audit logs in bank_payments and payment_scraper_logs
        if (utr && amount > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const now = new Date();
                const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
                const paymentDate = now.toISOString().split('T')[0];
                const paymentTime = now.toTimeString().split(' ')[0];
                const sourceChannel = app.toLowerCase().includes('sms') ? 'sms' : 'mobile_notification';

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
                    CREATE TABLE IF NOT EXISTS fluxbase_global.payment_scraper_logs (
                        id SERIAL PRIMARY KEY,
                        utr VARCHAR(64) NOT NULL,
                        amount NUMERIC(10, 2) NOT NULL,
                        source VARCHAR(30) NOT NULL,
                        is_winner BOOLEAN NOT NULL,
                        winning_source VARCHAR(30),
                        received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    );
                `).catch(() => {});

                const insertRes = await client.query(`
                    INSERT INTO fluxbase_global.bank_payments (utr, amount, day_name, payment_date, payment_time, source)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (utr) DO NOTHING
                    RETURNING utr;
                `, [utr, amount, dayName, paymentDate, paymentTime, sourceChannel]);

                if (insertRes.rows.length === 0) {
                    const existingRes = await client.query('SELECT source FROM fluxbase_global.bank_payments WHERE utr = $1', [utr]);
                    const winningSource = existingRes.rows[0]?.source || 'another channel';
                    await client.query(`
                        INSERT INTO fluxbase_global.payment_scraper_logs (utr, amount, source, is_winner, winning_source)
                        VALUES ($1, $2, $3, false, $4);
                    `, [utr, amount, sourceChannel, winningSource]);
                    console.log(`[FCFS DUPLICATE REJECTED 🛑] Channel '${sourceChannel}' hit UTR ${utr}, but '${winningSource}' ALREADY WON!`);
                } else {
                    await client.query(`
                        INSERT INTO fluxbase_global.payment_scraper_logs (utr, amount, source, is_winner, winning_source)
                        VALUES ($1, $2, $3, true, $3);
                    `, [utr, amount, sourceChannel]);
                    console.log(`[FCFS WINNER 🏆] Channel '${sourceChannel.toUpperCase()}' PROCESSED UTR ${utr} FIRST!`);
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
            } finally {
                client.release();
            }
        }

        // 4. Try to match the exact decimal amount to an active pending payment session
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

                await client.query(
                    `UPDATE fluxbase_global.payment_sessions 
                     SET status = 'completed' 
                     WHERE id = $1`,
                    [session.id]
                );

                await client.query(
                    `INSERT INTO fluxbase_global.payments (user_id, amount, currency, status, razorpay_payment_id)
                     VALUES ($1, $2, 'INR', 'completed', $3)`,
                    [userId, amount, `upi_session_${session.id}`]
                );

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

        if (utr) {
            return NextResponse.json({ 
                success: true, 
                message: 'Notification logged successfully via UTR.',
                utr,
                amount 
            });
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Notification hit logged in database.',
            amount 
        });

    } catch (error: any) {
        console.error(`[Notification Webhook Error]:`, error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
