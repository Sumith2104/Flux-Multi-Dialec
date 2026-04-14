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
    watchdogTimer: ReturnType<typeof setTimeout> | null;
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
            watchdogTimer: null,
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

function resetWatchdog(projectId: string) {
    const state = connections.get(projectId);
    if (!state) return;

    if (state.watchdogTimer) {
        clearTimeout(state.watchdogTimer);
    }

    // 45s threshold (server pings every 30s)
    state.watchdogTimer = setTimeout(() => {
        console.warn(`[Realtime:${projectId}] Watchdog timeout — connection stale. Reconnecting…`);
        const s = (state as any).socket;
        if (s) s.close();
    }, 45000);
}

async function startConnection(projectId: string) {
    const state = getOrCreateState(projectId);

    if (state.status === 'connecting' || state.status === 'open') return;

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }

    state.status = 'connecting';
    const abortController = new AbortController();
    state.abortController = abortController;

    console.log(`[Realtime] Connecting SSE for project ${projectId}…`);

    try {
        const response = await fetch(`/api/realtime/subscribe?projectId=${projectId}`, {
            signal: abortController.signal,
            headers: { 'Accept': 'text/event-stream' },
            cache: 'no-store',
        });

        if (!response.ok || !response.body) {
            throw new Error(`SSE connect failed: ${response.status}`);
        }

        state.status = 'open';
        state.retryCount = 0;
        console.log(`[Realtime] ✅ SSE connected for ${projectId}`);
        resetWatchdog(projectId);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() ?? '';

            for (const chunk of chunks) {
                if (chunk.startsWith(': ')) {
                    // heartbeat — reset watchdog
                    resetWatchdog(projectId);
                    continue;
                }
                const dataLine = chunk.split('\n').find(l => l.startsWith('data:'));
                if (!dataLine) continue;

                try {
                    const raw = dataLine.slice(5).trim();
                    const data = JSON.parse(raw);
                    resetWatchdog(projectId);

                    if (data.type === 'connected') continue;

                    // Normalize payload from DB trigger format
                    const tableRef = data.table || '';
                    const cleanTable = typeof tableRef === 'string' ? tableRef.split('.').pop() || tableRef : tableRef;
                    const normalized: RealtimeEvent = {
                        ...data,
                        type: data.action ? 'update' : (data.type || 'update'),
                        table: cleanTable,
                        action: data.action,
                        data: data.record,
                    };
                    notifyListeners(projectId, normalized);
                } catch (e) {
                    console.warn('[Realtime] SSE parse error:', e);
                }
            }
        }
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            console.log(`[Realtime] SSE intentionally closed for ${projectId}.`);
            return;
        }
        console.error(`[Realtime] SSE error for ${projectId}:`, err);
    }

    // Connection ended — schedule reconnect if still needed
    state.status = 'closed';
    (state as any).socket = null;
    if (state.watchdogTimer) clearTimeout(state.watchdogTimer);

    if (connections.has(projectId) && connections.get(projectId)!.listeners.size > 0) {
        scheduleReconnect(projectId);
    }
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

    // --- INSTANT CACHE SYNC LAYER ---
    const syncDatabase = useCallback((event: RealtimeEvent) => {
        if (!projectId) return;

        // 1. Handle Schema Changes (Tables created/dropped/altered)
        if (event.type === 'schema_update' || event.event_type === 'schema_update') {
            const pid = event.project_id || projectId;
            console.log(`[Realtime Sync] Schema changed. Instant Triple-Pass Pass 1...`);
            
            // Pass 1: IMMEDIATE (0ms)
            queryClient.invalidateQueries({ queryKey: ['schema', pid] });

            // Pass 2: Propagation Safety (4000ms)
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['schema', pid] });
            }, 4000);

            // Pass 3: Consistency Check (10000ms)
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['schema', pid] });
            }, 10000);
        }

        // 2. Handle Data Changes (Rows deleted/inserted/updated)
        if (event.type === 'update' || event.action || event.operation) {
            const table = event.table;
            console.log(`[Realtime Sync] Data mutation in project ${projectId}. Table: ${table || 'generic'}`);
            
            // Surgical Refetch: targeted table refresh
            if (table) {
                queryClient.refetchQueries({ 
                    queryKey: ['table-data', projectId, table],
                    type: 'active'
                });
            } else {
                // No table info — refetch all active tables for this project
                queryClient.refetchQueries({ 
                    queryKey: ['table-data', projectId],
                    type: 'active'
                });
            }

            // Invalidate analytics
            queryClient.invalidateQueries({ queryKey: ['analytics_stats', projectId] });
            queryClient.invalidateQueries({ queryKey: ['analytics_history', projectId] });
        }
    }, [projectId, queryClient]);

    useEffect(() => {
        if (!projectId) return;

        const listener: Listener = (event) => {
            // 1. Update UI-facing state (Batched by React)
            setLastEvent(event);
            
            // 2. Trigger Database Sync (Instant, Event-driven)
            syncDatabase(event);
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
