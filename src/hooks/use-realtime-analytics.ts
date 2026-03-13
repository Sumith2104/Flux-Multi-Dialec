import { useQuery } from '@tanstack/react-query';
import { getAnalyticsStatsAction } from '@/app/(app)/dashboard/analytics-actions';

export interface AnalyticsStats {
    total_requests: number;
    type_api_call: number;
    type_sql_execution: number;
    type_storage_read: number;
    type_storage_write: number;
    type_sql_select?: number;
    type_sql_insert?: number;
    type_sql_update?: number;
    type_sql_delete?: number;
    type_sql_alter?: number;
}

export function useRealtimeAnalytics(projectId: string | undefined): AnalyticsStats | null {
    const { data } = useQuery({
        queryKey: ['analytics_stats', projectId],
        queryFn: () => getAnalyticsStatsAction(projectId!),
        enabled: !!projectId,
        refetchInterval: 5000,
        staleTime: 4000,
    });

    return data || null;
}
