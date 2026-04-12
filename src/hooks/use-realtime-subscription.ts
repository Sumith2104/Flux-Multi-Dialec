'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Native SSE-based realtime subscription.
// MODULE-LEVEL SINGLETON: All consumers of this hook share ONE SSE connection per projectId.
// This prevents the thundering herd of N connections when N hooks call useRealtimeSubscription.

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

// --- Singleton state per projectId ---

type Listener = (event: RealtimeEvent) => void;

interface ConnectionState {
    status: 'idle' | 'connecting' | 'open' | 'closed';
    lastEvent: RealtimeEvent | null;
    listeners: Set<Listener>;
    abortController: AbortController | null;
    retryTimer: ReturnType<typeof setTimeout> | null;
    retryCount: number;
}

const connections = new Map<string, ConnectionState>();

function getOrCreateState(projectId: string): ConnectionState {
    if (!connections.has(projectId)) {
        connections.set(projectId, {
            status: 'idle',  // 'idle' = not started yet, distinct from 'connecting'
            lastEvent: null,
            listeners: new Set(),
            abortController: null,
            retryTimer: null,
            retryCount: 0,
        });
    }
    return connections.get(projectId)!;
}

function notifyListeners(projectId: string, event: RealtimeEvent) {
    const state = connections.get(projectId);
    if (!state) return;
    state.lastEvent = event;
    state.listeners.forEach(fn => fn(event));
}

function scheduleReconnect(projectId: string) {
    const state = connections.get(projectId);
    if (!state) return;
    state.status = 'closed';
    state.retryCount += 1;
    const delay = Math.min(1000 * Math.pow(2, state.retryCount - 1), 15000);
    console.log(`[Realtime:${projectId}] Reconnecting in ${delay}ms…`);
    state.retryTimer = setTimeout(() => {
        if (connections.has(projectId) && connections.get(projectId)!.listeners.size > 0) {
            startConnection(projectId);
        }
    }, delay);
}

async function startConnection(projectId: string) {
    const state = getOrCreateState(projectId);

    // Guard: skip if a real active connection is in-flight or established
    if (state.status === 'connecting' || state.status === 'open') return;

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }

    state.status = 'connecting';
    let wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

    // SECURITY: Auto-upgrade to WSS if served over HTTPS to avoid Mixed Content errors on Vercel
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
        wsUrl = wsUrl.replace('ws://', 'wss://');
    }
    
    console.log(`[Realtime] Connecting WebSocket for project ${projectId} to ${wsUrl}…`);

    const socket = new WebSocket(wsUrl);
    (state as any).socket = socket;

    socket.onopen = () => {
        state.status = 'open';
        state.retryCount = 0;
        console.log('[Realtime] WebSocket connected ✅');
        
        // Subscribe to the project room
        socket.send(JSON.stringify({
            type: 'subscribe',
            roomId: `project_${projectId}`
        }));
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Handle standard DB events from our new server
            if (data.type === 'db_event' && data.payload) {
                const payload = data.payload;
                const tableRef = payload.table || '';
                const cleanTable = typeof tableRef === 'string' ? tableRef.split('.').pop() || tableRef : tableRef;

                const normalized: RealtimeEvent = {
                    ...payload,
                    // Fix: Correctly map API 'event_type' to internal hook 'type' for Triple-Pass sync
                    type: payload.event_type === 'schema_update' ? 'schema_update' : (payload.type || 'update'),
                    table: cleanTable,
                    data: payload.record
                };

                notifyListeners(projectId, normalized);
            }
        } catch (e) {
            console.warn('[Realtime] WS Parse error:', e);
        }
    };

    socket.onclose = () => {
        console.log(`[Realtime] WebSocket closed for ${projectId}.`);
        state.status = 'closed';
        (state as any).socket = null;
        
        if (state.listeners.size > 0) {
            scheduleReconnect(projectId);
        }
    };

    socket.onerror = (err) => {
        console.error('[Realtime] WebSocket error:', err);
        socket.close();
    };
}

