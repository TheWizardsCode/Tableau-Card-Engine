/**
 * Guard test for the startup-context budget thresholds (CG-0MUFCL5N50023PHJ).
 *
 * The pre-push gate (`.githooks/pre-push`) fails a push when the pi startup
 * context surface exceeds the committed thresholds in
 * `docs/dev/context-budget.thresholds.json`. That gate only fires at push
 * time; this test moves the same check into the fast `unit` profile so drift
 * is caught locally, before it blocks the whole team.
 *
 * It measures the surface with the same tool the hook uses
 * (`context-audit/scripts/measure_context.py`), resolved in the same order:
 *   1. `skill/context-audit/scripts/measure_context.py`
 *   2. `~/.pi/agent/skills/context-audit/scripts/measure_context.py`
 *
 * Fail-open: environments without `python3` or the `context-audit` skill skip
 * the guard with a clear reason, mirroring the hook's documented behaviour.
 *
 * See `docs/dev/context-budget.md` for the gate and refresh workflow.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const THRESHOLDS_PATH = path.join(
  REPO_ROOT,
  'docs',
  'dev',
  'context-budget.thresholds.json',
);
const REFRESH_SCRIPT = path.join(
  REPO_ROOT,
  'scripts',
  'refresh-context-thresholds.sh',
);

/** Resolve `measure_context.py` using the pre-push hook's resolution order. */
function resolveMeasureScript(): string | null {
  const candidates = [
    path.join(REPO_ROOT, 'skill', 'context-audit', 'scripts', 'measure_context.py'),
    path.join(
      os.homedir(),
      '.pi',
      'agent',
      'skills',
      'context-audit',
      'scripts',
      'measure_context.py',
    ),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function pythonAvailable(): boolean {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const measureScript = resolveMeasureScript();
const skipReason = !pythonAvailable()
  ? 'python3 not available; skipping context-budget threshold guard (fail-open)'
  : measureScript === null
    ? 'measure_context.py not found (context-audit skill absent); skipping context-budget threshold guard (fail-open)'
    : null;

/**
 * Write a stub `measure_context.py` into a throwaway repo.
 *
 * The refresh script resolves the measurement tool **local-first**
 * (`<repo>/skill/context-audit/scripts/measure_context.py`), so a stub makes
 * the refresh-output assertions deterministic and independent of whichever
 * `context-audit` release happens to be installed globally.
 */
function writeStubMeasure(
  repoRoot: string,
  values: Record<string, number>,
): void {
  const stubPath = path.join(
    repoRoot,
    'skill',
    'context-audit',
    'scripts',
    'measure_context.py',
  );
  fs.mkdirSync(path.dirname(stubPath), { recursive: true });
  fs.writeFileSync(
    stubPath,
    [
      'import json, sys',
      `VALUES = ${JSON.stringify(values)}`,
      'args = sys.argv[1:]',
      'if "--write-thresholds" in args:',
      '    out = args[args.index("--write-thresholds") + 1]',
      '    open(out, "w", encoding="utf-8").write(',
      '        json.dumps(VALUES, indent=2, sort_keys=True) + "\\n")',
      'else:',
      '    print(json.dumps(VALUES, sort_keys=True))',
      '',
    ].join('\n'),
  );
}

/** Measure the current startup context surface as a thresholds map. */
function measureSurface(): Record<string, number> {
  const generated = execFileSync(
    'python3',
    [measureScript as string, '--repo-root', REPO_ROOT, '--include-hidden', '--generate-thresholds'],
    { cwd: REPO_ROOT, encoding: 'utf-8' },
  );
  return JSON.parse(generated) as Record<string, number>;
}

describe('context-budget thresholds guard', () => {
  it('committed thresholds match the measured startup context surface', (ctx) => {
    if (skipReason) {
      ctx.skip(skipReason);
      return;
    }

    const measured = measureSurface();
    const committed = JSON.parse(
      fs.readFileSync(THRESHOLDS_PATH, 'utf-8'),
    ) as Record<string, number>;

    expect(
      committed,
      'Context-budget thresholds are stale. Refresh and commit them with your change:\n' +
        '  scripts/refresh-context-thresholds.sh\n' +
        '  git add docs/dev/context-budget.thresholds.json',
    ).toEqual(measured);
  });

  it('refresh helper reports stale thresholds without rewriting them', (ctx) => {
    if (skipReason) {
      ctx.skip(skipReason);
      return;
    }

    // Build a throwaway repo layout whose committed thresholds are stale
    // (an empty repo measures 0 bytes), so the helper's `--check` contract is
    // exercised without touching the real thresholds file.
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-budget-guard-'));
    try {
      const scriptsDir = path.join(tmpRepo, 'scripts');
      const docsDir = path.join(tmpRepo, 'docs', 'dev');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.mkdirSync(docsDir, { recursive: true });
      const scriptCopy = path.join(scriptsDir, 'refresh-context-thresholds.sh');
      fs.copyFileSync(REFRESH_SCRIPT, scriptCopy);
      const stalePath = path.join(docsDir, 'context-budget.thresholds.json');
      const staleContent = JSON.stringify(
        { global_agents: 0, project_agents: 99999, skills_prose: 0, total: 99999 },
        null,
        2,
      );
      fs.writeFileSync(stalePath, staleContent);

      let status = 0;
      let stderr = '';
      try {
        execFileSync('bash', [scriptCopy, '--check'], {
          cwd: tmpRepo,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        const err = error as { status?: number; stderr?: string };
        status = err.status ?? 1;
        stderr = err.stderr ?? '';
      }

      expect(status).toBe(1);
      expect(stderr).toContain('STALE');
      // `--check` must never rewrite the committed file.
      expect(fs.readFileSync(stalePath, 'utf-8')).toBe(staleContent);
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it('refresh helper names every measured component in its delta table', (ctx) => {
    if (skipReason) {
      ctx.skip(skipReason);
      return;
    }

    // The component list is derived from the measured/committed JSON rather
    // than a hardcoded four-key list, so a component added by
    // `measure_context.py` (e.g. `skill_implement_md`, CG-0MW940SUV002GQCN)
    // shows up in the delta table instead of drifting silently — and an
    // unknown extra key is printed rather than dropped.
    const measured: Record<string, number> = {
      global_agents: 11,
      project_agents: 22,
      skills_prose: 33,
      skill_implement_md: 44,
      total: 66,
      brand_new_component: 77,
    };
    const canonicalOrder = [
      'global_agents',
      'project_agents',
      'skills_prose',
      'total',
    ];

    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-budget-refresh-'));
    try {
      const scriptsDir = path.join(tmpRepo, 'scripts');
      const docsDir = path.join(tmpRepo, 'docs', 'dev');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.mkdirSync(docsDir, { recursive: true });
      const scriptCopy = path.join(scriptsDir, 'refresh-context-thresholds.sh');
      fs.copyFileSync(REFRESH_SCRIPT, scriptCopy);
      const thresholdsPath = path.join(
        docsDir,
        'context-budget.thresholds.json',
      );
      // Committed file predates the new component, mirroring real drift.
      fs.writeFileSync(
        thresholdsPath,
        JSON.stringify(
          { global_agents: 0, project_agents: 22, skills_prose: 0, total: 22 },
          null,
          2,
        ),
      );
      writeStubMeasure(tmpRepo, measured);

      const stdout = execFileSync('bash', [scriptCopy], {
        cwd: tmpRepo,
        encoding: 'utf-8',
      });

      for (const key of Object.keys(measured)) {
        expect(stdout).toContain(key);
      }
      // Canonical components first, then any non-canonical key appended.
      const extraKey = 'brand_new_component';
      const positions = canonicalOrder.map((key) => stdout.indexOf(key));
      for (const [index, position] of positions.entries()) {
        expect(position).toBeGreaterThanOrEqual(0);
        if (index > 0) expect(position).toBeGreaterThan(positions[index - 1]);
      }
      expect(stdout.indexOf(extraKey)).toBeGreaterThan(
        positions[positions.length - 1],
      );

      // The refresh writes the full measured map...
      expect(
        JSON.parse(fs.readFileSync(thresholdsPath, 'utf-8')),
      ).toEqual(measured);
      // ...and `--check` then passes, so both branches share one component set.
      expect(() =>
        execFileSync('bash', [scriptCopy, '--check'], {
          cwd: tmpRepo,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ).not.toThrow();
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  });
});
