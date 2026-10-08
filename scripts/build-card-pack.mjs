#!/usr/bin/env node
/**
 * Reference card-pack builder (feature F7, CG-0MUZIS3G6008UQGO).
 *
 * Turns one authored card-pack source tree into an installable packs root the
 * Electron launcher can discover from `<contentDir>/packs/manifest.json`:
 *
 *   build/card-packs/packs/
 *     manifest.json                         ← merged entry (upserted, not overwritten)
 *     <gameId>/<packId>/
 *       cards.csv                           ← the pack's CSV fragment
 *       assets/…                            ← real (non-symlink) assets
 *
 * A pack source is a directory laid out like the on-disk target — a
 * `manifest.json` document (`{ version, packs[] }`) plus one
 * `<gameId>/<packId>/` directory per pack. The builder:
 *
 *   1. parses and validates the manifest with the shared contract
 *      (`parseCardPackManifest`); an invalid manifest **refuses** the build;
 *   2. validates each pack's CSV fragment (`id` column present) and rejects an
 *      invalid pack **whole** (recorded in `rejected`, never merged);
 *   3. copies each accepted pack's real files, skipping symlinks (a symlink
 *      points at a shared core asset the launcher already ships) — the same
 *      `copyGameOwnedAssets` convention as `scripts/build-game-artifact.mjs`;
 *   4. upserts its manifest entry into `<outRoot>/manifest.json` by
 *      `(gameId, id)`, sorting deterministically so equal inputs produce
 *      byte-identical output.
 *
 * Usage (via the `build:card-pack` npm script, which runs it under tsx):
 *
 *   npm run build:card-pack -- --input tests/fixtures/reference-packs/main-street
 *   npm run build:card-pack -- --input <dir> --out build/card-packs/packs
 *
 * The reference Main Street pack lives at
 * `tests/fixtures/reference-packs/main-street/`. Copy the emitted packs root
 * into `<contentDir>/packs/` to install it.
 *
 * @see scripts/build-game-artifact.mjs — the whole-game artifact builder whose
 *      conventions (argument parsing, manifest merge, asset copy) this reuses.
 * @see src/core-engine/CardPackManifest.ts — the manifest contract.
 * @see docs/DEVELOPER.md — "Card Packs"
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { copyGameOwnedAssets, parseArgs } from './build-game-artifact.mjs';
import { parseCardPackManifest } from '../src/core-engine/CardPackManifest.ts';
import { parseCsvHeader } from '../src/core-engine/CsvLoader.ts';

/**
 * Default output directory (relative to the repo root) — the **packs root**
 * that mirrors `<contentDir>/packs/`, so the manifest lands at
 * `build/card-packs/packs/manifest.json`.
 */
export const DEFAULT_OUT_ROOT = path.join('build', 'card-packs', 'packs');

/** Manifest filename inside the packs root. */
export const PACK_MANIFEST_FILENAME = 'manifest.json';

/** Manifest schema version written when creating a fresh document. */
export const PACK_MANIFEST_VERSION = 1;

/**
 * Thrown when a pack source cannot be built at all (an unreadable or invalid
 * manifest). A malformed individual pack is *rejected* (see
 * {@link buildCardPack}) rather than aborting the whole build.
 */
export class CardPackBuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CardPackBuildError';
  }
}

/**
 * Validate a pack CSV fragment. A fragment is valid when it has a header that
 * includes the required `id` column — the structural minimum any game's CSV
 * schema must provide for the merge seam (`mergeCardPackCsv`) to accept it.
 *
 * @param {string} csv Raw CSV text.
 * @returns {{ ok: true, header: string[] } | { ok: false, reason: string }}
 */
export function validatePackCsv(csv) {
  const header = parseCsvHeader(typeof csv === 'string' ? csv : '');
  if (header.length === 0) {
    return { ok: false, reason: 'CSV fragment is empty or has no header.' };
  }
  if (!header.includes('id')) {
    return {
      ok: false,
      reason: 'CSV header is missing the required "id" column.',
    };
  }
  return { ok: true, header };
}

/**
 * Upsert *entry* into `<outRoot>/manifest.json`, keyed by `(gameId, id)`.
 *
 * Mirrors `mergeManifestEntry` in `scripts/build-game-artifact.mjs`: an
 * existing document is read and preserved (packs from other games survive), the
 * matching entry is replaced, and the array is sorted by `gameId` then `id` so
 * the emitted JSON is deterministic. A malformed existing manifest is treated
 * as empty rather than failing the build.
 *
 * @param {string} outRoot                 Packs root (contains `manifest.json`).
 * @param {Record<string, unknown>} entry  Manifest entry to write.
 * @param {number} [version]               Manifest schema version for a fresh doc.
 * @returns {{ manifestPath: string, document: { version: number, packs: object[] } }}
 */
