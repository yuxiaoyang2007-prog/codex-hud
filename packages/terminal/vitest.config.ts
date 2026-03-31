import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '../..',
  test: {
    include: ['packages/terminal/src/**/*.test.ts']
  }
});
