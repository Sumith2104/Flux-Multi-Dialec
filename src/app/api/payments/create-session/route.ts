import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';
import logger from '@/lib/logger';

export async function POST(req: NextRequest) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { plan, isDiscountApplied, couponCode, projectData } = await req.json();
        
        const validPlans = ['pro', 'max', 'student_pro', 'student_max', 'employee', 'org_owner', 'org', 'pay_as_you_go'];
        if (!plan || !validPlans.includes(plan.toLowerCase())) {
            return NextResponse.json({ error: 'Invalid or missing plan type' }, { status: 400 });
        }

        const cleanPlan = plan.toLowerCase() === 'student_pro' ? 'pro' : 
                          plan.toLowerCase() === 'student_max' ? 'max' : 
                          plan.toLowerCase() === 'org' ? 'org_owner' : 
                          plan.toLowerCase();

        const pool = getPgPool();

        // 1. Fetch exact plan from fluxbase_global.plans table
        const planRes = await pool.query(
            `SELECT plan_key, name, price 
             FROM fluxbase_global.plans 
             WHERE plan_key = $1 AND is_active = true 
             LIMIT 1`,
            [cleanPlan]
        );

        let basePrice = 500;
        if (cleanPlan === 'pay_as_you_go') {
            basePrice = 50; // Refundable verification fee
        } else if (planRes.rows.length > 0) {
            basePrice = parseFloat(planRes.rows[0].price);
        } else {
            // Fallback defaults
            if (cleanPlan === 'employee') basePrice = 500;
            if (cleanPlan === 'org_owner') basePrice = 5000;
            if (cleanPlan === 'pro') basePrice = 499;
            if (cleanPlan === 'max') basePrice = 1499;
        }

        // 2. Fetch discount rate from fluxbase_global.discounts table if coupon was applied
        if (isDiscountApplied) {
            let discountPercentage = 20; // default 20%
            let flatDiscount = 0;

            if (couponCode) {
                const discRes = await pool.query(
                    `SELECT discount_type, discount_value, max_discount_amount 
                     FROM fluxbase_global.discounts 
                     WHERE code = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())
                     LIMIT 1`,
                    [couponCode.trim().toUpperCase()]
                );

                if (discRes.rows.length > 0) {
                    const d = discRes.rows[0];
                    if (d.discount_type === 'percentage') {
                        discountPercentage = parseFloat(d.discount_value);
                    } else if (d.discount_type === 'fixed_amount') {
                        flatDiscount = parseFloat(d.discount_value);
                    }
                }
            }

            if (flatDiscount > 0) {
                basePrice = Math.max(1, basePrice - flatDiscount);
            } else {
                basePrice = Math.max(1, Math.round(basePrice * (1 - discountPercentage / 100)));
            }
        }

        // Convert basePrice to integer to clear out any decimal parts before adding our unique offset
        basePrice = Math.floor(basePrice);

        // 3. Query all currently active pending sessions to find occupied decimal offsets (.01, .02, etc.)
        const activeSessionsQuery = await pool.query(
            `SELECT amount FROM fluxbase_global.payment_sessions 
             WHERE status = 'pending' AND expires_at > NOW()`
        );

        const occupiedOffsets = new Set(
            activeSessionsQuery.rows.map(row => {
                const amt = parseFloat(row.amount);
                return Math.round((amt - Math.floor(amt)) * 100); // 1 for .01, 2 for .02, etc.
            })
        );

        // 4. Find the lowest available decimal offset from .01 to .99
        let chosenOffsetIndex = 1;
        let foundOffset = false;

        for (let i = 1; i <= 99; i++) {
            if (!occupiedOffsets.has(i)) {
                chosenOffsetIndex = i;
                foundOffset = true;
                break;
            }
        }

        if (!foundOffset) {
            return NextResponse.json({
                error: 'Payment gateway channels at full capacity. Please try again in 1 minute.'
            }, { status: 429 });
        }

        const finalAmount = parseFloat((basePrice + (chosenOffsetIndex / 100)).toFixed(2));

        // 5. Create new payment session with 3-minute expiration and 'pending' status
        const insertSessionQuery = await pool.query(
            `INSERT INTO fluxbase_global.payment_sessions (user_id, plan_type, amount, status, expires_at, project_data)
             VALUES ($1, $2, $3, 'pending', NOW() + INTERVAL '3 minutes', $4)
             RETURNING id, amount, expires_at, plan_type`,
            [userId, cleanPlan, finalAmount, projectData ? JSON.stringify(projectData) : null]
        );

        const session = insertSessionQuery.rows[0];

        return NextResponse.json({
            success: true,
            sessionId: session.id,
            amount: parseFloat(session.amount),
            expiresAt: session.expires_at,
            planType: session.plan_type
        });

    } catch (err: any) {
        logger.error('[Create Payment Session API Error]:', err);
        return NextResponse.json({
            error: 'Failed to initialize payment session.'
        }, { status: 500 });
    }
}
export const dynamic = 'force-dynamic';
