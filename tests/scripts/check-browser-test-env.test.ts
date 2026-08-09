/**
 * Unit tests for the browser-test environment pre-check
 * (scripts/check-browser-test-env.ts).
 *
 * The full test suite's browser stages need Playwright's Chromium; when a
 * prerequisite is missing the suite previously timed out with an opaque
 * Vitest browser error. The pre-check detects the missing prerequisite
 * launch-free (package resolution + one existsSync) and prints the exact
 * remediation commands. See CG-0MSJ7ZXD5005N9E5.
 *
 * These tests use the injectable-dependency pattern: detection and
 * remediation are pure functions fed with fake resolvers/paths, so no
 * browser is launched and no network is touched.
 */
import { describe, it, expect } from 'vitest';
import {
  detectMissingPrereqs,
  buildRemediationMessage,
  runCheck,
  type CheckEnvDeps,
  type MissingPrereq,
} from '../../scripts/check-browser-test-env';

// ── Injectable dependency fixtures ─────────────────────────────

/** All prerequisites present: both packages resolve and the Chromium binary exists. */
const ALL_PRESENT: CheckEnvDeps = {
  resolveModule: () => '/node_modules/playwright/index.js',
  chromiumExecutablePath: () => '/cache/ms-playwright/chromium/chrome',
  pathExists: () => true,
  platform: 'linux',
};

/** Playwright package missing entirely. */
const NO_PLAYWRIGHT: CheckEnvDeps = {
  ...ALL_PRESENT,
  resolveModule: (id) => (id === 'playwright' ? null : '/node_modules/x/index.js'),
};

/** @vitest/browser package missing entirely. */
const NO_VITEST_BROWSER: CheckEnvDeps = {
  ...ALL_PRESENT,
  resolveModule: (id) =>
    id === '@vitest/browser' ? null : '/node_modules/x/index.js',
};

/** Chromium binary path points at a non-existent file. */
const NO_CHROMIUM_BINARY: CheckEnvDeps = {
  ...ALL_PRESENT,
  pathExists: () => false,
};

/** Chromium executable path unavailable (playwright package unloadable). */
const NO_CHROMIUM_PATH: CheckEnvDeps = {
  ...ALL_PRESENT,
  chromiumExecutablePath: () => null,
};

// ── detectMissingPrereqs ───────────────────────────────────────

describe('detectMissingPrereqs (launch-free detection)', () => {
  it('returns no missing prereqs when packages resolve and the Chromium binary exists', () => {
    expect(detectMissingPrereqs(ALL_PRESENT)).toEqual([]);
  });

  it('detects a missing playwright package', () => {
    expect(detectMissingPrereqs(NO_PLAYWRIGHT)).toContain('playwright');
  });

  it('detects a missing @vitest/browser package', () => {
    expect(detectMissingPrereqs(NO_VITEST_BROWSER)).toContain('@vitest/browser');
  });

  it('detects a Chromium binary that does not exist on disk', () => {
    expect(detectMissingPrereqs(NO_CHROMIUM_BINARY)).toContain('chromium');
  });

  it('detects a Chromium when the executable path cannot be resolved', () => {
    expect(detectMissingPrereqs(NO_CHROMIUM_PATH)).toContain('chromium');
  });

  it('reports each distinct missing prerequisite exactly once', () => {
    const deps: CheckEnvDeps = {
      resolveModule: () => null,
      chromiumExecutablePath: () => null,
      pathExists: () => false,
    };
    const missing = detectMissingPrereqs(deps);
    expect(missing.sort()).toEqual(['@vitest/browser', 'chromium', 'playwright']);
  });

  it('touches only the injected functions (no browser launch, no network)', () => {
    let resolveCalls = 0;
    let pathCalls = 0;
    const deps: CheckEnvDeps = {
      resolveModule: () => {
        resolveCalls += 1;
        return '/node_modules/x/index.js';
      },
      chromiumExecutablePath: () => '/cache/ms-playwright/chromium/chrome',
      pathExists: () => {
        pathCalls += 1;
        return true;
      },
    };
    detectMissingPrereqs(deps);
    // Exactly two package resolutions + one path existence check — no
    // subprocess, no browser launch, no network.
    expect(resolveCalls).toBe(2);
    expect(pathCalls).toBe(1);
  });
});

// ── buildRemediationMessage ────────────────────────────────────

describe('buildRemediationMessage (actionable remediation)', () => {
  const allMissing: MissingPrereq[] = ['playwright', '@vitest/browser', 'chromium'];

  it('lists every missing prerequisite', () => {
    const msg = buildRemediationMessage(allMissing, 'linux');
    expect(msg).toContain('playwright');
    expect(msg).toContain('@vitest/browser');
    expect(msg).toContain('chromium');
  });

  it('includes the install command `npx playwright install chromium`', () => {
    expect(buildRemediationMessage(['chromium'], 'linux')).toContain(
      'npx playwright install chromium',
    );
  });

  it('includes the Linux system-deps variant with a sudo note on Linux', () => {
    const msg = buildRemediationMessage(['chromium'], 'linux');
    expect(msg).toContain('npx playwright install --with-deps chromium');
    expect(msg).toContain('sudo');
  });

  it('omits the Linux --with-deps variant on non-Linux platforms', () => {
    const msg = buildRemediationMessage(['chromium'], 'darwin');
    expect(msg).not.toContain('--with-deps');
    expect(msg).toContain('npx playwright install chromium');
  });

  it('includes the verify command `npx playwright install --list`', () => {
    expect(buildRemediationMessage(['chromium'], 'linux')).toContain(
      'npx playwright install --list',
    );
  });
});

// ── runCheck exit codes ────────────────────────────────────────

describe('runCheck (exit codes)', () => {
  it('exits 0 when all prerequisites are present and prints an OK message', () => {
    const printed: string[] = [];
    const code = runCheck(ALL_PRESENT, (m) => printed.push(m));
    expect(code).toBe(0);
    expect(printed.join('\n')).toContain('OK');
  });

  it('exits 1 when a package is missing and prints the remediation message', () => {
    const printed: string[] = [];
    const code = runCheck(NO_PLAYWRIGHT, (m) => printed.push(m));
    expect(code).toBe(1);
    expect(printed.join('\n')).toContain('npx playwright install chromium');
  });

  it('exits 1 when the Chromium binary is missing and prints the remediation message', () => {
    const printed: string[] = [];
    const code = runCheck(NO_CHROMIUM_BINARY, (m) => printed.push(m));
    expect(code).toBe(1);
    expect(printed.join('\n')).toContain('npx playwright install --list');
  });

  it('honors an injected platform for the Linux --with-deps hint', () => {
    const printed: string[] = [];
    const code = runCheck(
      { ...NO_PLAYWRIGHT, platform: 'linux' },
      (m) => printed.push(m),
    );
    expect(code).toBe(1);
    expect(printed.join('\n')).toContain('--with-deps');
  });

  it('defaults to process.platform when no platform is injected', () => {
    // No platform in deps → uses process.platform; on Linux the --with-deps
    // hint is present, elsewhere it is absent. Either way the install
    // command must be present.
    const printed: string[] = [];
    const code = runCheck({ ...NO_PLAYWRIGHT, platform: undefined }, (m) =>
      printed.push(m),
    );
    expect(code).toBe(1);
    const msg = printed.join('\n');
    expect(msg).toContain('npx playwright install chromium');
    if (process.platform === 'linux') {
      expect(msg).toContain('--with-deps');
    } else {
      expect(msg).not.toContain('--with-deps');
    }
  });
});
