import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { plan, isDiscountApplied } = await req.json();
        
        if (!plan || (plan.toLowerCase() !== 'pro' && plan.toLowerCase() !== 'max')) {
            return NextResponse.json({ error: 'Invalid or missing plan type' }, { status: 400 });
        }

        const cleanPlan = plan.toLowerCase();

        // 1. Get base price from environment variables
        const standardProPrice = parseFloat(process.env.NEXT_PUBLIC_RAZORPAY_PRO_PRICE || '499');
        const discountProPrice = parseFloat(process.env.NEXT_PUBLIC_DISCOUNT_PRO_PRICE || '299');
        const standardMaxPrice = parseFloat(process.env.NEXT_PUBLIC_RAZORPAY_MAX_PRICE || '2499');
        const discountMaxPrice = parseFloat(process.env.NEXT_PUBLIC_DISCOUNT_MAX_PRICE || '1499');

        let basePrice = cleanPlan === 'pro' 
            ? (isDiscountApplied ? discountProPrice : standardProPrice)
            : (isDiscountApplied ? discountMaxPrice : standardMaxPrice);

        // Convert basePrice to integer to clear out any decimal parts before adding our unique offset
        basePrice = Math.floor(basePrice);

        const pool = getPgPool();

        // 2. Query all active pending sessions to find occupied offsets
        const activeSessionsQuery = await pool.query(
            `SELECT amount FROM fluxbase_global.payment_sessions 
             WHERE status = 'pending' AND expires_at > NOW() AND plan_type = $1`,
            [cleanPlan]
        );

        const occupiedAmounts = new Set(
            activeSessionsQuery.rows.map(row => parseFloat(row.amount))
        );

        // 3. Find an available decimal offset from .01 to .99
        let finalAmount = 0;
        let foundOffset = false;

        for (let i = 1; i <= 99; i++) {
            const offset = i / 100;
            const candidateAmount = parseFloat((basePrice + offset).toFixed(2));
            if (!occupiedAmounts.has(candidateAmount)) {
                finalAmount = candidateAmount;
                foundOffset = true;
                break;
            }
        }

        if (!foundOffset) {
            return NextResponse.json({ 
                error: 'Too many concurrent checkout sessions. Please try again in 1 minute.' 
            }, { status: 503 });
        }

        // 4. Create the session in the database with a 5-minute expiry
        const sessionDurationMinutes = 5;
        const insertQuery = await pool.query(
            `INSERT INTO fluxbase_global.payment_sessions (user_id, plan_type, amount, status, expires_at)
             VALUES ($1, $2, $3, 'pending', NOW() + $4 * INTERVAL '1 minute')
             RETURNING id, amount, expires_at`,
            [userId, cleanPlan, finalAmount, sessionDurationMinutes]
        );

        const session = insertQuery.rows[0];

        console.log(`[UPI Session] Created session ${session.id} for User ${userId}. Expected Amount: ₹${session.amount}, Expires: ${session.expires_at}`);

        return NextResponse.json({
            success: true,
            sessionId: session.id,
            amount: parseFloat(session.amount),
            expiresAt: session.expires_at,
            upiMerchantVpa: process.env.NEXT_PUBLIC_UPI_ID || 'sumith0909@axl'
        });

    } catch (error: any) {
        console.error('[Create Session Error]:', error);
        return NextResponse.json({ error: 'Internal server error occurred while initializing checkout.' }, { status: 500 });
    }
}
