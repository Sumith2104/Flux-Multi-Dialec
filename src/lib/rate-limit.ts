import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100; // per window
const WRITE_MAX_REQUESTS = 30; // for mutating endpoints
const LOGIN_MAX_REQUESTS = 5; // for auth endpoints

// Per-IP rate limiter
const ipLimiter = new RateLimiterMemory({
  points: DEFAULT_MAX_REQUESTS,
  duration: RATE_LIMIT_WINDOW_MS / 1000,
  blockDuration: 60, // block for 60s after exceeding
});

// Per-API-key rate limiter
const apiKeyLimiter = new RateLimiterMemory({
  points: 200,
  duration: RATE_LIMIT_WINDOW_MS / 1000,
  blockDuration: 60,
});

// Login rate limiter (stricter)
const loginLimiter = new RateLimiterMemory({
  points: LOGIN_MAX_REQUESTS,
  duration: 300, // 5 minute window
  blockDuration: 900, // block for 15 minutes
});

// Write endpoint rate limiter
const writeLimiter = new RateLimiterMemory({
  points: WRITE_MAX_REQUESTS,
  duration: RATE_LIMIT_WINDOW_MS / 1000,
  blockDuration: 60,
});

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

/**
 * Check rate limit for a regular request by IP.
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  try {
    const result = await ipLimiter.consume(ip);
    return { allowed: true, remaining: result.remainingPoints };
  } catch (err: any) {
    const res = err as RateLimiterRes;
    return { allowed: false, remaining: 0, retryAfterMs: res.msBeforeNext };
  }
}

/**
 * Check rate limit for an API key.
 */
export async function checkApiKeyRateLimit(apiKeyId: string): Promise<RateLimitResult> {
  try {
    const result = await apiKeyLimiter.consume(apiKeyId);
    return { allowed: true, remaining: result.remainingPoints };
  } catch (err: any) {
    const res = err as RateLimiterRes;
    return { allowed: false, remaining: 0, retryAfterMs: res.msBeforeNext };
  }
}

/**
 * Check rate limit for login/auth endpoints.
 */
export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  try {
    const result = await loginLimiter.consume(ip);
    return { allowed: true, remaining: result.remainingPoints };
  } catch (err: any) {
    const res = err as RateLimiterRes;
    return { allowed: false, remaining: 0, retryAfterMs: res.msBeforeNext };
  }
}

/**
 * Check rate limit for write endpoints (INSERT/UPDATE/DELETE).
 */
export async function checkWriteRateLimit(ip: string): Promise<RateLimitResult> {
  try {
    const result = await writeLimiter.consume(ip);
    return { allowed: true, remaining: result.remainingPoints };
  } catch (err: any) {
    const res = err as RateLimiterRes;
    return { allowed: false, remaining: 0, retryAfterMs: res.msBeforeNext };
  }
}

/**
 * Build standard rate limit response headers.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': String(result.remaining),
  };
  if (result.retryAfterMs) {
    headers['Retry-After'] = String(Math.ceil(result.retryAfterMs / 1000));
  }
  return headers;
}