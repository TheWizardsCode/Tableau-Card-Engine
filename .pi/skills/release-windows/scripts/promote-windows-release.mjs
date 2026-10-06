#!/usr/bin/env node
// Promote the latest Windows Setup artifact to a draft GitHub Release.
//
// Workflow (invoked manually by an agent/operator on demand):
//   1. Resolve the latest successful `Package Windows Binary` run
//      (`.github/workflows/package.yml`), or stop with a clear message.
//   2. Download its `tce-windows-installer` artifact.
//   3. Locate `release/TCE-Setup-<version>.exe`, derive the version from
//      the filename (electron-builder artifactName).
//   4. Extract the matching `CHANGELOG.md` section for release notes;
//      fall back to `gh release create --generate-notes` when missing.
//   5. Create a **draft** GitHub Release `v<version>` with the installer
//      attached (`--draft`, never published, never pre-release). The draft
//      is the operator's approval gate: they review and publish it in the
//      GitHub UI.
//   6. Idempotence: if a release for `v<version>` already exists, skip and
//      report its URL (exit 0). A pre-existing tag is reused by gh.
//
// `--dry-run` prints the exact commands/actions without touching origin
// (no artifact download, no release/tag creation).
//
// `--run-id <id>` pins the artifact source to a specific workflow run. CI
// uses it on a tag push: the just-started run is still `in_progress`, so
// "latest successful run" would resolve to the *previous* release. When the
// flag is absent the script auto-resolves the latest successful run (the
// manual `/skill:release-windows` path).
//
// Exit codes: 0 success/skip; 1 fatal (no run, download failure, missing
// installer, release creation failure).
//
// The pure exported functions (deriveVersionFromFilename,
// extractChangelogNotes, buildGhReleaseCreateArgs,
// extractReleaseUrlFromCreateOutput) are unit-tested under Node; the CLI
// wiring calls gh via child_process and is intentionally thin.
//
// Work items: CG-0MSQBQRYX0092PVA (helpers + tests), CG-0MSQBQSCX006R02B
// (CLI + docs), CG-0MSQ6MV7N0085V9R (parent)

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── Constants ────────────────────────────────────────────────

const WORKFLOW_FILE = 'package.yml';
const WORKFLOW_QUERY =
  'Package Windows Binary run with a `tce-windows-installer` artifact';
const ARTIFACT_NAME = 'tce-windows-installer';
const SETUP_FILENAME_RE = /^TCE-Setup-(\d+\.\d+\.\d+)\.exe$/i;
const RELEASE_URL_RE = /https:\/\/[^\s]+/;

// scripts/ -> release-windows/ -> skills/ -> .pi/ -> repo root
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CHANGELOG_PATH = join(REPO_ROOT, 'CHANGELOG.md');
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json');

// ── Pure helpers ─────────────────────────────────────────────

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

/**
 * Build the argv (after the `gh` binary) for creating the draft release.
 *
 * Notes are passed via `--notes-file` (the caller writes the extracted
 * CHANGELOG section to a temp file); when no notes are available the argv
 * falls back to `--generate-notes` and the caller prints an explicit notice.
 *
 * @param {{ version: string, installerPath: string, notesFile?: string }} opts
 * @returns {string[]} argv, e.g. `['release','create','v0.1.12','…exe','--draft','--notes-file','/tmp/notes.md']`
 */
export function buildGhReleaseCreateArgs({ version, installerPath, notesFile }) {
  const args = ['release', 'create', `v${version}`, installerPath, '--draft'];
  if (notesFile) {
    args.push('--notes-file', notesFile);
  } else {
    args.push('--generate-notes');
  }
  return args;
}

/**
 * Extract the release URL from `gh release create` stdout (first line is
 * the release URL). Returns `null` when no https URL is present.
 *
 * @param {string} output combined stdout of the create command
 * @returns {string|null}
 */
export function extractReleaseUrlFromCreateOutput(output) {
  if (typeof output !== 'string') return null;
  const match = RELEASE_URL_RE.exec(output);
  return match ? match[0].replace(/[),;]$/, '') : null;
}

/**
 * Parse the full `process.argv` into a plain options object.
 *
 * Pure (no side effects, no I/O) so the CLI wiring in `main()` stays thin and
 * the flag handling is unit-testable. An empty or `--`-prefixed value after
 * `--run-id` is treated as "not provided" (falls back to auto-resolve).
 *
 * @param {string[]} argv the full argument vector, e.g. `process.argv`
 * @returns {{ help: boolean, dryRun: boolean, runId: string|null }}
 */
export function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  let runId = null;
  const runIdIndex = args.indexOf('--run-id');
  if (runIdIndex !== -1) {
    const candidate = args[runIdIndex + 1];
    if (
      typeof candidate === 'string' &&
      candidate !== '' &&
      !candidate.startsWith('--')
    ) {
      runId = candidate;
    }
  }
  return {
    help: args.includes('--help') || args.includes('-h'),
    dryRun: args.includes('--dry-run'),
    runId,
  };
}

