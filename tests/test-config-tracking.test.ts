import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('.pi/test-config.json tracking', () => {
  const configPath = join(__dirname, '..', '.pi', 'test-config.json');

  it('exists with timeoutPerCommand set to 1500', () => {
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { timeoutPerCommand?: number };
    expect(config.timeoutPerCommand).toBe(1500);
  });

  it('is tracked by git (not ignored)', () => {
    // `git check-ignore` exits 0 when the path is ignored, non-zero otherwise.
    // We expect it to NOT be ignored — i.e. exit non-zero.
    let exitCode = 1;
    try {
      execSync(`git check-ignore .pi/test-config.json`, {
        stdio: 'ignore',
        cwd: join(__dirname, '..'),
      });
      // If we reach here, exit code was 0 (ignored) — that's a failure.
      throw new Error('path should not be gitignored');
    } catch (err: unknown) {
      exitCode = (err as { status?: number }).status ?? 1;
    }
    expect(exitCode).toBe(1);
  });

  it('is listed in git ls-files (tracked)', () => {
    const output = execSync('git ls-files .pi/test-config.json', {
      cwd: join(__dirname, '..'),
    }).toString('utf8').trim();
    expect(output).toBe('.pi/test-config.json');
  });
});
