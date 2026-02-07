
'use client';

import { useContext, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, Copy, Check } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { ProjectContext } from '@/contexts/project-context';
import { getTablesForProject, Table as DbTable } from '@/lib/data';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

function CopyableField({ label, value }: { label: string, value: string }) {
    const { toast } = useToast();
    const [hasCopied, setHasCopied] = useState(false);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(value);
        setHasCopied(true);
        toast({ title: "Copied!", description: `${label} has been copied to your clipboard.` });
        setTimeout(() => setHasCopied(false), 2000);
    };

    return (
        <div className="flex items-center justify-between rounded-lg border bg-background p-3">
            <div className="flex flex-col">
                <span className="text-sm font-semibold">{label}</span>
                <span className="font-mono text-xs text-muted-foreground">{value}</span>
            </div>
            <Button size="icon" variant="ghost" onClick={copyToClipboard}>
                {hasCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
        </div>
    )
}


export default function ApiPage() {
    const { project: selectedProject } = useContext(ProjectContext);
    const [tables, setTables] = useState<DbTable[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (selectedProject) {
            setLoading(true);
            getTablesForProject(selectedProject.project_id)
                .then(setTables)
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [selectedProject]);


    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <BackButton />
                <div>
                    <h1 className="text-3xl font-bold">API Information</h1>
                    <p className="text-muted-foreground">
                        Your Project ID and Table Names for API access.
                    </p>
                </div>
            </div>

            {!selectedProject ? (
                 <Card>
                    <CardHeader>
                        <CardTitle>No Project Selected</CardTitle>
                        <CardDescription>Please select a project to view its API details.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-48 border-2 border-dashed rounded-lg">
                            <p>Your API information will appear here once you select a project.</p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Project ID</CardTitle>
                            <CardDescription>Use this ID to authenticate your API requests for the '{selectedProject.display_name}' project.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CopyableField label="Project ID" value={selectedProject.project_id} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Tables</CardTitle>
                            <CardDescription>Available table names within this project.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {loading ? (
                                <>
                                    <Skeleton className="h-16 w-full" />
                                    <Skeleton className="h-16 w-full" />
                                </>
                            ) : tables.length > 0 ? (
                                tables.map(table => (
                                   <CopyableField key={table.table_id} label={table.table_name} value={table.table_name} />
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-4">No tables found in this project yet.</p>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}
