"use client";

import { useState, useEffect, useContext } from "react";
import { Copy, Plus, Trash2, Key, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiKeysAction, createApiKeyAction, revokeApiKeyAction } from "@/app/(app)/settings/api-key-actions";
import { type ApiKey } from "@/lib/api-keys";
import { ProjectContext } from "@/contexts/project-context";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectSettingsPage() {
    const { project: selectedProject, loading: projectLoading } = useContext(ProjectContext);
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [keyName, setKeyName] = useState("");
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const { toast } = useToast();

    const [debugKeys, setDebugKeys] = useState<ApiKey[]>([]);

    // Fetch keys on mount
    useEffect(() => {
        if (!selectedProject) {
            if (!projectLoading) setLoading(false);
            return;
        }

        setLoading(true);
        getApiKeysAction().then(res => {
            if (res.success && res.data) {
                setDebugKeys(res.data); // Store all keys for debugging
                // Filter keys for THIS project only
                const projectKeys = res.data.filter(k => k.projectId === selectedProject.project_id);
                setKeys(projectKeys);
            }
            setLoading(false);
        });
    }, [selectedProject, projectLoading]);

    const handleCreateKey = async () => {
        if (!keyName.trim() || !selectedProject) return;
        setLoading(true);

        // Always scope to the current project
        const res = await createApiKeyAction(keyName, selectedProject.project_id);
        setLoading(false);

        if (res.success && res.data) {
            setNewKey(res.data.key);
            // Add to list
            setKeys([res.data.apiKeyData, ...keys]);
            setKeyName('');
            toast({ title: "Success", description: "Project API Key generated." });
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error || "Failed to generate key." });
        }
    };

    const handleRevokeKey = async (id: string) => {
        const res = await revokeApiKeyAction(id);
        if (res.success) {
            setKeys(keys.filter(k => k.id !== id));
            toast({ title: "Revoked", description: "API Key has been revoked." });
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error });
        }
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "Copied!", description: `${label} copied to clipboard.` });
    };

    if (projectLoading) {
        return <div className="p-8"><Skeleton className="h-12 w-1/3 mb-8" /><Skeleton className="h-64 w-full" /></div>
    }

    if (!selectedProject) {
        return (
            <div className="container mx-auto p-8 text-center">
                <h1 className="text-2xl font-bold mb-4">No Project Selected</h1>
                <p className="text-muted-foreground">Please select a project from the top navigation to view settings.</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8 max-w-5xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Project Settings</h1>
                    <p className="text-muted-foreground mt-1">Manage configuration for <span className="font-semibold text-foreground">{selectedProject.display_name}</span></p>
                </div>
            </div>

            {/* Project ID Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Project Identity</CardTitle>
                    <CardDescription>Use this ID when making API requests to identify this project.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label>Project ID</Label>
                        <div className="flex items-center gap-2">
                            <Input value={selectedProject.project_id} readOnly className="font-mono bg-muted" />
                            <Button variant="outline" size="icon" onClick={() => copyToClipboard(selectedProject.project_id, "Project ID")}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* API Keys Section */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>API Keys</CardTitle>
                        <CardDescription>Manage access keys scoped specifically to this project.</CardDescription>
                    </div>
                    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Create New Key
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create Project API Key</DialogTitle>
                                <DialogDescription>
                                    This key will be automatically scoped to <strong>{selectedProject.display_name}</strong>.
                                </DialogDescription>
                            </DialogHeader>
                            {newKey ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-500 text-sm">
                                        Files this key ONLY once. It will not be shown again.
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 p-2 bg-muted rounded font-mono text-sm break-all">
                                            {newKey}
                                        </code>
                                        <Button size="icon" onClick={() => copyToClipboard(newKey, "API Key")}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <Button className="w-full" onClick={() => { setCreateDialogOpen(false); setNewKey(null); }}>
                                        Done
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="keyName">Key Name</Label>
                                        <Input
                                            id="keyName"
                                            placeholder="e.g. Production App, Test Client"
                                            value={keyName}
                                            onChange={(e) => setKeyName(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Scope</Label>
                                        <Input disabled value={selectedProject.display_name} className="bg-muted" />
                                        <p className="text-xs text-muted-foreground">This key can only access data within this project.</p>
                                    </div>
                                    <Button onClick={handleCreateKey} disabled={loading || !keyName.trim()} className="w-full">
                                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Generate Key
                                    </Button>
                                </div>

                            )}
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Preview</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && keys.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                                </TableRow>
                            ) : keys.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                        No keys found for this project.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                keys.map((key) => (
                                    <TableRow key={key.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <Key className="h-4 w-4 text-muted-foreground" />
                                                {key.name}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{key.preview}</TableCell>
                                        <TableCell>{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleRevokeKey(key.id)} className="text-destructive hover:bg-destructive/10">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Debug Section */}
            <Card className="border-yellow-500 bg-yellow-500/5">
                <CardHeader>
                    <CardTitle className="text-yellow-600">Debug Info (Temporary)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <p className="font-bold">Current Project ID (Context):</p>
                        <code className="bg-background p-1 rounded font-mono">{selectedProject.project_id}</code>
                    </div>
                    <div>
                        <p className="font-bold">All Keys (Raw Fetch):</p>
                        <div className="bg-background p-2 rounded overflow-auto max-h-64 text-xs font-mono">
                            {debugKeys.length > 0 ? (
                                debugKeys.map(k => (
                                    <div key={k.id} className="border-b last:border-0 py-1">
                                        <div>Name: {k.name}</div>
                                        <div>ID: {k.id.substring(0, 8)}...</div>
                                        <div className={k.projectId === selectedProject.project_id ? "text-green-600 font-bold" : "text-red-500"}>
                                            ProjectID: {k.projectId || 'undefined'}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                "No keys fetched."
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
