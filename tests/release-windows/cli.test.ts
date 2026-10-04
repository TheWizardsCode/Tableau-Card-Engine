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
  parseCliArgs,
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

describe('parseCliArgs', () => {
  it('defaults to auto-resolving the run when no flags are passed', () => {
    expect(parseCliArgs(['node', 'promote-windows-release.mjs'])).toEqual({
      help: false,
      dryRun: false,
      runId: null,
    });
  });

  it('pins the run id when --run-id is provided', () => {
    expect(
      parseCliArgs(['node', 'script.mjs', '--run-id', '31609434642']).runId,
    ).toBe('31609434642');
  });

  it('treats a missing or flag-like --run-id value as not provided', () => {
    expect(parseCliArgs(['node', 'script.mjs', '--run-id']).runId).toBeNull();
    expect(
      parseCliArgs(['node', 'script.mjs', '--run-id', '--dry-run']).runId,
    ).toBeNull();
  });

  it('parses --dry-run and --help independently of --run-id', () => {
    expect(parseCliArgs(['node', 'script.mjs', '--dry-run']).dryRun).toBe(true);
    expect(parseCliArgs(['node', 'script.mjs', '--help']).help).toBe(true);
    expect(parseCliArgs(['node', 'script.mjs', '-h']).help).toBe(true);
    expect(
      parseCliArgs(['node', 'script.mjs', '--dry-run', '--help']).dryRun,
    ).toBe(true);
  });

  it('returns defaults for non-array input', () => {
    expect(
      parseCliArgs(null as unknown as string[]),
    ).toEqual({ help: false, dryRun: false, runId: null });
  });
});
