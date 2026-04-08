'use server';
import { redis } from '@/lib/redis';

// In-memory cache to throttle Redis writes across warm serverless instances
// Key: {projectId}:{userId}, Value: last_tracked_timestamp
const sessionCache = new Map<string, number>();
const THROTTLE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Tracks a unique session for a project. 
 * Uses a Redis SET to store unique user IDs (or IPs if unauthenticated) per hour.
 */
export async function trackSession(projectId: string, userId: string): Promise<void> {
    if (!projectId || !userId) return;

    const cacheKey = `${projectId}:${userId}`;
    const now = Date.now();
    const lastTracked = sessionCache.get(cacheKey);

    // Skip if tracked within the last 10 minutes (Throttling)
    if (lastTracked && (now - lastTracked < THROTTLE_MS)) {
        return;
    }

    try {
        // Update local cache immediately
        sessionCache.set(cacheKey, now);

        // Current hour timestamp (aligned to minute 0, second 0)
        const date = new Date(now);
        date.setMinutes(0, 0, 0);
        const hourTimestamp = date.getTime();

        const analyticsKey = `analytics_rollup:${projectId}:${hourTimestamp}:sessions`;
        const liveKey = `live_sessions:${projectId}`;
        const liveWindowKey = `live_session_member:${projectId}:${userId}`;

        // Use a pipeline to reduce Redis commands to a single round-trip (Network Efficiency)
        const pipe = redis.pipeline();
        
        // 1. Analytics Rollup (Unique user set)
        pipe.sadd(analyticsKey, userId);
        pipe.sadd('analytics_keys_to_flush', analyticsKey);
        pipe.expire(analyticsKey, 172800); // 48 hours

        // 2. Simple Live Presence (Check if already counted in 5m window)
        // We'll use a transaction/script style or just chain them.
        // For simplicity with Upstash pipeline, we check existence separately or just set with condition.
        pipe.get(liveWindowKey);
        
        const results = await pipe.exec();
        const memberExists = results[3]; // Result of 'get liveWindowKey'

        if (!memberExists) {
            const innerPipe = redis.pipeline();
            innerPipe.incr(liveKey);
            innerPipe.set(liveWindowKey, '1', { ex: 300 }); // 5 minutes
            await innerPipe.exec();
        }

        // Cleanup local cache occasionally to prevent memory leaks in long-running containers
        if (sessionCache.size > 10000) {
            const expiryCutoff = now - (THROTTLE_MS * 2);
            for (const [k, v] of sessionCache.entries()) {
                if (v < expiryCutoff) sessionCache.delete(k);
            }
        }

    } catch (error) {
        console.warn('[SessionTracking] Failed to track session:', error);
    }
}
