'use server';

import { getCurrentUserId } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';

export async function getUserPlanAction() {
    const userId = await getCurrentUserId();
    if (!userId) return { plan: 'free', billing_cycle_end: null };

    try {
        const pool = getPgPool();
        const { rows } = await pool.query(
            'SELECT plan_type as "planType", billing_cycle_end as "billingCycleEnd", status FROM fluxbase_global.users WHERE id = $1::text',
            [userId]
        );

        if (rows.length > 0) {
            return {
                plan: rows[0].planType || 'free',
                billing_cycle_end: rows[0].billingCycleEnd,
                status: rows[0].status || 'active'
            };
        }
        return { plan: 'free', billing_cycle_end: null, status: 'active' };
    } catch (error) {
        console.error('[Billing] Failed to fetch user plan:', error);
        return { plan: 'free', billing_cycle_end: null, status: 'active' };
    }
}
