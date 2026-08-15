/**
 * release-windows skill: CLI command-construction tests
 *
 * Unit tests for the pure command-construction helpers added by the CLI
 * feature of the release-windows skill (`promote-windows-release.mjs`):
 * `buildGhReleaseCreateArgs()` and `extractReleaseUrlFromCreateOutput()`.
 *
 * These helpers keep the gh-invoking CLI logic thin and testable: the argv
 * for `gh release create` (draft release with CHANGELOG notes or the
 * `--generate-notes` fallback) is built purely, and the URL is parsed from
 * `gh release create` output so the CLI can report the draft link without a
 * follow-up `gh release view` call.
 *
 * Work item: CG-0MSQBQSCX006R02B
 */
import { describe, it, expect } from 'vitest';

import {
  buildGhReleaseCreateArgs,
  extractReleaseUrlFromCreateOutput,
} from '../../.pi/skills/release-windows/scripts/promote-windows-release.mjs';

describe('buildGhReleaseCreateArgs', () => {
  it('builds a draft release argv with a notes file when notes are available', () => {
    const args = buildGhReleaseCreateArgs({
      version: '0.1.12',
      installerPath: '/tmp/art/tce-windows-installer/release/TCE-Setup-0.1.12.exe',
      notesFile: '/tmp/notes-0.1.12.md',
    });
    expect(args).toEqual([
      'release',
      'create',
      'v0.1.12',
      '/tmp/art/tce-windows-installer/release/TCE-Setup-0.1.12.exe',
      '--draft',
      '--notes-file',
      '/tmp/notes-0.1.12.md',
    ]);
  });

  it('falls back to --generate-notes when no notes file is provided', () => {
    const args = buildGhReleaseCreateArgs({
      version: '0.1.12',
      installerPath: 'release/TCE-Setup-0.1.12.exe',
    });
    expect(args).toContain('v0.1.12');
    expect(args).toContain('--draft');
    expect(args).toContain('--generate-notes');
    expect(args).not.toContain('--notes-file');
    // Never publishes or marks pre-release.
    expect(args).not.toContain('--prerelease');
  });
});

describe('extractReleaseUrlFromCreateOutput', () => {
  it('extracts the release URL from the first line of gh release create output', () => {
    const url = extractReleaseUrlFromCreateOutput(
      'https://github.com/TheWizardsCode/Tableau-Card-Engine/releases/tag/v0.1.12\n' +
        'draft release created\n',
    );
    expect(url).toBe(
      'https://github.com/TheWizardsCode/Tableau-Card-Engine/releases/tag/v0.1.12',
    );
  });

  it('returns null when the output contains no https URL', () => {
    expect(extractReleaseUrlFromCreateOutput('something went wrong\n')).toBeNull();
    expect(extractReleaseUrlFromCreateOutput('')).toBeNull();
  });
});
