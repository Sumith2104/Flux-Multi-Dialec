'use server';
import { redis } from '@/lib/redis';

/**
 * Tracks a unique session for a project. 
 * Uses a Redis SET to store unique user IDs (or IPs if unauthenticated) per hour.
 * 
 * Key format: project:{projectId}:sessions:{hour_timestamp}
 */
export async function trackSession(projectId: string, userId: string): Promise<void> {
  if (!projectId || !userId) return;

  try {
    // Current hour timestamp (aligned to minute 0, second 0)
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const hourTimestamp = now.getTime();

    // Format matches flush-analytics: analytics_rollup:{projectId}:{periodStartMs}:{type}
    const key = `analytics_rollup:${projectId}:${hourTimestamp}:sessions`;
    
    // Add user to the set of unique visitors for this hour
    await redis.sadd(key, userId);
    
    // Register this key for flushing if it's new
    await redis.sadd('analytics_keys_to_flush', key);
    
    // Expire the key after 48 hours to save memory
    await redis.expire(key, 172800); 
    
    // Also track a global "live" session count with a shorter window (5 minutes)
    const liveKey = `live_sessions:${projectId}`;
    const liveWindowKey = `live_session_member:${projectId}:${userId}`;
    
    // Check if user is already counted in the current live window
    const exists = await redis.get(liveWindowKey);
    if (!exists) {
        await redis.incr(liveKey);
        await redis.set(liveWindowKey, '1', { ex: 300 }); // 5 minutes
    }

  } catch (error) {
    console.warn('[SessionTracking] Failed to track session:', error);
  }
}
