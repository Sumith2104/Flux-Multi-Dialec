import { config } from 'dotenv';
config({ path: '.env.local' });

import { WebSocketServer, WebSocket } from 'ws';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import http from 'http';

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

    pgClient.on('notification', (msg) => {
        try {
            if (msg.payload) {
                const payload = JSON.parse(msg.payload);
                broadcastToSubscribers(payload);
            }
        } catch (e) {
            console.error('Error parsing pg_notify payload:', e);
        }
    });

    console.log('PostgreSQL realtime listener active on "fluxbase_changes"');
}
setupPgListener().catch(console.error);

// Auth helper
function authenticate(req: http.IncomingMessage): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';').reduce((acc, cookieStr) => {
        const [key, value] = cookieStr.trim().split('=');
        acc[key] = value;
        return acc;
    }, {} as Record<string, string>);

    const session = cookies['session'];
    if (!session) return null;

    try {
        const decoded = jwt.verify(session, JWT_SECRET) as { uid: string };
        return decoded.uid;
    } catch (e) {
        return null;
    }
}

async function verifyProjectAccess(userId: string, projectId: string): Promise<boolean> {
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
    const userId = authenticate(req);

    if (!userId) {
        ws.close(1008, 'Unauthorized - Missing or invalid session cookie');
        return;
    }

    // Rate Limiting (Phase 3 Gatekeeping)
    const userRes = await pool.query('SELECT plan_type FROM fluxbase_global.users WHERE user_id = $1', [userId]);
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

                const hasAccess = await verifyProjectAccess(userId, projectId);
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
        }
    });
});

console.log('WebSocket Realtime Server running on ws://localhost:4000');