/**
 * True when a run's artifact-name list contains the expected installer
 * artifact. Pure so the dry-run pre-flight decision is unit-testable.
 *
 * @param {string[]} artifactNames artifact names attached to a workflow run
 * @param {string} [artifactName] expected artifact name
 * @returns {boolean}
 */
export function hasRequiredArtifact(artifactNames, artifactName = ARTIFACT_NAME) {
  return Array.isArray(artifactNames) && artifactNames.includes(artifactName);
}

// ── CLI wiring (gh via child_process) ────────────────────────

function runGh(args, { capture = true } = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf-8',
    stdio: capture ? 'pipe' : 'inherit',
  });
}

/** Resolve the latest successful package run id, or null. */
function resolveLatestSuccessfulRunId() {
  const out = runGh([
    'run',
    'list',
    '--workflow',
    WORKFLOW_FILE,
    '--status',
    'success',
    '--limit',
    '1',
    '--json',
    'databaseId',
  ]);
  const runs = JSON.parse(out.trim());
  if (!Array.isArray(runs) || runs.length === 0) return null;
  return String(runs[0].databaseId);
}

/** Download the tce-windows-installer artifact for a run into destDir. */
function downloadArtifact(runId, destDir) {
  runGh(['run', 'download', runId, '--name', ARTIFACT_NAME, '--dir', destDir]);
}

/** Find `release/TCE-Setup-<version>.exe` under dir; returns {path, version} or null. */
function findInstaller(dir) {
  const found = walkForSetupExe(dir);
  if (!found) return null;
  return { path: found, version: deriveVersionFromFilename(found) };
}

function walkForSetupExe(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      const nested = walkForSetupExe(full);
      if (nested) return nested;
    } else if (SETUP_FILENAME_RE.test(entry)) {
      return full;
    }
  }
  return null;
}

/** URL of an existing release for v<version>, or null. */
function releaseUrl(version) {
  try {
    const out = runGh(['release', 'view', `v${version}`, '--json', 'url']);
    const parsed = JSON.parse(out.trim());
    return typeof parsed.url === 'string' ? parsed.url : null;
  } catch {
    return null;
  }
}

/**
 * Artifact names attached to a workflow run (read-only API call).
 * Used by `--dry-run --run-id` to verify the installer artifact is present
 * before the real promotion step attempts to download it.
 */
