
import { useState, useEffect } from 'react';
import { getAnalyticsStatsAction } from '@/app/(app)/dashboard/analytics-actions';

export interface AnalyticsStats {
    total_requests: number;
    type_api_call: number;
    type_sql_execution: number;
    type_storage_read: number;
    type_storage_write: number;
    type_sql_select?: number; // Optional as they might not await exist in old records
    type_sql_insert?: number;
    type_sql_update?: number;
    type_sql_delete?: number;
    type_sql_alter?: number;
}

export function useRealtimeAnalytics(projectId: string | undefined): AnalyticsStats | null {
    const [stats, setStats] = useState<AnalyticsStats | null>(null);

    useEffect(() => {
        if (!projectId) return;

        let isMounted = true;
        const fetchStats = async () => {
            const data = await getAnalyticsStatsAction(projectId);
            if (isMounted && data) {
                setStats(data);
            }
        };

        fetchStats();
        const timer = setInterval(fetchStats, 5000); // poll every 5s

        return () => {
            isMounted = false;
            clearInterval(timer);
        };
    }, [projectId]);

    return stats;
}
