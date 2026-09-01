import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/integration/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Suites share cluster-level fixtures (schemas/tables) — run serially
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
