import { useQuery } from '@tanstack/react-query';
import { getRealtimeHistoryAction } from '@/app/(app)/dashboard/analytics-actions';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { useEffect, useRef } from 'react';

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
    const lastRefetchTimeRef = useRef<number>(0);

    const { data, refetch } = useQuery({
        queryKey: ['analytics_history', projectId],
        queryFn: () => getRealtimeHistoryAction(projectId!),
        enabled: !!projectId,
        staleTime: 15000,
        refetchInterval: 30000, // Background refresh every 30s
        refetchOnWindowFocus: false,
        gcTime: 10 * 60 * 1000,
    });

    // Throttled refresh on real mutations
    useEffect(() => {
        if (!lastEvent) return;

        const isMutation = lastEvent.type === 'update' || 
                           lastEvent.type === 'raw_sql_mutation' || 
                           lastEvent.type === 'schema_update';

        if (isMutation) {
            const now = Date.now();
            if (now - lastRefetchTimeRef.current >= 8000) {
                lastRefetchTimeRef.current = now;
                refetch();
            }
        }
    }, [lastEvent, refetch]);

    return (data as RealtimeDataPoint[]) || [];
}
