
import { Suspense } from 'react';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTablesForProject, getColumnsForTable, getConstraintsForProject, Table, Column, Constraint } from '@/lib/data';
import { Skeleton } from '@/components/ui/skeleton';
import { ErdView } from '@/components/erd-view';

interface DatabasePageProps {
    searchParams?: { [key: string]: string | string[] | undefined };
}

async function Database({ projectId }: { projectId: string }) {
    const allTables = await getTablesForProject(projectId);
    const allColumns = await Promise.all(
        allTables.map(table => getColumnsForTable(projectId, table.table_id))
    ).then(cols => cols.flat());
    const allConstraints = await getConstraintsForProject(projectId);

    return (
        <div className="h-full w-full">
            <ErdView
                tables={allTables}
                columns={allColumns}
                constraints={allConstraints}
            />
        </div>
    );
}

function DatabaseSkeleton() {
    return (
        <div className="w-full h-full p-6">
            <Skeleton className="h-full w-full" />
        </div>
    )
}

export default async function DatabasePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const cookieStore = await cookies();
    const selectedProjectCookie = cookieStore.get('selectedProject');
    const selectedProject = selectedProjectCookie ? JSON.parse(selectedProjectCookie.value) : null;
    const resolvedSearchParams = await searchParams;
    const projectId = (resolvedSearchParams?.projectId as string) || selectedProject?.project_id;

    if (!projectId) {
        redirect('/dashboard/projects');
    }

    return (
        <Suspense fallback={<DatabaseSkeleton />}>
            <Database projectId={projectId} />
        </Suspense>
    );
}