function listRunArtifactNames(runId) {
  const out = runGh([
    'api',
    `repos/{owner}/{repo}/actions/runs/${runId}/artifacts`,
    '--jq',
    '.artifacts[].name',
  ]);
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** True when the remote already has a `v<version>` tag. */
function remoteTagExists(version) {
  try {
    execFileSync(
      'git',
      ['ls-remote', '--exit-code', 'origin', `refs/tags/v${version}`],
      { encoding: 'utf-8', stdio: 'pipe' },
    );
    return true;
  } catch {
    return false;
  }
}

/** Version from package.json (used by --dry-run; the artifact is named from it). */
function versionFromPackageJson() {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

function logCommand(argv) {
  process.stdout.write(`$ gh ${argv.join(' ')}\n`);
}

function usage() {
  return [
    'promote-windows-release.mjs — promote the latest Windows Setup artifact to a draft GitHub Release',
    '',
    'Usage:',
    '  node promote-windows-release.mjs [--dry-run] [--run-id <id>] [--help]',
    '',
    'Options:',
    '  --dry-run       Print the exact commands/actions without touching origin',
    '                  (no artifact download, no release/tag creation). With',
    '                  --run-id it also verifies the run has the installer',
    '                  artifact attached (a read-only API check).',
    '  --run-id <id>   Promote the artifact from a specific workflow run id.',
    '                  Used by CI on a tag push, where the current run is not',
    '                  yet reported as successful. Default: the latest',
    '                  successful run.',
    '  --help          Show this help.',
    '',
    'Prerequisites:',
    '  gh CLI authenticated with repo scope; run from the repo root.',
    '',
  ].join('\n');
}

function readChangelogText() {
  try {
    return readFileSync(CHANGELOG_PATH, 'utf-8');
  } catch {
    return null;
  }
}

async function main(argv) {
  const { help, dryRun, runId: explicitRunId } = parseCliArgs(argv);
  if (help) {
    process.stdout.write(usage());
    return 0;
  }

  const runId = explicitRunId ?? resolveLatestSuccessfulRunId();
  if (runId === null) {
    process.stderr.write(
      `error: no successful '${WORKFLOW_QUERY}' run found (gh run list ` +
        `--workflow ${WORKFLOW_FILE} --status success --limit 1 returned empty). ` +
        'Has CI produced a Windows installer yet?\n',
    );
    return 1;
  }

  // ── Idempotence / pre-checks ───────────────────────────────
  // The version comes from the artifact filename in the real flow; for
  // --dry-run we derive it from package.json (electron-builder names the
  // artifact TCE-Setup-<package.json version>.exe).
  const expectedVersion = versionFromPackageJson();
  if (expectedVersion === null) {
    process.stderr.write('error: could not read version from package.json\n');
    return 1;
  }

  if (dryRun) {
    process.stdout.write(
      `# dry-run: ${explicitRunId ? 'pinned' : 'latest successful'} ${WORKFLOW_QUERY}: run ${runId}\n` +
        `# version (from package.json, artifact filename in real run): ${expectedVersion}\n`,
    );
    const existing = releaseUrl(expectedVersion);
    if (existing) {
      process.stdout.write(`# would SKIP: release v${expectedVersion} already exists at ${existing}\n`);
      return 0;
    }
    // Pre-flight (CI): when the run is pinned, confirm the installer artifact
    // is actually attached before the real step tries to download it. This
    // is read-only (no download) and turns a missing-artifact failure into a
    // clear pre-flight diagnostic.
    if (explicitRunId) {
      const names = listRunArtifactNames(explicitRunId);
      if (!hasRequiredArtifact(names)) {
        process.stderr.write(
          `error: run ${explicitRunId} has no '${ARTIFACT_NAME}' artifact ` +
            `(found: ${names.length ? names.join(', ') : 'none'})\n`,
        );
        return 1;
      }
      process.stdout.write(
        `# verified run ${explicitRunId} has the '${ARTIFACT_NAME}' artifact\n`,
      );
    }
    logCommand([
      'run',
      'download',
      runId,
      '--name',
      ARTIFACT_NAME,
      '--dir',
      '<tmp-dir>',
    ]);
    const changelog = readChangelogText();
    const notes = changelog ? extractChangelogNotes(changelog, expectedVersion) : null;
    if (!notes) {
      process.stdout.write(
        `# note: no CHANGELOG.md section for v${expectedVersion}; the real run falls back to --generate-notes\n`,
      );
    }
    logCommand(
      buildGhReleaseCreateArgs({
        version: expectedVersion,
        installerPath: '<tmp-dir>/tce-windows-installer/release/TCE-Setup-' +
          `${expectedVersion}.exe`,
        notesFile: notes ? '<tmp-dir>/release-notes.md' : undefined,
      }),
    );
    return 0;
  }

  // ── Real flow ──────────────────────────────────────────────
  const tmpDir = mkdtempSync(join(tmpdir(), 'tce-release-'));
  try {
    process.stdout.write(`Downloading artifact from run ${runId}...\n`);
    downloadArtifact(runId, tmpDir);

    const installer = findInstaller(tmpDir);
    if (!installer || installer.version === null) {
      process.stderr.write(
        `error: no TCE-Setup-<version>.exe found in the downloaded ` +
          `${ARTIFACT_NAME} artifact\n`,
      );
      return 1;
    }
    const { path: installerPath, version } = installer;
    process.stdout.write(`Found installer ${installerPath} (version ${version})\n`);

    const existing = releaseUrl(version);
    if (existing) {
      process.stdout.write(
        `Release v${version} already exists at ${existing} — skipping creation.\n`,
      );
      return 0;
    }

    if (remoteTagExists(version)) {
      process.stdout.write(
        `Tag v${version} already exists on origin — gh will reuse it for the draft release.\n`,
      );
    }

    const changelog = readChangelogText();
    const notes = changelog ? extractChangelogNotes(changelog, version) : null;
    let notesFile;
    if (notes) {
      notesFile = join(tmpDir, 'release-notes.md');
      writeFileSync(notesFile, `${notes}\n`);
      process.stdout.write(`Release notes extracted from CHANGELOG.md (v${version}).\n`);
    } else {
      process.stdout.write(
        `No CHANGELOG.md section found for v${version} — falling back to ` +
          'gh release create --generate-notes.\n',
      );
    }

    process.stdout.write(`Creating draft release v${version}...\n`);
    const createOutput = runGh(
      buildGhReleaseCreateArgs({ version, installerPath, notesFile }),
    );
    const url = extractReleaseUrlFromCreateOutput(createOutput);
    if (url) {
      process.stdout.write(
        `Draft release created: ${url}\n` +
          'The draft is the approval gate — the operator must review and ' +
          'publish it in the GitHub UI to complete the release.\n',
      );
    } else {
      process.stdout.write(
        'Draft release created (URL not parsed from gh output).\n' +
          'The draft is the approval gate — the operator must review and ' +
          'publish it in the GitHub UI to complete the release.\n',
      );
    }
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    return 1;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Entry-point guard: run main() only when executed as a script, so the
// pure exports can be imported by tests without side effects.
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main(process.argv).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    },
  );
}
