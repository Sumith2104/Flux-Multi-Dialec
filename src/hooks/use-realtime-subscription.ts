'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Native SSE-based realtime subscription.
// Connects directly to /api/realtime/subscribe (same origin, no WS needed).

export interface RealtimeEvent {
    type: 'live' | 'update' | 'subscribed' | 'error' | 'connected';
    project_id?: string;
    table?: string;
    table_id?: string;
    table_name?: string;
    operation?: string;
    event_type?: string;
    data?: any;
    timestamp?: string;
    [key: string]: any;
}

export function useRealtimeSubscription(projectId: string | undefined) {
    const abortRef = useRef<AbortController | null>(null);
    const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
    const [events, setEvents] = useState<RealtimeEvent[]>([]);
    const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const retryRef = useRef(0);
    const mountedRef = useRef(true);

    const connect = useCallback(async () => {
        if (!projectId || !mountedRef.current) return;

        // Cancel any existing stream
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        setStatus('connecting');
        console.log(`[Realtime] Connecting via SSE for project ${projectId}…`);

        try {
            const response = await fetch(
                `/api/realtime/subscribe?projectId=${projectId}`,
                { signal: abortRef.current.signal }
            );

            if (!response.ok) {
                throw new Error(`SSE ${response.status}: ${response.statusText}`);
            }

            if (!mountedRef.current) return;
            setStatus('open');
            retryRef.current = 0;
            console.log('[Realtime] SSE connected ✅');

            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (mountedRef.current) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? ''; // keep trailing incomplete line

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw) continue;

                    try {
                        const payload = JSON.parse(raw) as RealtimeEvent;
                        if (payload.type === 'connected') continue; // heartbeat

                        // Normalize: support both 'table_id'/'table_name' and 'table'
                        const tableRef = payload.table || payload.table_id || payload.table_name;
                        const normalized: RealtimeEvent = {
                            ...payload,
                            type: (payload.event_type === 'row.inserted' || payload.event_type === 'INSERT') ? 'update'
                                : (payload.event_type === 'row.updated' || payload.event_type === 'UPDATE') ? 'update'
                                    : (payload.event_type === 'row.deleted' || payload.event_type === 'DELETE') ? 'update'
                                        : payload.type || 'live',
                            table: tableRef,
                        };

                        if (!mountedRef.current) break;
                        setLastEvent(normalized);
                        setEvents(prev => [normalized, ...prev].slice(0, 20));
                    } catch (e) {
                        console.warn('[Realtime] Parse error:', e);
                    }
                }
            }
        } catch (err: any) {
            if (err.name === 'AbortError') return; // intentional close
            console.warn('[Realtime] SSE error:', err.message);
        }

        if (!mountedRef.current) return;

        // Exponential backoff: 1s → 2s → 4s → 8s → max 15s
        setStatus('closed');
        retryRef.current += 1;
        const delay = Math.min(1000 * Math.pow(2, retryRef.current - 1), 15000);
        console.log(`[Realtime] Reconnecting in ${delay}ms…`);
        reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) connect();
        }, delay);

    }, [projectId]);

    useEffect(() => {
        mountedRef.current = true;
        retryRef.current = 0;
        connect();

        return () => {
            mountedRef.current = false;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (abortRef.current) abortRef.current.abort();
        };
    }, [connect, projectId]);

    const sendMessage = useCallback((_message: any) => {
        // No-op for SSE (read-only); kept for API compatibility.
        console.warn('[Realtime] sendMessage is a no-op in SSE mode.');
    }, []);

    return {
        status,
        lastEvent,
        events,
        sendMessage,
        isConnected: status === 'open',
    };
}
