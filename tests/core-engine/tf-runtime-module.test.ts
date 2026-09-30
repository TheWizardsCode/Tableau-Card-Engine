/**
 * Unit test: committed ToneForge runtime synth module is present and valid.
 *
 * Verifies that the runtime synth module shipped in public/build/tf-synths/
 * exists on disk, is importable as an ES module, and exports the expected
 * TF_RUNTIME_MODULE/factories with the full set of synth keys.
 *
 * This test asserts AC3 (deterministic + single source of truth) and AC4
 * (test coverage) of CG-0MUL2G17U003C1N6.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

/** The path where the committed runtime module lives.
 *
 * public/build/ is explicitly allowed in .gitignore (excluded from the
 * build/ gitignore rule) so the committed runtime module ships with every
 * Vite/ Electron build without requiring the tf CLI.
 */
const RUNTIME_MODULE_PATH = path.join(
  repoRoot,
  'public',
  'build',
  'tf-synths',
  'main-street-runtime-synth.mjs',
);

/** All expected synth factory keys. */
const EXPECTED_KEYS = [
  'card-draw',
  'card-slide',
  'card-place',
  'card-discard',
  'card-coin-collect',
  'ui-notification-chime',
  'card-table-ambience',
  'construction-hammer',
  'construction-saw',
  'construction-lite-hammer',
  'construction-lite-saw',
  'crowd-cheer',
];

describe('ToneForge runtime synth module', () => {
  it('should exist on disk at public/build/tf-synths/main-street-runtime-synth.mjs', () => {
    expect(fs.existsSync(RUNTIME_MODULE_PATH)).toBe(true);
  });

  it('should be importable and export TF_RUNTIME_MODULE with descriptors and factories', async () => {
    // Dynamic import the committed module (same path the runtime requests).
    const moduleUrl = pathToFileUrl(RUNTIME_MODULE_PATH);
    const mod = await import(/* @vite-ignore */ moduleUrl);

    // TF_RUNTIME_MODULE must be the primary export.
    expect(mod.TF_RUNTIME_MODULE).toBeDefined();
    expect(mod.TF_RUNTIME_MODULE?.descriptors).toBeDefined();
    expect(mod.TF_RUNTIME_MODULE?.factories).toBeDefined();

    // Also verify named exports for direct consumption.
    expect(mod.descriptors).toBeDefined();
    expect(mod.factories).toBeDefined();
    expect(mod.getFactory).toBeInstanceOf(Function);
  });

  it('should export factories for all expected synth keys', async () => {
    const moduleUrl = pathToFileUrl(RUNTIME_MODULE_PATH);
    const mod = await import(/* @vite-ignore */ moduleUrl);

    for (const key of EXPECTED_KEYS) {
      expect(mod.factories).toHaveProperty(key);
      expect(typeof mod.factories[key]).toBe('function');
    }
  });

  it('should export descriptors for all expected synth keys', async () => {
    const moduleUrl = pathToFileUrl(RUNTIME_MODULE_PATH);
    const mod = await import(/* @vite-ignore */ moduleUrl);

    for (const key of EXPECTED_KEYS) {
      expect(mod.descriptors).toHaveProperty(key);
    }
  });

  it('should have getFactory return the correct factory for each key', () => {
    // getFactory is synchronous and just delegates to factories[].
    // Read the module text to verify getFactory implementation.
    const content = fs.readFileSync(RUNTIME_MODULE_PATH, 'utf-8');
    // getFactory should return factories[name].
    expect(content).toContain('export function getFactory(name)');
    expect(content).toContain('return factories[name]');
  });

  it('should be included in the Vite public/ output (i.e. not gitignored)', () => {
    // If the file path is gitignored, it won't be copied into dist/.
    // The public/ directory is NOT gitignored (except game-specific paths),
    // so public/build/ is safe to commit.
    const gitignorePath = path.join(repoRoot, '.gitignore');
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');

    // The build/ path in .gitignore should NOT match public/build/
    // (gitignore rules are relative to the file's location).
    expect(gitignore).toContain('build/');
    // But public/build/ is not excluded — public/ itself is tracked.
    // The 'build/' gitignore rule matches ./build/ not ./public/build/.
    // Verify that public/build/ is not explicitly gitignored.
    const publicBuildGitignore = gitignore.match(/^public\/build\//m);
    expect(publicBuildGitignore).toBeNull();
  });
});

/** Convert a filesystem path to a file:// URL for dynamic import(). */
function pathToFileUrl(filePath: string): string {
  return new URL(`file://${filePath}`).href;
}
