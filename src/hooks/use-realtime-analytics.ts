
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

        const eventSource = new EventSource(`/api/projects/${projectId}/analytics/stream`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.stats) setStats(data.stats);
            } catch (err) {
                console.error("Error parsing SSE analytics data", err);
            }
        };

        eventSource.onerror = (err) => {
            console.error("SSE stream error:", err);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [projectId]);

    return stats;
}
