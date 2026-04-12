'use client';
import { useEffect, useRef, useState } from 'react';

// The Render deployment WebSocket URL. You can store this in your Next.js .env.local 
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

export function useWebSocketSubscription(roomId: string) {
  const [lastEvent, setLastEvent] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const retryTimeout = useRef<any>(null);

  useEffect(() => {
    if (!roomId) return;

    function connect() {
      // Bypassing Vercel completely => hitting Render Node sidecar natively via TCP sockets
      ws.current = new WebSocket(WS_URL);

      ws.current.onopen = () => {
        setIsConnected(true);
        console.log(`Connected to Render WS. Subscribing to room: ${roomId}`);
        // Notify the node server which room (chat_id, project_id) we care about
        ws.current?.send(JSON.stringify({ type: 'subscribe', roomId }));
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          if (data.type === 'db_event') {
            setLastEvent(data.payload);
          }
        } catch(e) {
          console.error("WS parse error", e);
        }
      };

      ws.current.onerror = (err) => {
        console.error('Render WS Error:', err);
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        console.log('WS Disconnected. Attempting auto-reconnect in 3s...');
        // Auto-reconnect backoff (Render handles deploys nicely)
        retryTimeout.current = setTimeout(connect, 3000);
      };
    }

    connect();

    // Critical Cleanup: Next.js Fast Refresh drops & recreates connections
    return () => {
      clearTimeout(retryTimeout.current);
      if (ws.current) {
        ws.current.send(JSON.stringify({ type: 'unsubscribe', roomId }));
        ws.current.close();
      }
    };
  }, [roomId]);

  return { lastEvent, isConnected };
}
