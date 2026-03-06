import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js'],
    setupFiles: ['fake-indexeddb/auto', 'tests/setup/foundry-mocks.js'],
  },
});
