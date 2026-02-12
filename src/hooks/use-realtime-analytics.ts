
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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

        const statsRef = doc(db, 'projects', projectId, 'stats', 'general');

        const unsubscribe = onSnapshot(statsRef, (doc) => {
            if (doc.exists()) {
                setStats(doc.data() as AnalyticsStats);
            } else {
                setStats({
                    total_requests: 0,
                    type_api_call: 0,
                    type_sql_execution: 0,
                    type_storage_read: 0,
                    type_storage_write: 0
                });
            }
        });

        return () => unsubscribe();
    }, [projectId]);

    return stats;
}
