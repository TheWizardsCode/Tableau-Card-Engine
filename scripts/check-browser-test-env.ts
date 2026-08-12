#!/usr/bin/env node
/**
 * Fast-fail pre-check for browser-test prerequisites.
 *
 * The full test suite (`npm test` → `scripts/run-ci-tests.sh`) runs three
 * stages: unit → non-tutorial browser → tutorial E2E. The browser stages
 * need Playwright's Chromium; when it is missing the suite previously
 * failed with an opaque Vitest browser error after a long timeout. This
 * script detects the missing prerequisite up front and prints the exact
 * remediation commands, so a clean environment fails fast (seconds, not
 * minutes) with an actionable message.
 *
 * Detection is launch-free and network-free (see CG-0MSJ7ZXD5005N9E5):
 *
 *   1. `playwright` package resolvable?
 *   2. `@vitest/browser` package resolvable?
 *   3. Playwright's Chromium binary exists at `chromium.executablePath()`?
 *
 * The check sequence and remediation text are pure, injectable functions
 * (following the pattern of `scripts/vitest-run-with-retry.ts`) so every
 * detection/remediation path is unit-testable without a real browser.
 *
 * Usage:
 *   npx tsx scripts/check-browser-test-env.ts
 *
 * Exit code: 0 when all prerequisites are present, 1 when any are missing.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** A prerequisite that can be missing for the browser test stages. */
export type MissingPrereq = 'playwright' | '@vitest/browser' | 'chromium';

/** Injectable dependencies for detection (defaults hit the real env). */
export interface CheckEnvDeps {
  /** Resolve a package specifier to a module path, or null when missing. */
  resolveModule?: (specifier: string) => string | null;
  /** Playwright Chromium executable path, or null when unavailable. */
  chromiumExecutablePath?: () => string | null;
  /** Whether a filesystem path exists. */
  pathExists?: (path: string) => boolean;
  /** OS platform override (defaults to `process.platform`). */
  platform?: string;
}

const require = createRequire(import.meta.url);

/** Resolve a package via `require.resolve`; null when not installed. */
function defaultResolveModule(specifier: string): string | null {
  try {
    return require.resolve(specifier);
  } catch {
    return null;
  }
}

/**
 * Playwright's `chromium.executablePath()` — the expected binary path,
 * computed from the browser registry without launching anything. Returns
 * null when the playwright package itself cannot be loaded.
 */
function defaultChromiumExecutablePath(): string | null {
  try {
    const { chromium } = require('playwright') as typeof import('playwright');
    return chromium.executablePath() ?? null;
  } catch {
    return null;
  }
}

/** Human-readable label for each prerequisite. */
const PREREQ_LABELS: Record<MissingPrereq, string> = {
  playwright: 'Playwright package (`playwright` in devDependencies)',
  '@vitest/browser': '@vitest/browser package (must match the vitest version)',
  chromium: 'Playwright Chromium browser binary',
};

/**
 * Detect which browser-test prerequisites are missing.
 * Launch-free and network-free: only package resolution + one `existsSync`.
 */
export function detectMissingPrereqs(deps: CheckEnvDeps = {}): MissingPrereq[] {
  const resolveModule = deps.resolveModule ?? defaultResolveModule;
  const chromiumExecutablePath =
    deps.chromiumExecutablePath ?? defaultChromiumExecutablePath;
  const pathExists = deps.pathExists ?? existsSync;

  const missing: MissingPrereq[] = [];
  if (!resolveModule('playwright')) missing.push('playwright');
  if (!resolveModule('@vitest/browser')) missing.push('@vitest/browser');
  const exePath = chromiumExecutablePath();
  if (!exePath || !pathExists(exePath)) missing.push('chromium');
  return missing;
}

/**
 * Build the actionable remediation message for the given missing
 * prerequisites. Includes the install, verify, and (on Linux) the
 * system-dependencies variant of `npx playwright install`.
 */
export function buildRemediationMessage(
  missing: MissingPrereq[],
  platform: string = process.platform,
): string {
  const lines: string[] = [
    'Browser-test prerequisites are missing:',
    ...missing.map((m) => `  - ${PREREQ_LABELS[m]}`),
    '',
    'Install Playwright Chromium:',
    '  npx playwright install chromium',
  ];
  if (platform === 'linux') {
    lines.push(
      '  npx playwright install --with-deps chromium   # Linux: also installs system libraries (may require sudo)',
    );
  }
  lines.push(
    '',
    'Verify the installation:',
    '  npx playwright install --list',
  );
  return lines.join('\n');
}

/**
 * Run the pre-check and return the exit code (0 = ready, 1 = missing
 * prerequisites). Prints the result via the injectable `print` (defaults
 * to stderr so the message survives CI piping of stdout).
 */
export function runCheck(
  deps: CheckEnvDeps = {},
  print: (msg: string) => void = (msg) => process.stderr.write(`${msg}\n`),
): number {
  const missing = detectMissingPrereqs(deps);
  if (missing.length === 0) {
    print('Browser-test environment OK: playwright, @vitest/browser, and Chromium are present.');
    return 0;
  }
  print(buildRemediationMessage(missing, deps.platform ?? process.platform));
  return 1;
}

function main(): void {
  process.exit(runCheck());
}

// Entry-point guard: run main() only when executed as a script, so the
// pure helpers can be imported by tests without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