export function mergePackManifestEntry(outRoot, entry, version = PACK_MANIFEST_VERSION) {
  const manifestPath = path.join(outRoot, PACK_MANIFEST_FILENAME);
  let document = { version, packs: [] };
  if (fs.existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (parsed && Array.isArray(parsed.packs)) {
        document = { version: parsed.version ?? version, packs: parsed.packs };
      }
    } catch {
      // Malformed existing manifest — start a fresh one rather than fail.
      document = { version, packs: [] };
    }
  }

  const remaining = document.packs.filter(
    (pack) =>
      !(
        pack &&
        pack.gameId === entry.gameId &&
        pack.id === entry.id
      ),
  );
  document.packs = [...remaining, entry].sort(
    (a, b) =>
      String(a.gameId).localeCompare(String(b.gameId)) ||
      String(a.id).localeCompare(String(b.id)),
  );

  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
  return { manifestPath, document };
}

/**
 * Resolve a pack-relative path inside *packDir*, rejecting absolute paths,
 * NUL bytes, and traversal that escapes the pack directory. Returns `null`
 * when the path is unsafe so the caller can reject the pack structurally.
 */
function resolveWithinPack(packDir, relative) {
  if (typeof relative !== 'string' || relative.trim() === '') return null;
  const normalised = relative.replace(/\\/g, '/');
  if (
    normalised.startsWith('/') ||
    /^[A-Za-z]:/.test(normalised) ||
    normalised.includes('\0')
  ) {
    return null;
  }
  const resolved = path.resolve(packDir, normalised);
  const prefix = packDir.endsWith(path.sep) ? packDir : `${packDir}${path.sep}`;
  if (resolved !== packDir && !resolved.startsWith(prefix)) return null;
  return resolved;
}

/**
 * Build one authored card-pack source tree into an installable packs root.
 *
 * Never throws for an individual bad pack: a pack whose directory, CSV
 * fragment, or CSV header is invalid is reported in `rejected` and skipped
 * whole. An unreadable or invalid **manifest** throws
 * {@link CardPackBuildError} (the build is refused) and nothing is written.
 *
 * @param {object} options
 * @param {string} options.inputDir       Pack source root (manifest + pack dirs).
 * @param {string} [options.projectRoot]  Repo root (default: cwd).
 * @param {string} [options.outRoot]      Packs root (default: build/card-packs/packs).
 * @returns {{
 *   inputDir: string,
 *   outRoot: string,
 *   manifestPath: string,
 *   document: { version: number, packs: object[] } | null,
 *   packs: Array<{ id: string, gameId: string, packDir: string, csvPath: string, files: string[], entry: object }>,
 *   rejected: Array<{ id: string, gameId: string, reason: string }>,
 * }}
 */
