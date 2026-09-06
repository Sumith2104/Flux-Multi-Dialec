'use server';

import { getCurrentUserId } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import logger from '@/lib/logger';
import { LRUCache } from 'lru-cache';

const _billingCache = new LRUCache<string, BillingDetails>({ max: 500, ttl: 2 * 60 * 1000 }); // 2-min cache

export interface BillingDetails {
    plan: string;
    role?: string;
    billing_cycle_end: string | null;
    status: string;
    queriesUsed: number;
    queriesLimit: number;
    storageUsedGb: number;
    storageLimitGb: number;
    unbilledAmount: number;
    invoices: Array<{
        id: string;
        amount: number;
        plan: string;
        status: string;
        date: string;
        transactionId: string;
    }>;
}

export async function getUserPlanAction() {
    const userId = await getCurrentUserId();
    if (!userId) return { plan: 'free', billing_cycle_end: null };

    try {
        const pool = getPgPool();
        const { rows } = await pool.query(
            'SELECT plan_type as "planType", billing_cycle_end as "billingCycleEnd", status, user_role as "userRole" FROM fluxbase_global.users WHERE id = $1::text',
            [userId]
        );

        if (rows.length > 0) {
            return {
                plan: rows[0].planType || 'free',
                role: rows[0].userRole || 'student',
                billing_cycle_end: rows[0].billingCycleEnd,
                status: rows[0].status || 'active'
            };
        }
        return { plan: 'free', role: 'student', billing_cycle_end: null, status: 'active' };
    } catch (error) {
        logger.error('[Billing] Failed to fetch user plan:', error);
        return { plan: 'free', role: 'student', billing_cycle_end: null, status: 'active' };
    }
}

