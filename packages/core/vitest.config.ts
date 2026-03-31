import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '../..',
  test: {
    include: ['packages/core/src/**/*.test.ts']
  }
});
