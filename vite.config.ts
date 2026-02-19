/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core-engine': path.resolve(__dirname, 'src/core-engine'),
      '@card-system': path.resolve(__dirname, 'src/card-system'),
      '@rule-engine': path.resolve(__dirname, 'src/rule-engine'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: false,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.browser.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/**/*.browser.test.ts'],
          sequence: {
            concurrent: false,
          },
          testTimeout: 30_000,
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }],
            viewport: { width: 900, height: 700 },
          },
        },
      },
    ],
  },
});
