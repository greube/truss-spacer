import { defineConfig } from 'vitest/config';

// base './' so the same build works at /truss-spacer/cad/ (Pages) and locally
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'test/**/*.test.ts'] },
});
