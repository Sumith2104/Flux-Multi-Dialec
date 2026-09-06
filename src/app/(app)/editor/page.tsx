
import { Suspense } from 'react';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { EditorClient } from '@/components/editor-client';
import { Skeleton } from '@/components/ui/skeleton';


import { getTablesForProject, getColumnsForTable, getConstraintsForTable, getConstraintsForProject, getProjectById } from '@/lib/data';
// ...
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
    } catch (e) {
        console.error('Failed to get tables for project:', e);
    }

    const currentTable = tableId 
        ? allTables.find(t => t.table_id === tableId || t.table_name === (tableName || tableId)) 
        : (tableName ? allTables.find(t => t.table_name === tableName) : null);

    let columns: any[] = [];
    let constraints: any[] = [];
    let allProjectConstraints: any[] = [];

    const effectiveTableId = currentTable?.table_id || tableId;

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
                key={`${projectId}_${activeDatabase || ''}`}
                projectId={projectId}
                tableId={tableId}
                tableName={tableName}
                allTables={allTables}
                currentTable={currentTable}
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
    return (
        <div className="flex h-full w-full">
            <aside className="w-64 flex-shrink-0 border-r bg-background flex flex-col p-4 gap-4">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-10 w-full" />
                <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                </div>
            </aside>
            <main className="flex-1 flex flex-col overflow-hidden">
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <Skeleton className="h-6 w-48 mt-4" />
                    <Skeleton className="h-4 w-64 mt-2" />
                    <Skeleton className="h-10 w-32 mt-4" />
                </div>
            </main>
        </div>
    )
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

