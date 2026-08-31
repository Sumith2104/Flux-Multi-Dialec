import { NextResponse } from 'next/server';
import { getRazorpayClient } from '@/lib/razorpay';
import { getCurrentUserId } from '@/lib/auth';
import logger from '@/lib/logger';

export async function POST(req: Request) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { planId } = await req.json();

        if (!planId) {
            return NextResponse.json({ error: 'Missing planId' }, { status: 400 });
        }

        const { getPgPool } = await import('@/lib/pg');
        const pool = getPgPool();
        const userRes = await pool.query(
            'SELECT plan_type FROM fluxbase_global.users WHERE id = $1',
            [userId]
        );
        const currentPlan = (userRes.rows[0]?.plan_type || 'free').toLowerCase();

        const proPlanId = process.env.RAZORPAY_PRO_PLAN_ID || '';
        const maxPlanId = process.env.RAZORPAY_MAX_PLAN_ID || '';

        const requestedPlan = planId === maxPlanId ? 'max' : planId === proPlanId ? 'pro' : 'unknown';

        if (currentPlan === 'max') {
            return NextResponse.json({ error: 'You are already subscribed to the Max plan.' }, { status: 400 });
        }
        if (requestedPlan === 'pro' && currentPlan === 'pro') {
            return NextResponse.json({ error: 'You are already subscribed to the Pro plan.' }, { status: 400 });
        }

        // Generate a Subscription object via Razorpay Node SDK
        const razorpay = getRazorpayClient();
        const subscription = await razorpay.subscriptions.create({
            plan_id: planId,
            customer_notify: 1,
            total_count: 120, // 10 years of monthly billing default
            notes: {
                user_id: userId // CRITICAL: This allows the Webhook to identify which user paid
            }
        });

        return NextResponse.json({
            subscriptionId: subscription.id
        });

    } catch (err: any) {
        logger.error('[Billing] Subscription creation failed:', err);
        return NextResponse.json({ error: err.error?.description || err.message || 'Failed to initialize checkout' }, { status: 500 });
    }
}
