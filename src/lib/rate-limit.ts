import { redis } from './redis';

export interface RateLimitResult {
    success: boolean;
    limit: number;
    remaining: number;
    resetMs: number;
}

// In-memory fallback tracking when Redis is unconfigured
const memoryStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Sliding-window rate limiter per tenant/IP to prevent noisy neighbor resource starvation.
 */
export async function checkRateLimit(
    identifier: string, 
    limit = 100, 
    windowSeconds = 60
): Promise<RateLimitResult> {
    const key = `rate_limit:${identifier}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    try {
        // Attempt Redis sliding window tracking
        const currentCount = await redis.incr(key);
        if (currentCount === 1) {
            await redis.expire(key, windowSeconds);
        }

        const remaining = Math.max(0, limit - currentCount);
        const success = currentCount <= limit;

        return {
            success,
            limit,
            remaining,
            resetMs: windowMs
        };
    } catch {
        // Fallback to in-memory store if Redis is unavailable
        const record = memoryStore.get(key);
        if (!record || now > record.resetTime) {
            memoryStore.set(key, { count: 1, resetTime: now + windowMs });
            return { success: true, limit, remaining: limit - 1, resetMs: windowMs };
        }

        record.count += 1;
        const remaining = Math.max(0, limit - record.count);
        return {
            success: record.count <= limit,
            limit,
            remaining,
            resetMs: record.resetTime - now
        };
    }
}
