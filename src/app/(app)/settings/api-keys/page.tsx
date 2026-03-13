'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
import { useToast } from '@/hooks/use-toast';
import { createApiKeyAction, getApiKeysAction, revokeApiKeyAction, getProjectsAction } from '../api-key-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ApiKeysPage() {
    const { toast } = useToast();
    const [keys, setKeys] = useState<{ id: string, name: string, preview: string, createdAt: string, lastUsedAt?: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [keyName, setKeyName] = useState('');

    const [projects, setProjects] = useState<{ project_id: string, display_name: string }[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('global');

    useEffect(() => {
        getApiKeysAction().then(res => {
            if (res.success && res.data) setKeys(res.data);
        });
        getProjectsAction().then(res => {
            if (res.success && res.data) setProjects(res.data);
        });
    }, []);

    const handleCreateKey = async () => {
        if (!keyName.trim()) return;
        setLoading(true);
        const projectId = selectedProjectId === 'global' ? undefined : selectedProjectId;
        const res = await createApiKeyAction(keyName, projectId);
        setLoading(false);

        if (res.success && res.data) {
            setNewKey(res.data.key);
            setKeys([res.data.apiKeyData, ...keys]);
            setKeyName('');
            toast({ title: "Success", description: "API Key generated successfully." });
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error || "Failed to generate key." });
        }
    };

    const handleRevokeKey = async (id: string) => {
        const res = await revokeApiKeyAction(id);
        if (res.success) {
            setKeys(keys.filter(k => k.id !== id));
            toast({ title: "Success", description: "API Key revoked." });
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error || "Failed to revoke key." });
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>API Access Keys</CardTitle>
                <CardDescription>Manage API keys for programmatic access to your databases and AI models.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="space-y-2 flex-1">
                        <Label htmlFor="key-name">New Key Name</Label>
                        <Input
                            id="key-name"
                            placeholder="e.g. Mobile App Production"
                            value={keyName}
                            onChange={(e) => setKeyName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2 w-full sm:w-48">
                        <Label htmlFor="key-scope">Scope</Label>
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                            <SelectTrigger id="key-scope">
                                <SelectValue placeholder="Select Scope" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="global">All Projects (Global)</SelectItem>
                                {projects.map(p => (
                                    <SelectItem key={p.project_id} value={p.project_id}>
                                        {p.display_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleCreateKey} disabled={loading || !keyName.trim()} className="w-full sm:w-auto">
                        {loading ? 'Generating...' : 'Generate New Key'}
                    </Button>
                </div>

                {newKey && (
                    <div className="p-4 bg-muted rounded-md border border-yellow-500/50 bg-yellow-500/10 dark:text-yellow-200 text-yellow-800">
                        <p className="font-semibold mb-2">Secret Key Generated (Shown once):</p>
                        <code className="bg-background p-3 rounded block break-all font-mono text-sm border shadow-inner">
                            {newKey}
                        </code>
                        <div className="flex items-center justify-between mt-3">
                            <p className="text-xs opacity-90">Store this key safely! It will not be shown again.</p>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    navigator.clipboard.writeText(newKey);
                                    toast({ title: "Copied!" });
                                }}>
                                Copy Key
                            </Button>
                        </div>
                    </div>
                )}

                <div className="border rounded-md divide-y overflow-hidden shadow-sm">
                    {keys.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground text-sm bg-muted/30">
                            No active API keys found.
                        </div>
                    ) : (
                        keys.map(key => (
                            <div key={key.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
                                <div>
                                    <p className="font-semibold">{key.name}</p>
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                        <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono border">
                                            {key.preview}
                                        </code>
                                        {/* @ts-ignore */}
                                        {key.projectName && (
                                            <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                                                {/* @ts-ignore */}
                                                Scope: {key.projectName}
                                            </span>
                                        )}
                                        {/* @ts-ignore */}
                                        {!key.projectName && (
                                            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
                                                Global Access
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-2 flex gap-4">
                                        <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                                        {key.lastUsedAt && (
                                            <span>Last Request: {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-shrink-0">
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground transition-colors w-full"
                                            >
                                                Revoke Access
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Revoke "{key.name}"?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently destroy the API token matching <code className="font-mono text-xs">{key.preview}</code>. Any external apps using this key will be instantly blocked.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => handleRevokeKey(key.id)}
                                                    className="bg-destructive hover:bg-destructive/90"
                                                >
                                                    Confirm Revocation
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