export async function getBillingDetailsAction(): Promise<{ success: boolean; data?: BillingDetails; error?: string }> {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    const cached = _billingCache.get(userId);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        const pool = getPgPool();
        
        // 1. Fetch user & subscription info
        const userRes = await pool.query(
            'SELECT plan_type as "planType", billing_cycle_end as "billingCycleEnd", status, user_role as "userRole" FROM fluxbase_global.users WHERE id = $1::text',
            [userId]
        );
        const userRow = userRes.rows[0] || {};
        const plan = (userRow.planType || 'free').toLowerCase();
        const role = userRow.userRole || 'student';

        // 2. Fetch payments history
        let invoices: BillingDetails['invoices'] = [];
        try {
            const paymentsRes = await pool.query(
                `SELECT id, amount, plan_type as "planType", status, created_at as "createdAt", razorpay_payment_id as "paymentId" 
                 FROM fluxbase_global.payments 
                 WHERE user_id = $1::text 
                 ORDER BY created_at DESC LIMIT 10`,
                [userId]
            );
            invoices = paymentsRes.rows.map(r => ({
                id: r.id.toString(),
                amount: parseFloat(r.amount) || 0,
                plan: r.planType || plan,
                status: r.status || 'paid',
                date: new Date(r.createdAt).toLocaleDateString(),
                transactionId: r.paymentId || `TXN_${r.id}`
            }));
        } catch {}

        // 3. Compute limits based on active tier / plan
        let queriesLimit = 50000;
        let storageLimitGb = 0.5;

        if (role === 'employee' || plan === 'employee') {
            queriesLimit = 500000;
            storageLimitGb = 10;
        } else if (role === 'org_owner' || plan === 'org_owner' || plan === 'org') {
            queriesLimit = 5000000;
            storageLimitGb = 100;
        } else if (plan === 'pro') {
            queriesLimit = 250000;
            storageLimitGb = 5;
        } else if (plan === 'max') {
            queriesLimit = 1000000;
            storageLimitGb = 20;
        }

        // 4. Fetch user projects to use indexed queries
        const userProjectsRes = await pool.query(
            'SELECT project_id, dialect FROM fluxbase_global.projects WHERE user_id = $1::text',
            [userId]
        );
        const userProjects = userProjectsRes.rows || [];
        const projectIds = userProjects.map(r => r.project_id);

        // 5. Fetch REAL metered query executions
        let queriesUsed = 0;
        if (projectIds.length > 0) {
            try {
                const auditRes = await pool.query(`
                    SELECT COUNT(*) as count 
                    FROM fluxbase_global.audit_logs 
                    WHERE project_id = ANY($1) 
                      AND created_at >= NOW() - INTERVAL '30 days'
                `, [projectIds]);
                queriesUsed = parseInt(auditRes.rows[0]?.count || '0', 10);
            } catch (auditErr) {
                logger.warn('[Billing] Error computing real query count:', auditErr);
            }
        }

        let storageUsedGb = 0;
        try {
            let totalBytes = 0;

            // A. Compute real storage of all PostgreSQL tenant schemas for this user
            if (projectIds.length > 0) {
                const schemaNames = projectIds.map(id => `project_${id}`);
                const sizeRes = await pool.query(`
                    SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0) as total_bytes
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = ANY($1)
                `, [schemaNames]);
                totalBytes += parseInt(sizeRes.rows[0]?.total_bytes || '0', 10);
            }

            // B. Compute real storage of MySQL tenant schemas if MySQL configured
            if (process.env.AWS_RDS_MYSQL_URL || process.env.MYSQL_URL) {
                try {
                    const { getMysqlPool } = await import('@/lib/mysql');
                    const mysqlPool = getMysqlPool();
                    const myProjects = await pool.query(`
                        SELECT project_id FROM fluxbase_global.projects WHERE user_id = $1::text AND dialect = 'mysql'
                    `, [userId]);
                    if (myProjects.rows.length > 0) {
                        const dbNames = myProjects.rows.map(r => `project_${r.project_id}`);
                        const [myRows]: any = await mysqlPool.query(`
                            SELECT COALESCE(SUM(data_length + index_length), 0) as total_bytes
                            FROM information_schema.tables 
                            WHERE table_schema IN (?)
                        `, [dbNames]);
                        if (myRows && myRows[0]) {
                            totalBytes += parseInt(myRows[0].total_bytes || '0', 10);
                        }
                    }
                } catch (myErr) {
                    logger.warn('[Billing] Optional MySQL storage check skipped:', myErr);
                }
            }

            storageUsedGb = Number((totalBytes / (1024 * 1024 * 1024)).toFixed(3));
        } catch (sizeErr) {
            logger.warn('[Billing] Error computing real storage size:', sizeErr);
        }

        // 5. Calculate real unbilled amount for excess usage
        const queryRatePer10k = (role === 'org_owner' || plan === 'org_owner') ? 2.00 : 0.50;
        const storageRatePerGb = (role === 'org_owner' || plan === 'org_owner') ? 15.00 : 5.00;

        let unbilledAmount = 0;
        if (queriesUsed > queriesLimit) {
            const excessQueries = queriesUsed - queriesLimit;
            unbilledAmount += Math.ceil(excessQueries / 10000) * queryRatePer10k;
        }
        if (storageUsedGb > storageLimitGb) {
            const excessStorage = storageUsedGb - storageLimitGb;
            unbilledAmount += excessStorage * storageRatePerGb;
        }
        unbilledAmount = Number(unbilledAmount.toFixed(2));

        const resultData: BillingDetails = {
            plan,
            role,
            billing_cycle_end: userRow.billingCycleEnd || null,
            status: userRow.status || 'active',
            queriesUsed,
            queriesLimit,
            storageUsedGb,
            storageLimitGb,
            unbilledAmount,
            invoices
        };

        _billingCache.set(userId, resultData);

        return {
            success: true,
            data: resultData
        };

    } catch (err: any) {
        logger.error('[Billing] Error fetching billing details:', err);
        return { success: false, error: err.message };
    }
}
