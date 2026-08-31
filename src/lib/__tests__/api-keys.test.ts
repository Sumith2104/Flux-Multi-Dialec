import { describe, it, expect, vi } from 'vitest';
import { validateApiKey } from '@/lib/api-keys';
import { randomBytes, createHash } from 'crypto';

// vi.mock factory cannot reference top-level vars (hoisting).
// Use inline mocks.
vi.mock('@/lib/pg', () => ({
  getPgPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

describe('validateApiKey', () => {
  it('returns null for an unrecognized key', async () => {
    const result = await validateApiKey('fl_' + 'a'.repeat(48));
    expect(result).toBeNull();
  });
});

describe('api key format', () => {
  it('keys are 51 characters (fl_ + 48 hex)', () => {
    const rawKey = 'fl_' + randomBytes(24).toString('hex');
    expect(rawKey).toHaveLength(51);
  });

  it('hash is deterministic SHA256', () => {
    const rawKey = 'fl_' + '00'.repeat(24);
    const hash = createHash('sha256').update(rawKey).digest('hex');
    expect(hash).toHaveLength(64);
    const hash2 = createHash('sha256').update(rawKey).digest('hex');
    expect(hash).toBe(hash2);
  });

  it('preview shows first 7 and last 4 chars', () => {
    const rawKey = 'fl_' + 'a'.repeat(48);
    const preview = rawKey.substring(0, 7) + '...' + rawKey.substring(rawKey.length - 4);
    expect(preview).toBe('fl_aaaa...aaaa');
  });
});
