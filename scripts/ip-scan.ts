#!/usr/bin/env node
/**
 * Prohibited-term (IP) scan CLI.
 *
 * Carries the prohibited-term checklist into the content review gate: a
 * writer or reviewer runs one command and gets a per-file verdict over the
 * guarded set (the GDD, its worked examples/graph and the shipped story-line
 * content), or over an ad-hoc candidate file before it is committed.
 *
 * ```bash
 * npm run storylines:ip-scan                    # every configured target
 * npm run storylines:ip-scan -- path/to/new.csv # ad-hoc: named files only
 * npm run storylines:ip-scan -- --json          # machine-readable report
 * ```
 *
 * The guarded set is data (`configs/storyline-ip-scan.json`), so adding a
 * content file to the gate is a config edit, not a code edit; the CI guard
 * (`tests/gym/LongErasureContent.test.ts`) scans the same set, so a file added
 * to the config can never pass by being skipped.
 *
 * Exit codes: `0` = clean; `1` = a prohibited term was found, a target could
 * not be read, or the term list is malformed (fail closed).
 *
 * Runs under `tsx`; nothing here imports a game module or Phaser.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseProhibitedTermList,
  scanProhibitedTerms,
  type ProhibitedTermMatch,
} from '../src/story-line/content/ip-terms';
import { parseArgv } from './storyline-cli-support';

/** Repository-relative default guarded-set config. */
export const DEFAULT_IP_SCAN_CONFIG_PATH = 'configs/storyline-ip-scan.json';

/** CLI usage text. */
export const IP_SCAN_USAGE = `Scan story-line content and design documents for prohibited third-party terms.

Usage:
  npx tsx scripts/ip-scan.ts [paths...] [options]

Options:
  --path <path>      Scan one file in addition to (or instead of) the config set
  --config <path>    Guarded-set config (default: ${DEFAULT_IP_SCAN_CONFIG_PATH})
  --terms <path>     Prohibited-term list (default: the config's "terms", then
                     tests/fixtures/story-line/ip-prohibited-terms.json)
  --json             Emit the machine-readable report
  --help             Show this help

With no path, every file in the guarded set is scanned. Naming one or more
paths scans exactly those files (an ad-hoc pre-commit check).

Matching is case-insensitive and prefix-anchored (a term catches its
inflections); narrow technical allowances are declared in the term list.

Exit codes: 0 = clean, 1 = a prohibited term, an unreadable target or a
malformed term list.`;

/** One target's scan result. */
export interface IpScanFileResult {
  /** Repository-relative path as configured/supplied. */
  readonly path: string;
  /** The prohibited terms found in the file (empty when clean). */
  readonly matches: readonly ProhibitedTermMatch[];
}

/** The complete scan report. */
export interface IpScanReport {
  /** True when every target was readable and no prohibited term was found. */
  readonly success: boolean;
  /** Repository-relative path of the term list that was used. */
  readonly termsPath: string;
  /** Number of prohibited terms. */
  readonly termCount: number;
  /** Number of narrow allowances. */
  readonly allowanceCount: number;
  /** Per-file results in target order. */
  readonly files: readonly IpScanFileResult[];
  /** Total number of prohibited-term matches. */
  readonly violations: number;
  /** Read/parse errors that made the scan fail closed. */
  readonly errors: readonly string[];
}

/** The guarded-set config document. */
export interface IpScanConfig {
  /** Repository-relative prohibited-term list path. */
  readonly terms?: string;
  /** Repository-relative files the gate covers, in report order. */
  readonly targets: readonly string[];
}

/** Options accepted by {@link runIpScan}. */
export interface IpScanOptions {
  /** Absolute repository root (tests inject a temp directory). */
  readonly root: string;
  /** Repository-relative targets to scan, in report order. */
  readonly targets: readonly string[];
  /** Repository-relative term-list path. */
  readonly termsPath: string;
}

/** Default term list, used when neither the CLI nor the config names one. */
export const DEFAULT_TERMS_PATH = 'tests/fixtures/story-line/ip-prohibited-terms.json';

/** Reads and validates a JSON file, returning a total result. */
function readJson(path: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf-8')) as unknown };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Validates a guarded-set config document. */
export function parseIpScanConfig(
  input: unknown,
): { ok: true; config: IpScanConfig } | { ok: false; errors: readonly string[] } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['config must be a JSON object'] };
  }
  const record = input as Record<string, unknown>;
  const errors: string[] = [];
  const targets = record.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    errors.push('targets must be a non-empty array of paths');
  }
  const validTargets: string[] = [];
  if (Array.isArray(targets)) {
    for (const [index, target] of targets.entries()) {
      if (typeof target !== 'string' || target.trim().length === 0) {
        errors.push(`targets[${index}] must be a non-empty string`);
        continue;
      }
      validTargets.push(target);
    }
  }
  const terms = record.terms;
  if (terms !== undefined && (typeof terms !== 'string' || terms.trim().length === 0)) {
    errors.push('terms must be a non-empty string when present');
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      ...(typeof terms === 'string' ? { terms } : {}),
      targets: validTargets,
    },
  };
}

