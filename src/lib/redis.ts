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
        });
        console.log('[Redis] Successfully initialized Upstash Redis client.');
    } catch (err) {
        console.error('[Redis] Failed to initialize Upstash Redis client:', err);
    }
} else {
    console.warn('[Redis] Warning: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing in production. Redis is disabled.');
}

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
                        return (...args: any[]) => {
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
                            console.error(`[Redis] Error during "${String(prop)}" operation:`, err);
                            // Safe fallbacks on promise rejection
                            if (prop === 'ping') throw err;
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
                console.error(`[Redis] Error accessing property/method "${String(prop)}":`, err);
                if (prop === 'ping') throw err;
                if (prop === 'keys' || prop === 'smembers') return [];
                if (prop === 'scard' || prop === 'llen') return 0;
                if (prop === 'hgetall') return {};
                return null;
            }
        };
    }
});
