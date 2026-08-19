// Type declarations for the pure helper module promote-windows-release.mjs.
//
// Kept in sync with the JSDoc-typed exports of the .mjs implementation;
// consumed by the TypeScript test suite (tests/release-windows/) so `tsc`
// does not fail with TS7016 on the `.mjs` import.
//
// Work items: CG-0MSQBQRYX0092PVA (helpers + tests), CG-0MSQBQSCX006R02B
// (CLI + docs), CG-0MSQ6MV7N0085V9R (parent)

/** Derive the semantic version from `TCE-Setup-<version>.exe` (or a path ending in one). */
export function deriveVersionFromFilename(filename: string): string | null;

/** Extract the CHANGELOG.md section body for a version; null when missing. */
export function extractChangelogNotes(
  changelogText: string,
  version: string,
): string | null;

/** Options for {@link buildGhReleaseCreateArgs}. */
export interface GhReleaseCreateOptions {
  /** Version without the leading `v`, e.g. `'0.1.12'`. */
  version: string;
  /** Path to the installer exe to attach. */
  installerPath: string;
  /** Path to a temp file holding the release notes (optional). */
  notesFile?: string;
}

/**
 * Build the argv (after the `gh` binary) for `gh release create`:
 * a draft release `v<version>` with the installer attached, using
 * `--notes-file` when notes are available and `--generate-notes` otherwise.
 */
export function buildGhReleaseCreateArgs(
  options: GhReleaseCreateOptions,
): string[];

/** Extract the release URL from `gh release create` stdout; null when absent. */
export function extractReleaseUrlFromCreateOutput(output: string): string | null;
