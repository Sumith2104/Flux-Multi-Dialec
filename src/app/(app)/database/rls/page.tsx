'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Shield, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, AlertTriangle, Eye, EyeOff, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTablesForProject } from '@/lib/data';
import { getPgPool } from '@/lib/pg';

interface RLSPolicy {
    id: string;
    tableName: string;
    policyName: string;
    command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
    expression: string;
    enabled: boolean;
    createdAt: string;
}

const commandColors: Record<string, string> = {
    SELECT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    INSERT: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    UPDATE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
    ALL: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

export default function RLSPage() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId') || '';

    const [tables, setTables] = useState<string[]>([]);
    const [policies, setPolicies] = useState<RLSPolicy[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [expandedTable, setExpandedTable] = useState<string | null>(null);
    const [form, setForm] = useState({ tableName: '', policyName: '', command: 'ALL', expression: 'true' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/rls?projectId=${projectId}`);
            const data = await res.json();
            setTables(data.tables || []);
            setPolicies(data.policies || []);
            if (data.tables?.length > 0) setExpandedTable(prev => prev ?? data.tables[0]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        if (!form.tableName || !form.policyName || !form.expression) return;
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/rls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, projectId }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setShowAdd(false);
            setForm({ tableName: '', policyName: '', command: 'ALL', expression: 'true' });
            load();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (policy: RLSPolicy) => {
        try {
            await fetch(`/api/rls?projectId=${projectId}&tableName=${policy.tableName}&policyName=${policy.policyName}`, { method: 'DELETE' });
            load();
        } catch (e) { console.error(e); }
    };

    const handleToggle = async (policy: RLSPolicy) => {
        try {
            await fetch('/api/rls/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, tableName: policy.tableName, policyName: policy.policyName, enabled: !policy.enabled }),
            });
            load();
        } catch (e) { console.error(e); }
    };

    const groupedByTable = tables.reduce((acc, t) => {
        acc[t] = policies.filter(p => p.tableName === t);
        return acc;
    }, {} as Record<string, RLSPolicy[]>);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Shield className="h-6 w-6 text-amber-400" />
                        Row Level Security
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Define SQL-based access policies to control which rows each user can access
                    </p>
                </div>
                <Button onClick={() => setShowAdd(true)} className="bg-orange-600 hover:bg-orange-500" id="add-rls-policy">
                    <Plus className="h-4 w-4 mr-2" />
                    New Policy
                </Button>
            </div>

            {/* Info Banner */}
            <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="flex items-start gap-3 pt-4">
                    <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-sm text-amber-200/80">
                        <strong className="text-amber-300">RLS policies are enforced at the database level</strong> for all API requests.
                        Use <code className="bg-zinc-800 px-1 rounded text-xs">auth.uid()</code> to reference the current user&apos;s ID in your expressions.
                        Example: <code className="bg-zinc-800 px-1 rounded text-xs">user_id = auth.uid()</code>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : tables.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                        <Shield className="h-12 w-12 text-muted-foreground/30" />
                        <p className="text-lg font-medium">No tables found</p>
                        <p className="text-sm text-muted-foreground text-center">Create tables in the Table Editor first, then add RLS policies here.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {Object.entries(groupedByTable).map(([tableName, tablePolicies]) => (
                        <Card key={tableName} className="border-zinc-800">
                            <button
                                className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-900/50 transition-colors rounded-lg"
                                onClick={() => setExpandedTable(prev => prev === tableName ? null : tableName)}
                                id={`rls-table-${tableName}`}
                            >
                                <div className="flex items-center gap-3">
                                    {expandedTable === tableName ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                    <span className="font-medium font-mono text-sm">{tableName}</span>
                                    <Badge variant="outline" className="text-xs">
                                        {tablePolicies.length} {tablePolicies.length === 1 ? 'policy' : 'policies'}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-1">
                                    {tablePolicies.length > 0 ? (
                                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">Protected</Badge>
                                    ) : (
                                        <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">Unprotected</Badge>
                                    )}
                                </div>
                            </button>

                            {expandedTable === tableName && (
                                <div className="border-t border-zinc-800 p-4 space-y-3">
                                    {tablePolicies.length === 0 ? (
                                        <div className="text-center py-6 text-sm text-muted-foreground">
                                            No policies on this table. All rows are accessible via the API.
                                        </div>
                                    ) : (
                                        tablePolicies.map(policy => (
                                            <div key={policy.id} className={cn('rounded-lg border p-3 flex items-start justify-between gap-3', policy.enabled ? 'border-zinc-700 bg-zinc-900/50' : 'border-zinc-800 bg-zinc-950 opacity-60')}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-sm">{policy.policyName}</span>
                                                        <Badge variant="outline" className={cn('text-[10px] h-4 px-1.5', commandColors[policy.command])}>
                                                            {policy.command}
                                                        </Badge>
                                                        {!policy.enabled && <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-zinc-500">Disabled</Badge>}
                                                    </div>
                                                    <code className="text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded font-mono block truncate">
                                                        USING ({policy.expression})
                                                    </code>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleToggle(policy)}>
                                                        {policy.enabled ? <ToggleRight className="h-4 w-4 text-emerald-400" /> : <ToggleLeft className="h-4 w-4" />}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-400" onClick={() => handleDelete(policy)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    <Button variant="outline" size="sm" className="w-full border-dashed text-xs"
                                        onClick={() => { setForm(f => ({ ...f, tableName })); setShowAdd(true); }}>
                                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                                        Add policy to {tableName}
                                    </Button>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {/* Add Policy Dialog */}
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogContent className="bg-zinc-950 border-zinc-800 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-amber-400" />
                            Create RLS Policy
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs mb-1.5 block">Table</Label>
                                <Select value={form.tableName} onValueChange={v => setForm(f => ({ ...f, tableName: v }))}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-sm h-9" id="rls-table-select">
                                        <SelectValue placeholder="Select table" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                        {tables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs mb-1.5 block">Command</Label>
                                <Select value={form.command} onValueChange={v => setForm(f => ({ ...f, command: v }))}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-sm h-9" id="rls-command-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                        {['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs mb-1.5 block">Policy Name</Label>
                            <Input value={form.policyName} onChange={e => setForm(f => ({ ...f, policyName: e.target.value }))}
                                placeholder="e.g. users_own_rows" className="bg-zinc-900 border-zinc-700 h-9 text-sm" id="rls-policy-name" />
                        </div>
                        <div>
                            <Label className="text-xs mb-1.5 block">USING Expression</Label>
                            <Textarea value={form.expression} onChange={e => setForm(f => ({ ...f, expression: e.target.value }))}
                                placeholder="e.g. user_id = auth.uid()" className="bg-zinc-900 border-zinc-700 font-mono text-sm min-h-[80px]"
                                id="rls-expression" />
                            <p className="text-xs text-muted-foreground mt-1">SQL expression that must evaluate to true for a row to be accessible</p>
                        </div>
                        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                        <Button onClick={handleAdd} disabled={saving} className="bg-orange-600 hover:bg-orange-500" id="rls-save">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Policy'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
