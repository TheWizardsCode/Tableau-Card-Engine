/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';
import { transcriptPersistPlugin } from './scripts/vite-transcript-plugin';

export default defineConfig(({ mode, command }) => ({
  // Use the repo sub-path for production builds (GitHub Pages);
  // keep '/' for local development so localhost:3000 works as expected.
  base: mode === 'production' ? '/Tableau-Card-Engine/' : '/',
  plugins: [
    // Only register the transcript persistence plugin during dev server
    ...(command === 'serve' ? [transcriptPersistPlugin()] : []),
  ],
  resolve: {
    alias: {
      '@core-engine': path.resolve(__dirname, 'src/core-engine'),
      '@card-system': path.resolve(__dirname, 'src/card-system'),
      '@rule-engine': path.resolve(__dirname, 'src/rule-engine'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@ai': path.resolve(__dirname, 'src/ai'),
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
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/**/*.browser.test.ts'],
          fileParallelism: false,
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
}));
