'use server';

import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { getDashboardWidgets } from '@/lib/dashboards';

export async function getAnalyticsStatsAction(projectId: string) {
    const userId = await getCurrentUserId();
    if (!userId || !projectId) return null;

    const cacheKey = `analytics_stats_${projectId}`;
    try {
        const cached = await redis.get(cacheKey) as any;
        if (cached) return cached;
    } catch (e) {
        console.warn('Redis read error for analytics stats:', e);
    }

    try {
        const pool = getPgPool();
        // Sum up all rollups for this project. We skip tracking to avoid recursive analytics spikes.
        const result = await pool.query(`
            SELECT event_type, SUM(count) as total
            FROM fluxbase_global.analytics_rollups
            WHERE project_id = $1 AND period_start >= NOW() - INTERVAL '24 hours'
            GROUP BY event_type
        `, [projectId]);

        const stats = {
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
        };

        for (const row of result.rows) {
            const type = row.event_type;
            const count = parseInt(row.total);
            
            if (type === 'api_call' || type === 'sql_execution') {
                stats.total_requests += count;
            }

            if (type === 'api_call') stats.type_api_call = count;
            if (type === 'sql_execution') stats.type_sql_execution = count;
            if (type === 'storage_read') stats.type_storage_read = count;
            if (type === 'storage_write') stats.type_storage_write = count;
            if (type === 'sql_select') stats.type_sql_select = count;
            if (type === 'sql_insert') stats.type_sql_insert = count;
            if (type === 'sql_update') stats.type_sql_update = count;
            if (type === 'sql_delete') stats.type_sql_delete = count;
            if (type === 'sql_alter') stats.type_sql_alter = count;
        }

        // --- PHASE 2: Merge "In-Flight" data from Redis (Unsynced) ---
        try {
            // Efficiency-Fix: Replace expensive O(N) 'redis.keys' with O(K) 'smembers' lookup from our dedicated flush set.
            const allFlushKeys = await redis.smembers('analytics_keys_to_flush');
            const projectKeys = (allFlushKeys || []).filter(k => k.startsWith(`analytics_rollup:${projectId}:`));
            
            if (projectKeys.length > 0) {
                const values = await redis.mget(...projectKeys);
                for (let i = 0; i < projectKeys.length; i++) {
                    const key = projectKeys[i];
                    const val = parseInt(values[i] as string || '0', 10);
                    const type = key.split(':')[3];

                    if (type === 'api_call' || type === 'sql_execution') stats.total_requests += val;
                    if (type === 'api_call') stats.type_api_call += val;
                    if (type === 'sql_execution') stats.type_sql_execution += val;
                    if (type === 'storage_read') stats.type_storage_read += val;
                    if (type === 'storage_write') stats.type_storage_write += val;
                    if (type?.startsWith('sql_')) {
                        const sqlAction = `type_${type}` as keyof typeof stats;
                        if (stats[sqlAction] !== undefined) (stats as any)[sqlAction] += val;
                    }
                }
            }
        } catch {
            console.warn('Error merging Redis in-flight analytics');
        }

        // --- PHASE 3: Fetch Live Sessions ---
        try {
            const realtimeManager = (await import('@/lib/realtime-manager')).default;
            const activeLocal = realtimeManager.getSubscriberCount(projectId);
            const liveSessions = await redis.get(`live_sessions:${projectId}`);
            const redisVal = parseInt(liveSessions as string || '0', 10);
            (stats as any).live_sessions = Math.max(1, activeLocal, redisVal);
        } catch {
            (stats as any).live_sessions = 1;
        }

        try {
            // 3s TTL for crisp live dashboard updating without excessive Redis writes
            await redis.set(cacheKey, stats, { ex: 3 }); 
        } catch (e) {
            console.warn('Redis write error for analytics stats:', e);
        }

        return stats;
    } catch (e) {
        console.error('getAnalyticsStatsAction error:', e);
        return null;
    }
}

