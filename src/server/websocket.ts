import { config } from 'dotenv';
config({ path: '.env.local' });

import { WebSocketServer, WebSocket } from 'ws';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import http from 'http';
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL || 'https://dummy.upstash.io';
const token = process.env.UPSTASH_REDIS_REST_TOKEN || 'dummy';
const redis = new Redis({ url, token });

const JWT_SECRET = process.env.JWT_SECRET || 'fluxbase_dev_secret_key_123';
const PORT = parseInt(process.env.WS_PORT || '4000', 10);
const wss = new WebSocketServer({ port: PORT });
console.log(`[WS] Server starting on port ${PORT}...`);
const clients = new Map<string, Set<WebSocket>>();
const userConnectionCounts = new Map<string, number>();

if (!process.env.AWS_RDS_POSTGRES_URL) {
    throw new Error('Missing AWS_RDS_POSTGRES_URL');
}

const pool = new Pool({
    connectionString: process.env.AWS_RDS_POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

// Broadcast helper
function broadcastToSubscribers(payload: any) {
    // payload structure from Postgres: { table, project_id, operation, data }
    const channelId = `${payload.project_id}:${payload.table}`;
    const subs = clients.get(channelId);

    // Also broadcast to users subscribing to wildcard '*' for the whole project
    const wildcardSubs = clients.get(`${payload.project_id}:*`);

    const allSubs = new Set<WebSocket>([
        ...(subs || []),
        ...(wildcardSubs || [])
    ]);

    if (allSubs.size === 0) return;

    const message = JSON.stringify({ type: 'update', ...payload });
    for (const ws of allSubs) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    }
}

// PostgreSQL Listener
async function setupPgListener() {
    const pgClient = await pool.connect();
    await pgClient.query('LISTEN fluxbase_changes');
    await pgClient.query('LISTEN fluxbase_live');

    pgClient.on('notification', (msg) => {
        try {
            if (msg.payload) {
                const payload = JSON.parse(msg.payload);
                
                if (msg.channel === 'fluxbase_changes') {
                    broadcastToSubscribers(payload);
                } else if (msg.channel === 'fluxbase_live') {
                    // Broadcast to project wildcard listeners
                    const projectId = payload.project_id;
                    if (projectId) {
                        const wildcardSubs = clients.get(`${projectId}:*`);
                        if (wildcardSubs) {
                            const message = JSON.stringify({ type: 'live', ...payload });
                            for (const ws of wildcardSubs) {
                                if (ws.readyState === WebSocket.OPEN) {
                                    ws.send(message);
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing pg_notify payload:', e);
        }
    });

    console.log('PostgreSQL realtime listener active on "fluxbase_changes" and "fluxbase_live"');
}
setupPgListener().catch(console.error);

// Auth helper — supports session cookies (browser) AND API keys (external clients)
async function authenticateRequest(req: http.IncomingMessage): Promise<{ userId: string; allowedProjectId?: string } | null> {
    // 1. Try session cookie first (browser clients)
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookieStr) => {
            const [key, ...rest] = cookieStr.trim().split('=');
            acc[key] = rest.join('=');
            return acc;
        }, {} as Record<string, string>);

        const session = cookies['session'];
        if (session) {
            try {
                const decoded = jwt.verify(session, JWT_SECRET) as { uid: string };
                return { userId: decoded.uid };
            } catch (e) {
                // Invalid cookie — fall through to API key check
            }
        }
    }

    // 2. Try API key from query string (?token=...) or Sec-WebSocket-Protocol header
    //    External WS clients cannot set Authorization headers during the upgrade,
    //    so the token query param is the standard approach.
    let apiKey = '';
    const reqUrl = req.url || '';
    const qIndex = reqUrl.indexOf('?');
    if (qIndex !== -1) {
        const params = new URLSearchParams(reqUrl.slice(qIndex + 1));
        apiKey = params.get('token') || '';
    }

    if (!apiKey) {
        // Some clients pass the token as the WebSocket sub-protocol
        const proto = req.headers['sec-websocket-protocol'];
        if (proto && proto.startsWith('token.')) {
            apiKey = proto.slice(6);
        }
    }

    if (apiKey) {
        // 2a. Try verifying as a short-lived JWT ticket first
        try {
            const decoded = jwt.verify(apiKey, JWT_SECRET) as any;
            if (decoded && decoded.uid) {
                return { userId: decoded.uid };
            }
        } catch (e) {
            // Not a valid JWT or expired — fall through to API key lookup
        }

        // 2b. Try looking up as a persistent API key
        try {
            const res = await pool.query(
                `SELECT ak.user_id, ak.project_id 
                 FROM fluxbase_global.api_keys ak 
                 WHERE ak.key_value = $1 AND ak.is_active = true`,
                [apiKey]
            );
            if (res.rows.length > 0) {
                return {
                    userId: res.rows[0].user_id,
                    allowedProjectId: res.rows[0].project_id || undefined,
                };
            }
        } catch (e) {
            console.error('[WS] API key validation error:', e);
        }
    }

    return null;
}

async function verifyProjectAccess(userId: string, projectId: string, allowedProjectId?: string): Promise<boolean> {
    // API key restriction: key is scoped to a specific project
    if (allowedProjectId && allowedProjectId !== projectId) {
        return false;
    }

    const res = await pool.query(`
        SELECT p.project_id 
        FROM fluxbase_global.projects p
        LEFT JOIN fluxbase_global.project_members pm ON p.project_id = pm.project_id AND pm.user_id = $1
        WHERE p.project_id = $2 AND (p.user_id = $1 OR pm.user_id = $1)
    `, [userId, projectId]);

    return res.rows.length > 0;
}

// WebSocket Connection Handler
wss.on('connection', async (ws, req) => {
    const auth = await authenticateRequest(req);

    if (!auth) {
        ws.close(1008, 'Unauthorized — provide a valid session cookie or ?token=<api_key>');
        return;
    }

    const { userId, allowedProjectId } = auth;

    // Rate Limiting (Phase 3 Gatekeeping)
    const userRes = await pool.query('SELECT plan_type FROM fluxbase_global.users WHERE id = $1', [userId]);
    const planType = userRes.rows[0]?.plan_type || 'free';

    let maxConnections = 100;
    if (planType === 'pro') maxConnections = 500;
    if (planType === 'max') maxConnections = 5000;

    const currentConns = userConnectionCounts.get(userId) || 0;
    if (currentConns >= maxConnections) {
        ws.close(1008, `Rate Limit Exceeded. Your ${planType.toUpperCase()} plan only allows ${maxConnections} concurrent WebSocket connections.`);
        return;
    }

    userConnectionCounts.set(userId, currentConns + 1);

    // Keep track of what this socket subscribed to for cleanup
    const userSubscriptions = new Set<string>();

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'subscribe') {
                const { projectId, tableId } = data;
                if (!projectId || !tableId) return;

                const hasAccess = await verifyProjectAccess(userId, projectId, allowedProjectId);
                if (!hasAccess) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Access denied to project' }));
                    return;
                }

                const channelId = `${projectId}:${tableId}`;

                if (!clients.has(channelId)) {
                    clients.set(channelId, new Set());
                }
                clients.get(channelId)!.add(ws);
                userSubscriptions.add(channelId);
                
                // Track this active session in Redis
                await redis.incr(`live_sessions:${projectId}`).catch(() => {});

                console.log(`[WS] Client subscribed to ${channelId}`);
                ws.send(JSON.stringify({ type: 'subscribed', channel: channelId }));
            }

            if (data.type === 'unsubscribe') {
                const { projectId, tableId } = data;
                const channelId = `${projectId}:${tableId}`;
                if (clients.has(channelId)) {
                    clients.get(channelId)!.delete(ws);
                }
                userSubscriptions.delete(channelId);
                
                // Untrack this session in Redis
                await redis.decr(`live_sessions:${projectId}`).catch(() => {});
                
                console.log(`[WS] Client unsubscribed from ${channelId}`);
            }

        } catch (e) {
            console.error('WebSocket message error:', e);
        }
    });

    ws.on('close', () => {
        // Decrease connection count
        const currentConns = userConnectionCounts.get(userId) || 1;
        userConnectionCounts.set(userId, Math.max(0, currentConns - 1));

        for (const channelId of userSubscriptions) {
            if (clients.has(channelId)) {
                clients.get(channelId)!.delete(ws);
            }
            // Extract projectId from channelId (format: projectId:tableId)
            const projId = channelId.split(':')[0];
            if (projId) {
                redis.decr(`live_sessions:${projId}`).catch(() => {});
            }
        }
    });
});

console.log('WebSocket Realtime Server running on ws://localhost:4000');
