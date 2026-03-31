'use client';

import { useState, useEffect, useCallback, useContext } from 'react';
import { ProjectContext } from '@/contexts/project-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, AlertTriangle, Activity, Database, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Alert {
    id: string;
    name: string;
    metric: string;
    condition: '>' | '<' | '=';
    threshold: number;
    notifyEmail?: string;
    notifyWebhook?: string;
    enabled: boolean;
    lastTriggeredAt?: string;
    createdAt: string;
}

const metricOptions = [
    { value: 'total_requests', label: 'Total Requests (30 min)', icon: Activity },
    { value: 'row_count', label: 'Row Count', icon: Database },
    { value: 'storage_bytes', label: 'Storage Size (bytes)', icon: BarChart3 },
    { value: 'error_rate', label: 'Error Rate (%)', icon: AlertTriangle },
];

export default function AlertsPage() {
    const { project: selectedProject } = useContext(ProjectContext);
    const projectId = selectedProject?.project_id || '';

    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ name: '', metric: 'total_requests', condition: '>' as '>' | '<' | '=', threshold: 1000, notifyEmail: '', notifyWebhook: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/alerts?projectId=${projectId}`);
            const data = await res.json();
            setAlerts(data.alerts || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        if (!form.name || !form.metric) return;
        setSaving(true); setError('');
        try {
            const res = await fetch('/api/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, ...form }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setShowAdd(false);
            setForm({ name: '', metric: 'total_requests', condition: '>', threshold: 1000, notifyEmail: '', notifyWebhook: '' });
            load();
        } catch (e: any) { setError(e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        await fetch(`/api/alerts?projectId=${projectId}&id=${id}`, { method: 'DELETE' });
        load();
    };

    const handleToggle = async (alert: Alert) => {
        await fetch('/api/alerts/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, id: alert.id, enabled: !alert.enabled }),
        });
        load();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Bell className="h-6 w-6 text-yellow-400" />
                        Alerts
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Set threshold-based alerts and get notified when metrics exceed limits
                    </p>
                </div>
                <Button onClick={() => setShowAdd(true)} className="bg-orange-600 hover:bg-orange-500" id="add-alert">
                    <Plus className="h-4 w-4 mr-2" />
                    New Alert
                </Button>
            </div>

            {!selectedProject ? (
                <Card className="border-dashed border-zinc-800">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <Bell className="h-12 w-12 opacity-20" />
                        <p className="text-sm">Please select a project to configure alerts.</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                {loading ? (
                <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : alerts.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                        <Bell className="h-12 w-12 text-muted-foreground/30" />
                        <p className="text-lg font-medium">No alerts configured</p>
                        <p className="text-sm text-muted-foreground text-center max-w-sm">
                            Create alerts to get notified when your database metrics exceed defined thresholds.
                        </p>
                        <Button onClick={() => setShowAdd(true)} variant="outline" className="mt-2">Create your first alert</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {alerts.map(alert => {
                        const metric = metricOptions.find(m => m.value === alert.metric);
                        const MetricIcon = metric?.icon || Activity;
                        return (
                            <Card key={alert.id} className={cn('border-zinc-800', !alert.enabled && 'opacity-60')}>
                                <CardContent className="flex items-center gap-4 p-4">
                                    <div className={cn('p-2 rounded-md shrink-0', alert.enabled ? 'bg-yellow-500/10' : 'bg-zinc-800')}>
                                        <MetricIcon className={cn('h-4 w-4', alert.enabled ? 'text-yellow-400' : 'text-zinc-500')} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-medium text-sm">{alert.name}</span>
                                            {!alert.enabled && <Badge variant="outline" className="text-[10px] h-4 text-zinc-500">Paused</Badge>}
                                            {alert.lastTriggeredAt && <Badge variant="outline" className="text-[10px] h-4 text-red-400 border-red-500/20 bg-red-500/10">Last triggered</Badge>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Notify when <span className="text-zinc-300 font-medium">{metric?.label}</span>{' '}
                                            <span className="font-mono text-orange-400">{alert.condition} {alert.threshold.toLocaleString()}</span>
                                        </p>
                                        <div className="flex items-center gap-3 mt-1">
                                            {alert.notifyEmail && <span className="text-[10px] text-zinc-500">📧 {alert.notifyEmail}</span>}
                                            {alert.notifyWebhook && <span className="text-[10px] text-zinc-500">🔗 Webhook</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(alert)}>
                                            {alert.enabled ? <ToggleRight className="h-5 w-5 text-emerald-400" /> : <ToggleLeft className="h-5 w-5 text-zinc-500" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400" onClick={() => handleDelete(alert.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
            </>
        )}

            {/* Add Alert Dialog */}
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogContent className="bg-zinc-950 border-zinc-800 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Bell className="h-4 w-4 text-yellow-400" />
                            Create Alert
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label className="text-xs mb-1.5 block">Alert Name</Label>
                            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. High traffic alert" className="bg-zinc-900 border-zinc-700 h-9 text-sm" id="alert-name" />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-1">
                                <Label className="text-xs mb-1.5 block">Metric</Label>
                                <Select value={form.metric} onValueChange={v => setForm(f => ({ ...f, metric: v }))}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-sm h-9" id="alert-metric">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                        {metricOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs mb-1.5 block">When</Label>
                                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v as any }))}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-sm h-9 font-mono" id="alert-condition">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                        <SelectItem value=">">&gt; greater than</SelectItem>
                                        <SelectItem value="<">&lt; less than</SelectItem>
                                        <SelectItem value="=">=  equals</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs mb-1.5 block">Threshold</Label>
                                <Input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: parseInt(e.target.value) || 0 }))}
                                    className="bg-zinc-900 border-zinc-700 h-9 text-sm font-mono" id="alert-threshold" />
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs mb-1.5 block">Notify Email (optional)</Label>
                            <Input value={form.notifyEmail} onChange={e => setForm(f => ({ ...f, notifyEmail: e.target.value }))}
                                placeholder="you@example.com" className="bg-zinc-900 border-zinc-700 h-9 text-sm" id="alert-email" />
                        </div>
                        <div>
                            <Label className="text-xs mb-1.5 block">Notify Webhook URL (optional)</Label>
                            <Input value={form.notifyWebhook} onChange={e => setForm(f => ({ ...f, notifyWebhook: e.target.value }))}
                                placeholder="https://hooks.slack.com/..." className="bg-zinc-900 border-zinc-700 h-9 text-sm font-mono" id="alert-webhook" />
                        </div>
                        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                        <Button onClick={handleAdd} disabled={saving} className="bg-orange-600 hover:bg-orange-500" id="alert-save">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Alert'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