export async function getRealtimeHistoryAction(projectId: string) {
    if (!projectId) return [];
    try {
        const now = Date.now();
        const currentMinute = Math.floor(now / 60000) * 60000;
        
        const historyPoints: {
            timestamp: number;
            timeLabel: string;
            requests: number;
            api: number;
            sql: number;
            deltaRequests: number;
            deltaApi: number;
            deltaSql: number;
        }[] = [];

        const minuteKeysToFetch: string[] = [];
        const minutesList: number[] = [];

        for (let i = 59; i >= 0; i--) {
            const time = currentMinute - (i * 60000);
            minutesList.push(time);
            minuteKeysToFetch.push(
                `analytics_minute:${projectId}:${time}:api_call`,
                `analytics_minute:${projectId}:${time}:sql_execution`
            );
        }

        let redisValues: (string | null)[] = [];
        try {
            if (minuteKeysToFetch.length > 0) {
                redisValues = await redis.mget(...minuteKeysToFetch);
            }
        } catch (e) {
            console.warn('Redis mget error in getRealtimeHistoryAction:', e);
        }

        // Also query PostgreSQL rollups for the past 60 min to ensure durability across restarts
        const pool = getPgPool();
        let pgRows: any[] = [];
        try {
            const pgRes = await pool.query(`
                SELECT period_start, event_type, SUM(count) as total
                FROM fluxbase_global.analytics_rollups
                WHERE project_id = $1 AND period_start >= NOW() - INTERVAL '60 minutes'
                GROUP BY period_start, event_type
            `, [projectId]);
            pgRows = pgRes.rows || [];
        } catch {}

        for (let i = 0; i < minutesList.length; i++) {
            const time = minutesList[i];
            const date = new Date(time);
            const timeLabel = date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });

            let apiVal = parseInt((redisValues[i * 2] as string) || '0', 10);
            let sqlVal = parseInt((redisValues[i * 2 + 1] as string) || '0', 10);

            // If minute has no redis in-flight, check if postgres rollup had it
            if (apiVal === 0 && sqlVal === 0 && pgRows.length > 0) {
                for (const row of pgRows) {
                    const rowTime = new Date(row.period_start).getTime();
                    if (Math.abs(rowTime - time) < 60000) {
                        const count = parseInt(row.total, 10) || 0;
                        if (row.event_type === 'api_call') apiVal += count;
                        if (row.event_type === 'sql_execution') sqlVal += count;
                    }
                }
            }

            const totalVal = apiVal + sqlVal;

            historyPoints.push({
                timestamp: time,
                timeLabel,
                requests: totalVal,
                api: apiVal,
                sql: sqlVal,
                deltaRequests: totalVal,
                deltaApi: apiVal,
                deltaSql: sqlVal
            });
        }

        return historyPoints;
    } catch (e) {
        console.error('getRealtimeHistoryAction error:', e);
        return [];
    }
}

