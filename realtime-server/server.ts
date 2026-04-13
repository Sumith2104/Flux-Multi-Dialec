import WebSocket, { WebSocketServer } from 'ws';
import { Client } from 'pg';
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT || 8080;
const server = http.createServer((req, res) => res.end('Fluxbase Realtime WS Server Active'));
const wss = new WebSocketServer({ server });

// Room System: Mapping roomId (e.g., 'table_123', 'chat_456') to a Set of active WS connections
const rooms = new Map<string, Set<WebSocket>>();

async function setupDatabaseListener() {
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL || process.env.AWS_RDS_POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pgClient.connect();
    console.log('Postgres connection established.');
    
    // Listen to the channel defined in our PG Trigger
    await pgClient.query('LISTEN flux_realtime');

    pgClient.on('notification', (msg) => {
      if (!msg.payload) return;
      try {
        const data = JSON.parse(msg.payload);
        
        const routingId = data.project_id || data.record?.chat_id || data.record?.project_id || data.record?.room_id || 'global';
        const outboundMessage = JSON.stringify({ type: 'db_event', payload: data });

        if (routingId === 'global') {
          console.log(`[Global Broadcast] Schema evolved. Notifying ALL active rooms...`);
          rooms.forEach((clients, roomId) => {
            clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(outboundMessage);
              }
            });
          });
        } else {
          const roomId = `project_${routingId}`;
          console.log(`Broadcasting to room: ${roomId} (Table: ${data.table})`);
          
          const clientsInRoom = rooms.get(roomId);
          if (clientsInRoom) {
            clientsInRoom.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(outboundMessage);
              }
            });
          }
        }
      } catch (e) {
        console.error('Error parsing notification:', e);
      }
    });

    pgClient.on('error', async (err) => {
      console.error('PG Client Error, reconnecting...', err);
      try { await pgClient.end(); } catch (e) {}
      setTimeout(setupDatabaseListener, 5000); // Safely retry with a fresh client
    });
  } catch (err) {
    console.error('Initial PG connection failed, retrying...', err);
    setTimeout(setupDatabaseListener, 5000);
  }
}

setupDatabaseListener();

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

function heartbeat(this: ExtWebSocket) {
  this.isAlive = true;
}

wss.on('connection', (ws: ExtWebSocket) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // Handle Pong from browser clients (message-level)
      if (data.type === 'pong') {
        ws.isAlive = true;
        return;
      }

      if (data.type === 'subscribe' && data.roomId) {
        if (!rooms.has(data.roomId)) {
          rooms.set(data.roomId, new Set());
        }
        rooms.get(data.roomId)!.add(ws);
        ws.send(JSON.stringify({ type: 'subscribed', roomId: data.roomId }));
      }
      
      if (data.type === 'unsubscribe' && data.roomId) {
        const cls = rooms.get(data.roomId);
        if (cls) {
          cls.delete(ws);
          if (cls.size === 0) rooms.delete(data.roomId);
        }
      }
    } catch(e) {
      console.error("Invalid message format", e);
    }
  });

  // O(1) Memory Cleanup on Disconnect
  ws.on('close', () => {
    rooms.forEach((clients, roomId) => {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (clients.size === 0) rooms.delete(roomId);
      }
    });
  });
});

// Heartbeat Interval: Run every 30 seconds
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const extWs = ws as ExtWebSocket;
    if (extWs.isAlive === false) {
      console.log('[Heartbeat] Terminating inactive connection.');
      return ws.terminate();
    }

    extWs.isAlive = false;
    // Native ping for non-browser clients
    ws.ping();
    // Message-level ping for browser hooks
    ws.send(JSON.stringify({ type: 'ping' }));
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

server.listen(port, () => console.log(`WebSocket router active on port ${port}`));
