import { Redis } from '@upstash/redis'

// Provide dummy fallback for build environments or missing keys
const url = process.env.UPSTASH_REDIS_REST_URL || (() => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required UPSTASH_REDIS_REST_URL environment variable');
    }
    return 'https://dummy.upstash.io';
})();
const token = process.env.UPSTASH_REDIS_REST_TOKEN || (() => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required UPSTASH_REDIS_REST_TOKEN environment variable');
    }
    return 'dummy';
})();

export const redis = new Redis({
    url,
    token,
})
