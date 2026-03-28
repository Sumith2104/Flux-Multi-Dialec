import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2020',
  banner: {
    js: `/**
 * Fluxbase Client SDK v1.0.0
 * Official JavaScript/TypeScript client for Fluxbase
 * https://github.com/Sumith2104/Fluxbase
 * MIT License
 */`
  }
});
