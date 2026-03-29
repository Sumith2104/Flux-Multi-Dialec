import { getPgPool } from '@/lib/pg';
import { randomBytes, createHash } from 'crypto';

export interface ApiKey {
    id: string; // The document ID (which is the hash of the key)
    userId: string; // Stored as user_id
    name: string;
    projectId?: string; // Stored as project_id
    projectName?: string; // Stored as project_name
    scopes: string[]; // Stored as scopes (JSONB)
    preview: string;
    createdAt: string; // Stored as created_at
    lastUsedAt?: string; // Stored as last_used_at
}

export interface CreateApiKeyResult {
    key: string;
    apiKeyData: ApiKey;
}

export async function generateApiKey(userId: string, name: string, projectId?: string, projectName?: string, scopes: string[] = ['read']): Promise<CreateApiKeyResult> {
    const rawKey = 'fl_' + randomBytes(24).toString('hex');
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const preview = `${rawKey.substring(0, 7)}...${rawKey.substring(rawKey.length - 4)}`;

    const pool = getPgPool();
    await pool.query(
        `INSERT INTO fluxbase_global.api_keys (id, user_id, name, project_id, project_name, preview, scopes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [hash, userId, name, projectId || null, projectName || null, preview, JSON.stringify(scopes)]
    );

    const apiKeyData: ApiKey = {
        id: hash,
        userId,
        name,
        preview,
        createdAt: new Date().toISOString(),
        projectId,
        projectName,
        scopes
    };

    return { key: rawKey, apiKeyData };
}

export async function validateApiKey(rawKey: string): Promise<{ userId: string, projectId?: string, scopes: string[] } | null> {
    const hash = createHash('sha256').update(rawKey).digest('hex');

    const pool = getPgPool();
    const result = await pool.query('SELECT user_id, project_id, scopes FROM fluxbase_global.api_keys WHERE id = $1', [hash]);

    if (result.rows.length === 0) return null;

    // Async update last used
    pool.query('UPDATE fluxbase_global.api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1', [hash]).catch(err =>
        console.error('Failed to update API key stats:', err)
    );

    return {
        userId: result.rows[0].user_id,
        projectId: result.rows[0].project_id,
        scopes: result.rows[0].scopes || ['read']
    };
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
    const pool = getPgPool();
    const result = await pool.query('SELECT * FROM fluxbase_global.api_keys WHERE user_id = $1 ORDER BY created_at DESC', [userId]);

    return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        projectId: row.project_id,
        projectName: row.project_name,
        scopes: row.scopes || ['read'],
        preview: row.preview,
        createdAt: row.created_at.toISOString(),
        lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : undefined
    }));
}

export async function revokeApiKey(userId: string, keyId: string): Promise<void> {
    const pool = getPgPool();
    const result = await pool.query('DELETE FROM fluxbase_global.api_keys WHERE id = $1 AND user_id = $2 RETURNING id', [keyId, userId]);

    if (result.rowCount === 0) {
        throw new Error("Key not found or unauthorized");
    }
}
