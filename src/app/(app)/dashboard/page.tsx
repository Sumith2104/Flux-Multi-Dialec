
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
import { ProjectContext } from '@/contexts/project-context';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
    const { project: selectedProject } = useContext(ProjectContext);
    const [tables, setTables] = useState<DbTable[]>([]);
    const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        async function loadDashboardData() {
            if (!selectedProject) {
                setLoading(false);
                return;
            };

            setLoading(true);
            try {
                const [tablesData, analyticsData] = await Promise.all([
                    getTablesForProject(selectedProject.project_id),
                    getProjectAnalytics(selectedProject.project_id),
                ]);
                setTables(tablesData);
                setAnalytics(analyticsData);
            } catch (error) {
                console.error("Failed to load dashboard data:", error);
                // Optionally, show a toast notification
            } finally {
                setLoading(false);
            }
        }
        loadDashboardData();
    }, [selectedProject]);


    const formatSize = (kb: number) => {
        if (kb > 1000) {
            return `${(kb / 1024).toFixed(2)} MB`;
        }
        return `${kb} KB`;
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
                <h1 className="text-3xl font-bold">Dashboard</h1>
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Tables
                        </CardTitle>
                        <Table className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                        <div className="text-2xl font-bold">{tables.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Tables in this project
                        </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Rows
                        </CardTitle>
                        <Rows className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                        <div className="text-2xl font-bold">{analytics?.totalRows ?? 0}</div>
                            <p className="text-xs text-muted-foreground">
                            Across all tables
                        </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Storage
                        </CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                        <div className="text-2xl font-bold">{formatSize(analytics?.totalSize ?? 0)}</div>
                            <p className="text-xs text-muted-foreground">
                            Total size of all CSV files
                        </p>
                        </CardContent>
                    </Card>
                </div>
                
                {analytics && analytics.tables.length > 0 && (
                    <StorageChart data={analytics.tables} />
                )}

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
                                                            <Edit className="mr-2 h-4 w-4"/>
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
