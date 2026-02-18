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
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
