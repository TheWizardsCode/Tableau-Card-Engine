// Type declarations for the pure helper module promote-windows-release.mjs.
//
// Kept in sync with the JSDoc-typed exports of the .mjs implementation;
// consumed by the TypeScript test suite (tests/release-windows/) so `tsc`
// does not fail with TS7016 on the `.mjs` import.
//
// Work items: CG-0MSQBQRYX0092PVA (helpers + tests), CG-0MSQ6MV7N0085V9R (parent)

/** Derive the semantic version from `TCE-Setup-<version>.exe` (or a path ending in one). */
export function deriveVersionFromFilename(filename: string): string | null;

/** Extract the CHANGELOG.md section body for a version; null when missing. */
export function extractChangelogNotes(
  changelogText: string,
  version: string,
): string | null;
