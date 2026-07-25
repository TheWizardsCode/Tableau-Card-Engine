/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { transcriptPersistPlugin } from './scripts/vite-transcript-plugin';

// Read version from package.json (single source of truth)
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const APP_VERSION = pkg.version;

export default defineConfig(({ mode, command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  // Use the repo sub-path for production builds (GitHub Pages);
  // keep '/' for local development so localhost:3000 works as expected.
  base: mode === 'production' ? '/Tableau-Card-Engine/' : '/',
  plugins: [
    // Only register the transcript persistence plugin during normal dev-server runs.
    // Vitest browser uses an internal Vite server; avoid plugin middleware there to
    // prevent file-system side effects and extra request handling during tests.
    ...(command === 'serve' && !process.env.VITEST ? [transcriptPersistPlugin()] : []),
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
      // ── Unit Tests (Node environment) ─────────────────
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
      // ── Non-Tutorial Browser Tests ────────────────────
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/**/*.browser.test.ts'],
          exclude: ['tests/e2e/main-street-tutorial-e2e-*.browser.test.ts'],
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }],
            viewport: { width: 900, height: 700 },
            isolate: true,
          },
        },
      },
      // ── Tutorial E2E Tests (each in its own browser context) ──
      // Each part gets its own project with a uniquely-named browser
      // instance to prevent canvas/GPU context exhaustion from
      // sequential Phaser game create/destroy cycles.
      {
        extends: true,
        test: {
          name: 'tutorial-part1',
          include: ['tests/e2e/main-street-tutorial-e2e-part1.browser.test.ts'],
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium', name: 't1' }],
            viewport: { width: 900, height: 700 },
            isolate: true,
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'tutorial-part2',
          include: ['tests/e2e/main-street-tutorial-e2e-part2.browser.test.ts'],
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium', name: 't2' }],
            viewport: { width: 900, height: 700 },
            isolate: true,
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'tutorial-part3',
          include: ['tests/e2e/main-street-tutorial-e2e-part3.browser.test.ts'],
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium', name: 't3' }],
            viewport: { width: 900, height: 700 },
            isolate: true,
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'tutorial-part4',
          include: ['tests/e2e/main-street-tutorial-e2e-part4.browser.test.ts'],
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium', name: 't4' }],
            viewport: { width: 900, height: 700 },
            isolate: true,
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'tutorial-part5',
          include: ['tests/e2e/main-street-tutorial-e2e-part5.browser.test.ts'],
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium', name: 't5' }],
            viewport: { width: 900, height: 700 },
            isolate: true,
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'tutorial-part6',
          include: ['tests/e2e/main-street-tutorial-e2e-part6.browser.test.ts'],
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium', name: 't6' }],
            viewport: { width: 900, height: 700 },
            isolate: true,
          },
        },
      },
    ],
  },
}));
