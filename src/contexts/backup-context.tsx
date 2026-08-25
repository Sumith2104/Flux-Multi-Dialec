"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export interface ActiveBackup {
    id: string;
    projectId: string;
    projectName?: string;
    label?: string;
    status: 'in_progress' | 'completed' | 'failed';
    progress: number; // 0 to 100
    error?: string;
    createdAt: string;
}

interface BackupContextType {
    backups: ActiveBackup[];
    startBackgroundBackup: (projectId: string, projectName?: string) => Promise<void>;
    dismissBackup: (id: string) => void;
    clearCompletedBackups: () => void;
}

const BackupContext = createContext<BackupContextType>({
    backups: [],
    startBackgroundBackup: async () => {},
    dismissBackup: () => {},
    clearCompletedBackups: () => {},
});

export const useBackupManager = () => useContext(BackupContext);

export function BackupProvider({ children }: { children: React.ReactNode }) {
    const [backups, setBackups] = useState<ActiveBackup[]>([]);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const updateBackupState = useCallback((id: string, patch: Partial<ActiveBackup>) => {
        setBackups(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
    }, []);

    const dismissBackup = useCallback((id: string) => {
        setBackups(prev => prev.filter(b => b.id !== id));
    }, []);

    const clearCompletedBackups = useCallback(() => {
        setBackups(prev => prev.filter(b => b.status === 'in_progress'));
    }, []);

    const startBackgroundBackup = useCallback(
        async (projectId: string, projectName?: string) => {
            const taskId = `backup_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const taskLabel = `Backup: ${projectName || projectId.substring(0, 8)}`;

            const newBackupTask: ActiveBackup = {
                id: taskId,
                projectId,
                projectName,
                label: taskLabel,
                status: 'in_progress',
                progress: 15,
                createdAt: new Date().toISOString(),
            };

            setBackups(prev => [newBackupTask, ...prev]);

            toast({
                title: 'Backup started in background',
                description: 'Database snapshot generation is running. You can navigate freely.',
            });

            // Smooth progress simulation while backend dumps tenant tables
            const progressInterval = setInterval(() => {
                setBackups(prev =>
                    prev.map(b => {
                        if (b.id === taskId && b.status === 'in_progress') {
                            const nextProgress = Math.min(b.progress + Math.floor(Math.random() * 12) + 5, 88);
                            return { ...b, progress: nextProgress };
                        }
                        return b;
                    })
                );
            }, 800);

            try {
                const res = await fetch('/api/backups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId }),
                });

                clearInterval(progressInterval);
                const data = await res.json();

                if (!res.ok || !data.success) {
                    const errorMsg =
                        typeof data?.error === 'string'
                            ? data.error
                            : data?.error?.message || data?.message || 'Backup failed';
                    throw new Error(errorMsg);
                }

                updateBackupState(taskId, {
                    status: 'completed',
                    progress: 100,
                    label: data.backup?.label || taskLabel,
                });

                toast({
                    title: 'Backup completed',
                    description: `Snapshot for ${projectName || 'project'} has been saved successfully.`,
                });

                // Invalidate query caches and dispatch event to refresh UI
                queryClient.invalidateQueries({ queryKey: ['backups', projectId] });
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('fluxbase:backup-completed', { detail: { projectId } }));
                }
            } catch (err: any) {
                clearInterval(progressInterval);
                const msg = err.message || 'An unexpected error occurred during backup';
                updateBackupState(taskId, {
                    status: 'failed',
                    progress: 100,
                    error: msg,
                });

                toast({
                    title: 'Backup failed',
                    description: msg,
                    variant: 'destructive',
                });
            }
        },
        [queryClient, toast, updateBackupState]
    );

    return (
        <BackupContext.Provider
            value={{
                backups,
                startBackgroundBackup,
                dismissBackup,
                clearCompletedBackups,
            }}
        >
            {children}
        </BackupContext.Provider>
    );
}
