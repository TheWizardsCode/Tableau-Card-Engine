/**
 * Vite plugin that injects __APP_VERSION__ as a global constant.
 *
 * Unlike Vite's `define` option (which can be unreliable in dev mode
 * when the config is a function), this plugin uses a proper plugin hook
 * that works consistently across dev and production builds.
 *
 * It reads the version from package.json (single source of truth) and
 * replaces all references to `__APP_VERSION__` with the literal version string.
 */
import { resolve } from 'path';
import fs from 'fs';
import type { Plugin } from 'vite';

export function versionDefinePlugin(): Plugin {
  const pkg = JSON.parse(
    fs.readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')
  );
  const APP_VERSION = pkg.version;

  return {
    name: 'vite-version-define',
    transform(code, id) {
      const query = id.split('?')[1];
      // Skip node_modules, test files, and non-TS/JS files
      // Exclude test files to avoid replacing __APP_VERSION__ in test code strings
      if (
        id.includes('node_modules') ||
        id.includes('.test.') ||
        id.includes('.spec.') ||
        !/\.(ts|js|mjs|tsx|jsx)$/.test(id) ||
        query === 'inline'
      ) {
        return;
      }

      // Replace all occurrences of __APP_VERSION__ with the literal version string
      const replaced = code.replace(
        /__APP_VERSION__/g,
        JSON.stringify(APP_VERSION)
      );

      if (replaced !== code) {
        return { code: replaced, map: null };
      }
    },
  };
}
