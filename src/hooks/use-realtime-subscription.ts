'use client';

import { useEffect, useRef, useState } from 'react';

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
    status: 'connecting' | 'open' | 'closed';
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
            status: 'connecting',
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

    // Already connecting or open — don't double-connect
    if (state.status === 'connecting' || state.status === 'open') return;

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }
    if (state.abortController) {
        state.abortController.abort();
    }

    state.status = 'connecting';
    state.abortController = new AbortController();
    console.log(`[Realtime] Connecting singleton SSE for project ${projectId}…`);

    try {
        const response = await fetch(
            `/api/realtime/subscribe?projectId=${projectId}`,
            { signal: state.abortController.signal }
        );

        if (!response.ok) {
            if (response.status === 401) {
                console.error('[Realtime] Unauthorized. Connection closed.');
                state.status = 'closed';
                return;
            }
            throw new Error(`SSE ${response.status}: ${response.statusText}`);
        }

        state.status = 'open';
        state.retryCount = 0;
        console.log('[Realtime] SSE singleton connected ✅');

        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Stop if no-one is listening anymore
                if (!connections.has(projectId) || connections.get(projectId)!.listeners.size === 0) {
                    reader.cancel().catch(() => {});
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw) continue;

                    try {
                        const payload = JSON.parse(raw) as RealtimeEvent;
                        if (payload.type === 'connected') continue;

                        const tableRef = payload.table || payload.table_id || payload.table_name || '';
                        const cleanTable = typeof tableRef === 'string' ? tableRef.split('.').pop() || tableRef : tableRef;

                        const normalized: RealtimeEvent = {
                            ...payload,
                            type: (['INSERT', 'UPDATE', 'DELETE', 'row.inserted', 'row.updated', 'row.deleted'].some(t =>
                                payload.event_type === t || payload.operation === t || payload.type === t
                            )) ? 'update' : payload.type || 'live',
                            table: cleanTable,
                        };

                        notifyListeners(projectId, normalized);
                    } catch (e) {
                        console.warn('[Realtime] Parse error:', e);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.log('[Realtime] Connection intentionally closed.');
            return;
        }
        console.warn('[Realtime] SSE error:', err.message);
    }

    const state2 = connections.get(projectId);
    if (state2 && state2.listeners.size > 0) {
        scheduleReconnect(projectId);
    } else {
        // No listeners left — clean up
        connections.delete(projectId);
    }
}

function subscribe(projectId: string, listener: Listener): () => void {
    const state = getOrCreateState(projectId);
    state.listeners.add(listener);

    // Start the connection if not already running
    if (state.status === 'closed' || state.status === 'connecting') {
        // Only start if not already looping (abortController signals the loop is running)
        if (!state.abortController || state.abortController.signal.aborted) {
            startConnection(projectId);
        }
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
    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;

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
