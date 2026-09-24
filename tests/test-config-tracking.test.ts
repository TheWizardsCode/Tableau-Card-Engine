import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..');
const configRelPath = '.pi/test-config.json';

/**
 * Return true when the git *ignore rules* exclude *relativePath*.
 *
 * `--no-index` is essential: without it `git check-ignore` never reports a
 * tracked path as ignored, so a regression that re-adds `.pi/test-config.json`
 * to `.gitignore` would go undetected. `--quiet` turns the result into an exit
 * code (0 = excluded, 1 = not excluded).
 */
function isGitIgnoredByRule(relativePath: string, cwd: string = repoRoot): boolean {
  try {
    execSync(`git check-ignore --no-index --quiet -- "${relativePath}"`, {
      stdio: 'ignore',
      cwd,
    });
    return true;
  } catch {
    return false;
  }
}

describe('.pi/test-config.json tracking', () => {
  it('exists with timeoutPerCommand set to 1500', () => {
    const config = JSON.parse(
      readFileSync(join(repoRoot, configRelPath), 'utf8'),
    ) as { timeoutPerCommand?: number };
    expect(config.timeoutPerCommand).toBe(1500);
  });

  it('is not ignored by the git ignore rules', () => {
    // Positive control: a genuinely ignored sibling under the same `.pi/*`
    // rule proves the helper detects ignore rules at all. Without it a
    // regression that re-ignores the config could still pass vacuously.
    expect(isGitIgnoredByRule('.pi/some-local-file.json')).toBe(true);
    expect(isGitIgnoredByRule(configRelPath)).toBe(false);
  });

  it('is tracked by git (listed in ls-files)', () => {
    const output = execSync(`git ls-files --error-unmatch -- ${configRelPath}`, {
      cwd: repoRoot,
    }).toString('utf8').trim();
    expect(output).toBe(configRelPath);
  });

  it('is inherited by a fresh git worktree of this repo', () => {
    // AC2: `implement.py finish` runs from a worktree and reads the timeout
    // from `<worktree>/.pi/test-config.json`. A fresh worktree only inherits
    // tracked files, so this asserts the exact mechanism the override relies
    // on — the config must be present, not ignored, and hold the 1500 s value
    // everywhere a worktree is created.
    const tmpRoot = mkdtempSync(join(tmpdir(), 'tce-test-config-worktree-'));
    const worktreePath = join(tmpRoot, 'wt');
    try {
      execSync(`git worktree add --detach "${worktreePath}" HEAD`, {
        cwd: repoRoot,
        stdio: 'ignore',
      });

      const config = JSON.parse(
        readFileSync(join(worktreePath, configRelPath), 'utf8'),
      ) as { timeoutPerCommand?: number };
      expect(config.timeoutPerCommand).toBe(1500);
      expect(isGitIgnoredByRule(configRelPath, worktreePath)).toBe(false);
    } finally {
      try {
        execSync(`git worktree remove --force "${worktreePath}"`, {
          cwd: repoRoot,
          stdio: 'ignore',
        });
      } catch {
        // Best-effort: if add failed there is nothing to remove; the temp
        // directory removal below is authoritative either way.
      }
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
