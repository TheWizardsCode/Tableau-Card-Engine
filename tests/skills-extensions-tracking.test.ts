import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..');

/**
 * Return true when git considers *relativePath* ignored.
 *
 * `git check-ignore` exits 0 when the path matches an exclude rule and 1 when
 * it does not, so a non-zero exit is the "tracked / not ignored" signal.
 */
function isGitIgnored(relativePath: string): boolean {
  try {
    execSync(`git check-ignore ${relativePath}`, {
      stdio: 'ignore',
      cwd: repoRoot,
    });
    return true;
  } catch {
    return false;
  }
}

describe('.pi/skills_extensions/ tracking', () => {
  it('is not gitignored, so the test-skill extension can be committed', () => {
    expect(isGitIgnored('.pi/skills_extensions/test/extension.json')).toBe(false);
  });

  it('allows the extension prose hooks to be tracked', () => {
    expect(isGitIgnored('.pi/skills_extensions/test/SKILL_PREFIX.md')).toBe(false);
    expect(isGitIgnored('.pi/skills_extensions/test/SKILL_POSTFIX.md')).toBe(false);
  });

  it('preserves the existing .pi/skills/ and .pi/test-config.json allow rules', () => {
    expect(isGitIgnored('.pi/test-config.json')).toBe(false);
    expect(isGitIgnored('.pi/skills/release-windows/SKILL.md')).toBe(false);
  });

  it('still ignores unrelated .pi/ files', () => {
    expect(isGitIgnored('.pi/some-local-file.json')).toBe(true);
  });
});
