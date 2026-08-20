import { useQuery } from '@tanstack/react-query';
import { getAnalyticsStatsAction } from '@/app/(app)/dashboard/analytics-actions';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { useEffect, useRef } from 'react';

export interface AnalyticsStats {
    total_requests: number;
    type_api_call: number;
    type_sql_execution: number;
    type_storage_read: number;
    type_storage_write: number;
    type_sql_select?: number;
    type_sql_insert?: number;
    type_sql_update: number;
    type_sql_delete: number;
    type_sql_alter: number;
    live_sessions: number; // Real-time active connection tracking
}

export function useRealtimeAnalytics(projectId: string | undefined): AnalyticsStats | null {
    const { lastEvent } = useRealtimeSubscription(projectId);
    const lastRefetchTimeRef = useRef<number>(0);

    const queryKey = ['analytics_stats', projectId];

    const { data, refetch } = useQuery({
        queryKey,
        queryFn: () => getAnalyticsStatsAction(projectId!),
        enabled: !!projectId,
        staleTime: 8000,
        refetchInterval: 12000, // Smooth background refresh every 12s
        refetchOnWindowFocus: false,
        gcTime: 3 * 60 * 1000,
    });

    // Throttled refresh when a real database mutation event arrives
    useEffect(() => {
        if (!lastEvent) return;

        const isMutation = lastEvent.type === 'update' || 
                           lastEvent.type === 'raw_sql_mutation' || 
                           lastEvent.type === 'schema_update' || 
                           lastEvent.action === 'INSERT' || 
                           lastEvent.action === 'UPDATE' || 
                           lastEvent.action === 'DELETE';

        if (isMutation) {
            const now = Date.now();
            if (now - lastRefetchTimeRef.current >= 4000) {
                lastRefetchTimeRef.current = now;
                refetch();
            }
        }
    }, [lastEvent, refetch]);

    return data || null;
}
