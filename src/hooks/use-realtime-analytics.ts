import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAnalyticsStatsAction } from '@/app/(app)/dashboard/analytics-actions';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { useEffect } from 'react';

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
    const queryClient = useQueryClient();
    const { lastEvent } = useRealtimeSubscription(projectId);

    const queryKey = ['analytics_stats', projectId];

    const { data, refetch } = useQuery({
        queryKey,
        queryFn: () => getAnalyticsStatsAction(projectId!),
        enabled: !!projectId,
        staleTime: 8000,
        // CRITICAL FIX: was 30 * 60 * 1000 (30 minutes!) — analytics objects
        // were kept alive in the JS heap for 30 min after the dashboard unmounted.
        // Now set to 3 minutes, aligned with other queries.
        gcTime: 3 * 60 * 1000,
    });

    // Instant refresh when a WebSocket event arrives
    useEffect(() => {
        if (lastEvent) {
            console.log('[Realtime Analytics] Pushing update for event:', lastEvent.type);
            refetch();
        }
    }, [lastEvent, refetch]);

    return data || null;
}
