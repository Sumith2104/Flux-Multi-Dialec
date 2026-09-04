'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import logger from '@/lib/logger';

// Native SSE-based realtime subscription.
// MODULE-LEVEL SINGLETON: All consumers of this hook share ONE SSE connection per projectId.
// This prevents the thundering herd of N connections when N hooks call useRealtimeSubscription.

export interface RealtimeEvent {
    type: 'live' | 'update' | 'subscribed' | 'error' | 'connected' | 'schema_update' | 'db_event' | 'raw_sql_mutation';
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

    // If WebSocket fails repeatedly, seamlessly fallback to SSE
    if (state.retryCount >= 2 && state.listeners.size > 0) {
        logger.warn(`[Realtime:${projectId}] WebSocket reconnect failed repeatedly. Falling back to SSE...`);
        connectSSE(projectId, state);
        return;
    }

    const delay = Math.min(1000 * Math.pow(2, state.retryCount - 1), 5000);
    logger.info(`[Realtime:${projectId}] Reconnecting in ${delay}ms…`);
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
        logger.warn(`[Realtime:${projectId}] Watchdog timeout — connection stale. Reconnecting…`);
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

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (wsUrl && typeof window !== 'undefined') {
        let wsOpened = false;
        try {
            const wsTarget = `${wsUrl.replace(/\/$/, '')}?projectId=${projectId}`;
            const ws = new WebSocket(wsTarget);
            (state as any).socket = ws;

            ws.onopen = () => {
                wsOpened = true;
                state.status = 'open';
                state.retryCount = 0;
                logger.info(`[Realtime] WebSocket connected to Render for ${projectId}`);
                resetWatchdog(projectId);

                // Send subscription handshake to Render room system
                try {
                    ws.send(JSON.stringify({ type: 'subscribe', roomId: `project_${projectId}` }));
                    ws.send(JSON.stringify({ type: 'subscribe', roomId: projectId }));
                } catch (err) {
                    logger.warn('[Realtime] Failed to send subscribe handshake:', err);
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    resetWatchdog(projectId);
                    if (data.type === 'ping' || data.type === 'connected') return;

                    const payload = data.payload || data;
                    const tableRef = payload.table || payload.table_name || data.table || data.table_name || '';
                    const cleanTable = typeof tableRef === 'string' ? tableRef.split('.').pop() || tableRef : tableRef;
                    const rawAction = payload.action || data.action || payload.operation || data.operation || '';
                    const rawData = payload.record || payload.data || data.record || data.data;

                    const normalized: RealtimeEvent = {
                        ...data,
                        ...payload,
                        type: rawAction ? 'update' : (payload.type || data.type || 'update'),
                        table: cleanTable,
                        action: String(rawAction).toUpperCase(),
                        operation: String(rawAction).toUpperCase(),
                        data: rawData,
                    };
                    notifyListeners(projectId, normalized);
                } catch (e) {
                    logger.warn('[Realtime] WS message parse error:', e);
                }
            };

            ws.onclose = () => {
                (state as any).socket = null;
                if (!wsOpened) {
                    logger.warn(`[Realtime] Render WebSocket failed to connect for ${projectId}, falling back to SSE...`);
                    connectSSE(projectId, state);
                } else {
                    scheduleReconnect(projectId);
                }
            };

            ws.onerror = () => {
                try { ws.close(); } catch {}
            };
            return;
        } catch (e) {
            logger.warn('[Realtime] WebSocket connect failed, falling back to SSE:', e);
        }
    }

    await connectSSE(projectId, state);
}

async function connectSSE(projectId: string, state: ConnectionState) {

    const abortController = new AbortController();
    state.abortController = abortController;

    logger.info(`[Realtime] Connecting SSE for project ${projectId}…`);

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
        logger.info(`[Realtime] SSE connected for ${projectId}`);
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
                    const payload = data.payload || data;
                    const tableRef = payload.table || payload.table_name || data.table || data.table_name || '';
                    const cleanTable = typeof tableRef === 'string' ? tableRef.split('.').pop() || tableRef : tableRef;
                    const rawAction = payload.action || data.action || payload.operation || data.operation || '';
                    const rawData = payload.record || payload.data || data.record || data.data;

                    const normalized: RealtimeEvent = {
                        ...data,
                        ...payload,
                        type: rawAction ? 'update' : (data.type || 'update'),
                        table: cleanTable,
                        action: String(rawAction).toUpperCase(),
                        operation: String(rawAction).toUpperCase(),
                        data: rawData,
                    };
                    notifyListeners(projectId, normalized);
                } catch (e) {
                    logger.warn('[Realtime] SSE parse error:', e);
                }
            }
        }
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            logger.info(`[Realtime] SSE intentionally closed for ${projectId}.`);
            return;
        }
        logger.error(`[Realtime] SSE error for ${projectId}:`, err);
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
            logger.info(`[Realtime] No more subscribers for ${projectId}. Closing.`);
            if (s.retryTimer) clearTimeout(s.retryTimer);
            if (s.abortController) s.abortController.abort();
            connections.delete(projectId);
        }
    };
}

// --- React Hook (thin wrapper around singleton) ---

