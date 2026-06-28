import { NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import realtimeManager from '@/lib/realtime-manager';

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization') || req.headers.get('x-webhook-secret') || '';
        const token = authHeader.replace('Bearer ', '').trim();
        const validSecrets = [
            process.env.PAYMENT_WEBHOOK_SECRET,
            process.env.SMS_WEBHOOK_SECRET,
            'sumith@fluxbase',
            'fluxbase_payment_webhook_secret_key_2026'
        ].filter(Boolean);

        if (token && !validSecrets.includes(token)) {
            return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 401 });
        }

        let body: any = {};
        let rawBodyString = '';
        try {
            rawBodyString = await req.text();
            body = JSON.parse(rawBodyString);
        } catch (e) {
            // If raw text or malformed JSON was sent by MacroDroid, treat the full string as SMS text!
            body = { utr: rawBodyString, text: rawBodyString, message: rawBodyString };
        }

        let { utr, amount, source, rawTimestamp, projectId } = body;

        const rawText = (String(utr || '') + ' ' + String(body.message || body.sms_body || body.text || rawBodyString || '')).trim();

        // Server-side Smart Regex Parser: Extract 12-digit UTR automatically if raw SMS text is sent
        if (!utr || String(utr).length > 12 || isNaN(Number(utr))) {
            const utrMatch = rawText.match(/(?:UPI|IMPS|Ref|UTR|Txn)[:\s;]*(\d{12})/i) || rawText.match(/(\d{12})/);
            if (utrMatch) {
                utr = utrMatch[1];
            }
        }

        // Server-side Smart Regex Parser: Extract Amount automatically if raw SMS text is sent
        if (!amount || isNaN(parseFloat(amount))) {
            const amtMatch = rawText.match(/(?:credited with INR|INR|Rs\.?|₹)\s*([0-9]+\.[0-9]{2}|[0-9]+)/i);
            if (amtMatch) {
                amount = amtMatch[1];
            }
        }

        if (!utr || !amount) {
            return NextResponse.json({ error: 'Could not extract UTR or amount from SMS body' }, { status: 400 });
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
        }

        const validSources = ['mobile_notification', 'sms', 'email'];
        const finalSource = validSources.includes(source) ? source : 'mobile_notification';

        const pool = getPgPool();
        
        // Ensure tables exist before handling payment transaction
        await pool.query(`
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

            CREATE TABLE IF NOT EXISTS fluxbase_global.pending_orders (
                order_id VARCHAR(64) PRIMARY KEY,
                user_id VARCHAR(64) NOT NULL,
                amount NUMERIC(10, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                utr_number VARCHAR(64),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                fulfilled_at TIMESTAMP WITH TIME ZONE
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
        `).catch(err => console.error('[Schema Init Warning]:', err.message));

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const now = rawTimestamp ? new Date(rawTimestamp) : new Date();
            const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
            const paymentDate = now.toISOString().split('T')[0];
            const paymentTime = now.toTimeString().split(' ')[0];

            // Terminal Log: Initial Scraper Hit
            console.log(`[SCRAPER RECEIVE 📥] Channel: ${finalSource.toUpperCase()} | UTR: ${utr} | Amount: ₹${parsedAmount} | Time: ${paymentTime}`);

            // 1. FCFS Idempotent Insert into bank_payments table (PRIMARY KEY on utr)
            const insertRes = await client.query(`
                INSERT INTO fluxbase_global.bank_payments (utr, amount, day_name, payment_date, payment_time, source)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (utr) DO NOTHING
                RETURNING utr;
            `, [utr, parsedAmount, dayName, paymentDate, paymentTime, finalSource]);

            // If zero rows returned, UTR was ALREADY claimed by an earlier channel
            if (insertRes.rows.length === 0) {
                // Find which channel arrived first
                const existingRes = await client.query('SELECT source FROM fluxbase_global.bank_payments WHERE utr = $1', [utr]);
                const winningSource = existingRes.rows[0]?.source || 'another channel';

                // Audit Log in DB
                await client.query(`
                    INSERT INTO fluxbase_global.payment_scraper_logs (utr, amount, source, is_winner, winning_source)
                    VALUES ($1, $2, $3, false, $4);
                `, [utr, parsedAmount, finalSource, winningSource]);

                await client.query('COMMIT');

                // Terminal Log: FCFS Rejection
                console.log(`[FCFS DUPLICATE REJECTED 🛑] Channel '${finalSource}' attempted UTR ${utr}, but channel '${winningSource}' ALREADY WON and claimed it!`);

                return NextResponse.json({
                    success: true,
                    duplicate: true,
                    winner: winningSource,
                    message: `UTR ${utr} already claimed and stored by ${winningSource}.`
                });
            }

            // FCFS Winner Audit Log in DB
            await client.query(`
                INSERT INTO fluxbase_global.payment_scraper_logs (utr, amount, source, is_winner, winning_source)
                VALUES ($1, $2, $3, true, $3);
            `, [utr, parsedAmount, finalSource]);

            // Terminal Log: FCFS Winner
            console.log(`[FCFS WINNER 🏆] Channel '${finalSource.toUpperCase()}' PROCESSED UTR ${utr} FIRST! Stored in DB.`);

            // 2. Fractional Amount Matching (e.g. ₹100.02) against Active Pending Orders
            const orderRes = await client.query(`
                SELECT order_id, user_id 
                FROM fluxbase_global.pending_orders 
                WHERE status = 'pending' 
                  AND amount = $1 
                  AND created_at >= NOW() - INTERVAL '15 minutes'
                ORDER BY created_at ASC 
                LIMIT 1 
                FOR UPDATE SKIP LOCKED;
            `, [parsedAmount]);

            let matchedOrderId: string | null = null;
            let matchedUserId: string | null = null;

            if (orderRes.rows.length > 0) {
                matchedOrderId = orderRes.rows[0].order_id;
                matchedUserId = orderRes.rows[0].user_id;

                // Mark pending order as paid
                await client.query(`
                    UPDATE fluxbase_global.pending_orders 
                    SET status = 'paid', utr_number = $1, fulfilled_at = NOW() 
                    WHERE order_id = $2;
                `, [utr, matchedOrderId]);

                // Link bank payment record to order
                await client.query(`
                    UPDATE fluxbase_global.bank_payments 
                    SET order_id = $1 
                    WHERE utr = $2;
                `, [matchedOrderId, utr]);

                console.log(`[ORDER MATCHED 🎯] Order ID '${matchedOrderId}' for User '${matchedUserId}' verified and marked PAID!`);
            }

            await client.query('COMMIT');

            // 3. Trigger Realtime WebSocket event to unlock user UI instantly
            if (matchedOrderId) {
                realtimeManager.emit(`order_${matchedOrderId}`, JSON.stringify({
                    status: 'paid',
                    utr,
                    amount: parsedAmount,
                    userId: matchedUserId
                }));
            }

            if (projectId) {
                realtimeManager.emit(`project:${projectId}`, JSON.stringify({
                    type: 'payment_received',
                    utr,
                    amount: parsedAmount,
                    source: finalSource
                }));
            }

            return NextResponse.json({
                success: true,
                duplicate: false,
                utr,
                dayName,
                paymentDate,
                paymentTime,
                source: finalSource,
                orderMatched: !!matchedOrderId,
                matchedOrderId
            });

        } catch (txError) {
            await client.query('ROLLBACK');
            throw txError;
        } finally {
            client.release();
        }

    } catch (error: any) {
        console.error('[Webhook Ingestion Error]:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
