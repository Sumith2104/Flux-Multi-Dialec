
'use client';

import { useState, useEffect, useContext } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Table, Edit, Rows, Database } from "lucide-react"
import Link from "next/link"
import { getTablesForProject, Table as DbTable, getProjectAnalytics, ProjectAnalytics } from "@/lib/data";
import {
    Table as ShadcnTable,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { StorageChart } from "@/components/storage-chart";
import { RealtimeLineChart } from "@/components/realtime-line-chart";
import { ProjectContext } from '@/contexts/project-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useRealtimeAnalytics } from '@/hooks/use-realtime-analytics';

export default function DashboardPage() {
    const { project: selectedProject } = useContext(ProjectContext);
    const [tables, setTables] = useState<DbTable[]>([]);
    const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
    const [loading, setLoading] = useState(true);

    const realtimeStats = useRealtimeAnalytics(selectedProject?.project_id);

    useEffect(() => {
        async function loadDashboardData() {
            if (!selectedProject) {
                setLoading(false);
                return;
            };

            // Don't show global loading spinner on background refreshes
            if (!analytics) setLoading(true); // Only show loading on initial fetch

            try {
                // Fetch tables once (or less frequently) if structure doesn't change often, 
                // but for "realtime" we can fetch everything.
                // Optimally: Separate fetch for lightweight analytics.
                const [tablesData, analyticsData] = await Promise.all([
                    getTablesForProject(selectedProject.project_id),
                    getProjectAnalytics(selectedProject.project_id),
                ]);
                setTables(tablesData);
                setAnalytics(analyticsData);
            } catch (error) {
                console.error("Failed to load dashboard data:", error);
            } finally {
                setLoading(false);
            }
        }

        loadDashboardData();
    }, [selectedProject]);


    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                </div>
                <Skeleton className="h-72 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        )
    }

    if (!selectedProject) {
        // This state should ideally not be reached due to layout redirect
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-lg text-muted-foreground">Please select a project to view the dashboard.</p>
                <Button asChild variant="link">
                    <Link href="/dashboard/projects">Go to Project Selection</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-0">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    Dashboard
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                </h1>
                <div className="flex items-center gap-2">
                    <Button asChild>
                        <Link href={`/dashboard/tables/create?projectId=${selectedProject.project_id}`}>
                            <Plus className="mr-2 h-4 w-4" />
                            New Table
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="space-y-6">

                {/* Real-time Metrics Grid */}
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-4">
                    <Card className="aspect-square flex flex-col justify-between">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Total Requests
                            </CardTitle>
                            <div className="h-4 w-4 animate-pulse rounded-full bg-green-500 shadow-[0_0_12px_#22c55e]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold">{realtimeStats?.total_requests ?? 0}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Real-time Interactions
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="aspect-square flex flex-col justify-between">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                API Calls
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold text-blue-500">{realtimeStats?.type_api_call ?? 0}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Data Fetches
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="aspect-square flex flex-col justify-between">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                SQL Executions
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold text-purple-500">{realtimeStats?.type_sql_execution ?? 0}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Queries Run
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="aspect-square flex flex-col justify-between">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Storage
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold truncate">{formatSize(analytics?.totalSize ?? 0)}</div>
                            <p className="text-xs text-muted-foreground mt-1 w-full truncate">
                                {tables.length} Tables, {analytics?.totalRows ?? 0} Rows
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts Section */}
                <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-7">
                    {/* Line Chart takes up more space */}
                    <div className="col-span-4">
                        <RealtimeLineChart currentStats={realtimeStats} />
                    </div>

                    {/* Storage Chart takes up less */}
                    <div className="col-span-3">
                        {analytics && analytics.tables.length > 0 ? (
                            <StorageChart data={analytics.tables} />
                        ) : (
                            <Card className="h-full flex items-center justify-center p-6 text-muted-foreground border-dashed">
                                No tables to display storage data.
                            </Card>
                        )}
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Tables</CardTitle>
                        <CardDescription>
                            A list of tables in your project.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {tables.length > 0 ? (
                            <div className="border rounded-lg">
                                <ShadcnTable>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Created</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {tables.map((table: DbTable) => (
                                            <TableRow key={table.table_id}>
                                                <TableCell className="font-medium">{table.table_name}</TableCell>
                                                <TableCell className="text-muted-foreground">{table.description}</TableCell>
                                                <TableCell>{new Date(table.created_at).toLocaleDateString()}</TableCell>
                                                <TableCell>
                                                    <Button asChild variant="outline" size="sm">
                                                        <Link href={`/editor?projectId=${selectedProject.project_id}&tableId=${table.table_id}&tableName=${table.table_name}`}>
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            Edit
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </ShadcnTable>
                            </div>
                        ) : (
                            <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                                <p>No tables yet.</p>
                                <Button variant="link" asChild>
                                    <Link href={`/dashboard/tables/create?projectId=${selectedProject.project_id}`}>Create your first table</Link>
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
