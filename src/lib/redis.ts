import { Redis } from '@upstash/redis'

// Provide dummy fallback for build environments or missing keys
const url = process.env.UPSTASH_REDIS_REST_URL || 'https://dummy.upstash.io'
const token = process.env.UPSTASH_REDIS_REST_TOKEN || 'dummy'

export const redis = new Redis({
    url,
    token,
})
