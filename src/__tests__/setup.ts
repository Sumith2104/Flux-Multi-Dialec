import { vi } from 'vitest';

// Mock Upstash Redis for tests
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn().mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
  })),
}));

// Mock pg pool
const mockQueryFn = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
vi.mock('@/lib/pg', () => ({
  pool: {
    query: mockQueryFn,
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  },
  getPgPool: vi.fn().mockReturnValue({
    query: mockQueryFn,
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock cookies (next/headers)
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// Mock fluxdb logger
vi.mock('@/lib/fluxdb-logger', () => ({
  logToFluxDB: vi.fn(),
}));

