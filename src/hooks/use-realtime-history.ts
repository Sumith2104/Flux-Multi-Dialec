import { useQuery } from '@tanstack/react-query';
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
    const { data } = useQuery({
        queryKey: ['analytics_history', projectId],
        queryFn: () => getRealtimeHistoryAction(projectId!),
        enabled: !!projectId,
        staleTime: 30000,
        refetchInterval: 60000, // Background refresh every 1 minute
        refetchOnWindowFocus: false,
        gcTime: 10 * 60 * 1000,
    });

    return (data as RealtimeDataPoint[]) || [];
}
