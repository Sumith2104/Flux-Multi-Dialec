import { useQuery } from '@tanstack/react-query';
import { getRealtimeHistoryAction } from '@/app/(app)/dashboard/analytics-actions';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { useEffect } from 'react';

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
    const { lastEvent } = useRealtimeSubscription(projectId);

    const { data, refetch } = useQuery({
        queryKey: ['analytics_history', projectId],
        queryFn: () => getRealtimeHistoryAction(projectId!),
        enabled: !!projectId,
        refetchInterval: 10000, // Reduced polling since we have WS now
        staleTime: 4000,
        gcTime: 30 * 60 * 1000, // Keep in memory for 30 minutes
    });

    // Refresh history when a WebSocket event arrives
    useEffect(() => {
        if (lastEvent) {
            refetch();
        }
    }, [lastEvent, refetch]);

    return (data as RealtimeDataPoint[]) || [];
}