export function buildCardPack(options) {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const inputDir = path.resolve(projectRoot, options.inputDir);
  const outRoot = path.resolve(projectRoot, options.outRoot ?? DEFAULT_OUT_ROOT);
  const sourceManifestPath = path.join(inputDir, PACK_MANIFEST_FILENAME);

  let manifestText;
  try {
    manifestText = fs.readFileSync(sourceManifestPath, 'utf-8');
  } catch (error) {
    throw new CardPackBuildError(
      `Could not read pack manifest at ${sourceManifestPath}: ${messageOf(error)}`,
    );
  }

  const parsed = parseCardPackManifest(manifestText);
  if (!parsed.ok) {
    throw new CardPackBuildError(
      `Invalid card-pack manifest at ${sourceManifestPath}: ${parsed.errors.join('; ')}`,
    );
  }

  const packs = [];
  const rejected = [];

  for (const entry of parsed.manifest.packs) {
    const sourcePackDir = path.join(inputDir, entry.gameId, entry.id);
    if (!isDirectory(sourcePackDir)) {
      rejected.push({
        id: entry.id,
        gameId: entry.gameId,
        reason: `Pack directory is missing: ${sourcePackDir}`,
      });
      continue;
    }

    const csvPath = resolveWithinPack(sourcePackDir, entry.cards);
    if (csvPath === null) {
      rejected.push({
        id: entry.id,
        gameId: entry.gameId,
        reason: `CSV fragment path "${entry.cards}" escapes the pack directory.`,
      });
      continue;
    }
    if (isSymlink(csvPath)) {
      rejected.push({
        id: entry.id,
        gameId: entry.gameId,
        reason: `CSV fragment "${entry.cards}" must be a real file, not a symlink.`,
      });
      continue;
    }

    let csv;
    try {
      csv = fs.readFileSync(csvPath, 'utf-8');
    } catch (error) {
      rejected.push({
        id: entry.id,
        gameId: entry.gameId,
        reason: `Could not read CSV fragment "${entry.cards}": ${messageOf(error)}`,
      });
      continue;
    }

    const validation = validatePackCsv(csv);
    if (!validation.ok) {
      rejected.push({
        id: entry.id,
        gameId: entry.gameId,
        reason: `Invalid CSV fragment "${entry.cards}": ${validation.reason}`,
      });
      continue;
    }

    // Copy the pack's real files (CSV + assets), skipping symlinks — a
    // symlinked asset is a shared core asset the launcher already ships.
    const destPackDir = path.join(outRoot, entry.gameId, entry.id);
    const files = copyGameOwnedAssets(sourcePackDir, destPackDir, { skipNames: [] }).sort();
    const destCsvPath = path.join(destPackDir, entry.cards);
    if (!fs.existsSync(destCsvPath)) {
      // Defensive: never leave a partially-copied pack behind.
      fs.rmSync(destPackDir, { recursive: true, force: true });
      rejected.push({
        id: entry.id,
        gameId: entry.gameId,
        reason: `CSV fragment "${entry.cards}" was not copied (symlink?).`,
      });
      continue;
    }

    packs.push({
      id: entry.id,
      gameId: entry.gameId,
      packDir: destPackDir,
      csvPath: destCsvPath,
      files,
      entry,
    });
  }

  // Upsert the accepted entries in deterministic order. Only rewrite the
  // manifest when at least one pack was accepted, so an all-rejected build
  // leaves any existing (possibly valid) manifest untouched.
  const manifestPath = path.join(outRoot, PACK_MANIFEST_FILENAME);
  let document = null;
  for (const { entry } of packs) {
    ({ document } = mergePackManifestEntry(outRoot, entry, parsed.manifest.version));
  }

  return { inputDir, outRoot, manifestPath, document, packs, rejected };
}

/** Render the human-readable CLI summary for a build result. */
export function formatBuildSummary(result) {
  const lines = [];
  lines.push(`Built ${result.packs.length} card pack(s) into ${result.outRoot}`);
  if (result.packs.length > 0) {
    const relativeManifest = path.relative(process.cwd(), result.manifestPath);
    lines.push(`  manifest: ${relativeManifest}`);
    for (const pack of result.packs) {
      lines.push(
        `  ${pack.gameId}/${pack.id}  (${pack.files.length} file(s))`,
      );
    }
  }
  if (result.rejected.length > 0) {
    lines.push(`Rejected ${result.rejected.length} pack(s):`);
    for (const rejected of result.rejected) {
      lines.push(`  ${rejected.gameId}/${rejected.id}: ${rejected.reason}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Parse the CLI arguments into a build-options object. */
export function parseBuildArgs(args) {
  return {
    inputDir: typeof args.input === 'string' ? args.input : undefined,
    outRoot: typeof args.out === 'string' ? args.out : undefined,
    help: args.help === true,
  };
}

/**
 * CLI entry point. Returns the process exit code (0 success, 1 on a refused
 * build, an invalid invocation, or any rejected pack).
 */
export function main(argv = process.argv.slice(2)) {
  const options = parseBuildArgs(parseArgs(argv));
  if (options.help || !options.inputDir) {
    process.stdout.write(
      'Usage: npm run build:card-pack -- --input <packSourceDir> [--out <packsRoot>]\n',
    );
    return options.help ? 0 : 1;
  }

  let result;
  try {
    result = buildCardPack({
      inputDir: options.inputDir,
      outRoot: options.outRoot,
    });
  } catch (error) {
    process.stderr.write(`${messageOf(error)}\n`);
    return 1;
  }

  process.stdout.write(formatBuildSummary(result));
  return result.rejected.length > 0 ? 1 : 0;
}

/** True when *target* exists and is a directory (no throw). */
function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** True when *target* exists and is a symbolic link (no throw). */
function isSymlink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Coerce an unknown thrown value to a message. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// Only run the CLI when invoked directly (not when imported by a test).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exitCode = main();
}