// Global per-project, per-table debounce timers across all hook instances (prevents duplicate refetches from multiple components)
const globalLastTableRefetch = new Map<string, number>();
const globalTableTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function useRealtimeSubscription(projectId: string | undefined) {
    const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
    const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'closed'>('connecting');
    const queryClient = useQueryClient();
    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;

    // --- INSTANT CACHE SYNC LAYER ---
    const syncDatabase = useCallback((event: RealtimeEvent) => {
        if (!projectId) return;

        // 1. Handle Schema Changes (Tables created/dropped/altered)
        if (event.type === 'schema_update' || event.event_type === 'schema_update') {
            const pid = event.project_id || projectId;
            logger.info(`[Realtime Sync] Schema changed. Instant Triple-Pass Pass 1...`);

            // Pass 1: IMMEDIATE (0ms)
            queryClient.invalidateQueries({ queryKey: ['schema', pid] });

            // Pass 2: Propagation Safety (3000ms)
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['schema', pid] });
            }, 3000);

            // Pass 3: Consistency Check (8000ms)
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['schema', pid] });
            }, 8000);
            return;
        }

        // 2. Handle Data Changes (Rows deleted/inserted/updated)
        const action = String(event.action || event.operation || '').toUpperCase();
        const isDataMutation = (
            event.type === 'update' ||
            event.type === 'db_event' ||
            event.type === 'raw_sql_mutation' ||
            ['INSERT', 'UPDATE', 'DELETE'].includes(action)
        ) && event.type !== 'connected' && event.type !== 'subscribed';

        if (isDataMutation) {
            const table = event.table;

            const normalizeTable = (name: any) =>
                String(name || '')
                    .toLowerCase()
                    .replace(/['"`]/g, '')
                    .split('.')
                    .pop()
                    ?.trim() || '';

            const targetTable = normalizeTable(table);

            // Telemetry / internal tables should NEVER disrupt business table refetches
            if (targetTable === 'audit_logs' || targetTable === 'api_keys' || targetTable === 'analytics_rollups') {
                queryClient.invalidateQueries({ queryKey: ['analytics_stats', projectId] });
                queryClient.invalidateQueries({ queryKey: ['analytics_history', projectId] });
                queryClient.invalidateQueries({ queryKey: ['dashboard-analytics', projectId] });
                return;
            }

            const tableKey = targetTable || '*';
            const timerKey = `${projectId}:${tableKey}`;

            // Check if there are active table-data queries for this project
            const activeQueries = queryClient.getQueryCache().getAll().filter(q => {
                return q.isActive() && q.queryKey[0] === 'table-data' && q.queryKey[1] === projectId;
            });

            // If user is currently viewing a specific table, only process if target matches
            if (activeQueries.length > 0 && targetTable) {
                const matchesAnyActive = activeQueries.some(q => {
                    const qTable = normalizeTable(q.queryKey[2]);
                    return !qTable || qTable === targetTable;
                });
                if (!matchesAnyActive) {
                    return;
                }
            }

            const executeRefetch = () => {
                globalLastTableRefetch.set(timerKey, Date.now());
                const existingTimer = globalTableTimers.get(timerKey);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                    globalTableTimers.delete(timerKey);
                }

                // Surgical table refetch
                queryClient.refetchQueries({
                    predicate: (query) => {
                        if (query.queryKey[0] !== 'table-data' || query.queryKey[1] !== projectId) return false;
                        if (targetTable && query.queryKey[2]) {
                            return normalizeTable(query.queryKey[2]) === targetTable;
                        }
                        return true;
                    },
                    type: 'active'
                });

                // Invalidate analytics lazily (stale-while-revalidate)
                queryClient.invalidateQueries({ queryKey: ['analytics_stats', projectId] });
                queryClient.invalidateQueries({ queryKey: ['analytics_history', projectId] });
                queryClient.invalidateQueries({ queryKey: ['dashboard-analytics', projectId] });
            };

            const now = Date.now();
            const lastRefetchTime = globalLastTableRefetch.get(timerKey) || 0;
            const elapsed = now - lastRefetchTime;
            const BURST_WINDOW = 1200; // 1.2s batch window for streaming bot bursts
            const IDLE_THRESHOLD = 3000; // If idle for > 3s, show first row instantly

            if (elapsed >= IDLE_THRESHOLD) {
                // First event after an idle period: execute immediately for 0ms instant response!
                executeRefetch();
            } else {
                // If mutations arrive in a rapid burst, debounce the trailing edge
                if (!globalTableTimers.has(timerKey)) {
                    const timer = setTimeout(() => {
                        globalTableTimers.delete(timerKey);
                        executeRefetch();
                    }, BURST_WINDOW);
                    globalTableTimers.set(timerKey, timer);
                }
            }
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

        // Client-side local custom event listener fallback (handles local/serverless disconnections)
        const handleLocalSchemaChange = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail?.projectId === projectId) {
                logger.info(`[Realtime Sync] Local schema change event received. Triggering sync...`);
                syncDatabase({ type: 'schema_update', project_id: projectId });
            }
        };

        window.addEventListener('flux:schema-change', handleLocalSchemaChange);

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
            window.removeEventListener('flux:schema-change', handleLocalSchemaChange);
            clearInterval(statusInterval);
        };
    }, [projectId, syncDatabase]);

    const sendMessage = () => {
        logger.warn('[Realtime] sendMessage is a no-op in SSE mode.');
    };

    return {
        status,
        lastEvent,
        events: lastEvent ? [lastEvent] : [],
        sendMessage,
        isConnected: status === 'open',
    };
}
