#!/usr/bin/env node
// Promote the latest Windows Setup artifact to a draft GitHub Release.
//
// This module currently exports the pure helper functions used by the
// release-windows skill:
//   - deriveVersionFromFilename():  TCE-Setup-<version>.exe -> version
//   - extractChangelogNotes():      CHANGELOG.md section body for a version
//
// The CLI entry point (auto-resolve latest package run, download artifact,
// `gh release create --draft`, `--dry-run`, idempotence) is added by the
// CLI feature (CG-0MSQBQSCX006R02B); keep everything exported here pure and
// side-effect free so it stays unit-testable under Node.
//
// Work items: CG-0MSQBQRYX0092PVA (helpers + tests), CG-0MSQ6MV7N0085V9R (parent)

// Matches electron-builder artifactName `TCE-Setup-${version}.${ext}`
// (electron-builder.yml) where version comes from package.json (X.Y.Z).
const SETUP_FILENAME_RE = /^TCE-Setup-(\d+\.\d+\.\d+)\.exe$/i;

/**
 * Derive the semantic version from a Windows Setup installer filename
 * (or path ending in one), e.g. `TCE-Setup-0.1.12.exe` -> `'0.1.12'`.
 *
 * @param {string} filename filename or path, e.g. `'TCE-Setup-0.1.12.exe'`
 * @returns {string|null} the version, or `null` when the name does not match
 */
export function deriveVersionFromFilename(filename) {
  if (typeof filename !== 'string') return null;
  const base = filename.split(/[\\/]/).pop() ?? '';
  const match = SETUP_FILENAME_RE.exec(base);
  return match ? match[1] : null;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the release-notes body for a version from CHANGELOG.md text.
 *
 * Matches a heading of the form `## v<version> (date)` (date optional),
 * returns the trimmed body up to the next `## ` heading, and returns `null`
 * when the section is missing or empty. A search for `0.1.1` does not match
 * the `## v0.1.12 ...` heading.
 *
 * @param {string} changelogText full CHANGELOG.md text
 * @param {string} version version without the leading `v`, e.g. `'0.1.12'`
 * @returns {string|null} the section body, or `null` when absent
 */
export function extractChangelogNotes(changelogText, version) {
  if (
    typeof changelogText !== 'string' ||
    typeof version !== 'string' ||
    version === ''
  ) {
    return null;
  }
  const headingRe = new RegExp(
    `^## v${escapeRegExp(version)}(?:\\s+\\([^)]*\\))?\\s*$`,
    'm',
  );
  const match = headingRe.exec(changelogText);
  if (!match) return null;
  const bodyStart = match.index + match[0].length;
  const rest = changelogText.slice(bodyStart);
  const nextHeading = /\n##\s/.exec(rest);
  const body = nextHeading ? rest.slice(0, nextHeading.index) : rest;
  const trimmed = body.trim();
  return trimmed === '' ? null : trimmed;
}
