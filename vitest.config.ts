import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  // tsconfig uses `jsx: preserve` for Next; tests that import .tsx (the PDF report) need a real transform.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/golden/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
