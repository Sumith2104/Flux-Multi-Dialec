'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Use environment variable or fallback to localhost for development
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000; // Start at 2s, doubles each time (2s, 4s, 8s, 16s, 32s)

export interface RealtimeEvent {
    type: 'live' | 'update' | 'subscribed' | 'error';
    project_id?: string;
    table?: string;
    operation?: string;
    data?: any;
    timestamp?: string;
    [key: string]: any;
}

export function useRealtimeSubscription(projectId: string | undefined) {
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
    const [events, setEvents] = useState<RealtimeEvent[]>([]);
    const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const retryCountRef = useRef(0);
    const shouldReconnectRef = useRef(true);

    const connect = useCallback(async () => {
        if (!projectId || !shouldReconnectRef.current) return;

        // Clean up previous connection if it exists
        if (wsRef.current) {
            wsRef.current.onclose = null; // Prevent recursive reconnect trigger
            wsRef.current.close();
        }

        try {
            console.log(`[Realtime] Acquiring token... (attempt ${retryCountRef.current + 1}/${MAX_RETRIES})`);
            const tokenRes = await fetch('/api/realtime/token');
            const { token, error } = await tokenRes.json();
            
            if (error || !token) {
                console.error('[Realtime] Failed to get token:', error);
                setStatus('closed');
                return;
            }

            const url = `${WS_URL}?token=${token}`;
            console.log(`[Realtime] Connecting to WebSocket...`);
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[Realtime] WebSocket connected');
                setStatus('open');
                retryCountRef.current = 0; // Reset retry counter on successful connection
                // Subscribe to project-wide events using the wildcard '*'
                ws.send(JSON.stringify({ 
                    type: 'subscribe', 
                    projectId: projectId, 
                    tableId: '*' 
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as RealtimeEvent;
                    
                    if (data.type === 'live' || data.type === 'update') {
                        setLastEvent(data);
                        // Phase 4: Buffer capped at 20 (was 50) — events array is display-only;
                        // the lastEvent ref is what actually drives side effects.
                        setEvents(prev => [data, ...prev].slice(0, 20));
                    }
                } catch (e) {
                    console.error('[Realtime] Failed to parse message:', e);
                }
            };

            ws.onclose = () => {
                if (!shouldReconnectRef.current) return;

                setStatus('closed');
                retryCountRef.current += 1;

                if (retryCountRef.current > MAX_RETRIES) {
                    console.warn(`[Realtime] Max retries (${MAX_RETRIES}) reached. Stopping reconnection.`);
                    return;
                }

                // Exponential backoff: 2s, 4s, 8s, 16s, 32s
                const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCountRef.current - 1), 30000);
                console.log(`[Realtime] Connection closed. Retrying in ${delay / 1000}s... (${retryCountRef.current}/${MAX_RETRIES})`);

                if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = setTimeout(connect, delay);
            };

            ws.onerror = (err) => {
                // onerror always fires before onclose, so we let onclose handle reconnecting
                console.warn('[Realtime] WebSocket error — will retry via onclose handler.');
                ws.close();
            };
        } catch (e) {
            console.error('[Realtime] Connection failed:', e);
            setStatus('closed');
        }
    }, [projectId]);

    useEffect(() => {
        shouldReconnectRef.current = true;
        retryCountRef.current = 0;
        connect();

        return () => {
            shouldReconnectRef.current = false; // Prevent any pending reconnects from firing
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null; // Prevent reconnect on intentional close
                wsRef.current.close();
            }
        };
    }, [connect, projectId]);

    const sendMessage = useCallback((message: any) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        }
    }, []);

    return { 
        status, 
        lastEvent, 
        events, 
        sendMessage,
        isConnected: status === 'open'
    };
}
