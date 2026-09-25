/**
 * Tests for the Vitest → flat-TAP reporter bridge
 * (`scripts/vitest-tap-reporter.ts`).
 *
 * Verifies:
 *
 * - The reporter emits the flat TAP shape (`not ok N - <file> > <suite > test>`
 *   plus YAML `error: |-` / `stack: |-` blocks) that the global test-skill
 *   runner's `parse_node_failures` understands.
 * - A deliberately-failing Vitest fixture, run with both the default and the
 *   TAP reporter, produces parseable per-test failure records with non-empty
 *   `stdout_excerpt` and `stack_trace`.
 * - The default reporter's human-readable summary is preserved alongside the
 *   TAP output.
 * - The reporter is silent when every test passes (the retry wrapper's
 *   "all files passed" detection must not break).
 *
 * See: CG-0MUECISUW0075KJZ (this file), CG-0MUECQ22U002Z0A1 (reporter),
 * CG-0MUDYCJUC009URD6 (parent).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  VitestTapReporter,
  formatTapName,
  renderTapFailure,
  toRelativeModuleId,
  type TapError,
  type TapWriter,
} from '../../scripts/vitest-tap-reporter';

const REPO_ROOT = join(__dirname, '..', '..');
const FIXTURE_DIR = join(REPO_ROOT, 'tests', 'tooling', 'fixtures');
const FIXTURE_CONFIG = join(FIXTURE_DIR, 'vitest.tap-fixture.config.ts');
const FAILING_FIXTURE = join(
  FIXTURE_DIR,
  'tap-reporter-deliberately-failing.fixture.ts',
);
const TAP_REPORTER = join(REPO_ROOT, 'scripts', 'vitest-tap-reporter.ts');

/** Collect the reporter's writes into a single string. */
function captureWriter(): { chunks: string[]; write: TapWriter } {
  const chunks: string[] = [];
  return { chunks, write: (chunk: string) => chunks.push(chunk) };
}

/** Minimal structural stand-in for a failed `TestCase`. */
function fakeTestCase(
  moduleId: string,
  fullName: string,
  errors: TapError[],
): Parameters<VitestTapReporter['onTestCaseResult']>[0] {
  return {
    module: { moduleId },
    fullName,
    result: () => ({ state: 'failed', errors }),
  } as unknown as Parameters<VitestTapReporter['onTestCaseResult']>[0];
}

/** Minimal structural stand-in for a passing `TestCase`. */
function fakePassingTestCase(
  moduleId: string,
): Parameters<VitestTapReporter['onTestCaseResult']>[0] {
  return {
    module: { moduleId },
    fullName: 'suite > passing test',
    result: () => ({ state: 'passed', errors: [] }),
  } as unknown as Parameters<VitestTapReporter['onTestCaseResult']>[0];
}

/** Locate the global run_tests.py (same discovery as the extension tests). */
function findGlobalRunner(): string | null {
  const candidates = [
    process.env.PI_AGENT_HOME
      ? join(process.env.PI_AGENT_HOME, 'skills', 'test', 'scripts', 'run_tests.py')
      : null,
    join(homedir(), '.pi', 'agent', 'skills', 'test', 'scripts', 'run_tests.py'),
  ].filter((c): c is string => c !== null);
  return candidates.find((c) => existsSync(c)) ?? null;
}

const GLOBAL_RUNNER = findGlobalRunner();

interface ParsedFailure {
  test_name: string;
  stdout_excerpt: string;
  stack_trace: string;
}

/** Parse TAP output with the global runner's `parse_node_failures`. */
function parseWithGlobalRunner(tap: string): ParsedFailure[] {
  const scriptsDir = join(GLOBAL_RUNNER!, '..');
  const script = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
    'import run_tests',
    'output = sys.stdin.read()',
    'print(json.dumps(run_tests.parse_node_failures(output)))',
  ].join('\n');
  const result = spawnSync('python3', ['-c', script], {
    input: tap,
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `parser exited ${result.status}`);
  }
  return JSON.parse(result.stdout) as ParsedFailure[];
}

