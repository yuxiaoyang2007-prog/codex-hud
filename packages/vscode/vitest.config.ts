import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '../..',
  test: {
    include: ['packages/vscode/src/**/*.test.ts']
  }
});
