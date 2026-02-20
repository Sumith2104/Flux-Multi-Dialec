import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface ProjectHistory {
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

        const fetchHistory = async () => {
            try {
                const now = new Date();
                const todayStr = now.toISOString().split('T')[0];
                let todayData: any = {};

                const todayRef = doc(db, 'projects', projectId, 'stats_history', todayStr);
                const todaySnap = await getDoc(todayRef);
                if (todaySnap.exists()) {
                    todayData = todaySnap.data();
                }

                // Fetch yesterday to fill out 24 hours smoothly early in the UTC day
                const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                let yesterdayData: any = {};

                const yesterdayRef = doc(db, 'projects', projectId, 'stats_history', yesterdayStr);
                const yesterdaySnap = await getDoc(yesterdayRef);
                if (yesterdaySnap.exists()) {
                    yesterdayData = yesterdaySnap.data();
                }

                const currentHour = now.getUTCHours();
                const requestsSeries: { val: number }[] = [];
                const apiSeries: { val: number }[] = [];

                for (let i = 23; i >= 0; i--) {
                    let historicalHour = currentHour - i;
                    let targetData = todayData;

                    if (historicalHour < 0) {
                        historicalHour += 24;
                        targetData = yesterdayData;
                    }

                    const hourStr = String(historicalHour).padStart(2, '0');
                    const hrReq = targetData[`${hourStr}_total_requests`] || 0;
                    const hrApi = targetData[`${hourStr}_type_api_call`] || 0;

                    requestsSeries.push({ val: hrReq });
                    apiSeries.push({ val: hrApi });
                }

                setHistory({ requests: requestsSeries, apiCalls: apiSeries });

            } catch (error) {
                // Warning instead of error to prevent Next.js dev overlay crash if rules haven't propagated
                console.warn("Failed to fetch project history. Check firestore.rules permissions:", error);
            }
        };

        fetchHistory();

        // Refresh every few minutes in case hour rolls over
        const interval = setInterval(fetchHistory, 300000);

        return () => clearInterval(interval);
    }, [projectId]);

    return history;
}
