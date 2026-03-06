import { NextResponse } from 'next/server';
import { razorpay } from '@/lib/razorpay';
import { getCurrentUserId } from '@/lib/auth';

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

        // Generate a Subscription object via Razorpay Node SDK
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
        console.error('[Billing] Subscription creation failed:', err);
        return NextResponse.json({ error: err.error?.description || err.message || 'Failed to initialize checkout' }, { status: 500 });
    }
}
