/**
 * Unit tests for the Electron launcher content resolver
 * (electron/content-locator.ts) — pure Node, no Electron runtime.
 *
 * Covers the parent work item's DLC content architecture (AC #4):
 * the resolver defaults to the bundled app, honours an external content
 * override (Steam DLC install dir), and rejects invalid locations with
 * structured errors.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveContentDir,
  ContentLocatorError,
  CONTENT_DIR_ENV,
} from '../../electron/content-locator';

const tempDirs: string[] = [];

/** Create a temp content root with an optional index.html entry. */
function makeContentRoot(withEntry: boolean, extraFiles: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-content-'));
  tempDirs.push(dir);
  const files: Record<string, string> = { ...extraFiles };
  if (withEntry) files['index.html'] = '<!doctype html><html></html>';
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

afterEach(() => {
  delete process.env[CONTENT_DIR_ENV];
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveContentDir', () => {
  it('returns the bundled dist directory as the default when no override is provided', () => {
    const bundled = makeContentRoot(true);
    const resolved = resolveContentDir({ bundledDir: bundled });

    expect(resolved.contentDir).toBe(bundled);
    expect(resolved.entryFile).toBe(path.join(bundled, 'index.html'));
    expect(resolved.source).toBe('bundled');
  });

  it('honors an explicit content-dir override over the bundled default', () => {
    const bundled = makeContentRoot(true);
    const override = makeContentRoot(true);

    const resolved = resolveContentDir({ bundledDir: bundled, override });

    expect(resolved.contentDir).toBe(override);
    expect(resolved.entryFile).toBe(path.join(override, 'index.html'));
    expect(resolved.source).toBe('override');
  });

  it('honors the TCE_CONTENT_DIR env var when no explicit override is given', () => {
    const bundled = makeContentRoot(true);
    const override = makeContentRoot(true);
    process.env[CONTENT_DIR_ENV] = override;

    const resolved = resolveContentDir({ bundledDir: bundled });

    expect(resolved.contentDir).toBe(override);
    expect(resolved.source).toBe('override');
  });

  it('lets an explicit override win over the env var', () => {
    const bundled = makeContentRoot(true);
    const fromEnv = makeContentRoot(true);
    const fromArg = makeContentRoot(true);
    process.env[CONTENT_DIR_ENV] = fromEnv;

    const resolved = resolveContentDir({ bundledDir: bundled, override: fromArg });

    expect(resolved.contentDir).toBe(fromArg);
  });

  it('resolves a Steam DLC-style external layout (content root with index.html + assets)', () => {
    const dlcRoot = makeContentRoot(true, {
      'assets/js/bundle.js': 'console.log("dlc");',
      'assets/css/site.css': 'body{}',
    });

    const resolved = resolveContentDir({ bundledDir: makeContentRoot(true), override: dlcRoot });

    expect(resolved.contentDir).toBe(dlcRoot);
    expect(resolved.entryFile).toBe(path.join(dlcRoot, 'index.html'));
    // The DLC assets live alongside the entry file, resolvable by the renderer.
    expect(fs.existsSync(path.join(resolved.contentDir, 'assets', 'js', 'bundle.js'))).toBe(true);
  });

  it('honors a custom entry file name', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-content-'));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'launcher.html'), '<html></html>');

    const resolved = resolveContentDir({ bundledDir: dir, entryFileName: 'launcher.html' });

    expect(resolved.entryFile).toBe(path.join(dir, 'launcher.html'));
  });

  it('rejects a missing override directory with a structured error', () => {
    const missing = path.join(os.tmpdir(), 'tce-does-not-exist-' + Date.now());

    let error: unknown;
    try {
      resolveContentDir({ bundledDir: makeContentRoot(true), override: missing });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ContentLocatorError);
    const locatorError = error as ContentLocatorError;
    expect(locatorError.code).toBe('CONTENT_DIR_NOT_FOUND');
    expect(locatorError.exitCode).toBeGreaterThan(0);
    expect(locatorError.message).toContain(missing);
  });

  it('rejects a bundled directory that is missing', () => {
    const missing = path.join(os.tmpdir(), 'tce-does-not-exist-' + Date.now());

    expect(() => resolveContentDir({ bundledDir: missing })).toThrowError(ContentLocatorError);
  });

  it('rejects a content directory that has no index.html entry file', () => {
    const noEntry = makeContentRoot(false);

    let error: unknown;
    try {
      resolveContentDir({ bundledDir: noEntry });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ContentLocatorError);
    const locatorError = error as ContentLocatorError;
    expect(locatorError.code).toBe('ENTRY_FILE_NOT_FOUND');
    expect(locatorError.message).toContain('index.html');
  });
});
