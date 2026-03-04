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

        const eventSource = new EventSource(`/api/projects/${projectId}/analytics/stream`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.history) setHistory(data.history);
            } catch (err) {
                console.error("Error parsing SSE history data", err);
            }
        };

        return () => {
            eventSource.close();
        };
    }, [projectId]);

    return history;
}
