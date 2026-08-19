/**
 * release-windows skill: pure helper tests
 *
 * Unit tests for the pure, side-effect-free helpers in
 * `.pi/skills/release-windows/scripts/promote-windows-release.mjs`:
 * `deriveVersionFromFilename()` and `extractChangelogNotes()`.
 *
 * These helpers underpin the CLI script (Feature 2) that promotes the
 * Windows Setup artifact to a draft GitHub release: the version is derived
 * from the installer filename (`TCE-Setup-<version>.exe` per
 * `electron-builder.yml` artifactName) and the release notes are extracted
 * from the matching `CHANGELOG.md` section.
 *
 * Work item: CG-0MSQBQRYX0092PVA
 */
import { describe, it, expect } from 'vitest';

import {
  deriveVersionFromFilename,
  extractChangelogNotes,
} from '../../.pi/skills/release-windows/scripts/promote-windows-release.mjs';

describe('deriveVersionFromFilename', () => {
  it('derives the version from a TCE-Setup-<version>.exe filename', () => {
    expect(deriveVersionFromFilename('TCE-Setup-0.1.12.exe')).toBe('0.1.12');
  });

  it('derives the version from a path ending in the installer filename', () => {
    // `gh run download` extracts the artifact into a directory; the CLI
    // resolves the exe via a `release/`-style path before calling this helper.
    expect(deriveVersionFromFilename('release/TCE-Setup-0.1.12.exe')).toBe('0.1.12');
    expect(
      deriveVersionFromFilename('tce-windows-installer/release/TCE-Setup-0.1.12.exe'),
    ).toBe('0.1.12');
  });

  it('returns null for filenames that do not match the pattern', () => {
    expect(deriveVersionFromFilename('TCE-Setup.exe')).toBeNull();
    expect(deriveVersionFromFilename('TCE-Setup-0.1.12.zip')).toBeNull();
    expect(deriveVersionFromFilename('Setup-0.1.12.exe')).toBeNull();
    expect(deriveVersionFromFilename('TCE-Setup-0.1.exe')).toBeNull();
    expect(deriveVersionFromFilename('TCE-Setup-1.2.exe')).toBeNull();
    expect(deriveVersionFromFilename('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(deriveVersionFromFilename(null as unknown as string)).toBeNull();
    expect(deriveVersionFromFilename(undefined as unknown as string)).toBeNull();
  });
});

describe('extractChangelogNotes', () => {
  const changelog = [
    '# Changelog',
    '',
    '## v0.1.12 (2026-08-12)',
    '### Features',
    '- Full test suite now runs reliably. (CG-0MSJ7ZXD5005N9E5)',
    '- Add a harder Citadel mode to Beleaguered Castle. (CG-0MLTDXG3H0WCXMUV)',
    '### Bug Fixes',
    '- Clicking an empty street slot now correctly places your business. (CG-0MSN8ZZX2000B9UP)',
    '### Other',
    '- Updated developer docs. (CG-0MSJ7ZXDB002CX97)',
    '',
    '## v0.1.11 (2026-08-08)',
    '### Features',
    '- Coloretto (set-building tableau) (CG-0MLSDXYF1FSGQ38)',
    '',
  ].join('\n');

  it('extracts the full section body for a matching version', () => {
    const notes = extractChangelogNotes(changelog, '0.1.12');
    expect(notes).not.toBeNull();
    expect(notes).toContain('### Features');
    expect(notes).toContain('Add a harder Citadel mode');
    expect(notes).toContain('### Bug Fixes');
    expect(notes).toContain('Updated developer docs');
    // Must not bleed into the next version's section.
    expect(notes).not.toContain('Coloretto');
  });

  it('stops at the next version heading', () => {
    const notes = extractChangelogNotes(changelog, '0.1.11');
    expect(notes).not.toBeNull();
    expect(notes).toContain('Coloretto');
    expect(notes).not.toContain('0.1.12');
  });

  it('returns null when the version section is missing', () => {
    expect(extractChangelogNotes(changelog, '9.9.9')).toBeNull();
  });

  it('does not confuse a shorter version with a longer one', () => {
    // Searching for 0.1.1 must not match the 0.1.12 section.
    expect(extractChangelogNotes(changelog, '0.1.1')).toBeNull();
  });

  it('returns null for empty or invalid input', () => {
    expect(extractChangelogNotes('', '0.1.12')).toBeNull();
    expect(extractChangelogNotes(changelog, '')).toBeNull();
    expect(extractChangelogNotes(null as unknown as string, '0.1.12')).toBeNull();
  });
});
