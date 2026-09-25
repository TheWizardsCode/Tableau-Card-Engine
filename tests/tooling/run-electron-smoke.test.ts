/**
 * Tests for the extracted Electron smoke runner (`scripts/run-electron-smoke.sh`).
 *
 * Verifies the display-selection heuristic behaviourally via the script's
 * `TCE_SMOKE_DRY_RUN=1` mode, which prints the command it would run without
 * launching Electron:
 *
 * - `TCE_SMOKE_BINARY` set → run the packaged binary directly.
 * - Linux with no `DISPLAY` and `xvfb-run` available → wrap in `xvfb-run -a`.
 * - `DISPLAY` set (or non-Linux) → run directly.
 * - No display and no `xvfb-run` on Linux → skip with a notice (exit 0).
 *
 * The runner requires a display and a built Electron app, so a real launch is
 * impractical in the unit suite; the selection logic is the testable core.
 *
 * See: CG-0MUECRMTO0016FH2 (this file), CG-0MUDYCJUC009URD6 (parent).
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'run-electron-smoke.sh');

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run the extracted runner in dry-run mode with a controlled environment. */
function runDry(
  env: NodeJS.ProcessEnv = {},
): RunResult {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      TCE_SMOKE_DRY_RUN: '1',
      // Clear display/heuristic inputs; callers opt back in explicitly.
      DISPLAY: '',
      TCE_SMOKE_BINARY: '',
      ...env,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// ---------------------------------------------------------------------------
// Fixtures: a fake xvfb-run (available) and a minimal PATH without it.
// ---------------------------------------------------------------------------

let fakeXvfbDir: string;
let minimalPathDir: string;

beforeAll(() => {
  fakeXvfbDir = join(tmpdir(), `tce-fake-xvfb-${process.pid}`);
  mkdirSync(fakeXvfbDir, { recursive: true });
  const xvfbRun = join(fakeXvfbDir, 'xvfb-run');
  writeFileSync(xvfbRun, '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(xvfbRun, 0o755);

  // A PATH containing only `bash` (command resolution), `dirname` (script-dir
  // resolution) and a fake `uname` that reports Linux, with NO xvfb-run.
  minimalPathDir = join(tmpdir(), `tce-minimal-path-${process.pid}`);
  mkdirSync(minimalPathDir, { recursive: true });
  symlinkSync('/bin/bash', join(minimalPathDir, 'bash'));
  symlinkSync('/usr/bin/dirname', join(minimalPathDir, 'dirname'));
  const fakeUname = join(minimalPathDir, 'uname');
  writeFileSync(fakeUname, '#!/usr/bin/env bash\necho Linux\n');
  chmodSync(fakeUname, 0o755);
});

afterAll(() => {
  rmSync(fakeXvfbDir, { recursive: true, force: true });
  rmSync(minimalPathDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Selection behaviour
// ---------------------------------------------------------------------------

describe('run-electron-smoke.sh display selection', () => {
  it('runs the packaged binary directly when TCE_SMOKE_BINARY is set', () => {
    const result = runDry({ TCE_SMOKE_BINARY: '/path/to/tce.exe' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('npx vitest run --project electron');
  });

  it('wraps in xvfb-run when DISPLAY is unset and xvfb-run is available', () => {
    const result = runDry({
      PATH: `${fakeXvfbDir}:${process.env.PATH}`,
      DISPLAY: '',
      TCE_SMOKE_BINARY: '',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      'xvfb-run -a npx vitest run --project electron',
    );
  });

  it('runs directly when a native DISPLAY is present', () => {
    const result = runDry({
      // Provide a fake xvfb-run too, to prove DISPLAY takes precedence.
      PATH: `${fakeXvfbDir}:${process.env.PATH}`,
      DISPLAY: ':99',
      TCE_SMOKE_BINARY: '',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('npx vitest run --project electron');
  });

  it('skips with a notice when no display and no xvfb-run on Linux', () => {
    const result = runDry({
      PATH: minimalPathDir,
      DISPLAY: '',
      TCE_SMOKE_BINARY: '',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SKIP: no display and xvfb-run unavailable');
    expect(result.stdout).not.toContain('vitest run');
  });

  it('TCE_SMOKE_BINARY takes precedence over DISPLAY and xvfb-run', () => {
    const result = runDry({
      PATH: `${fakeXvfbDir}:${process.env.PATH}`,
      DISPLAY: ':99',
      TCE_SMOKE_BINARY: '/path/to/tce.exe',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('npx vitest run --project electron');
  });
});
