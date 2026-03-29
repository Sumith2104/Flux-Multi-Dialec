'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

type HealthStatus = 'checking' | 'healthy' | 'degraded' | 'offline';

interface ServiceStatus {
    name: string;
    status: HealthStatus;
    latency?: number;
}

export function StatusIndicator() {
    const [services, setServices] = useState<ServiceStatus[]>([
        { name: 'Database', status: 'checking' },
        { name: 'Redis', status: 'checking' },
        { name: 'API', status: 'checking' },
    ]);
    const [overall, setOverall] = useState<HealthStatus>('checking');

    const check = async () => {
        try {
            const start = Date.now();
            const res = await fetch('/api/health', { cache: 'no-store' });
            const latency = Date.now() - start;
            const data = await res.json();

            const dbStatus: HealthStatus = data.database === true ? (latency > 800 ? 'degraded' : 'healthy') : 'offline';
            const redisStatus: HealthStatus = data.redis === true ? 'healthy' : 'degraded';
            const apiStatus: HealthStatus = res.ok ? 'healthy' : 'offline';

            const updated = [
                { name: 'Database', status: dbStatus, latency },
                { name: 'Redis', status: redisStatus },
                { name: 'API', status: apiStatus, latency },
            ];
            setServices(updated);

            const hasOffline = updated.some(s => s.status === 'offline');
            const hasDegraded = updated.some(s => s.status === 'degraded');
            setOverall(hasOffline ? 'offline' : hasDegraded ? 'degraded' : 'healthy');
        } catch {
            setServices(prev => prev.map(s => ({ ...s, status: 'offline' })));
            setOverall('offline');
        }
    };

    useEffect(() => {
        check();
        const interval = setInterval(check, 30000); // re-check every 30s
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const colors: Record<HealthStatus, string> = {
        checking: 'bg-zinc-500',
        healthy: 'bg-emerald-500',
        degraded: 'bg-yellow-500',
        offline: 'bg-red-500',
    };

    const labels: Record<HealthStatus, string> = {
        checking: 'Checking...',
        healthy: 'All systems operational',
        degraded: 'Degraded performance',
        offline: 'Service disruption',
    };

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        id="status-indicator"
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors h-8"
                    >
                        <span className="relative flex h-2 w-2">
                            {overall === 'healthy' && (
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                            )}
                            <span className={cn('relative inline-flex rounded-full h-2 w-2', colors[overall])} />
                        </span>
                        <span className="hidden lg:block text-xs text-muted-foreground">Status</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent
                    side="bottom"
                    align="end"
                    className="bg-zinc-950 border-zinc-800 p-0 overflow-hidden min-w-[200px]"
                >
                    <div className="px-3 py-2 border-b border-zinc-800">
                        <p className="text-xs font-medium text-foreground">{labels[overall]}</p>
                    </div>
                    <div className="p-2 space-y-1">
                        {services.map(svc => (
                            <div key={svc.name} className="flex items-center justify-between px-1 py-0.5">
                                <div className="flex items-center gap-2">
                                    <span className={cn('h-1.5 w-1.5 rounded-full', colors[svc.status])} />
                                    <span className="text-xs text-zinc-300">{svc.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {svc.latency && (
                                        <span className="text-[10px] text-zinc-500">{svc.latency}ms</span>
                                    )}
                                    <span className={cn(
                                        'text-[10px] capitalize',
                                        svc.status === 'healthy' ? 'text-emerald-400' :
                                        svc.status === 'degraded' ? 'text-yellow-400' :
                                        svc.status === 'offline' ? 'text-red-400' : 'text-zinc-500'
                                    )}>
                                        {svc.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
