/**
 * The prohibited-term (IP) scan CLI (`scripts/ip-scan.ts`).
 *
 * These tests exercise the scan engine and the command behaviour over a
 * temporary repository root: a clean target passes, a violating target fails
 * with the line a reviewer acts on, an unreadable target or a malformed term
 * list fails closed (a scan that could not run must never read as clean), and
 * the configured guarded set is a non-empty registry of existing files — so a
 * content file can never leave the gate by being silently dropped.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_IP_SCAN_CONFIG_PATH,
  formatIpScanReport,
  parseIpScanConfig,
  runIpScan,
  runIpScanCli,
} from '../../scripts/ip-scan';

const tempRoots: string[] = [];

/** Creates a temp repository root, removed when the test file finishes. */
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ip-scan-'));
  tempRoots.push(root);
  return root;
}

/** Writes `content` at a repository-relative path under `root`. */
function write(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf-8');
}

/** The term list used by the focused cases. */
const TERMS_PATH = 'tests/fixtures/terms.json';
const TERMS = {
  terms: ['warp', 'phaser'],
  allowedOccurrences: [
    { pattern: '`Phaser`', rationale: 'the engine framework, in a code span' },
  ],
};

/** The guarded-set config used by the CLI cases. */
const CONFIG_PATH = DEFAULT_IP_SCAN_CONFIG_PATH;

