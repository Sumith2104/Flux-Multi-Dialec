
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface AnalyticsStats {
    total_requests: number;
    type_api_call: number;
    type_sql_execution: number;
    type_storage_read: number;
    type_storage_write: number;
}

export function useRealtimeAnalytics(projectId: string | undefined): AnalyticsStats | null {
    const [stats, setStats] = useState<AnalyticsStats | null>(null);

    useEffect(() => {
        if (!projectId) return;

        const fetchStats = async () => {
            try {
                const statsRef = doc(db, 'projects', projectId, 'stats', 'general');
                const snapshot = await getDoc(statsRef);

                if (snapshot.exists()) {
                    setStats(snapshot.data() as AnalyticsStats);
                } else {
                    setStats({
                        total_requests: 0,
                        type_api_call: 0,
                        type_sql_execution: 0,
                        type_storage_read: 0,
                        type_storage_write: 0,
                        type_sql_select: 0,
                        type_sql_insert: 0,
                        type_sql_update: 0,
                        type_sql_delete: 0,
                        type_sql_alter: 0
                    });
                }
            } catch (error) {
                console.error("Failed to fetch analytics:", error);
            }
        };

        // Initial fetch
        fetchStats();

        // Poll every 1 minute
        const interval = setInterval(fetchStats, 60000);

        return () => clearInterval(interval);
    }, [projectId]);

    return stats;
}
