/**
 * Tests for the TCE test-skill extension (local extension contract).
 *
 * Verifies:
 *
 * - AC1: `extension.json` exists, parses, and defines all required types
 *   (`unit`, `smoke`, `dev`, `browser`, `tutorial`, `e2e`, `electron`)
 *   while deliberately omitting `full`.
 * - AC2: The global test-skill resolver resolves every locally-defined type
 *   to its expected commands and rejects unknown types.
 * - AC4: Every browser-dependent type (`smoke`, `dev`, `browser`, `tutorial`,
 *   `e2e`) chains `check-browser-test-env.ts`; every typed Vitest command
 *   runs through `vitest-run-with-retry.ts` with `--reporter=default` plus
 *   `--reporter=./scripts/vitest-tap-reporter.ts`.
 * - AC5: `tutorial` and `e2e` cover Main Street tutorial parts with the
 *   established order (part3 last) plus the `replay-e2e` project.
 * - AC6: `full` is deliberately omitted so bare `/skill:test` runs the real
 *   full CI suite.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = join(__dirname, '..', '..');
const EXTENSION_PATH = join(
  REPO_ROOT,
  '.pi',
  'skills_extensions',
  'test',
  'extension.json',
);

/** Parse the extension.json into a `types` map. */
function loadExtensionTypes(): Record<string, string | string[]> | null {
  const raw = readFileSync(EXTENSION_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return parsed.types ?? null;
}

/** Normalise a single command value to a list. */
function normaliseCommands(
  typeMap: Record<string, string | string[]>,
  key: string,
): string[] {
  const value = typeMap[key];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.length > 0) return [...value];
  return [];
}

/**
 * Locate the global test-skill `run_tests.py`. The global skill root is
 * either `$PI_AGENT_HOME`, `~/.pi/agent`, or a local `skills/` checkout.
 */
function findGlobalRunner(): string | null {
  const candidates = [
    process.env.PI_AGENT_HOME
      ? join(process.env.PI_AGENT_HOME, 'skills', 'test', 'scripts', 'run_tests.py')
      : null,
    join(homedir(), '.pi', 'agent', 'skills', 'test', 'scripts', 'run_tests.py'),
    join(REPO_ROOT, 'skills', 'test', 'scripts', 'run_tests.py'),
  ].filter((c): c is string => c !== null);
  return candidates.find((c) => existsSync(c)) ?? null;
}

const GLOBAL_TEST_RUNNER = findGlobalRunner();

// Tutorial parts in the established order (from run-tutorial-tests.sh):
// part1 → part2 → part4 → part5 → part6 → part3
const TUTORIAL_PART_ORDER = [
  'tutorial-part1',
  'tutorial-part2',
  'tutorial-part4',
  'tutorial-part5',
  'tutorial-part6',
  'tutorial-part3',
];

// Browser-dependent types that must chain check-browser-test-env.ts
const BROWSER_DEPENDENT_TYPES = ['smoke', 'dev', 'browser', 'tutorial', 'e2e'];

// ---------------------------------------------------------------------------
// AC1: extension.json structure and required types
// ---------------------------------------------------------------------------

describe('AC1 — extension.json structure', () => {
  it('extension.json exists and parses', () => {
    const raw = readFileSync(EXTENSION_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).toBeInstanceOf(Object);
  });

  it('defines all required types', () => {
    const types = loadExtensionTypes();
    expect(types).not.toBeNull();
    const required = ['unit', 'smoke', 'dev', 'browser', 'tutorial', 'e2e', 'electron'];
    for (const key of required) {
      expect(types).toHaveProperty(key);
      const cmds = normaliseCommands(types as Record<string, string | string[]>, key);
      expect(cmds.length).toBeGreaterThan(0);
    }
  });

  it('deliberately omits `full`', () => {
    const types = loadExtensionTypes();
    expect(types).not.toHaveProperty('full');
  });
});

// ---------------------------------------------------------------------------
// AC2 + AC3: Global resolver integration
// ---------------------------------------------------------------------------