export async function getProjectHistoryAction(projectId: string) {
    if (!projectId) return null;

    const cacheKey = `project_history_${projectId}`;
    try {
        const cached = await redis.get(cacheKey) as any;
        if (cached) return cached;
    } catch (e) {
        console.warn('Redis read error for project history:', e);
    }

    try {
        const pool = getPgPool();
        const stats = await getAnalyticsStatsAction(projectId);

        // Fetch genuine 24-hour history from rollups table
        const historyQuery = `
            SELECT 
                period_start,
                event_type,
                SUM(count) as total
            FROM fluxbase_global.analytics_rollups
            WHERE project_id = $1 
              AND period_start >= NOW() - INTERVAL '24 hours'
            GROUP BY period_start, event_type
            ORDER BY period_start ASC
        `;

        const result = await pool.query(historyQuery, [projectId]);

        // Initialize 24 hourly buckets
        const requestsArr = Array(24).fill(0);
        const apiCallsArr = Array(24).fill(0);
        const sessionsArr = Array(24).fill(0);

        const now = new Date();
        // Remove truncating to keep a smooth 24-hour rolling window
        const nowTime = now.getTime();

        for (const row of result.rows) {
            const rowTime = new Date(row.period_start).getTime();
            const hoursAgo = Math.floor((nowTime - rowTime) / (1000 * 60 * 60));

            if (hoursAgo >= 0 && hoursAgo < 24) {
                const index = 23 - hoursAgo; // 23 is the current hour, 0 is 24 hours ago
                const count = parseInt(row.total, 10);

                // Total Requests: Sum of API Calls and SQL Executions
                if (row.event_type === 'api_call' || row.event_type === 'sql_execution') {
                    requestsArr[index] += count;
                }

                // API Calls: ONLY api_call events
                if (row.event_type === 'api_call') {
                    apiCallsArr[index] += count;
                }

                // Real Sessions from rollups table
                if (row.event_type === 'sessions') {
                    sessionsArr[index] += count;
                }
            }
        }

        // --- PHASE 2: Merge "In-Flight" data from Redis (Unsynced) ---
        try {
            const allFlushKeys = await redis.smembers('analytics_keys_to_flush');
            const projectKeys = (allFlushKeys || []).filter(k => k.startsWith(`analytics_rollup:${projectId}:`));
            
            if (projectKeys.length > 0) {
                const values = await redis.mget(...projectKeys);
                for (let i = 0; i < projectKeys.length; i++) {
                    const key = projectKeys[i];
                    const val = parseInt(values[i] as string || '0', 10);
                    const rowTime = parseInt(key.split(':')[2], 10);
                    const type = key.split(':')[3];
                    
                    const hoursAgo = Math.floor((nowTime - rowTime) / (1000 * 60 * 60));

                    if (hoursAgo >= 0 && hoursAgo < 24) {
                        const index = 23 - hoursAgo;
                        
                        if (type === 'api_call' || type === 'sql_execution') {
                            requestsArr[index] += val;
                        }
                        if (type === 'api_call') {
                            apiCallsArr[index] += val;
                        }
                    }
                }
            }

            // Also check current active sessions key (not part of the flush keys)
            const sessionKeys = await redis.keys(`analytics_rollup:${projectId}:*:sessions`);
            if (sessionKeys && sessionKeys.length > 0) {
                for (const key of sessionKeys) {
                    const rowTime = parseInt(key.split(':')[2], 10);
                    const hoursAgo = Math.floor((nowTime - rowTime) / (1000 * 60 * 60));

                    if (hoursAgo >= 0 && hoursAgo < 24) {
                        const index = 23 - hoursAgo;
                        const val = await redis.scard(key);
                        sessionsArr[index] = Math.max(sessionsArr[index], val);
                    }
                }
            }
        } catch {
            console.warn('Error merging Redis in-flight analytics for history');
        }

        // Ensure current hour index (23) reflects active live session and request counts
        sessionsArr[23] = Math.max(1, sessionsArr[23]);
        if (stats?.total_requests) {
            requestsArr[23] = Math.max(stats.total_requests, requestsArr[23]);
        }
        if (stats?.type_api_call) {
            apiCallsArr[23] = Math.max(stats.type_api_call, apiCallsArr[23]);
        }

        const payload = {
            daily: { 'today': stats?.total_requests || 0 },
            monthly: {},
            yearly: {},
            requests: requestsArr.map(val => ({ val })),
            apiCalls: apiCallsArr.map(val => ({ val })),
            sessions: sessionsArr.map(val => ({ val }))
        };

        try {
            await redis.set(cacheKey, payload, { ex: 300 });
        } catch (e) {
            console.warn('Redis write error for project history:', e);
        }

        return payload;
    } catch (e) {
        console.error('getProjectHistoryAction error:', e);
        return {
            daily: {}, monthly: {}, yearly: {},
            requests: Array(24).fill({ val: 0 }),
            apiCalls: Array(24).fill({ val: 0 })
        };
    }
}

export async function getDashboardWidgetsAction(projectId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");
    return await getDashboardWidgets(projectId, userId);
}

