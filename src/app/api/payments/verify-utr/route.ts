import { NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';

export async function POST(req: Request) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { utr, plan } = await req.json();

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

        // 1. Check if the UTR exists and is unused
        const smsRes = await pool.query(
            `SELECT id, amount, is_used FROM fluxbase_global.scraped_sms 
             WHERE utr = $1`, 
            [cleanUtr]
        );

        if (smsRes.rows.length === 0) {
            return NextResponse.json({ 
                error: 'UTR not found. If you just made the payment, please wait 30 seconds for the bank SMS to sync and click Verify again.' 
            }, { status: 404 });
        }

        const sms = smsRes.rows[0];

        if (sms.is_used) {
            return NextResponse.json({ error: 'This transaction UTR has already been claimed.' }, { status: 400 });
        }

        const amount = parseFloat(sms.amount);

        // 2. Validate that the payment amount is greater than 0
        const isValidAmount = amount > 0;

        if (!isValidAmount) {
            return NextResponse.json({ 
                error: `Mismatched amount. The UTR matches a payment of ₹${amount}, but the selected plan is ${plan.toUpperCase()}.` 
            }, { status: 400 });
        }

        // 3. Complete the transaction and upgrade the user's plan
        // Start a PostgreSQL transaction to ensure all queries succeed or fail together
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // A. Mark SMS as used
            await client.query(
                `UPDATE fluxbase_global.scraped_sms 
                 SET is_used = true 
                 WHERE utr = $1`, 
                [cleanUtr]
            );

            // B. Log record in payments table
            await client.query(
                `INSERT INTO fluxbase_global.payments (user_id, amount, currency, status, razorpay_payment_id)
                 VALUES ($1, $2, 'INR', 'completed', $3)`,
                [userId, amount, `upi_utr_${cleanUtr}`]
            );

            // C. Upgrade user plan settings
            await client.query(
                `UPDATE fluxbase_global.users 
                 SET plan_type = $1, billing_cycle_end = NOW() + INTERVAL '1 month', status = 'active'
                 WHERE id = $2`,
                [cleanPlan, userId]
            );

            await client.query('COMMIT');
            console.log(`[UPI Direct] Successfully verified UTR ${cleanUtr} and upgraded User ${userId} to ${cleanPlan}`);
            
            return NextResponse.json({ 
                success: true, 
                message: `Payment verified successfully! Your account has been upgraded to ${plan.toUpperCase()}.` 
            });

        } catch (txnError) {
            await client.query('ROLLBACK');
            throw txnError;
        } finally {
            client.release();
        }

    } catch (err: any) {
        console.error('[Verify UTR Error]:', err);
        return NextResponse.json({ error: 'Internal server error occurred while verifying payment.' }, { status: 500 });
    }
}
