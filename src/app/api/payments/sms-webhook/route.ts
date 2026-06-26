import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';

// In production, configure SMS_WEBHOOK_SECRET in .env.local
const SMS_WEBHOOK_SECRET = process.env.SMS_WEBHOOK_SECRET || 'my_super_secure_secret_token';

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization');
        if (authHeader !== `Bearer ${SMS_WEBHOOK_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { body, sender } = await req.json();
        if (!body || !sender) {
            return NextResponse.json({ error: 'Missing body or sender' }, { status: 400 });
        }

        const smsText = body.toLowerCase();
        
        // 1. Ensure it's a credit notification, not a debit
        const isCredit = 
            smsText.includes('credited') || 
            smsText.includes('received') || 
            smsText.includes('deposited') || 
            smsText.includes('added to') || 
            smsText.includes('accepted');

        if (!isCredit) {
            console.log(`[SMS Webhook] Ignored non-credit SMS: "${body}"`);
            return NextResponse.json({ success: false, message: 'Ignored non-credit notification' });
        }

        // 2. Extract Amount
        // Matches "Rs. 499", "Rs. 499.00", "INR 499.00", "Rs 499", and corrupted symbol versions.
        const amountMatch = body.match(/(?:credited|received|payment\s+of|rs\.?|inr|₹)\s*[^0-9]*?([\d,]+(?:\.\d{1,2})?)/i);
        if (!amountMatch) {
            console.warn(`[SMS Webhook] Could not parse amount from SMS: "${body}"`);
            return NextResponse.json({ success: false, message: 'Could not parse amount' });
        }
        
        const rawAmount = amountMatch[1].replace(/,/g, '');
        const amount = parseFloat(rawAmount);

        // 3. Extract 12-digit UTR/Ref No
        // UPI transaction references are always 12-digit numeric sequences
        const utrMatch = body.match(/\b(\d{12})\b/);
        if (!utrMatch) {
            console.warn(`[SMS Webhook] Could not parse 12-digit UTR from SMS: "${body}"`);
            return NextResponse.json({ success: false, message: 'Could not parse UTR' });
        }
        
        const utr = utrMatch[1];

        // 4. Save into database
        const pool = getPgPool();
        await pool.query(`
            INSERT INTO fluxbase_global.scraped_sms (sms_body, sender, utr, amount)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (utr) DO NOTHING
        `, [body, sender, utr, amount]);

        console.log(`[SMS Webhook] Successfully logged payment SMS: UTR=${utr}, Amount=₹${amount}`);
        return NextResponse.json({ success: true, utr, amount });

    } catch (error: any) {
        console.error(`[SMS Webhook Error]:`, error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
