
import { Suspense } from 'react';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { EditorClient } from '@/components/editor-client';
import { Skeleton } from '@/components/ui/skeleton';
import { TableEditorSkeleton } from '@/components/skeletons/page-skeletons';


import { getTablesForProject, getColumnsForTable, getConstraintsForTable, getConstraintsForProject, getProjectById } from '@/lib/data';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function Editor({ projectId, tableId, tableName }: { projectId: string; tableId?: string; tableName?: string; }) {
    const { getCurrentUserId } = await import('@/lib/auth');
    const userId = await getCurrentUserId();
    const project = await getProjectById(projectId, userId || undefined);
    if (!project) {
        redirect('/dashboard');
    }
    const dialect = project?.dialect || 'postgresql';
    let allTables: any[] = [];
    try {
        allTables = await getTablesForProject(projectId, userId || undefined);
        // Resilient retry in case tenant schema was just provisioned in a background transaction
        if (allTables.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 250));
            allTables = await getTablesForProject(projectId, userId || undefined);
        }
    } catch (e) {
        console.error('Failed to get tables for project:', e);
    }

    const currentTable = tableId 
        ? allTables.find(t => t.table_id === tableId || t.table_name === (tableName || tableId)) 
        : (tableName ? allTables.find(t => t.table_name === tableName) : null);

    // If no table was specifically requested in the URL, automatically select the first table
    const resolvedTable = currentTable || (allTables.length > 0 && !tableId && !tableName ? allTables[0] : null);
    const effectiveTableId = resolvedTable?.table_id || tableId;
    const effectiveTableName = resolvedTable?.table_name || tableName;

    let columns: any[] = [];
    let constraints: any[] = [];
    let allProjectConstraints: any[] = [];

    if (effectiveTableId) {
        try {
            columns = await getColumnsForTable(projectId, effectiveTableId, userId || undefined);
            constraints = await getConstraintsForTable(projectId, effectiveTableId, userId || undefined);
            allProjectConstraints = await getConstraintsForProject(projectId, userId || undefined);
        } catch (e) {
            console.error('Failed to get columns/constraints for table:', e);
        }
    }

    const { getProjectDbAndSchema } = await import('@/lib/tenant-pools');
    const { dbName: activeDatabase } = project ? getProjectDbAndSchema(project) : { dbName: '' };

    // Rows are now fetched on the client-side
    return (
        <div className="h-full w-full min-h-0 flex flex-col flex-1 overflow-hidden">
            <EditorClient
                key={`${projectId}_${activeDatabase || ''}_${resolvedTable?.table_id || 'none'}`}
                projectId={projectId}
                tableId={effectiveTableId}
                tableName={effectiveTableName}
                allTables={allTables}
                currentTable={resolvedTable}
                initialColumns={columns}
                initialConstraints={constraints}
                allProjectConstraints={allProjectConstraints}
                dialect={dialect}
                connectionType={project?.connection_type}
                activeDatabase={activeDatabase}
            />
        </div>
    );
}

function EditorSkeleton() {
    return <TableEditorSkeleton />;
}

export default async function EditorPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const cookieStore = await cookies();
    const selectedProjectCookie = cookieStore.get('selectedProject');
    let selectedProject: any = null;
    try {
        const rawVal = selectedProjectCookie?.value?.trim();
        selectedProject = (rawVal && rawVal.startsWith('{')) ? JSON.parse(rawVal) : null;
    } catch (e) {
        console.warn("Failed to parse selectedProject cookie:", e);
    }

    const resolvedParams = await searchParams;
    const projectId = resolvedParams?.projectId as string || selectedProject?.project_id;

    if (!projectId) {
        redirect('/dashboard');
    }

    const tableId = resolvedParams?.tableId as string | undefined;
    const tableName = resolvedParams?.tableName as string | undefined;

    return (
        <Suspense fallback={<EditorSkeleton />}>
            <Editor projectId={projectId} tableId={tableId} tableName={tableName} />
        </Suspense>
    );
}

