-- Refresh tokens table for Fluxbase auth system
-- Access tokens are short-lived (15 min), refresh tokens rotate on use (7 day TTL)

CREATE TABLE IF NOT EXISTS fluxbase_global.refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES fluxbase_global.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

-- One refresh token per user (simpler rotation model)
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
    ON fluxbase_global.refresh_tokens (user_id);

-- Fast lookup for verification
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
    ON fluxbase_global.refresh_tokens (token_hash);

-- Auto-cleanup expired tokens (run via cron or on app startup)
-- DELETE FROM fluxbase_global.refresh_tokens WHERE expires_at < NOW();
