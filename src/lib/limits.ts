import { getPgPool } from '@/lib/pg';
import { getProjectById, getTablesForProject } from '@/lib/data';

const PLAN_LIMITS = {
    free: {
        projects: 1,
        tablesPerProject: 5,
        rowsPerTable: 10000,
        apiKeys: 2,
        webhooks: 0
    },
    pro: {
        projects: 3,
        tablesPerProject: 15,
        rowsPerTable: 50000,
        apiKeys: 10,
        webhooks: 5
    },
    max: {
        projects: 999999, // Practically unlimited
        tablesPerProject: 999999,
        rowsPerTable: 999999999,
        apiKeys: 999999,
        webhooks: 999999
    }
} as const;

type PlanType = keyof typeof PLAN_LIMITS;

export class LimitExceededError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LimitExceededError';
    }
}

export async function getUserPlan(userId: string): Promise<PlanType> {
    const pool = getPgPool();
    const res = await pool.query('SELECT plan_type FROM fluxbase_global.users WHERE id = $1', [userId]);
    const plan = res.rows[0]?.plan_type || 'free';
    // Validate the plan falls into one of our tiers, fallback to free
    if (plan in PLAN_LIMITS) return plan as PlanType;
    return 'free';
}

export async function checkProjectLimit(userId: string): Promise<void> {
    const plan = await getUserPlan(userId);
    const limit = PLAN_LIMITS[plan].projects;

    const pool = getPgPool();
    const res = await pool.query('SELECT COUNT(*) as count FROM fluxbase_global.projects WHERE user_id = $1', [userId]);
    const count = parseInt(res.rows[0].count, 10);

    if (count >= limit) {
        throw new LimitExceededError(`Project limit reached. Your ${plan.toUpperCase()} plan allows a maximum of ${limit} project(s). Please upgrade to create more.`);
    }
}

export async function checkTableLimit(projectId: string, userId: string): Promise<void> {
    const plan = await getUserPlan(userId);
    const limit = PLAN_LIMITS[plan].tablesPerProject;

    const tables = await getTablesForProject(projectId, userId);

    if (tables.length >= limit) {
        throw new LimitExceededError(`Table limit reached. Your ${plan.toUpperCase()} plan allows a maximum of ${limit} tables per project. Please upgrade to create more.`);
    }
}

export async function checkRowLimit(projectId: string, userId: string, tableName: string, insertingCount: number = 1): Promise<void> {
    const plan = await getUserPlan(userId);
    const limit = PLAN_LIMITS[plan].rowsPerTable;

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    let currentRows = 0;

    if (project.dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const dbName = `project_${projectId}`;
        try {
            const [rows]: any = await mysqlPool.query(`SELECT COUNT(*) as count FROM \`${dbName}\`.\`${tableName}\``);
            currentRows = parseInt(rows[0].count, 10);
        } catch (e) {
            // Table might not exist yet, which is fine
            currentRows = 0;
        }
    } else {
        const pool = getPgPool();
        const schemaName = `project_${projectId}`;
        try {
            const res = await pool.query(`SELECT COUNT(*) as count FROM "${schemaName}"."${tableName}"`);
            currentRows = parseInt(res.rows[0].count, 10);
        } catch (e) {
            currentRows = 0;
        }
    }

    if (currentRows + insertingCount > limit) {
        throw new LimitExceededError(`Row limit reached. Your ${plan.toUpperCase()} plan allows a maximum of ${limit} rows per table. You are trying to insert ${insertingCount} rows into a table that already has ${currentRows} rows. Please upgrade your plan.`);
    }
}

export async function checkApiKeyLimit(userId: string): Promise<void> {
    const plan = await getUserPlan(userId);
    const limit = PLAN_LIMITS[plan].apiKeys;

    const pool = getPgPool();
    const res = await pool.query('SELECT COUNT(*) as count FROM fluxbase_global.api_keys WHERE user_id = $1', [userId]);
    const count = parseInt(res.rows[0].count, 10);

    if (count >= limit) {
        throw new LimitExceededError(`API Key limit reached. Your ${plan.toUpperCase()} plan allows a maximum of ${limit} API keys. Please upgrade to create more.`);
    }
}

export async function checkWebhookLimit(projectId: string, userId: string): Promise<void> {
    const plan = await getUserPlan(userId);
    const limit = PLAN_LIMITS[plan].webhooks;

    if (limit === 0) {
        throw new LimitExceededError(`Webhooks are only available on the PRO and MAX plans. Please upgrade to access real-time event triggers.`);
    }

    const pool = getPgPool();
    const res = await pool.query('SELECT COUNT(*) as count FROM fluxbase_global.webhooks WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    const count = parseInt(res.rows[0].count, 10);

    if (count >= limit) {
        throw new LimitExceededError(`Webhook limit reached. Your ${plan.toUpperCase()} plan allows a maximum of ${limit} webhooks per project. Please upgrade to create more.`);
    }
}
