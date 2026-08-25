"use client";

import { useBackupManager } from '@/contexts/backup-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Archive, CheckCircle2, XCircle, Loader2, X, ChevronDown, ChevronUp, Database } from 'lucide-react';
import { useState } from 'react';

export function BackgroundBackupWidget() {
    const { backups, dismissBackup } = useBackupManager();
    const [minimized, setMinimized] = useState(false);

    if (backups.length === 0) return null;

    const activeCount = backups.filter(b => b.status === 'in_progress').length;

    return (
        <div className="fixed bottom-4 right-4 z-50 w-80 sm:w-96 shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
            <Card className="border-border bg-card/95 backdrop-blur-md overflow-hidden shadow-2xl">
                <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 text-foreground">
                        <Archive size={14} className="text-orange-400 animate-pulse" />
                        {activeCount > 0
                            ? `Creating ${activeCount} Database Snapshot${activeCount > 1 ? 's' : ''}...`
                            : 'Database Backups'}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => setMinimized(!minimized)}
                        >
                            {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </Button>
                    </div>
                </CardHeader>

                {!minimized && (
                    <CardContent className="p-3 max-h-64 overflow-y-auto space-y-2.5">
                        {backups.map(item => (
                            <div
                                key={item.id}
                                className="p-2.5 rounded-lg border border-border/60 bg-muted/20 text-xs space-y-1.5"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Database size={13} className="text-muted-foreground shrink-0" />
                                        <span
                                            className="font-medium text-foreground truncate max-w-[190px]"
                                            title={item.label || item.projectName || item.projectId}
                                        >
                                            {item.label || item.projectName || item.projectId}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {item.status === 'in_progress' && (
                                            <div className="flex items-center gap-1 text-[11px] text-orange-400 font-mono">
                                                <Loader2 size={12} className="animate-spin text-orange-400" />
                                                <span>{item.progress}%</span>
                                            </div>
                                        )}
                                        {item.status === 'completed' && (
                                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                                                <CheckCircle2 size={13} />
                                                <span>Ready</span>
                                            </span>
                                        )}
                                        {item.status === 'failed' && (
                                            <span className="flex items-center gap-1 text-[11px] text-red-400 font-medium">
                                                <XCircle size={13} />
                                                <span>Failed</span>
                                            </span>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-muted-foreground hover:text-foreground ml-0.5"
                                            onClick={() => dismissBackup(item.id)}
                                        >
                                            <X size={12} />
                                        </Button>
                                    </div>
                                </div>

                                {item.status === 'in_progress' && (
                                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-orange-500 h-full transition-all duration-300 rounded-full"
                                            style={{ width: `${item.progress}%` }}
                                        />
                                    </div>
                                )}

                                {item.status === 'failed' && (
                                    <p className="text-[10px] text-red-400 truncate leading-tight">
                                        {item.error || 'Backup generation failed'}
                                    </p>
                                )}
                            </div>
                        ))}
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
