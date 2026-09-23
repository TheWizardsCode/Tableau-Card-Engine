/**
 * Terminology guard regression test (CG-0MTMYIHKO001QCWL).
 *
 * Runs `scripts/check-terminology-guards.sh` and asserts it exits clean, so
 * day-as-turn wording cannot silently reappear in player-facing text or docs.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('terminology guard', () => {
  it(
    'passes with no forbidden day-as-turn tokens',
    () => {
      const res = spawnSync('bash', ['scripts/check-terminology-guards.sh'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        timeout: 60_000,
      });
      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      expect(res.stdout).toContain('PASS');
    },
    // Match the spawnSync timeout above: the guard spawns many greps and can
    // exceed vitest's 15s default under full-suite CPU contention, which would
    // fail the test before its own child timeout could apply.
    60_000,
  );
});
