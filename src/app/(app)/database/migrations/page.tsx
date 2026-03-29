'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { GitBranch, Plus, CheckCircle2, XCircle, Clock, Loader2, Play, RotateCcw, ChevronDown, ChevronRight, FileCode, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Migration {
    id: string;
    version: string;
    name: string;
    upSql: string;
    downSql: string;
    status: 'pending' | 'applied' | 'failed';
    appliedAt?: string;
    error?: string;
}

export default function MigrationsPage() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId') || '';

    const [migrations, setMigrations] = useState<Migration[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ name: '', upSql: '', downSql: '' });
    const [saving, setSaving] = useState(false);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/migrations?projectId=${projectId}`);
            const data = await res.json();
            setMigrations(data.migrations || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async () => {
        if (!form.name || !form.upSql) return;
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/migrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, ...form }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setShowAdd(false);
            setForm({ name: '', upSql: '', downSql: '' });
            load();
        } catch (e: any) { setError(e.message); }
        finally { setSaving(false); }
    };

    const handleRun = async (migration: Migration, direction: 'up' | 'down') => {
        setRunningId(migration.id);
        try {
            await fetch('/api/migrations/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, migrationId: migration.id, direction }),
            });
            load();
        } catch (e) { console.error(e); }
        finally { setRunningId(null); }
    };

    const statusConfig = {
        pending: { label: 'Pending', icon: Clock, className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
        applied: { label: 'Applied', icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        failed: { label: 'Failed', icon: XCircle, className: 'bg-red-500/10 text-red-400 border-red-500/20' },
    };

    const applied = migrations.filter(m => m.status === 'applied');
    const pending = migrations.filter(m => m.status === 'pending');
    const failed = migrations.filter(m => m.status === 'failed');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <GitBranch className="h-6 w-6 text-blue-400" />
                        Database Migrations
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Version-controlled schema changes with up/down rollback support
                    </p>
                </div>
                <Button onClick={() => setShowAdd(true)} className="bg-orange-600 hover:bg-orange-500" id="add-migration">
                    <Plus className="h-4 w-4 mr-2" />
                    New Migration
                </Button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Applied', value: applied.length, color: 'text-emerald-400' },
                    { label: 'Pending', value: pending.length, color: 'text-yellow-400' },
                    { label: 'Failed', value: failed.length, color: 'text-red-400' },
                ].map(s => (
                    <Card key={s.label} className="border-zinc-800">
                        <CardContent className="pt-4">
                            <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
                            <div className="text-xs text-muted-foreground">{s.label}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : migrations.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                        <GitBranch className="h-12 w-12 text-muted-foreground/30" />
                        <p className="text-lg font-medium">No migrations yet</p>
                        <p className="text-sm text-muted-foreground">Create your first migration to start tracking schema changes.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {migrations.map(m => {
                        const { label, icon: Icon, className } = statusConfig[m.status];
                        const isRunning = runningId === m.id;
                        return (
                            <Card key={m.id} className="border-zinc-800">
                                <div className="flex items-center p-4 gap-4">
                                    <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-mono shrink-0">
                                        {m.version}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{m.name}</span>
                                            <Badge variant="outline" className={cn('text-[10px] h-4 px-1.5', className)}>
                                                <Icon className="h-2.5 w-2.5 mr-1" />
                                                {label}
                                            </Badge>
                                        </div>
                                        {m.appliedAt && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Applied {format(new Date(m.appliedAt), 'MMM d, yyyy HH:mm')}
                                            </p>
                                        )}
                                        {m.error && <p className="text-xs text-red-400 mt-0.5 truncate">{m.error}</p>}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                                            onClick={() => setExpanded(prev => prev === m.id ? null : m.id)}
                                            id={`migration-expand-${m.id}`}>
                                            <FileCode className="h-3.5 w-3.5 mr-1" />
                                            {expanded === m.id ? 'Hide' : 'SQL'}
                                        </Button>
                                        {m.status === 'pending' && (
                                            <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500" onClick={() => handleRun(m, 'up')} disabled={!!runningId} id={`migration-run-${m.id}`}>
                                                {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <><ArrowUp className="h-3 w-3 mr-1" />Run</>}
                                            </Button>
                                        )}
                                        {m.status === 'applied' && (
                                            <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleRun(m, 'down')} disabled={!!runningId} id={`migration-rollback-${m.id}`}>
                                                {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <><ArrowDown className="h-3 w-3 mr-1" />Rollback</>}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                {expanded === m.id && (
                                    <div className="border-t border-zinc-800 p-4 space-y-3">
                                        <div>
                                            <p className="text-xs font-medium text-emerald-400 mb-1.5">▲ UP migration</p>
                                            <pre className="text-xs bg-zinc-900 rounded-md p-3 overflow-x-auto text-zinc-300 border border-zinc-800 font-mono">{m.upSql}</pre>
                                        </div>
                                        {m.downSql && (
                                            <div>
                                                <p className="text-xs font-medium text-red-400 mb-1.5">▼ DOWN migration</p>
                                                <pre className="text-xs bg-zinc-900 rounded-md p-3 overflow-x-auto text-zinc-300 border border-zinc-800 font-mono">{m.downSql}</pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add Migration Dialog */}
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-blue-400" />
                            Create Migration
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label className="text-xs mb-1.5 block">Migration Name</Label>
                            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. add_user_roles_table" className="bg-zinc-900 border-zinc-700 font-mono h-9 text-sm" id="migration-name" />
                        </div>
                        <div>
                            <Label className="text-xs mb-1.5 flex items-center gap-1"><ArrowUp className="h-3 w-3 text-emerald-400" /> UP — Migrate Forward</Label>
                            <Textarea value={form.upSql} onChange={e => setForm(f => ({ ...f, upSql: e.target.value }))}
                                placeholder="ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer';" className="bg-zinc-900 border-zinc-700 font-mono text-sm min-h-[100px]" id="migration-up-sql" />
                        </div>
                        <div>
                            <Label className="text-xs mb-1.5 flex items-center gap-1"><ArrowDown className="h-3 w-3 text-red-400" /> DOWN — Rollback (optional)</Label>
                            <Textarea value={form.downSql} onChange={e => setForm(f => ({ ...f, downSql: e.target.value }))}
                                placeholder="ALTER TABLE users DROP COLUMN role;" className="bg-zinc-900 border-zinc-700 font-mono text-sm min-h-[80px]" id="migration-down-sql" />
                        </div>
                        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={saving} className="bg-orange-600 hover:bg-orange-500" id="migration-save">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Migration'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
