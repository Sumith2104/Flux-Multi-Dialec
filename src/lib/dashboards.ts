import { getPgPool } from '@/lib/pg';
import { getProjectById } from '@/lib/data';
import { quotePgProjectSchema, quoteMysqlProjectSchema } from '@/lib/sql-safety';
import crypto from 'crypto';

export interface DashboardWidget {
    id: string;
    title: string;
    chart_type: string;
    query: string;
    config: string; // JSON string containing xAixs, yAxis, etc.
    created_at: string;
}

async function ensureTableExists(projectId: string, dialect: string) {
    if (dialect?.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const schema = quoteMysqlProjectSchema(projectId);
        await mysqlPool.query(`CREATE DATABASE IF NOT EXISTS ${schema}`);
        await mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS ${schema}.\`_flux_internal_dashboards\` (
                id VARCHAR(128) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                chart_type VARCHAR(50) NOT NULL,
                query TEXT,
                config JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } else {
        const pool = getPgPool();
        const schema = quotePgProjectSchema(projectId);
        await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ${schema}."_flux_internal_dashboards" (
                id VARCHAR(128) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                chart_type VARCHAR(50) NOT NULL,
                query TEXT,
                config JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
}

export async function getDashboardWidgets(projectId: string, userId: string): Promise<DashboardWidget[]> {
    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const isMysql = project.dialect?.toLowerCase() === 'mysql';
    await ensureTableExists(projectId, project.dialect || 'postgresql');

    if (isMysql) {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const schema = quoteMysqlProjectSchema(projectId);
        const [rows]: any = await mysqlPool.query(
            `SELECT * FROM ${schema}.\`_flux_internal_dashboards\` ORDER BY created_at ASC`
        );
        return rows.map((r: any) => ({
            ...r,
            config: typeof r.config === 'string' ? r.config : JSON.stringify(r.config)
        }));
    } else {
        const pool = getPgPool();
        const schema = quotePgProjectSchema(projectId);
        const res = await pool.query(
            `SELECT * FROM ${schema}."_flux_internal_dashboards" ORDER BY created_at ASC`
        );
        return res.rows;
    }
}

export async function saveDashboardWidget(projectId: string, userId: string, title: string, chartType: string, query: string, config: any) {
    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const isMysql = project.dialect?.toLowerCase() === 'mysql';
    await ensureTableExists(projectId, project.dialect || 'postgresql');
    const id = crypto.randomUUID().replace(/-/g, '');

    if (isMysql) {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const schema = quoteMysqlProjectSchema(projectId);
        await mysqlPool.query(
            `INSERT INTO ${schema}.\`_flux_internal_dashboards\` (id, title, chart_type, query, config) VALUES (?, ?, ?, ?, ?)`,
            [id, title, chartType, query, JSON.stringify(config)]
        );
    } else {
        const pool = getPgPool();
        const schema = quotePgProjectSchema(projectId);
        await pool.query(
            `INSERT INTO ${schema}."_flux_internal_dashboards" (id, title, chart_type, query, config) VALUES ($1, $2, $3, $4, $5)`,
            [id, title, chartType, query, config]
        );
    }
    return id;
}

export async function deleteDashboardWidget(projectId: string, userId: string, widgetId: string) {
    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    const isMysql = project.dialect?.toLowerCase() === 'mysql';
    if (isMysql) {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const schema = quoteMysqlProjectSchema(projectId);
        await mysqlPool.query(
            `DELETE FROM ${schema}.\`_flux_internal_dashboards\` WHERE id = ?`,
            [widgetId]
        );
    } else {
        const pool = getPgPool();
        const schema = quotePgProjectSchema(projectId);
        await pool.query(
            `DELETE FROM ${schema}."_flux_internal_dashboards" WHERE id = $1`,
            [widgetId]
        );
    }
}
