'use client';

import { useState, useContext, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
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
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWebhooksAction, createWebhookAction, deleteWebhookAction, toggleWebhookAction } from '../actions';
import { type Webhook, type WebhookEvent } from '@/lib/webhooks';

export default function WebhooksPage() {
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

    if (!selectedProject) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Webhooks</CardTitle>
                    <CardDescription>Select a project to configure Webhooks.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

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
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                Delete
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete Webhook?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Deleting <strong className="text-foreground">{webhook.name}</strong> will stop all future HTTP events being sent to <code className="text-xs bg-muted px-1 rounded">{webhook.url}</code>. This cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => handleDeleteWebhook(webhook.webhook_id)}
                                                    className="bg-destructive hover:bg-destructive/90"
                                                >
                                                    Yes, Delete Webhook
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
