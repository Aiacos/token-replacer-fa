import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js'],
    setupFiles: ['fake-indexeddb/auto', 'tests/setup/foundry-mocks.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Only the shipped module counts; CI tooling has its own tests.
      include: ['scripts/**/*.js'],
    },
  },
});
