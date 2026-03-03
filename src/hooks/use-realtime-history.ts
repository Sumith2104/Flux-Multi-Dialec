import { useState, useEffect } from 'react';
import { getRealtimeHistoryAction } from '@/app/(app)/dashboard/analytics-actions';

export interface RealtimeDataPoint {
    timestamp: number;
    timeLabel: string;
    requests: number;
    api: number;
    sql: number;
    deltaRequests: number;
    deltaApi: number;
    deltaSql: number;
}

export function useRealtimeHistory(projectId: string | undefined): RealtimeDataPoint[] {
    const [history, setHistory] = useState<RealtimeDataPoint[]>([]);

    useEffect(() => {
        if (!projectId) return;

        let isMounted = true;
        const fetchHistory = async () => {
            const data = await getRealtimeHistoryAction(projectId);
            if (isMounted) {
                setHistory(data || []);
            }
        };

        fetchHistory();
        const timer = setInterval(fetchHistory, 10000);

        return () => {
            isMounted = false;
            clearInterval(timer);
        };
    }, [projectId]);

    return history;
}
