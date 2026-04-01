// src/lib/browser-cache.ts
// IndexedDB-backed LRU cache — the "warm" cache tier between JS heap and network.
//
// Memory architecture:
//   Hot  → TanStack Query in-memory cache (limited by gcTime)
//   Warm → IndexedDB (this file) — survives TanStack eviction, page navigation
//   Cold → Network (AWS RDS via /api/table-data)
//
// Max storage: ~200 MB (20 entries × ~10 MB per page of rows)
// TTL: 10 minutes per entry
// Eviction: LRU by timestamp when MAX_ENTRIES exceeded

const DB_NAME = 'fluxbase_cache_v1';
const DB_VERSION = 1;
const STORE_NAME = 'table_rows';
const MAX_ENTRIES = 20;             // Max 20 table/page combos in warm cache
const MAX_AGE_MS = 10 * 60 * 1000; // 10-minute TTL

interface CachedEntry {
    key: string;
    data: unknown;
    timestamp: number;
}

let _db: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
    if (_db) return _db;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                store.createIndex('by_timestamp', 'timestamp', { unique: false });
            }
        };
        req.onsuccess = () => {
            _db = req.result;
            // Handle unexpected closes (tab sleep, memory pressure)
            _db.onclose = () => { _db = null; };
            resolve(_db);
        };
        req.onerror = () => reject(req.error);
    });
}

/**
 * Read a cached value by key.
 * Returns null if missing or expired (>10 min old).
 */
export async function idbGet(key: string): Promise<unknown | null> {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => {
                const entry = req.result as CachedEntry | undefined;
                if (!entry) return resolve(null);
                if (Date.now() - entry.timestamp > MAX_AGE_MS) {
                    // Expired — treat as cache miss (will be lazily deleted on next put)
                    return resolve(null);
                }
                resolve(entry.data);
            };
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

/**
 * Write a value to the cache. Fire-and-forget safe.
 * Automatically prunes oldest entries if MAX_ENTRIES exceeded.
 */
export async function idbSet(key: string, data: unknown): Promise<void> {
    try {
        const db = await getDB();
        const entry: CachedEntry = { key, data, timestamp: Date.now() };

        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(entry);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        // LRU eviction — runs async, non-blocking
        pruneOldEntries(db).catch(() => {});
    } catch {
        // Suppress — cache write failure is non-fatal
    }
}

/**
 * Invalidate all cache entries whose keys start with the given prefix.
 * Call this after table mutations (INSERT/UPDATE/DELETE).
 */
export async function idbDeleteByPrefix(keyPrefix: string): Promise<void> {
    try {
        const db = await getDB();
        await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.openCursor();
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) return resolve();
                if (cursor.key.toString().startsWith(keyPrefix)) {
                    cursor.delete();
                }
                cursor.continue();
            };
            req.onerror = () => resolve();
        });
    } catch {}
}

/**
 * Clear ALL entries from the warm cache.
 * Use after: project switch, database reset, logout.
 */
export async function idbClearAll(): Promise<void> {
    try {
        const db = await getDB();
        await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {}
}

/** LRU eviction: delete oldest entries when over the cap. */
async function pruneOldEntries(db: IDBDatabase): Promise<void> {
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const index = tx.objectStore(STORE_NAME).index('by_timestamp');
        const req = index.getAll();
        req.onsuccess = () => {
            const all = req.result as CachedEntry[];
            if (all.length > MAX_ENTRIES) {
                // Sort ascending by timestamp, delete the oldest (front of array)
                all.sort((a, b) => a.timestamp - b.timestamp);
                const toDelete = all.slice(0, all.length - MAX_ENTRIES);
                const store = tx.objectStore(STORE_NAME);
                toDelete.forEach(e => store.delete(e.key));
            }
            resolve();
        };
        req.onerror = () => resolve();
    });
}
