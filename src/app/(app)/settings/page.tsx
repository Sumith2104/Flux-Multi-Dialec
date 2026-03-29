'use client';

import { useState, useContext, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ProjectContext } from '@/contexts/project-context';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteProjectAction, clearOrganizationAction, updateProjectSettingsAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { logoutAction } from '../actions';
import { 
    Copy, Check, Shield, Globe, Clock, Table as TableIcon, 
    Key, Loader2, AlertTriangle, Database
} from "lucide-react";
import { 
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { getTablesForProject, Table as DbTable } from '@/lib/data';
import { Skeleton } from '@/components/ui/skeleton';

const timezones = Intl.supportedValuesOf('timeZone');

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
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
                <span className="font-mono text-sm text-foreground break-all pr-4">{value}</span>
            </div>
            <Button size="icon" variant="ghost" className="shrink-0" onClick={copyToClipboard}>
                {hasCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
        </div>
    )
}

export default function GeneralSettingsPage() {
    const { project: selectedProject, setProject } = useContext(ProjectContext);
    const { toast } = useToast();
    const router = useRouter();
    
    // State
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [timezone, setTimezone] = useState(selectedProject?.timezone || 'UTC');
    const [savingTimezone, setSavingTimezone] = useState(false);
    const [tables, setTables] = useState<DbTable[]>([]);
    const [loadingTables, setLoadingTables] = useState(false);

    useEffect(() => {
        if (selectedProject) {
            setTimezone(selectedProject.timezone || 'UTC');
            
            setLoadingTables(true);
            getTablesForProject(selectedProject.project_id)
                .then(setTables)
                .finally(() => setLoadingTables(false));
        }
    }, [selectedProject]);

    const handleSaveTimezone = async () => {
        if (!selectedProject) return;
        setSavingTimezone(true);
        const res = await updateProjectSettingsAction(selectedProject.project_id, timezone);
        setSavingTimezone(false);

        if (res.success) {
            toast({ title: "Settings Saved", description: "Project timezone updated successfully." });
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error });
        }
    };

    const handleDeleteProject = async () => {
        if (!selectedProject) {
            toast({ variant: 'destructive', title: 'Error', description: 'No project selected.' });
            return;
        }
        if (deleteConfirmation !== `delete my project ${selectedProject.display_name}`) {
            toast({ variant: 'destructive', title: 'Error', description: 'Confirmation text does not match.' });
            return;
        }
        const result = await deleteProjectAction(selectedProject.project_id);
        if (result.success) {
            toast({ title: 'Success', description: `Project '${selectedProject.display_name}' has been deleted.` });
            setProject(null); 
            setDeleteConfirmation('');
            router.push('/dashboard/projects');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete project.' });
        }
    };

    const handleClearOrganization = async () => {
        const result = await clearOrganizationAction();
        if (result.success) {
            toast({ title: 'Success', description: 'Your organization data has been cleared.' });
            await logoutAction();
            router.push('/');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to clear organization data.' });
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-primary" />
                            Project Identity
                        </CardTitle>
                        <CardDescription>Essential identification for API and database access.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="project-name">Project Display Name</Label>
                            <Input id="project-name" value={selectedProject?.display_name || ''} disabled className="bg-muted/50" />
                        </div>
                        {selectedProject && (
                            <CopyableField label="Project ID" value={selectedProject.project_id} />
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            Regional Settings
                        </CardTitle>
                        <CardDescription>Configure localization for database operations.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="timezone">Database Timezone</Label>
                            <Select value={timezone} onValueChange={setTimezone} disabled={!selectedProject}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select a timezone" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {timezones.map(tz => (
                                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">Default timezone for generated timestamps (e.g., NOW()).</p>
                        </div>
                    </CardContent>
                    <CardFooter className="border-t bg-muted/5 py-3">
                        <Button 
                            onClick={handleSaveTimezone} 
                            disabled={savingTimezone || !selectedProject || timezone === selectedProject.timezone}
                            size="sm"
                        >
                            {savingTimezone && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Update Timezone
                        </Button>
                    </CardFooter>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TableIcon className="h-5 w-5 text-primary" />
                        Project Tables
                    </CardTitle>
                    <CardDescription>Quick reference for table names in the current project.</CardDescription>
                </CardHeader>
                <CardContent>
                    {!selectedProject ? (
                        <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                            Please select a project to view its tables.
                        </div>
                    ) : loadingTables ? (
                        <div className="space-y-2">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                    ) : tables.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                            No tables found in this project.
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {tables.map(table => (
                                <CopyableField key={table.table_id} label={table.table_name} value={table.table_name} />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Danger Zone
                    </CardTitle>
                    <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border bg-background p-4 gap-4">
                        <div>
                            <Label htmlFor="delete-project">Delete this Project</Label>
                            <p className="text-sm text-muted-foreground">
                                This will permanently delete the '{selectedProject?.display_name || ' selected'}' project, including all its tables and data.
                            </p>
                        </div>
                        <AlertDialog onOpenChange={(open) => !open && setDeleteConfirmation('')}>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={!selectedProject}>Delete Project</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. To confirm, please type{' '}
                                        <strong className="text-foreground">delete my project {selectedProject?.display_name}</strong> in the box below.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="py-2">
                                    <Input
                                        id="delete-confirm"
                                        value={deleteConfirmation}
                                        onChange={(e) => setDeleteConfirmation(e.target.value)}
                                        placeholder={`delete my project ${selectedProject?.display_name}`}
                                        className="font-mono"
                                    />
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleDeleteProject}
                                        disabled={deleteConfirmation !== `delete my project ${selectedProject?.display_name}`}
                                        className="bg-destructive hover:bg-destructive/90"
                                    >
                                        Continue
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border bg-background p-4 gap-4">
                        <div>
                            <Label htmlFor="clear-org">Clear Organization</Label>
                            <p className="text-sm text-muted-foreground">This will permanently delete all projects and data associated with your account.</p>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" >Clear Organization Data</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This is your final confirmation. This action will permanently delete your entire account, all projects, and all data. This cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleClearOrganization} className="bg-destructive hover:bg-destructive/90">I understand, delete everything</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
