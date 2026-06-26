import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';

const NOTIFICATION_WEBHOOK_SECRET = process.env.NOTIFICATION_WEBHOOK_SECRET || 'my_super_secure_secret_token';

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization');
        if (authHeader !== `Bearer ${NOTIFICATION_WEBHOOK_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { app, title, text } = await req.json();
        if (!text) {
            return NextResponse.json({ error: 'Missing notification text' }, { status: 400 });
        }

        console.log(`[Notification Webhook] Intercepted from ${app || 'Unknown App'}: Title: "${title}", Text: "${text}"`);

        // 1. Parse amount from notification
        // Matches "₹ 299", "Rs. 299.00", "Rs 299"
        const amountMatch = text.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (!amountMatch) {
            console.warn(`[Notification Webhook] Could not parse amount from: "${text}"`);
            return NextResponse.json({ success: false, message: 'Could not parse amount' });
        }
        const rawAmount = amountMatch[1].replace(/,/g, '');
        const amount = parseFloat(rawAmount);

        // 2. Parse the custom Note/Description (Session ID or Payment ID)
        // Matches "Note: pay_12345" or "Note: 123-abc-456"
        // PhonePe / Paytm Business notifications typically append "(Note: <text>)" or similar
        const noteMatch = text.match(/(?:Note|Remark|For):\s*([a-zA-Z0-9_\-]+)/i);
        if (!noteMatch) {
            console.warn(`[Notification Webhook] No custom note/payment ID found in notification: "${text}"`);
            return NextResponse.json({ success: false, message: 'No payment ID found in note' });
        }
        const paymentId = noteMatch[1]; // E.g., "pay_12345" or user_id

        console.log(`[Notification Webhook] Extracted: Payment ID = ${paymentId}, Amount = ₹${amount}`);

        // 3. Process the payment in the database
        const pool = getPgPool();
        
        // We look up the pending payment. Depending on your schema, paymentId could be the payment table ID 
        // or a custom field. Let's look up by payments.id or payments.razorpay_payment_id if we store it there.
        // We will query to see if there is a pending payment with this ID.
        // If it's a numeric ID:
        const isNumericId = /^\d+$/.test(paymentId);
        
        let paymentQuery;
        if (isNumericId) {
            paymentQuery = await pool.query(
                `SELECT id, user_id, amount, status FROM fluxbase_global.payments 
                 WHERE id = $1 AND status = 'pending'`,
                [parseInt(paymentId, 10)]
            );
        } else {
            // Or look up by a string-based field like razorpay_payment_id/custom reference
            paymentQuery = await pool.query(
                `SELECT id, user_id, amount, status FROM fluxbase_global.payments 
                 WHERE razorpay_payment_id = $1 AND status = 'pending'`,
                [paymentId]
            );
        }

        if (paymentQuery.rows.length === 0) {
            console.warn(`[Notification Webhook] No pending payment found for ID: ${paymentId}`);
            return NextResponse.json({ success: false, message: 'No matching pending payment found' });
        }

        const payment = paymentQuery.rows[0];
        const userId = payment.user_id;

        // 4. Validate the amount
        if (parseFloat(payment.amount) !== amount) {
            console.warn(`[Notification Webhook] Amount mismatch for payment ${payment.id}. Expected ₹${payment.amount}, received ₹${amount}`);
            return NextResponse.json({ success: false, message: 'Amount mismatch' });
        }

        // 5. Complete payment and upgrade user
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // A. Update payment status to completed
            await client.query(
                `UPDATE fluxbase_global.payments 
                 SET status = 'completed', updated_at = NOW() 
                 WHERE id = $1`,
                [payment.id]
            );

            // B. Upgrade user plan (Determine plan based on amount)
            // Pro Price: ₹499 (Standard) or ₹299 (Discounted)
            // Max Price: ₹2499 (Standard) or ₹1499 (Discounted)
            const standardProPrice = parseFloat(process.env.NEXT_PUBLIC_RAZORPAY_PRO_PRICE || '499');
            const discountProPrice = parseFloat(process.env.NEXT_PUBLIC_DISCOUNT_PRO_PRICE || '299');
            
            const planType = (amount === standardProPrice || amount === discountProPrice) ? 'pro' : 'max';

            await client.query(
                `UPDATE fluxbase_global.users 
                 SET plan_type = $1, billing_cycle_end = NOW() + INTERVAL '1 month', status = 'active'
                 WHERE id = $2`,
                [planType, userId]
            );

            await client.query('COMMIT');
            console.log(`[Notification Webhook] Successfully processed Payment ${payment.id}. Upgraded User ${userId} to ${planType}`);

            return NextResponse.json({ success: true, message: 'Payment successfully processed' });

        } catch (txnError) {
            await client.query('ROLLBACK');
            throw txnError;
        } finally {
            client.release();
        }

    } catch (error: any) {
        console.error(`[Notification Webhook Error]:`, error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
