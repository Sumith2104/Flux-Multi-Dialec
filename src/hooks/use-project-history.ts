import { useState, useEffect } from 'react';
import { getProjectHistoryAction } from '@/app/(app)/dashboard/analytics-actions';

export interface ProjectHistory {
    daily?: Record<string, number>;
    monthly?: Record<string, number>;
    yearly?: Record<string, number>;
    requests: { val: number }[];
    apiCalls: { val: number }[];
}

export function useProjectHistory(projectId: string | undefined): ProjectHistory {
    const [history, setHistory] = useState<ProjectHistory>({
        requests: Array(24).fill({ val: 0 }),
        apiCalls: Array(24).fill({ val: 0 })
    });

    useEffect(() => {
        if (!projectId) return;

        let isMounted = true;
        const fetchHistory = async () => {
            try {
                const data = await getProjectHistoryAction(projectId);
                if (isMounted && data) {
                    setHistory({
                        ...data,
                        // Provide empty fallback arrays for the UI to prevent crashes
                        requests: data.requests || Array(24).fill({ val: 0 }),
                        apiCalls: data.apiCalls || Array(24).fill({ val: 0 })
                    });
                }
            } catch (err) {
                console.error("Failed to load project history natively:", err);
            }
        };

        fetchHistory();
        const timer = setInterval(fetchHistory, 60000 * 5); // poll every 5 mins

        return () => {
            isMounted = false;
            clearInterval(timer);
        };
    }, [projectId]);

    return history;
}