/** Sets up a root with the term list and a guarded set. */
function makeConfiguredRoot(targets: string[]): string {
  const root = makeRoot();
  write(root, TERMS_PATH, JSON.stringify(TERMS));
  write(root, CONFIG_PATH, JSON.stringify({ terms: TERMS_PATH, targets }));
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('runIpScan', () => {
  it('reports a clean target as successful', () => {
    const root = makeRoot();
    write(root, TERMS_PATH, JSON.stringify(TERMS));
    write(root, 'docs/clean.md', 'The Archivist reweaves a drowned homeland.\n');

    const report = runIpScan({ root, targets: ['docs/clean.md'], termsPath: TERMS_PATH });

    expect(report).toMatchObject({
      success: true,
      termCount: 2,
      allowanceCount: 1,
      violations: 0,
      errors: [],
    });
    expect(report.files).toEqual([{ path: 'docs/clean.md', matches: [] }]);
    expect(formatIpScanReport(report)).toContain('RESULT: CLEAN');
    expect(formatIpScanReport(report)).toContain('✓ docs/clean.md');
  });

  it('reports a prohibited term with its line and fails', () => {
    const root = makeRoot();
    write(root, TERMS_PATH, JSON.stringify(TERMS));
    write(root, 'content/bad.csv', 'id,name\nx1,The first warp\n');

    const report = runIpScan({ root, targets: ['content/bad.csv'], termsPath: TERMS_PATH });

    expect(report.success).toBe(false);
    expect(report.violations).toBe(1);
    expect(report.files[0]?.matches).toEqual([{ term: 'warp', line: 2 }]);
    const text = formatIpScanReport(report);
    expect(text).toContain('✗ content/bad.csv: line 2 — warp');
    expect(text).toContain('RESULT: FAILED');
  });

  it('honours the framework allowance', () => {
    const root = makeRoot();
    write(root, TERMS_PATH, JSON.stringify(TERMS));
    write(root, 'docs/framework.md', 'The logic module is `Phaser`-free.\n');

    const report = runIpScan({
      root,
      targets: ['docs/framework.md'],
      termsPath: TERMS_PATH,
    });

    expect(report.success).toBe(true);
  });

  it('fails closed when a target cannot be read', () => {
    const root = makeRoot();
    write(root, TERMS_PATH, JSON.stringify(TERMS));

    const report = runIpScan({ root, targets: ['docs/missing.md'], termsPath: TERMS_PATH });

    expect(report.success).toBe(false);
    expect(report.errors).toEqual([expect.stringContaining('docs/missing.md: cannot read')]);
  });

  it('fails closed on a malformed term list', () => {
    const root = makeRoot();
    write(root, TERMS_PATH, JSON.stringify({ terms: [] }));

    const report = runIpScan({ root, targets: [], termsPath: TERMS_PATH });

    expect(report.success).toBe(false);
    expect(report.errors).toContain('terms must contain at least one term');
  });

  it('fails closed when no target is supplied', () => {
    const root = makeRoot();
    write(root, TERMS_PATH, JSON.stringify(TERMS));

    const report = runIpScan({ root, targets: [], termsPath: TERMS_PATH });

    expect(report.success).toBe(false);
    expect(report.errors).toContain('no scan targets supplied');
  });
});

describe('parseIpScanConfig', () => {
  it('accepts a config with a term list and targets', () => {
    expect(parseIpScanConfig({ terms: TERMS_PATH, targets: ['a.md'] })).toEqual({
      ok: true,
      config: { terms: TERMS_PATH, targets: ['a.md'] },
    });
  });

  it('accepts a config that relies on the default term list', () => {
    expect(parseIpScanConfig({ targets: ['a.md'] })).toEqual({
      ok: true,
      config: { targets: ['a.md'] },
    });
  });

  it('rejects an empty target set and malformed entries', () => {
    expect(parseIpScanConfig({ targets: [] })).toEqual({
      ok: false,
      errors: ['targets must be a non-empty array of paths'],
    });
    const parsed = parseIpScanConfig({ terms: '', targets: ['a.md', 7] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors).toEqual(
        expect.arrayContaining([
          'terms must be a non-empty string when present',
          'targets[1] must be a non-empty string',
        ]),
      );
    }
  });
});

describe('runIpScanCli', () => {
  it('scans the configured guarded set and exits 0 when clean', () => {
    const root = makeConfiguredRoot(['docs/clean.md']);
    write(root, 'docs/clean.md', 'A quiet chart.\n');
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(runIpScanCli([], root)).toBe(0);
    const printed = out.mock.calls.map((call) => String(call[0])).join('');
    expect(printed).toContain('RESULT: CLEAN');
    expect(printed).toContain('2 term(s)');
  });

  it('exits 1 and names the offending term', () => {
    const root = makeConfiguredRoot(['docs/bad.md']);
    write(root, 'docs/bad.md', 'The warp drive hums.\n');
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(runIpScanCli([], root)).toBe(1);
    const printed = out.mock.calls.map((call) => String(call[0])).join('');
    expect(printed).toContain('line 1 — warp');
    expect(err).not.toHaveBeenCalled();
  });

  it('scans exactly the named ad-hoc files with --path', () => {
    const root = makeConfiguredRoot(['docs/never-scanned.md']);
    write(root, 'docs/never-scanned.md', 'A warp in the plan.\n');
    write(root, 'docs/candidate.md', 'A clean candidate.\n');
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(runIpScanCli(['--path', 'docs/candidate.md'], root)).toBe(0);
    const printed = out.mock.calls.map((call) => String(call[0])).join('');
    expect(printed).toContain('1 file(s)');
    expect(printed).toContain('✓ docs/candidate.md');
  });

  it('emits the JSON report', () => {
    const root = makeConfiguredRoot(['docs/clean.md']);
    write(root, 'docs/clean.md', 'A quiet chart.\n');
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(runIpScanCli(['--json'], root)).toBe(0);
    const printed = out.mock.calls.map((call) => String(call[0])).join('');
    expect(JSON.parse(printed)).toMatchObject({ success: true, violations: 0, termCount: 2 });
  });

  it('fails closed when the config is missing', () => {
    const root = makeRoot();
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(runIpScanCli([], root)).toBe(1);
    expect(err.mock.calls.map((call) => String(call[0])).join('')).toContain(
      DEFAULT_IP_SCAN_CONFIG_PATH,
    );
  });

  it('rejects a --path flag with no value', () => {
    const root = makeRoot();
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(runIpScanCli(['--path'], root)).toBe(1);
    expect(err.mock.calls.map((call) => String(call[0])).join('')).toContain(
      '--path requires a value',
    );
  });

  it('prints usage on --help without reading a config', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(runIpScanCli(['--help'], makeRoot())).toBe(0);
    expect(out.mock.calls.map((call) => String(call[0])).join('')).toContain(
      'prohibited third-party terms',
    );
  });
});