/**
 * Runs the scan over the supplied targets.
 *
 * Total: an unreadable target or a malformed term list is reported in
 * `errors` and makes the report unsuccessful — a scan that could not read a
 * file must never read as clean.
 *
 * @param options Root, targets and term-list path.
 * @returns The scan report.
 */
export function runIpScan(options: IpScanOptions): IpScanReport {
  const errors: string[] = [];
  const files: IpScanFileResult[] = [];

  const loaded = readJson(resolve(options.root, options.termsPath));
  const parsed =
    loaded.ok
      ? parseProhibitedTermList(loaded.value)
      : ({ ok: false, errors: [`${options.termsPath}: ${loaded.error}`] } as const);

  if (!parsed.ok) {
    return {
      success: false,
      termsPath: options.termsPath,
      termCount: 0,
      allowanceCount: 0,
      files,
      violations: 0,
      errors: parsed.errors,
    };
  }

  if (options.targets.length === 0) errors.push('no scan targets supplied');

  for (const path of options.targets) {
    let text: string;
    try {
      text = readFileSync(resolve(options.root, path), 'utf-8');
    } catch (error) {
      errors.push(`${path}: cannot read (${(error as Error).message})`);
      continue;
    }
    files.push({ path, matches: scanProhibitedTerms(text, parsed.list) });
  }

  const violations = files.reduce((total, file) => total + file.matches.length, 0);
  return {
    success: errors.length === 0 && violations === 0,
    termsPath: options.termsPath,
    termCount: parsed.list.terms.length,
    allowanceCount: parsed.list.allowedOccurrences.length,
    files,
    violations,
    errors,
  };
}

/**
 * Renders a report for a human reader.
 *
 * @param report A report from {@link runIpScan}.
 * @returns The report text, without a trailing newline.
 */
export function formatIpScanReport(report: IpScanReport): string {
  const lines: string[] = [
    `Prohibited-term scan — ${report.files.length} file(s), ${report.termCount} term(s), ${report.allowanceCount} allowance(s)`,
    `  terms: ${report.termsPath}`,
  ];
  for (const file of report.files) {
    if (file.matches.length === 0) {
      lines.push(`  ✓ ${file.path}`);
      continue;
    }
    const found = file.matches
      .map((match) => `line ${match.line} — ${match.term}`)
      .join('; ');
    lines.push(`  ✗ ${file.path}: ${found}`);
  }
  for (const error of report.errors) lines.push(`  ! ${error}`);
  if (report.success) {
    lines.push(
      `RESULT: CLEAN — no prohibited term in ${report.files.length} file(s).`,
    );
  } else {
    const parts: string[] = [];
    if (report.violations > 0) parts.push(`${report.violations} prohibited-term match(es)`);
    if (report.errors.length > 0) parts.push(`${report.errors.length} error(s)`);
    lines.push(`RESULT: FAILED — ${parts.join(', ')}.`);
  }
  return lines.join('\n');
}

/** Reads the guarded set from a config file. */
function loadConfig(
  root: string,
  configPath: string,
): { ok: true; config: IpScanConfig } | { ok: false; errors: readonly string[] } {
  const loaded = readJson(resolve(root, configPath));
  if (!loaded.ok) return { ok: false, errors: [`${configPath}: ${loaded.error}`] };
  const parsed = parseIpScanConfig(loaded.value);
  if (!parsed.ok) return { ok: false, errors: parsed.errors.map((e) => `${configPath}: ${e}`) };
  return parsed;
}

/**
 * CLI entry point.
 *
 * @param argv Raw arguments (without the node/script prefix).
 * @param root Repository root (default: this script's parent directory).
 * @returns The process exit code.
 */
export function runIpScanCli(
  argv: readonly string[],
  root: string = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
): number {
  const { flags, positionals } = parseArgv(argv);
  if (flags.has('help')) {
    process.stdout.write(`${IP_SCAN_USAGE}\n`);
    return 0;
  }

  const configPath = flags.get('config') ?? DEFAULT_IP_SCAN_CONFIG_PATH;
  const adHoc = [...positionals];
  const pathFlag = flags.get('path');
  if (pathFlag === 'true') {
    process.stderr.write('ip-scan: --path requires a value\n');
    return 1;
  }
  if (pathFlag !== undefined) adHoc.push(pathFlag);

  const loaded = loadConfig(root, configPath);
  let targets: readonly string[];
  let config: IpScanConfig | undefined;
  if (adHoc.length > 0) {
    // An ad-hoc scan ignores the configured target list but still honours the
    // config's term list; a missing config is not fatal here because the
    // default term list is a complete, committed list.
    targets = adHoc;
    config = loaded.ok ? loaded.config : undefined;
  } else {
    if (!loaded.ok) {
      for (const error of loaded.errors) process.stderr.write(`ip-scan: ${error}\n`);
      return 1;
    }
    config = loaded.config;
    targets = config.targets;
  }

  const termsPath = flags.get('terms') ?? config?.terms ?? DEFAULT_TERMS_PATH;
  const report = runIpScan({ root, targets, termsPath });

  process.stdout.write(
    flags.has('json')
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${formatIpScanReport(report)}\n`,
  );
  return report.success ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runIpScanCli(process.argv.slice(2));
}
