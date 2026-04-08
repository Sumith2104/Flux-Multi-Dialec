'use server';

import { getPgPool } from '@/lib/pg';
import { getCurrentUserId } from '@/lib/auth';
import { redis } from '@/lib/redis';

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
            WHERE project_id = $1
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
        } catch (redisErr) {
            console.warn('Error merging Redis in-flight analytics:', redisErr);
        }

        // --- PHASE 3: Fetch Live Sessions ---
        try {
            const liveSessions = await redis.get(`live_sessions:${projectId}`);
            (stats as any).live_sessions = parseInt(liveSessions as string || '0', 10);
        } catch (redisErr) {
            (stats as any).live_sessions = 0;
        }

        try {
            // Increase cache TTL to 30s to match throttle window and reduce Redis writes
            await redis.set(cacheKey, stats, { ex: 30 }); 
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
        const pool = getPgPool();
        
        // Fetch actual last 60 minutes history from postgres rollups table
        const historyQuery = `
            SELECT 
                period_start,
                event_type,
                SUM(count) as total
            FROM fluxbase_global.analytics_rollups
            WHERE project_id = $1 
              AND period_start >= NOW() - INTERVAL '60 minutes'
            GROUP BY period_start, event_type
            ORDER BY period_start ASC
        `;

        const result = await pool.query(historyQuery, [projectId]);

        // Build array of 60 points representing each of the last 60 minutes
        const historyMap = new Map();
        const now = new Date();
        now.setSeconds(0, 0); // Align to the minute

        // Initialize 60 empty buckets
        for (let i = 59; i >= 0; i--) {
            const time = now.getTime() - (i * 60000);
            const date = new Date(time);
            const timeLabel = date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
            historyMap.set(time, { 
                timestamp: time, 
                timeLabel, 
                requests: 0, 
                api: 0, 
                sql: 0, 
                deltaRequests: 0, 
                deltaApi: 0, 
                deltaSql: 0 
            });
        }

        // Fill with real data
        for (const row of result.rows) {
            const rowTime = new Date(row.period_start).getTime();
            const matchingBucket = Array.from(historyMap.keys()).find(k => Math.abs(k - rowTime) < 60000);
            
            if (matchingBucket) {
                const bucket = historyMap.get(matchingBucket);
                const count = parseInt(row.total, 10);
                
                if (row.event_type === 'api_call') {
                    bucket.api += count;
                    bucket.requests += count;
                    bucket.deltaApi += count;
                    bucket.deltaRequests += count;
                }
                if (row.event_type === 'sql_execution') {
                    bucket.sql += count;
                    bucket.requests += count;
                    bucket.deltaSql += count;
                    bucket.deltaRequests += count;
                }
            }
        }

        return Array.from(historyMap.values());
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
        now.setMinutes(0, 0, 0); // Align to current hour

        for (const row of result.rows) {
            const rowTime = new Date(row.period_start).getTime();
            const nowTime = now.getTime();
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

        // --- PHASE 2: Merge "In-Flight" session data from Redis (Unsynced) ---
        try {
            const keys = await redis.keys(`analytics_rollup:${projectId}:*:sessions`);
            if (keys && keys.length > 0) {
                for (const key of keys) {
                    const rowTime = parseInt(key.split(':')[2], 10);
                    const nowTime = now.getTime();
                    const hoursAgo = Math.floor((nowTime - rowTime) / (1000 * 60 * 60));

                    if (hoursAgo >= 0 && hoursAgo < 24) {
                        const index = 23 - hoursAgo;
                        const val = await redis.scard(key);
                        sessionsArr[index] = Math.max(sessionsArr[index], val); // Use max because scard is current state
                    }
                }
            }
        } catch (redisErr) {
            console.warn('Error merging Redis in-flight sessions:', redisErr);
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
