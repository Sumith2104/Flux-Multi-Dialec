import crypto from 'crypto';
import { getPgPool } from '@/lib/pg';
import logger from '@/lib/logger';

// 32-byte encryption key derived via HKDF from JWT_SECRET
function deriveKey(): Buffer {
    const secret = process.env.JWT_SECRET || 'fluxbase-github-token-secret-fallback-key-seed';
    return Buffer.from(crypto.hkdfSync('sha256', secret, 'fluxbase-gh-tokens-salt-2026', 'fluxbase-github-token-aes-gcm', 32));
}

// Encrypt token → returns combined ciphertext:authTag and iv
function encrypt(plaintext: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
        encrypted: `${encrypted}:${authTag}`,
        iv: iv.toString('hex')
    };
}

// Decrypt token
function decrypt(encryptedCombined: string, ivHex: string): string {
    const [encrypted, authTagHex] = encryptedCombined.split(':');
    if (!encrypted || !authTagHex) {
        throw new Error('Invalid encrypted token payload format');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

let tablesInitialized = false;

export async function ensureGitHubTables(): Promise<void> {
    if (tablesInitialized) return;
    try {
        const pool = getPgPool();
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.github_tokens (
                user_id VARCHAR(64) PRIMARY KEY,
                encrypted_token TEXT NOT NULL,
                token_iv VARCHAR(32) NOT NULL,
                scopes TEXT DEFAULT 'repo',
                github_username VARCHAR(255),
                connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_used_at TIMESTAMP WITH TIME ZONE
            );

            CREATE TABLE IF NOT EXISTS fluxbase_global.import_logs (
                id SERIAL PRIMARY KEY,
                project_id VARCHAR(32) NOT NULL,
                user_id VARCHAR(64) NOT NULL,
                repo_full_name VARCHAR(255) NOT NULL,
                branch VARCHAR(128) DEFAULT 'main',
                module_path VARCHAR(255) DEFAULT 'fluxbase',
                file_name VARCHAR(255) NOT NULL,
                file_sha VARCHAR(64),
                status VARCHAR(16) NOT NULL,
                statements_executed INTEGER DEFAULT 0,
                error_message TEXT,
                execution_time_ms INTEGER,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_import_logs_project ON fluxbase_global.import_logs(project_id);

            ALTER TABLE fluxbase_global.projects
                ADD COLUMN IF NOT EXISTS github_repo VARCHAR(255),
                ADD COLUMN IF NOT EXISTS github_branch VARCHAR(128),
                ADD COLUMN IF NOT EXISTS github_module_path VARCHAR(255),
                ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP WITH TIME ZONE,
                ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE,
                ADD COLUMN IF NOT EXISTS import_source VARCHAR(32);
        `);
        tablesInitialized = true;
    } catch (err) {
        logger.error('[GitHubToken] Error ensuring github tables:', err);
    }
}

/**
 * Store encrypted GitHub access token for a user
 */
export async function storeGitHubToken(
    userId: string,
    accessToken: string,
    scopes: string = 'repo',
    githubUsername: string = ''
): Promise<void> {
    await ensureGitHubTables();
    const pool = getPgPool();
    const { encrypted, iv } = encrypt(accessToken);

    await pool.query(`
        INSERT INTO fluxbase_global.github_tokens (
            user_id, encrypted_token, token_iv, scopes, github_username, connected_at, last_used_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            encrypted_token = EXCLUDED.encrypted_token,
            token_iv = EXCLUDED.token_iv,
            scopes = EXCLUDED.scopes,
            github_username = EXCLUDED.github_username,
            connected_at = NOW(),
            last_used_at = NOW();
    `, [userId, encrypted, iv, scopes, githubUsername]);
}

/**
 * Retrieve decrypted token (returns null if not connected)
 */
export async function getGitHubToken(userId: string): Promise<string | null> {
    await ensureGitHubTables();
    const pool = getPgPool();
    const res = await pool.query(`
        SELECT encrypted_token, token_iv 
        FROM fluxbase_global.github_tokens 
        WHERE user_id = $1
    `, [userId]);

    if (res.rows.length === 0) return null;

    try {
        const { encrypted_token, token_iv } = res.rows[0];
        const token = decrypt(encrypted_token, token_iv);

        // Asynchronously update last_used_at
        pool.query(`
            UPDATE fluxbase_global.github_tokens 
            SET last_used_at = NOW() 
            WHERE user_id = $1
        `, [userId]).catch(() => {});

        return token;
    } catch (err) {
        logger.error('[GitHubToken] Failed to decrypt token for user ' + userId, err);
        return null;
    }
}

/**
 * Check connection status (lightweight — no decryption)
 */
export async function getGitHubConnection(userId: string): Promise<{
    connected: boolean;
    username?: string;
    connectedAt?: string;
} | null> {
    await ensureGitHubTables();
    const pool = getPgPool();
    const res = await pool.query(`
        SELECT github_username, connected_at 
        FROM fluxbase_global.github_tokens 
        WHERE user_id = $1
    `, [userId]);

    if (res.rows.length === 0) {
        return { connected: false };
    }

    return {
        connected: true,
        username: res.rows[0].github_username || '',
        connectedAt: res.rows[0].connected_at ? new Date(res.rows[0].connected_at).toISOString() : undefined
    };
}

/**
 * Revoke token (delete from DB)
 */
export async function revokeGitHubToken(userId: string): Promise<void> {
    await ensureGitHubTables();
    const pool = getPgPool();
    await pool.query(`
        DELETE FROM fluxbase_global.github_tokens WHERE user_id = $1
    `, [userId]);
}
