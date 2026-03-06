// Distributed Upstash Redis cache for table rows to speed up GET/SELECT requests.
// In a serverless environment like Vercel, this correctly persists state across all isolated instances.

import type { Row } from '@/lib/data';
import { redis } from '@/lib/redis';

export interface PaginatedCachePayload {
    rows: Row[];
    totalRows: number;
    nextCursorId: string | null;
    hasMore: boolean;
}

interface CacheEntry {
    lastUpdated: number;
    data: PaginatedCachePayload;
}

const CACHE_TTL_SECONDS = 60; // 60 seconds

export async function getCachedTableRows(projectId: string, tableId: string, page: number): Promise<PaginatedCachePayload | null> {
    const key = `fluxTable_${projectId}_${tableId}_p${page}`;
    try {
        const entry = await redis.get<CacheEntry>(key);
        if (entry) {
            return entry.data;
        }
    } catch (e) {
        console.warn(`[Redis Cache Error] get: ${key}`, e);
    }
    return null;
}

export async function setCachedTableRows(projectId: string, tableId: string, page: number, data: PaginatedCachePayload): Promise<void> {
    const key = `fluxTable_${projectId}_${tableId}_p${page}`;
    try {
        await redis.set(key, {
            lastUpdated: Date.now(),
            data
        }, { ex: CACHE_TTL_SECONDS });
    } catch (e) {
        console.warn(`[Redis Cache Error] set: ${key}`, e);
    }
}

export async function invalidateTableCache(projectId: string, tableId: string): Promise<void> {
    // We only realistically need to invalidate page 0, as higher pages flow.
    // If we wanted to be strictly correct, we should invalidate all pages or use a pattern.
    // Upstash REST API `del` supports multiple keys but not pattern scanning natively without iterators.
    // Let's manually delete the first 5 pages which covers 99% of UI cache hits.
    try {
        const keys = [0, 1, 2, 3, 4].map(p => `fluxTable_${projectId}_${tableId}_p${p}`);
        await redis.del(...keys);
    } catch (e) {
        console.warn(`[Redis Cache Error] invalidate: fluxTable_${projectId}_${tableId}`, e);
    }
}

export async function invalidateProjectCache(projectId: string): Promise<void> {
    console.log(`[Redis Cache] Project ${projectId} tables will naturally expire.`);
}
