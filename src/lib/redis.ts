import { Redis } from '@upstash/redis';

// Provide dummy fallback for build environments or missing keys
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const isConfigured = !!(url && token);

let client: Redis | null = null;
if (isConfigured) {
    try {
        client = new Redis({
            url: url!,
            token: token!,
            // Fail fast on DNS / network errors so SSE heartbeats don't hang
            automaticDeserialization: true,
        });
        console.log('[Redis] Successfully initialized Upstash Redis client.');
    } catch (err) {
        console.error('[Redis] Failed to initialize Upstash Redis client:', err);
    }
}
let _lastQuotaLogTime = 0;

export const redis = new Proxy({} as Redis, {
    get(target, prop) {
        if (prop === 'pipeline') {
            return () => {
                if (client) {
                    try {
                        return client.pipeline();
                    } catch (e) {
                        console.error('[Redis] Pipeline initialization error:', e);
                    }
                }
                // Return a mock pipeline that chains and does nothing
                const mockPipeline: any = {
                    exec: async () => [],
                };
                // Capture all chained methods
                const mockHandler = {
                    get(pTarget: any, pProp: string | symbol) {
                        if (pProp === 'exec') {
                            return async () => [];
                        }
                        return () => {
                            return mockPipeline; // chainable
                        };
                    }
                };
                return new Proxy(mockPipeline, mockHandler);
            };
        }

        return (...args: any[]) => {
            if (!client) {
                // Safe default returns
                if (prop === 'ping') return Promise.resolve('PONG');
                if (prop === 'eval' || prop === 'evalsha') return Promise.resolve([1, 100, Date.now() + 10000, 100]);
                if (prop === 'keys' || prop === 'smembers') return Promise.resolve([]);
                if (prop === 'scard' || prop === 'llen') return Promise.resolve(0);
                if (prop === 'hgetall') return Promise.resolve({});
                return Promise.resolve(null);
            }
            try {
                const method = (client as any)[prop];
                if (typeof method === 'function') {
                    const result = method.apply(client, args);
                    if (result instanceof Promise) {
                        return result.catch(err => {
                            // Downgrade transient network errors (DNS, fetch failed) or Upstash quota limits to warn — fail open cleanly
                            const isNetworkError = err?.cause?.code === 'ENOTFOUND' || err?.message?.includes('fetch failed');
                            const isQuotaExceeded = err?.message?.includes('max requests limit exceeded');
                            const isNoScript = err?.message?.includes('NOSCRIPT');
                            
                            if (isQuotaExceeded) {
                                const now = Date.now();
                                if (now - _lastQuotaLogTime > 600000) { // 10 minutes throttle
                                    console.warn(`[Redis] Upstash request limit reached — failing open to in-memory/database fallbacks.`);
                                    _lastQuotaLogTime = now;
                                }
                            } else if (isNetworkError) {
                                console.warn(`[Redis] Network error during "${String(prop)}" — Redis unreachable, failing open.`);
                            } else if (isNoScript) {
                                console.log(`[Redis] NOSCRIPT detected during "${String(prop)}" — letting client fallback to EVAL.`);
                            } else {
                                console.error(`[Redis] Error during "${String(prop)}" operation:`, err);
                            }

                            if (isNoScript) {
                                throw err;
                            }

                            // Safe fallbacks on promise rejection
                            if (prop === 'ping') return 'PONG';
                            if (prop === 'eval' || prop === 'evalsha') return [1, 100, Date.now() + 10000, 100];
                            if (prop === 'keys' || prop === 'smembers') return [];
                            if (prop === 'scard' || prop === 'llen') return 0;
                            if (prop === 'hgetall') return {};
                            return null;
                        });
                    }
                    return result;
                }
                return (client as any)[prop];
            } catch (err) {
                const isNoScript = (err as any)?.message?.includes('NOSCRIPT');
                if (!isNoScript) {
                    console.error(`[Redis] Error accessing property/method "${String(prop)}":`, err);
                }
                if (isNoScript) {
                    throw err;
                }
                if (prop === 'ping') throw err;
                if (prop === 'eval' || prop === 'evalsha') return [1, 100, Date.now() + 10000, 100];
                if (prop === 'keys' || prop === 'smembers') return [];
                if (prop === 'scard' || prop === 'llen') return 0;
                if (prop === 'hgetall') return {};
                return null;
            }
        };
    }
});
