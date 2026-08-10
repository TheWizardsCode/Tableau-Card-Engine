/**
 * Unit tests for the launcher CLI/content-dir wiring
 * (electron/launcher-config.ts) — pure Node, no Electron runtime.
 *
 * Verifies that the CLI `--content-dir` flag and the TCE_CONTENT_DIR env var
 * are wired into the content provider chain exactly as the parent work item's
 * Steam DLC architecture requires (override beats bundled default).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseContentDirArg,
  buildProviderChain,
  resolveGameContent,
} from '../../electron/launcher-config.js';
import { CONTENT_DIR_ENV } from '../../electron/content-locator.js';

const tempDirs: string[] = [];

function makeContentRoot(withEntry: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-lcfg-'));
  tempDirs.push(dir);
  if (withEntry) fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
  return dir;
}

afterEach(() => {
  delete process.env[CONTENT_DIR_ENV];
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('parseContentDirArg', () => {
  it('parses the --content-dir <dir> form', () => {
    expect(parseContentDirArg(['electron', '.', '--content-dir', '/dlc/path'])).toBe('/dlc/path');
  });

  it('parses the --content-dir=<dir> form', () => {
    expect(parseContentDirArg(['electron', '.', '--content-dir=/dlc/path'])).toBe('/dlc/path');
  });

  it('returns null when the flag is absent', () => {
    expect(parseContentDirArg(['electron', '.'])).toBeNull();
  });

  it('returns null when the flag has no value', () => {
    expect(parseContentDirArg(['electron', '.', '--content-dir'])).toBeNull();
  });
});

describe('resolveGameContent (provider chain)', () => {
  it('resolves the bundled dist dir when no override is given', () => {
    const bundled = makeContentRoot(true);

    const resolved = resolveGameContent({ argv: ['electron', '.'], bundledDir: bundled });

    expect(resolved.contentDir).toBe(bundled);
    expect(resolved.source).toBe('bundled');
  });

  it('lets the CLI --content-dir flag beat the bundled default', () => {
    const bundled = makeContentRoot(true);
    const dlc = makeContentRoot(true);

    const resolved = resolveGameContent({
      argv: ['electron', '.', '--content-dir', dlc],
      bundledDir: bundled,
    });

    expect(resolved.contentDir).toBe(dlc);
    expect(resolved.source).toBe('override');
  });

  it('lets the CLI flag beat the TCE_CONTENT_DIR env var', () => {
    const bundled = makeContentRoot(true);
    const fromEnv = makeContentRoot(true);
    const fromCli = makeContentRoot(true);
    process.env[CONTENT_DIR_ENV] = fromEnv;

    const resolved = resolveGameContent({
      argv: ['electron', '.', '--content-dir', fromCli],
      bundledDir: bundled,
    });

    expect(resolved.contentDir).toBe(fromCli);
  });

  it('falls back to TCE_CONTENT_DIR when no CLI flag is given', () => {
    const bundled = makeContentRoot(true);
    const fromEnv = makeContentRoot(true);
    process.env[CONTENT_DIR_ENV] = fromEnv;

    const resolved = resolveGameContent({ argv: ['electron', '.'], bundledDir: bundled });

    expect(resolved.contentDir).toBe(fromEnv);
    expect(resolved.source).toBe('override');
  });

  it('surfaces a structured error when the override directory is invalid', () => {
    const missing = path.join(os.tmpdir(), 'tce-missing-' + Date.now());

    expect(() =>
      resolveGameContent({
        argv: ['electron', '.', '--content-dir', missing],
        bundledDir: makeContentRoot(true),
      }),
    ).toThrowError(/content directory not found/i);
  });

  it('buildProviderChain: first provider that resolves wins', () => {
    const bundled = makeContentRoot(true);
    const dlc = makeContentRoot(true);

    const chain = buildProviderChain({
      argv: ['electron', '.', '--content-dir', dlc],
      bundledDir: bundled,
    });

    expect(chain[0].resolve()?.contentDir).toBe(dlc);
    expect(chain[1].resolve()?.contentDir).toBe(bundled);
  });
});
