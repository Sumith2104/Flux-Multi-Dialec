'use server';

import { getCurrentUserId } from '@/lib/auth';
import { saveDashboardWidget, deleteDashboardWidget } from '@/lib/dashboards';
import { getPgPool } from '@/lib/pg';
import { getProjectById, getTablesForProject, getColumnsForTable } from '@/lib/data';
import { revalidatePath } from 'next/cache';

export async function createWidgetAction(projectId: string, title: string, chartType: string, query: string, config: any) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");
    
    await saveDashboardWidget(projectId, userId, title, chartType, query, config);
    revalidatePath('/analytics');
}

export async function removeWidgetAction(projectId: string, widgetId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");
    
    await deleteDashboardWidget(projectId, userId, widgetId);
    revalidatePath('/analytics');
}

export async function updateWidgetConfigAction(projectId: string, widgetId: string, newConfig: any) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const project = await getProjectById(projectId, userId);
    if (!project) throw new Error("Project not found");

    if (project.dialect === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        await mysqlPool.query(
            `UPDATE \`project_${projectId}\`.\`_flux_internal_dashboards\` SET config = ? WHERE id = ?`,
            [JSON.stringify(newConfig), widgetId]
        );
    } else {
        const pool = getPgPool();
        await pool.query(
            `UPDATE "project_${projectId}"."_flux_internal_dashboards" SET config = $1 WHERE id = $2`,
            [newConfig, widgetId]
        );
    }
}

export async function getProjectTablesAction(projectId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");
    return await getTablesForProject(projectId, userId);
}

export async function getTableColumnsAction(projectId: string, tableId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");
    return await getColumnsForTable(projectId, tableId, userId);
}
