// Simple in-memory cache for table rows to speed up GET/SELECT requests.
// In a serverless environment like Vercel, this cache is per-instance and ephemeral,
// but it is highly effective at reducing database reads during bursts of traffic.

import type { Row } from '@/lib/data';

interface CacheEntry {
    lastUpdated: number;
    data: Row[];
}

const tableCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function getCachedTableRows(projectId: string, tableId: string): Row[] | null {
    const key = `${projectId}_${tableId}`;
    const entry = tableCache.get(key);

    if (entry && (Date.now() - entry.lastUpdated < CACHE_TTL_MS)) {
        return entry.data;
    }

    return null;
}

export function setCachedTableRows(projectId: string, tableId: string, data: Row[]): void {
    const key = `${projectId}_${tableId}`;
    tableCache.set(key, {
        lastUpdated: Date.now(),
        data
    });
}

export function invalidateTableCache(projectId: string, tableId: string): void {
    const key = `${projectId}_${tableId}`;
    tableCache.delete(key);
}

export function invalidateProjectCache(projectId: string): void {
    // Invalidate all tables for a project (useful for project deletion)
    const prefix = `${projectId}_`;
    for (const key of tableCache.keys()) {
        if (key.startsWith(prefix)) {
            tableCache.delete(key);
        }
    }
}
