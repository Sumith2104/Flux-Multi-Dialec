
'use client';

import { useState, useContext, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/back-button"
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
import { deleteProjectAction, clearOrganizationAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { logoutAction } from '../actions';
import { createApiKeyAction, getApiKeysAction, revokeApiKeyAction, getProjectsAction } from './api-key-actions';
import { type ApiKey } from '@/lib/api-keys';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWebhooksAction, createWebhookAction, deleteWebhookAction, toggleWebhookAction } from './actions';
import { type Webhook, type WebhookEvent } from '@/lib/webhooks';

export default function SettingsPage() {
    const { project: selectedProject, setProject } = useContext(ProjectContext);
    const { toast } = useToast();
    const router = useRouter();
    const [deleteConfirmation, setDeleteConfirmation] = useState('');

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
            setProject(null); // Clear from context and local storage
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
            // Log the user out and redirect to the signup page
            await logoutAction();
            router.push('/signup');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to clear organization data.' });
        }
    };


    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
                <BackButton />
                <div>
                    <h1 className="text-3xl font-bold">Settings</h1>
                    <p className="text-muted-foreground">
                        Manage project and organization settings.
                    </p>
                </div>
            </div>

            <ApiKeySettings />

            <WebhooksSettings />

            <Card>
                <CardHeader>
                    <CardTitle>Project Configuration</CardTitle>
                    <CardDescription>Adjust settings for the current project.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="project-name">Project Name</Label>
                        <Input id="project-name" defaultValue={selectedProject?.display_name || ''} disabled />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button disabled>Save Changes</Button>
                </CardFooter>
            </Card>

            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive">Danger Zone</CardTitle>
                    <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                            <Label htmlFor="delete-project">Delete this Project</Label>
                            <p className="text-sm text-muted-foreground">
                                This will permanently delete the '{selectedProject?.display_name || '...'}' project, including all its tables and data.
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
                    <div className="flex items-center justify-between rounded-lg border p-4">
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

