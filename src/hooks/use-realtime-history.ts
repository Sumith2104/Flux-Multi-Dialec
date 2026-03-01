import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

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
    const [history, setHistory] = useState<RealtimeDataPoint[]>([]);

    const yesterdayCache = useRef<any>(null);

    useEffect(() => {
        if (!projectId) return;

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const todayRef = doc(db, 'projects', projectId, 'stats_realtime', todayStr);

        // Fetch yesterday's data once if we might need it (around UTC midnight)
        const fetchYesterday = async () => {
            if (now.getUTCHours() === 0 && !yesterdayCache.current) {
                const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                const yesterdayRef = doc(db, 'projects', projectId, 'stats_realtime', yesterdayStr);
                const yesterdaySnap = await getDoc(yesterdayRef);
                if (yesterdaySnap.exists()) {
                    yesterdayCache.current = yesterdaySnap.data();
                } else {
                    yesterdayCache.current = {};
                }
            }
        };

        fetchYesterday();

        const unsubscribe = onSnapshot(todayRef, (todaySnap) => {
            try {
                const currentNow = new Date();
                let todayData: any = {};
                if (todaySnap.exists()) {
                    todayData = todaySnap.data();
                }

                let yesterdayData = yesterdayCache.current || {};

                const dataPoints: RealtimeDataPoint[] = [];

                for (let i = 59; i >= 0; i--) {
                    const time = currentNow.getTime() - i * 60000;
                    const date = new Date(time);
                    const timeLabel = date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });

                    const hourString = String(date.getUTCHours()).padStart(2, '0');
                    const minuteString = String(date.getUTCMinutes()).padStart(2, '0');
                    const minuteKey = `${hourString}:${minuteString}`;

                    let targetData = todayData;
                    if (date.getUTCDate() !== currentNow.getUTCDate()) {
                        targetData = yesterdayData;
                    }

                    const hrReq = targetData[`${minuteKey}_total_requests`] || 0;
                    const hrApi = targetData[`${minuteKey}_type_api_call`] || 0;
                    const hrSql = targetData[`${minuteKey}_type_sql_execution`] || 0;

                    dataPoints.push({
                        timestamp: time,
                        timeLabel: timeLabel,
                        requests: hrReq, // Absolute count of requests inside this 1-minute bucket
                        api: hrApi,
                        sql: hrSql,
                        deltaRequests: 0, // Delta vs previous minute
                        deltaApi: 0,
                        deltaSql: 0
                    });
                }

                // Now calculate the deltas
                for (let i = 1; i < dataPoints.length; i++) {
                    dataPoints[i].deltaRequests = dataPoints[i].requests - dataPoints[i - 1].requests;
                    dataPoints[i].deltaApi = dataPoints[i].api - dataPoints[i - 1].api;
                    dataPoints[i].deltaSql = dataPoints[i].sql - dataPoints[i - 1].sql;
                }

                setHistory(dataPoints);

            } catch (error) {
                console.warn("Failed to process realtime history snapshot:", error);
            }
        });

        // Setup an interval just to shift the time window forward every minute if no socket events fire
        const timer = setInterval(() => {
            // Forcing a tiny state update could re-trigger the window, 
            // but strictly we can rely on data coming in to push the chart. 
            // To keep the chart moving even when 0 requests come in, we should really force a refresh.
            // We can do this by just calling a manual refresh logic, or fetching inside the snapshot is enough if DB updates.
            // Best to just let it sit if no updates, the snapshot will fire when data arrives.
        }, 60000);

        return () => {
            unsubscribe();
            clearInterval(timer);
        };
    }, [projectId]);

    return history;
}
