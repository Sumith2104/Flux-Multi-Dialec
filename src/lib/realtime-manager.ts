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
    private maxRetries = 10;

    constructor() {
        super();
        this.setMaxListeners(0); // Allow infinite subscribers to prevent memory leak crashes
        this.init();
    }

    private async init() {
        if (this.isConnecting || this.client) return;
        this.isConnecting = true;

        try {
            console.log('[RealtimeManager] Initializing Global Database Listener...');
            const pool = getPgPool();
            this.client = await pool.connect();

            // Set up listeners for the shared connection
            this.client.on('notification', (msg: any) => {
                try {
                    const payload = JSON.parse(msg.payload);
                    let projectId = payload.project_id;
                    if (projectId) {
                        // Normalize database triggers which append 'project_' prefix to internal schema events
                        if (projectId.startsWith('project_')) {
                            projectId = projectId.substring(8);
                        }
                        
                        // Broadcast to everyone listening for this specific project
                        this.emit(`project:${projectId}`, msg.payload);
                    }
                } catch (e) {
                    console.error('[RealtimeManager] Notification parse error:', e);
                }
            });

            this.client.on('error', (err: any) => {
                console.error('[RealtimeManager] Database Listener Error:', err);
                this.reconnect();
            });

            // Start listening for common channels
            await this.client.query('LISTEN fluxbase_changes');
            await this.client.query('LISTEN fluxbase_live');
            
            console.log('[RealtimeManager] ✅ Global Listener Active (Listening on "fluxbase_changes", "fluxbase_live")');
            this.isConnecting = false;
            this.retryCount = 0;
        } catch (err) {
            console.error('[RealtimeManager] 🛑 Initialization Failed:', err);
            this.isConnecting = false;
            this.reconnect();
        }
    }

    private reconnect() {
        if (this.client) {
            try { this.client.release(); } catch (e) {}
            this.client = null;
        }

        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000); // Exponential backoff
            console.log(`[RealtimeManager] Reconnecting in ${delay}ms (Attempt ${this.retryCount})...`);
            setTimeout(() => this.init(), delay);
        } else {
            console.error('[RealtimeManager] Maximum reconnection attempts reached.');
        }
    }

    /**
     * Subscribe to changes for a specific project.
     * @param projectId The project ID to monitor
     * @param callback Function to call when a change occurs
     * @returns Unsubscribe function
     */
    public subscribe(projectId: string, callback: (payload: string) => void) {
        const eventName = `project:${projectId}`;
        this.on(eventName, callback);

        const count = this.listenerCount(eventName);
        console.log(`[Realtime] ⚡ +1 Subscriber. Total for ${projectId}: ${count}`);

        return () => {
            this.off(eventName, callback);
            const remaining = this.listenerCount(eventName);
            console.log(`[Realtime] ☁️ -1 Subscriber. Remaining for ${projectId}: ${remaining}`);
        };
    }
}

// Next.js Global Singleton Pattern (prevents multiple listeners during HMR)
const globalWithRealtime = global as typeof globalThis & {
    realtimeManager: RealtimeManager;
};

const realtimeManager = globalWithRealtime.realtimeManager || new RealtimeManager();

if (process.env.NODE_ENV !== 'production') {
    globalWithRealtime.realtimeManager = realtimeManager;
}

export default realtimeManager;
