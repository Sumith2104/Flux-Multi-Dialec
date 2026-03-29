'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Archive, Download, RefreshCw, Clock, CheckCircle2, AlertCircle, Loader2, HardDrive, RotateCcw, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

interface Backup {
    id: string;
    label: string;
    type: 'auto' | 'manual';
    status: 'completed' | 'in_progress' | 'failed';
    sizeBytes?: number;
    createdAt: string;
    expiresAt?: string;
}

const formatBytes = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function BackupsPage() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId') || '';

    const [backups, setBackups] = useState<Backup[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [confirmRestore, setConfirmRestore] = useState<Backup | null>(null);

    const load = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/backups?projectId=${projectId}`);
            const data = await res.json();
            setBackups(data.backups || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async () => {
        setCreating(true);
        try {
            await fetch('/api/backups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId }),
            });
            load();
        } catch (e) { console.error(e); }
        finally { setCreating(false); }
    };

    const handleRestore = async (backup: Backup) => {
        setRestoring(backup.id);
        try {
            await fetch('/api/backups/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, backupId: backup.id }),
            });
            setConfirmRestore(null);
            load();
        } catch (e) { console.error(e); }
        finally { setRestoring(null); }
    };

    const statusConfig = {
        completed: { label: 'Complete', icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        in_progress: { label: 'In Progress', icon: Loader2, className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        failed: { label: 'Failed', icon: AlertCircle, className: 'bg-red-500/10 text-red-400 border-red-500/20' },
    };

    const autoBackups = backups.filter(b => b.type === 'auto');
    const manualBackups = backups.filter(b => b.type === 'manual');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Archive className="h-6 w-6 text-orange-400" />
                        Backups
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Point-in-time database snapshots with one-click restore
                    </p>
                </div>
                <Button onClick={handleCreate} disabled={creating} className="bg-orange-600 hover:bg-orange-500" id="create-backup">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                    Create Backup
                </Button>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Total Backups', value: backups.length, icon: Archive, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                    { label: 'Auto Backups', value: autoBackups.length, icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    { label: 'Total Size', value: formatBytes(backups.reduce((a, b) => a + (b.sizeBytes || 0), 0)), icon: HardDrive, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                ].map(s => (
                    <Card key={s.label} className="border-zinc-800">
                        <CardContent className="flex items-center gap-3 pt-4">
                            <div className={cn('p-2 rounded-lg', s.bg)}>
                                <s.icon className={cn('h-5 w-5', s.color)} />
                            </div>
                            <div>
                                <div className="text-xl font-bold">{s.value}</div>
                                <div className="text-xs text-muted-foreground">{s.label}</div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : backups.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                        <Archive className="h-12 w-12 text-muted-foreground/30" />
                        <p className="text-lg font-medium">No backups yet</p>
                        <p className="text-sm text-muted-foreground">Create your first manual backup or wait for the next automatic snapshot.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {manualBackups.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><Download className="h-3.5 w-3.5" />Manual Backups</h3>
                            <BackupList backups={manualBackups} onRestore={setConfirmRestore} restoring={restoring} statusConfig={statusConfig} />
                        </div>
                    )}
                    {autoBackups.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Automatic Backups</h3>
                            <BackupList backups={autoBackups} onRestore={setConfirmRestore} restoring={restoring} statusConfig={statusConfig} />
                        </div>
                    )}
                </div>
            )}

            {/* Restore Confirm Dialog */}
            <Dialog open={!!confirmRestore} onOpenChange={() => setConfirmRestore(null)}>
                <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-yellow-400">
                            <AlertCircle className="h-4 w-4" />Confirm Restore
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-2 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            This will restore your database to the state at <strong className="text-foreground">{confirmRestore && format(new Date(confirmRestore.createdAt), 'MMM d, yyyy HH:mm')}</strong>.
                        </p>
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-300">
                            ⚠️ This action is irreversible. All data changes made after this backup snapshot will be permanently lost.
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmRestore(null)}>Cancel</Button>
                        <Button onClick={() => confirmRestore && handleRestore(confirmRestore)}
                            disabled={!!restoring}
                            className="bg-yellow-600 hover:bg-yellow-500 text-black font-semibold" id="confirm-restore">
                            {restoring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                            Restore Backup
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function BackupList({ backups, onRestore, restoring, statusConfig }: any) {
    return (
        <div className="space-y-2">
            {backups.map((b: Backup) => {
                const { label, icon: Icon, className } = statusConfig[b.status];
                return (
                    <Card key={b.id} className="border-zinc-800">
                        <CardContent className="flex items-center gap-4 p-4">
                            <div className="p-2 rounded-lg bg-zinc-800 shrink-0">
                                <Archive className="h-4 w-4 text-zinc-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-medium text-sm">{b.label}</span>
                                    <Badge variant="outline" className={cn('text-[10px] h-4 px-1.5', className)}>
                                        <Icon className={cn('h-2.5 w-2.5 mr-1', b.status === 'in_progress' && 'animate-spin')} />
                                        {label}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(b.createdAt), 'MMM d, yyyy HH:mm')}</span>
                                    <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{formatBytes(b.sizeBytes)}</span>
                                    {b.expiresAt && <span>Expires {formatDistanceToNow(new Date(b.expiresAt), { addSuffix: true })}</span>}
                                </div>
                            </div>
                            {b.status === 'completed' && (
                                <Button variant="outline" size="sm" className="h-8 text-xs border-zinc-700 hover:border-orange-500/50 hover:text-orange-400 shrink-0"
                                    onClick={() => onRestore(b)} disabled={!!restoring} id={`restore-${b.id}`}>
                                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Restore
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