function subscribe(projectId: string, listener: Listener): () => void {
    const state = getOrCreateState(projectId);
    state.listeners.add(listener);

    // Start the connection if not yet started or previously closed
    if (state.status === 'idle' || state.status === 'closed') {
        startConnection(projectId);
    }

    return () => {
        const s = connections.get(projectId);
        if (!s) return;
        s.listeners.delete(listener);
        if (s.listeners.size === 0) {
            // Last subscriber left — tear down
            console.log(`[Realtime] No more subscribers for ${projectId}. Closing.`);
            if (s.retryTimer) clearTimeout(s.retryTimer);
            if (s.abortController) s.abortController.abort();
            connections.delete(projectId);
        }
    };
}

// --- React Hook (thin wrapper around singleton) ---

export function useRealtimeSubscription(projectId: string | undefined) {
    const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
    const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
    const queryClient = useQueryClient();
    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;

    // --- GLOBAL CACHE SYNC LAYER ---
    // This effect ensures that deletions/updates in ONE part of the app 
    // immediately refresh the cache for ALL other components.
    useEffect(() => {
        if (!lastEvent || !projectId) return;

        // 1. Handle Schema Changes (Tables created/dropped/altered)
        // GLOBAL AUTO-REFRESH: When any user makes a structural change, the server broadcasts 'schema_update'.
        // We handle this with a 'Triple-Pass' (1s, 4s, 10s) strategy to guarantee consistency across all clients.
        if (lastEvent.type === 'schema_update' || lastEvent.event_type === 'schema_update') {
            const pid = lastEvent.project_id || projectId;
            console.log(`[Realtime Sync] Schema changed in project ${pid}. Starting Triple-Pass refresh...`);
            
            // Pass 1: Immediate Responsiveness (1000ms)
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['schema', pid] });
            }, 1000);

            // Pass 2: Standard Propagation (4000ms)
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['schema', pid] });
            }, 4000);

            // Pass 3: Hyper-Consistency Safety Net (10000ms)
            // Catch extremely delayed database catalog updates
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['schema', pid] });
            }, 10000);
        }

        // 2. Handle Data Changes (Rows deleted/inserted/updated)
        // We broadly invalidate 'table-data' to ensure consistency across views.
        if (lastEvent.type === 'update' || lastEvent.action || lastEvent.operation) {
            const table = lastEvent.table;
            console.log(`[Realtime Sync] Data changed in ${table}. Synchronizing views...`);
            
            // Refetch current active table data (Turbo style)
            queryClient.refetchQueries({ 
                queryKey: ['table-data', projectId, table],
                type: 'active'
            });

            // Invalidate analytics and history globally
            queryClient.invalidateQueries({ queryKey: ['analytics_stats', projectId] });
            queryClient.invalidateQueries({ queryKey: ['analytics_history', projectId] });
        }
    }, [lastEvent, projectId, queryClient]);

    useEffect(() => {
        if (!projectId) return;

        const listener: Listener = (event) => {
            setLastEvent(event);
        };

        const unsubscribe = subscribe(projectId, listener);

        // Sync status from singleton
        const state = connections.get(projectId);
        if (state) setStatus(state.status);

        // Poll status so UI indicator stays correct (light-weight, 1-per-hook not 1-per-project)
        const statusInterval = setInterval(() => {
            const s = connections.get(projectId);
            setStatus(s ? s.status : 'closed');
        }, 2000);

        return () => {
            unsubscribe();
            clearInterval(statusInterval);
        };
    }, [projectId]);

    const sendMessage = () => {
        console.warn('[Realtime] sendMessage is a no-op in SSE mode.');
    };

    return {
        status,
        lastEvent,
        events: lastEvent ? [lastEvent] : [],
        sendMessage,
        isConnected: status === 'open',
    };
}