function ApiKeySettings() {
    const { toast } = useToast();
    const [keys, setKeys] = useState<{ id: string, name: string, preview: string, createdAt: string, lastUsedAt?: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [keyName, setKeyName] = useState('');

    const [projects, setProjects] = useState<{ project_id: string, display_name: string }[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('global');

    // Fetch keys and projects on mount
    useEffect(() => {
        getApiKeysAction().then(res => {
            if (res.success && res.data) {
                setKeys(res.data);
            }
        });
        getProjectsAction().then(res => {
            if (res.success && res.data) {
                setProjects(res.data);
            }
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
                <CardTitle>API Access</CardTitle>
                <CardDescription>Manage API keys for external access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex gap-4 items-end">
                    <div className="space-y-2 flex-1">
                        <Label htmlFor="key-name">New Key Name</Label>
                        <Input
                            id="key-name"
                            placeholder="e.g. Mobile App"
                            value={keyName}
                            onChange={(e) => setKeyName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2 w-48">
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
                    <Button onClick={handleCreateKey} disabled={loading || !keyName.trim()}>
                        {loading ? 'Generating...' : 'Generate Key'}
                    </Button>
                </div>

                {newKey && (
                    <div className="p-4 bg-muted rounded-md border border-yellow-500/50 bg-yellow-500/10 dark:text-yellow-200 text-yellow-800">
                        <p className="font-semibold mb-2">Detailed key shown only once:</p>
                        <code className="bg-background p-2 rounded block break-all font-mono text-sm border">
                            {newKey}
                        </code>
                        <p className="text-xs mt-2 opacity-80">Copy this key now. You won't be able to see it again.</p>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                                navigator.clipboard.writeText(newKey);
                                toast({ title: "Copied!" });
                            }}>
                            Copy to Clipboard
                        </Button>
                    </div>
                )}

                <div className="border rounded-md divide-y">
                    {keys.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            No API keys found.
                        </div>
                    ) : (
                        keys.map(key => (
                            <div key={key.id} className="p-4 flex items-center justify-between">
                                <div>
                                    <p className="font-medium">{key.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <code className="text-xs text-muted-foreground bg-muted px-1 rounded">
                                            {key.preview}
                                        </code>
                                        {/* @ts-ignore */}
                                        {key.projectName && (
                                            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded-full">
                                                {/* @ts-ignore */}
                                                Default: {key.projectName}
                                            </span>
                                        )}
                                        {/* @ts-ignore */}
                                        {!key.projectName && (
                                            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300 px-1.5 py-0.5 rounded-full">
                                                Global
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1 space-x-2">
                                        <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                                        {key.lastUsedAt && (
                                            <span>• Last Used: {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleRevokeKey(key.id)}
                                >
                                    Revoke
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function WebhooksSettings() {
    const { project: selectedProject } = useContext(ProjectContext);
    const { toast } = useToast();
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(false);

    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [event, setEvent] = useState<WebhookEvent>('*');
    const [tableId, setTableId] = useState('*');
    const [secret, setSecret] = useState('');

    useEffect(() => {
        if (selectedProject) {
            getWebhooksAction(selectedProject.project_id).then(res => {
                if (res.success && res.data) {
                    setWebhooks(res.data);
                }
            });
        }
    }, [selectedProject]);

    const handleCreateWebhook = async () => {
        if (!selectedProject || !name.trim() || !url.trim()) return;
        setLoading(true);
        const res = await createWebhookAction(selectedProject.project_id, name, url, event, tableId, secret);
        setLoading(false);

        if (res.success && res.data) {
            setWebhooks([res.data as unknown as Webhook, ...webhooks]);
            setName('');
            setUrl('');
            setSecret('');
            setEvent('*');
            setTableId('*');
            toast({ title: "Success", description: "Webhook created successfully." });
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error || "Failed to create webhook." });
        }
    };

    const handleToggleWebhook = async (id: string, currentlyActive: boolean) => {
        if (!selectedProject) return;
        const res = await toggleWebhookAction(selectedProject.project_id, id, !currentlyActive);
        if (res.success) {
            setWebhooks(webhooks.map(wh => wh.webhook_id === id ? { ...wh, is_active: !currentlyActive } : wh));
            toast({ title: "Success", description: `Webhook ${!currentlyActive ? 'enabled' : 'disabled'}.` });
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error || "Failed to toggle webhook." });
        }
    };

    const handleDeleteWebhook = async (id: string) => {
        if (!selectedProject) return;
        const res = await deleteWebhookAction(selectedProject.project_id, id);
        if (res.success) {
            setWebhooks(webhooks.filter(wh => wh.webhook_id !== id));
            toast({ title: "Success", description: "Webhook deleted." });
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error || "Failed to delete webhook." });
        }
    };

    if (!selectedProject) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>Configure real-time HTTP push events for this project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_2fr_1fr_1fr_auto] items-end">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input placeholder="Zapier Sync" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>URL Endpoint</Label>
                        <Input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Event</Label>
                        <Select value={event} onValueChange={(e: WebhookEvent) => setEvent(e)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="*">All (*)</SelectItem>
                                <SelectItem value="row.inserted">inserted</SelectItem>
                                <SelectItem value="row.updated">updated</SelectItem>
                                <SelectItem value="row.deleted">deleted</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Table ID</Label>
                        <Input placeholder="*" value={tableId} onChange={e => setTableId(e.target.value)} />
                    </div>
                    <Button onClick={handleCreateWebhook} disabled={loading || !name.trim() || !url.trim()} className="w-full">
                        {loading ? 'Adding...' : 'Add'}
                    </Button>
                </div>

                <div className="border rounded-md divide-y mt-6">
                    {webhooks.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            No active webhooks configured.
                        </div>
                    ) : (
                        webhooks.map(webhook => (
                            <div key={webhook.webhook_id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <p className="font-medium">{webhook.name}</p>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground max-w-[200px] sm:max-w-[300px] truncate block">
                                            {webhook.url}
                                        </code>
                                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                            {webhook.event}
                                        </span>
                                        <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded-full">
                                            Table: {webhook.table_id}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Created: {new Date(webhook.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-xs text-muted-foreground sm:inline sr-only hidden">{webhook.is_active ? 'Active' : 'Paused'}</Label>
                                        <Switch
                                            checked={webhook.is_active}
                                            onCheckedChange={() => handleToggleWebhook(webhook.webhook_id, webhook.is_active)}
                                        />
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDeleteWebhook(webhook.webhook_id)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