/** Run a Vitest fixture through the TAP + default reporters. */
function runFixtureWithTapReporter(): { stdout: string; stderr: string } {
  const result = spawnSync(
    'npx',
    [
      'vitest',
      'run',
      '--config',
      FIXTURE_CONFIG,
      '--reporter=default',
      `--reporter=${TAP_REPORTER}`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 180_000,
      env: { ...process.env, VITEST: '' },
    },
  );
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('TAP formatting helpers', () => {
  it('formats the TAP name as <file> > <suite > test>', () => {
    expect(formatTapName('tests/foo.test.ts', 'suite > test')).toBe(
      'tests/foo.test.ts > suite > test',
    );
  });

  it('relativises absolute module ids under cwd', () => {
    const absolute = join(REPO_ROOT, 'tests', 'foo.test.ts');
    expect(toRelativeModuleId(absolute, REPO_ROOT)).toBe('tests/foo.test.ts');
  });

  it('leaves virtual and out-of-tree module ids unchanged', () => {
    expect(toRelativeModuleId('virtual:foo', REPO_ROOT)).toBe('virtual:foo');
    expect(toRelativeModuleId('/somewhere/else/foo.test.ts', REPO_ROOT)).toBe(
      '/somewhere/else/foo.test.ts',
    );
  });

  it('renders a flat TAP failure block with error and stack YAML blocks', () => {
    const tap = renderTapFailure(3, 'tests/foo.test.ts', 'suite > test', [
      {
        name: 'AssertionError',
        message: 'expected 1 to be 2',
        stack:
          'AssertionError: expected 1 to be 2\n    at tests/foo.test.ts:12:3',
      },
    ]);
    const lines = tap.split('\n');
    expect(lines[0]).toBe('not ok 3 - tests/foo.test.ts > suite > test');
    expect(tap).toContain('\n  ---\n');
    expect(tap).toContain('  error: |-\n');
    expect(tap).toContain('  stack: |-\n');
    expect(tap).toContain('  ...\n');
    expect(tap).toContain('AssertionError: expected 1 to be 2');
    expect(tap).toContain('at tests/foo.test.ts:12:3');
  });

  it('folds the cause chain into the error message', () => {
    const tap = renderTapFailure(1, 'tests/foo.test.ts', 'suite > test', [
      {
        name: 'Error',
        message: 'outer',
        stack: 'Error: outer',
        cause: { name: 'Error', message: 'inner' },
      },
    ]);
    expect(tap).toContain('Error: outer');
    expect(tap).toContain('Caused by: Error: inner');
  });

  it('falls back to the test name when no error carries a message', () => {
    const tap = renderTapFailure(1, 'tests/foo.test.ts', 'suite > test', []);
    expect(tap).toContain('not ok 1 - tests/foo.test.ts > suite > test');
    // The name is reused as the error/stack body so the parser still sees text.
    expect(tap).toContain('suite > test');
  });
});

// ---------------------------------------------------------------------------
// Reporter behaviour
// ---------------------------------------------------------------------------

describe('VitestTapReporter', () => {
  it('is silent for a passing test case', () => {
    const { chunks, write } = captureWriter();
    const reporter = new VitestTapReporter({ write });
    reporter.onTestCaseResult(
      fakePassingTestCase(join(REPO_ROOT, 'tests', 'foo.test.ts')),
    );
    expect(chunks.join('')).toBe('');
  });

  it('emits a TAP block for a failed test case', () => {
    const { chunks, write } = captureWriter();
    const reporter = new VitestTapReporter({ write });
    reporter.onTestCaseResult(
      fakeTestCase(join(REPO_ROOT, 'tests', 'foo.test.ts'), 'suite > test', [
        { name: 'AssertionError', message: 'boom', stack: 'AssertionError: boom' },
      ]),
    );
    const output = chunks.join('');
    expect(output).toContain('not ok 1 -');
    expect(output).toContain('tests/foo.test.ts > suite > test');
  });

  it('numbers successive failures monotonically', () => {
    const { chunks, write } = captureWriter();
    const reporter = new VitestTapReporter({ write });
    reporter.onTestCaseResult(
      fakeTestCase(join(REPO_ROOT, 'tests', 'a.test.ts'), 'a', [
        { name: 'Error', message: 'a' },
      ]),
    );
    reporter.onTestCaseResult(
      fakeTestCase(join(REPO_ROOT, 'tests', 'b.test.ts'), 'b', [
        { name: 'Error', message: 'b' },
      ]),
    );
    const output = chunks.join('');
    expect(output).toContain('not ok 1 - tests/a.test.ts > a');
    expect(output).toContain('not ok 2 - tests/b.test.ts > b');
  });

  it('emits a module-level failure for collection errors', () => {
    const { chunks, write } = captureWriter();
    const reporter = new VitestTapReporter({ write });
    const fakeModule = {
      moduleId: join(REPO_ROOT, 'tests', 'broken.test.ts'),
      errors: () => [{ name: 'SyntaxError', message: 'unexpected token' }],
    } as unknown as Parameters<VitestTapReporter['onTestModuleEnd']>[0];
    reporter.onTestModuleEnd(fakeModule);
    expect(chunks.join('')).toContain('not ok 1 - tests/broken.test.ts > (module)');
  });

  it('is silent for a module with no errors', () => {
    const { chunks, write } = captureWriter();
    const reporter = new VitestTapReporter({ write });
    const fakeModule = {
      moduleId: join(REPO_ROOT, 'tests', 'clean.test.ts'),
      errors: () => [],
    } as unknown as Parameters<VitestTapReporter['onTestModuleEnd']>[0];
    reporter.onTestModuleEnd(fakeModule);
    expect(chunks.join('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Global-parser compatibility
// ---------------------------------------------------------------------------

describe('global parse_node_failures compatibility', () => {
  it('global parser is available', () => {
    expect(GLOBAL_RUNNER).not.toBeNull();
  });

  it('parses a rendered TAP failure into a named record', () => {
    const tap = renderTapFailure(1, 'tests/foo.test.ts', 'suite > test', [
      {
        name: 'AssertionError',
        message: 'expected 1 to be 2',
        stack: 'AssertionError: expected 1 to be 2\n    at tests/foo.test.ts:12:3',
      },
    ]);
    const records = parseWithGlobalRunner(tap);
    expect(records).toHaveLength(1);
    expect(records[0].test_name).toBe('tests/foo.test.ts > suite > test');
    expect(records[0].stdout_excerpt.length).toBeGreaterThan(0);
    expect(records[0].stack_trace.length).toBeGreaterThan(0);
  });

  it('parses the real fixture output emitted via the CLI reporter', () => {
    const { stdout, stderr } = runFixtureWithTapReporter();
    const combined = `${stdout}\n${stderr}`;
    const records = parseWithGlobalRunner(combined);
    expect(records.length).toBeGreaterThanOrEqual(1);
    const record = records.find((r) => r.test_name.includes('fails on purpose'));
    expect(record).toBeDefined();
    expect(record!.stdout_excerpt.length).toBeGreaterThan(0);
    expect(record!.stack_trace.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// End-to-end reporter loading
// ---------------------------------------------------------------------------

describe('deliberately-failing fixture through the CLI reporter', () => {
  it('fixture and config are present', () => {
    expect(existsSync(FAILING_FIXTURE)).toBe(true);
    expect(existsSync(FIXTURE_CONFIG)).toBe(true);
  });

  it('emits flat TAP and preserves the default reporter summary', () => {
    const { stdout, stderr } = runFixtureWithTapReporter();
    const combined = `${stdout}\n${stderr}`;

    // TAP reporter output.
    expect(combined).toContain('not ok 1 -');
    expect(combined).toContain('> deliberately failing TAP fixture > fails on purpose');
    expect(combined).toContain('  error: |-');
    expect(combined).toContain('  stack: |-');

    // Default reporter summary preserved.
    expect(combined).toContain('Test Files');
    expect(combined).toMatch(/failed/);
  });
});