describe('AC2/AC3 — resolver resolves local types and rejects unknowns', () => {
  // The global resolver is the authoritative consumer of the local extension
  // contract (SA-0MSQ7MQEJ0064ZB0).
  const GLOBAL_RUNNER = GLOBAL_TEST_RUNNER;

  /**
   * Resolve a test type to commands by importing the global resolver in a
   * Python subprocess and printing the resolved command list as JSON.
   */
  function resolveViaRunner(testType: string): string[] {
    const scriptsDir = join(GLOBAL_RUNNER!, '..');
    const script = [
      'import json, sys',
      `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
      'import run_tests',
      `print(json.dumps(run_tests.resolve_type_commands(${JSON.stringify(REPO_ROOT)}, ${JSON.stringify(testType)})))`,
    ].join('\n');

    const result = spawnSync('python3', ['-c', script], { encoding: 'utf-8' });
    if (result.status !== 0) {
      throw new Error(result.stderr || `resolver exited ${result.status}`);
    }
    return JSON.parse(result.stdout) as string[];
  }

  it('global resolver is available', () => {
    expect(GLOBAL_RUNNER).not.toBeNull();
  });

  it('resolves every locally-defined type to its expected commands', () => {
    const types = loadExtensionTypes();
    expect(types).not.toBeNull();

    for (const key of Object.keys(types as Record<string, string | string[]>)) {
      const cmds = resolveViaRunner(key);
      expect(Array.isArray(cmds)).toBe(true);
      expect(cmds.length).toBeGreaterThan(0);
    }
  });

  it('rejects an unknown type', () => {
    expect(() => resolveViaRunner('nonexistent-type')).toThrow(
      /unknown test type/i,
    );
  });

  it('resolves `full` via fallback to the real full CI suite', () => {
    const cmds = resolveViaRunner('full');
    expect(Array.isArray(cmds)).toBe(true);
    expect(cmds.length).toBeGreaterThan(0);
    // The full suite should contain the npm test command.
    const cmdStr = cmds.join(' ');
    expect(cmdStr).toContain('test');
  });
});

// ---------------------------------------------------------------------------
// AC4: Command structure validation
// ---------------------------------------------------------------------------

describe('AC4 — browser-dependent types chain pre-check and TAP reporter', () => {
  const types = loadExtensionTypes();

  it('every browser-dependent type chains check-browser-test-env.ts', () => {
    for (const type of BROWSER_DEPENDENT_TYPES) {
      const cmds = normaliseCommands(types as Record<string, string | string[]>, type);
      const joined = cmds.join(' ');
      expect(joined).toContain('check-browser-test-env');
    }
  });

  it('every typed Vitest command runs through vitest-run-with-retry.ts', () => {
    for (const key of Object.keys(types as Record<string, string | string[]>)) {
      if (key === 'electron') continue; // electron uses a different runner
      const cmds = normaliseCommands(types as Record<string, string | string[]>, key);
      const joined = cmds.join(' ');
      expect(joined).toContain('vitest-run-with-retry');
    }
  });

  it('every typed Vitest command uses the TAP reporter flags', () => {
    for (const key of Object.keys(types as Record<string, string | string[]>)) {
      if (key === 'electron') continue;
      const cmds = normaliseCommands(types as Record<string, string | string[]>, key);
      const joined = cmds.join(' ');
      expect(joined).toContain('--reporter=default');
      expect(joined).toContain('vitest-tap-reporter');
    }
  });
});

// ---------------------------------------------------------------------------
// AC5: Tutorial and e2e part coverage + order
// ---------------------------------------------------------------------------

describe('AC5 — tutorial/e2e part coverage and ordering', () => {
  const types = loadExtensionTypes();

  it('tutorial covers all parts in the established order (part3 last)', () => {
    const tutorialCmds = normaliseCommands(
      types as Record<string, string | string[]>,
      'tutorial',
    );
    expect(tutorialCmds.length).toBe(TUTORIAL_PART_ORDER.length);

    // Extract the project names from the commands
    const projects: string[] = [];
    for (const cmd of tutorialCmds) {
      const match = cmd.match(/--project\s+(\S+)/);
      expect(match).not.toBeNull();
      projects.push(match![1]);
    }

    expect(projects).toEqual(TUTORIAL_PART_ORDER);
  });

  it('e2e covers all tutorial parts plus replay-e2e', () => {
    const e2eCmds = normaliseCommands(types as Record<string, string | string[]>, 'e2e');

    // Extract project names
    const projects: string[] = [];
    for (const cmd of e2eCmds) {
      const match = cmd.match(/--project\s+(\S+)/);
      expect(match).not.toBeNull();
      projects.push(match![1]);
    }

    // First should be tutorial parts in order, then replay-e2e
    const tutorialProjects = projects.slice(0, TUTORIAL_PART_ORDER.length);
    expect(tutorialProjects).toEqual(TUTORIAL_PART_ORDER);
    expect(projects[TUTORIAL_PART_ORDER.length]).toBe('replay-e2e');
    expect(projects.length).toBe(TUTORIAL_PART_ORDER.length + 1);
  });

  it('tutorial part list matches scripts/run-tutorial-tests.sh', () => {
    // Read the tutorial test script and extract the loop variable values.
    // The script uses `for part in part1 part2 part4 part5 part6 part3;`
    // and then `--project "tutorial-${part}"`.
    const scriptPath = join(REPO_ROOT, 'scripts', 'run-tutorial-tests.sh');
    const scriptContent = readFileSync(scriptPath, 'utf-8');

    // Extract the `for part in ...` loop body
    const forMatch = scriptContent.match(/for\s+part\s+in\s+([^;]+);/);
    expect(forMatch).not.toBeNull();
    const parts = forMatch![1].trim().split(/\s+/);
    const expectedProjects = parts.map((p: string) => `tutorial-${p}`);

    const types = loadExtensionTypes();
    const tutorialCmds = normaliseCommands(
      types as Record<string, string | string[]>,
      'tutorial',
    );
    const extensionProjects: string[] = [];
    for (const cmd of tutorialCmds) {
      const m = cmd.match(/--project\s+(\S+)/);
      expect(m).not.toBeNull();
      extensionProjects.push(m![1]);
    }

    // The extension's tutorial commands must match the canonical part order
    // from run-tutorial-tests.sh.
    expect(extensionProjects).toEqual(expectedProjects);
  });
});

// ---------------------------------------------------------------------------
// AC7: SKILL_PREFIX.md prose hook
// ---------------------------------------------------------------------------

describe('AC7 — SKILL_PREFIX.md prose hook', () => {
  /**
   * Ask the global extension loader to load TCE's `test` extension and report
   * whether the prose prefix is surfaced. Exercises the real loader rather
   * than inspecting file text (per the Test Writing Guidelines).
   */
  function loadExtensionViaRunner(): {
    present: boolean;
    prefix: string | null;
  } {
    const scriptsDir = join(GLOBAL_TEST_RUNNER!, '..');
    const skillsRoot = join(scriptsDir, '..', '..');
    const script = [
      'import json, sys',
      `sys.path.insert(0, ${JSON.stringify(skillsRoot)})`,
      'from shared.skill_extensions import load_extension',
      `ext = load_extension('test', ${JSON.stringify(REPO_ROOT)})`,
      "print(json.dumps({'present': ext.present, 'prefix': ext.prefix}))",
    ].join('\n');
    const result = spawnSync('python3', ['-c', script], { encoding: 'utf-8' });
    if (result.status !== 0) {
      throw new Error(result.stderr || `loader exited ${result.status}`);
    }
    return JSON.parse(result.stdout) as { present: boolean; prefix: string | null };
  }

  it('is present and surfaced by the extension loader', () => {
    const ext = loadExtensionViaRunner();
    expect(ext.present).toBe(true);
    expect(ext.prefix).not.toBeNull();
    expect((ext.prefix ?? '').length).toBeGreaterThan(0);
  });
});
