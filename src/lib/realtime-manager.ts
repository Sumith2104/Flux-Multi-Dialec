import { EventEmitter } from 'events';
import { getPgPool } from './pg';

/**
 * RealtimeManager: A singleton for multiplexing PostgreSQL LISTEN/NOTIFY events.
 * 
 * Instead of every user taking a dedicated DB connection for SSE, we maintain
 * exactly ONE connection for the entire application and use an EventEmitter
 * to broadcast changes to all active SSE streams.
 */
class RealtimeManager extends EventEmitter {
    private client: any = null;
    private isConnecting = false;
    private retryCount = 0;
    private maxRetries = 15; // Increased to handle long outages
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private lastLogError: string | null = null;
    private lastLogTime = 0;

    constructor() {
        super();
        this.setMaxListeners(0);
        this.init();
    }

    public async destroy() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.client) {
            try { this.client.release(); } catch (e) {}
            this.client = null;
        }
        this.removeAllListeners();
        console.log('[RealtimeManager] 🛑 Instance Destroyed.');
    }

    private async init() {
        if (this.isConnecting || this.client) return;
        this.isConnecting = true;

        try {
            // Only log initialization once every 5 minutes to keep terminal clean if it loops
            const now = Date.now();
            if (now - this.lastLogTime > 300000) {
                console.log('[RealtimeManager] Initializing Global Database Listener...');
                this.lastLogTime = now;
            }

            const pool = getPgPool();
            
            // Watchdog Timeout: Guaranteed failure in 5s if the network hangs
            this.client = await Promise.race([
                pool.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection terminated due to connection timeout')), 5000))
            ]);

            this.client.on('notification', (msg: any) => {
                try {
                    const payload = JSON.parse(msg.payload);
                    let projectId = payload.project_id;
                    if (projectId) {
                        if (projectId.startsWith('project_')) {
                            projectId = projectId.substring(8);
                        }
                        this.emit(`project:${projectId}`, msg.payload);
                    }
                } catch (e) {
                    console.error('[RealtimeManager] Notification parse error:', e);
                }
            });

            this.client.on('error', (err: any) => {
                const errMsg = err.message || String(err);
                if (errMsg !== this.lastLogError) {
                    console.error('[RealtimeManager] Database Listener Error:', err);
                    this.lastLogError = errMsg;
                }
                this.reconnect();
            });

            await this.client.query('LISTEN flux_realtime');
            
            console.log('[RealtimeManager] ✅ Global Listener Active (Listening on "flux_realtime")');

            this.isConnecting = false;
            this.retryCount = 0;
            this.lastLogError = null;
        } catch (err: any) {
            this.isConnecting = false;
            const errMsg = err.message || String(err);
            
            // Suppress duplicate noisy terminal logs for DNS failures
            if (err.code === 'ENOTFOUND' || errMsg.includes('connection timeout')) {
                if (errMsg !== this.lastLogError) {
                    console.warn(`[RealtimeManager] ⚠️ Host unreachable. Will retry with backoff.`);
                    this.lastLogError = errMsg;
                }
            } else {
                console.error('[RealtimeManager] 🛑 Initialization Failed:', err);
            }
            
            this.reconnect();
        }
    }

    private reconnect() {
        if (this.reconnectTimeout) return; // Already scheduled

        if (this.client) {
            try { this.client.release(); } catch (e) {}
            this.client = null;
        }

        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            // Rapid retry for the first 3, then exponential backoff up to 1 minute
            const delay = this.retryCount <= 3 
                ? 2000 
                : Math.min(2000 * Math.pow(2, this.retryCount - 3), 60000);

            this.reconnectTimeout = setTimeout(() => {
                this.reconnectTimeout = null;
                this.init();
            }, delay);
        } else {
            console.error('[RealtimeManager] Maximum reconnection attempts reached.');
        }
    }

    public subscribe(projectId: string, callback: (payload: string) => void) {
        const eventName = `project:${projectId}`;
        this.on(eventName, callback);

        const count = this.listenerCount(eventName);
        if (count === 1 || count % 5 === 0) {
            console.log(`[Realtime] ⚡ +1 Subscriber. Total for ${projectId}: ${count}`);
        }

        return () => {
            this.off(eventName, callback);
            const remaining = this.listenerCount(eventName);
            if (remaining === 0 || remaining % 5 === 0) {
                console.log(`[Realtime] ☁️ -1 Subscriber. Remaining for ${projectId}: ${remaining}`);
            }
        };
    }
}

// Next.js Global Singleton Pattern (prevents multiple listeners during HMR)
const globalWithRealtime = globalThis as typeof globalThis & {
    realtimeManager: RealtimeManager | undefined;
};

// CRITICAL FIX: Properly destroy the old instance during HMR to stop its reconnection timers.
if (process.env.NODE_ENV !== 'production' && globalWithRealtime.realtimeManager) {
    console.log('[RealtimeManager] HMR: Refreshing Global Singleton...');
    try {
        globalWithRealtime.realtimeManager.destroy(); // <--- STOP OLD INSTANCE TIMERS
    } catch (e) {}
    globalWithRealtime.realtimeManager = undefined;
}

const realtimeManager = globalWithRealtime.realtimeManager || new RealtimeManager();

if (process.env.NODE_ENV !== 'production') {
    globalWithRealtime.realtimeManager = realtimeManager;
}

export default realtimeManager;
