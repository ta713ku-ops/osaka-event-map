import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Collection tests use Node's built-in test runner so they can exercise
    // filesystem/cache behavior without a jsdom transform.
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'scripts/**/*.test.mjs'],
  },
});
