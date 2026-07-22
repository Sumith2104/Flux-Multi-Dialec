"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Webhook, Plus, Trash2, Send, Check, Loader2, Globe, Shield } from "lucide-react";
import { Table as DbTable } from "@/lib/data";

interface WebhookItem {
    id: string;
    name: string;
    url: string;
    event: string;
    table_id: string;
    is_active: boolean;
    created_at: string;
}

interface WebhooksManagerProps {
    projectId: string;
    tables: DbTable[];
}

export function WebhooksManager({ projectId, tables }: WebhooksManagerProps) {
    const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const { toast } = useToast();

    // New Webhook Form State
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [event, setEvent] = useState('ALL');
    const [tableId, setTableId] = useState('*');
    const [secret, setSecret] = useState('');
    const [showForm, setShowForm] = useState(false);

    const fetchWebhooks = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/webhooks?projectId=${projectId}`);
            const data = await res.json();
            if (data.success) {
                setWebhooks(data.webhooks || []);
            }
        } catch {
            toast({ title: "Error", description: "Failed to fetch webhooks", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) {
            fetchWebhooks();
        }
    }, [projectId]);

    const handleCreateWebhook = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !url) {
            toast({ title: "Validation Error", description: "Name and URL are required.", variant: "destructive" });
            return;
        }

        setCreating(true);
        try {
            const res = await fetch('/api/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    name,
                    url,
                    event,
                    table_id: tableId,
                    secret: secret || undefined,
                    is_active: true
                })
            });

            const data = await res.json();
            if (data.success) {
                toast({ title: "Success", description: `Webhook "${name}" created successfully!` });
                setName('');
                setUrl('');
                setSecret('');
                setShowForm(false);
                fetchWebhooks();
            } else {
                toast({ title: "Failed", description: data.error?.message || "Failed to create webhook", variant: "destructive" });
            }
        } catch {
            toast({ title: "Error", description: "An unexpected error occurred", variant: "destructive" });
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteWebhook = async (webhookId: string) => {
        try {
            const res = await fetch('/api/webhooks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, webhookId })
            });
            const data = await res.json();
            if (data.success) {
                toast({ title: "Deleted", description: "Webhook removed successfully." });
                setWebhooks(prev => prev.filter(w => w.id !== webhookId));
            }
        } catch {
            toast({ title: "Error", description: "Failed to delete webhook", variant: "destructive" });
        }
    };

    const handleTestWebhook = async (webhook: WebhookItem) => {
        setTestingId(webhook.id);
        try {
            const res = await fetch(webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Fluxbase-Event': 'test.ping' },
                body: JSON.stringify({
                    event: 'test.ping',
                    timestamp: new Date().toISOString(),
                    projectId,
                    data: { message: 'Fluxbase Live Webhook Ping Test Successful' }
                }),
                mode: 'no-cors'
            });
            toast({ title: "Test Sent", description: `Triggered test event to ${webhook.url}` });
        } catch (e: any) {
            toast({ title: "Test Failed", description: e.message || "Failed to deliver webhook payload", variant: "destructive" });
        } finally {
            setTestingId(null);
        }
    };

    return (
        <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
                <div>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <Webhook className="w-5 h-5 text-primary" />
                        Live Webhooks & Event Streamer
                    </CardTitle>
                    <CardDescription>
                        Trigger real-time HTTP POST notifications when table rows are created, updated, or deleted.
                    </CardDescription>
                </div>
                <Button 
                    onClick={() => setShowForm(!showForm)} 
                    size="sm" 
                    className="flex items-center gap-1.5"
                >
                    <Plus size={14} /> Add Webhook
                </Button>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
                {/* Create Webhook Form */}
                {showForm && (
                    <form onSubmit={handleCreateWebhook} className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-4 animate-in fade-in duration-200">
                        <h4 className="text-sm font-semibold text-foreground">Configure New Webhook Endpoint</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs">Webhook Name</Label>
                                <Input 
                                    value={name} 
                                    onChange={e => setName(e.target.value)} 
                                    placeholder="e.g. Order Processing Server" 
                                    className="h-9 text-xs mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Payload URL (HTTP/HTTPS)</Label>
                                <Input 
                                    value={url} 
                                    onChange={e => setUrl(e.target.value)} 
                                    placeholder="https://api.myapp.com/webhooks/fluxbase" 
                                    className="h-9 text-xs mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Event Scope</Label>
                                <select 
                                    value={event} 
                                    onChange={e => setEvent(e.target.value)}
                                    className="w-full h-9 px-3 text-xs rounded-md border border-border bg-background text-foreground mt-1"
                                >
                                    <option value="ALL">ALL (INSERT, UPDATE, DELETE)</option>
                                    <option value="INSERT">INSERT (Row Creation)</option>
                                    <option value="UPDATE">UPDATE (Row Modification)</option>
                                    <option value="DELETE">DELETE (Row Deletion)</option>
                                </select>
                            </div>
                            <div>
                                <Label className="text-xs">Target Table Scope</Label>
                                <select 
                                    value={tableId} 
                                    onChange={e => setTableId(e.target.value)}
                                    className="w-full h-9 px-3 text-xs rounded-md border border-border bg-background text-foreground mt-1"
                                >
                                    <option value="*">* All Tables</option>
                                    {tables.map(t => (
                                        <option key={t.table_id} value={t.table_id}>{t.table_name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <Label className="text-xs">Secret Signing Key (Optional)</Label>
                            <Input 
                                value={secret} 
                                onChange={e => setSecret(e.target.value)} 
                                placeholder="whsec_..." 
                                className="h-9 text-xs mt-1 font-mono"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" disabled={creating}>
                                {creating ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <Check className="mr-1.5" size={14} />}
                                Save Webhook Endpoint
                            </Button>
                        </div>
                    </form>
                )}

                {/* Webhooks List */}
                {loading ? (
                    <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin text-primary" size={16} /> Loading configured webhooks...
                    </div>
                ) : webhooks.length > 0 ? (
                    <div className="space-y-3">
                        {webhooks.map(wh => (
                            <div key={wh.id} className="p-4 rounded-xl border border-border/80 bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-foreground text-sm">{wh.name}</span>
                                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                                            {wh.event}
                                        </Badge>
                                        <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                                            Table: {wh.table_id === '*' ? 'All Tables (*)' : wh.table_id}
                                        </Badge>
                                    </div>
                                    <p className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                                        <Globe size={12} className="text-primary" /> {wh.url}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button 
                                        onClick={() => handleTestWebhook(wh)} 
                                        variant="outline" 
                                        size="sm" 
                                        disabled={testingId === wh.id}
                                        className="h-8 text-xs gap-1.5"
                                    >
                                        {testingId === wh.id ? <Loader2 className="animate-spin" size={12} /> : <Send size={12} />}
                                        Test Payload
                                    </Button>
                                    <Button 
                                        onClick={() => handleDeleteWebhook(wh.id)} 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-8 text-xs text-muted-foreground hover:text-red-500"
                                    >
                                        <Trash2 size={14} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-10 text-center text-xs text-muted-foreground border-2 border-dashed border-border/60 rounded-xl space-y-2">
                        <Globe className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                        <p className="font-medium text-foreground">No Live Webhooks configured</p>
                        <p className="text-muted-foreground">Create a webhook endpoint to receive real-time POST payloads on table modifications.</p>
                        <Button onClick={() => setShowForm(true)} size="sm" variant="outline" className="mt-2">
                            <Plus className="mr-1.5" size={14} /> Configure First Webhook
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
