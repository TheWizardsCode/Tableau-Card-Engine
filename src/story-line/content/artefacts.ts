/**
 * Generated story-line artefacts: the committed Mermaid graph and JSON manifest.
 *
 * The editor and the `storylines:graph` CLI both need the *same* two outputs
 * for a content file, and both need the same drift answer ("are the committed
 * artefacts still in step with the content?"). This module is that single
 * implementation:
 *
 * - {@link renderArtefacts} derives both texts from a manifest (reusing the
 *   manifest module's renderers — there is no second Mermaid/JSON encoder);
 * - {@link checkArtefacts} compares them with the committed files, reporting
 *   `missing` and `drift` separately so a caller can give an actionable
 *   message;
 * - {@link writeArtefacts} regenerates both, then re-reads them and reports
 *   the drift check, so a "regenerated" claim is always verified rather than
 *   assumed.
 *
 * These are **generated** artefacts. Hand-written documentation is not
 * generated here and is never rewritten: the write bridge reports a
 * documented row as requiring a manual doc update instead.
 *
 * This module is Phaser-free and game-import-free. It writes only generated
 * artefacts — the story-line content CSV itself is written exclusively by
 * `author.ts`.
 *
 * @module
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderMermaid, serialiseManifest, type StorylineManifest } from './manifest';

/** The two generated artefact kinds, in a stable order. */
export type ArtefactFormat = 'json' | 'mermaid';

/** Paths of the generated artefacts, in whatever base directory the caller uses. */
export interface ArtefactPaths {
  /** Path of the JSON manifest artefact. */
  readonly json: string;
  /** Path of the Mermaid flowchart artefact. */
  readonly mermaid: string;
}

/**
 * The committed Gym artefact paths (repository-relative).
 *
 * The Gym is the default adapter's game, so these are the defaults every tool
 * uses unless a game passes its own paths.
 */
export const DEFAULT_ARTEFACT_PATHS: ArtefactPaths = {
  json: 'example-games/gym/content/storyline-manifest.json',
  mermaid: 'example-games/gym/content/storyline-graph.mmd',
} as const;

/** The rendered text of both artefacts for one manifest. */
export interface ArtefactContent {
  /** The JSON manifest text. */
  readonly json: string;
  /** The Mermaid flowchart text. */
  readonly mermaid: string;
}

/** One committed artefact that is not in step with the content. */
export interface ArtefactDrift {
  /** Which artefact drifted. */
  readonly format: ArtefactFormat;
  /** The path that was checked (as supplied, resolved for reading). */
  readonly path: string;
  /** Why it is out of step. */
  readonly reason: 'missing' | 'drift';
  /** Actionable message naming the artefact and the regeneration command. */
  readonly message: string;
}

/** The result of regenerating the committed artefacts. */
export interface ArtefactWriteResult {
  /** The paths that were targeted. */
  readonly paths: ArtefactPaths;
  /** The paths actually written. */
  readonly written: readonly string[];
  /** Post-write drift check — empty means the artefacts are in sync. */
  readonly drifts: readonly ArtefactDrift[];
  /** True when every artefact was written and verified in sync. */
  readonly ok: boolean;
}

/** Renders both artefacts from a manifest (deterministic, timestamp-free). */
export function renderArtefacts(manifest: StorylineManifest): ArtefactContent {
  return {
    json: serialiseManifest(manifest),
    mermaid: renderMermaid(manifest),
  };
}

/** Compares one artefact's committed text with the expected text. */
function compareArtefact(
  format: ArtefactFormat,
  path: string,
  expected: string,
  baseDir: string,
): ArtefactDrift | undefined {
  const absolute = resolve(baseDir, path);
  if (!existsSync(absolute)) {
    return {
      format,
      path,
      reason: 'missing',
      message:
        `missing committed ${format} artefact ${path} — regenerate with ` +
        `\`npm run storylines:graph -- --format ${format}\``,
    };
  }
  if (readFileSync(absolute, 'utf-8') !== expected) {
    return {
      format,
      path,
      reason: 'drift',
      message:
        `drift detected in ${path} — regenerate with ` +
        `\`npm run storylines:graph -- --format ${format}\``,
    };
  }
  return undefined;
}

/**
 * Checks the committed artefacts against a manifest.
 *
 * @param manifest The manifest the content currently produces.
 * @param paths    Artefact paths (defaults to {@link DEFAULT_ARTEFACT_PATHS}).
 * @param baseDir  Base directory relative paths resolve against (default
 *                 `process.cwd()`).
 * @returns Every drift found (empty when both artefacts are in sync).
 */
export function checkArtefacts(
  manifest: StorylineManifest,
  paths: ArtefactPaths = DEFAULT_ARTEFACT_PATHS,
  baseDir: string = process.cwd(),
): ArtefactDrift[] {
  const content = renderArtefacts(manifest);
  const drifts: ArtefactDrift[] = [];
  const json = compareArtefact('json', paths.json, content.json, baseDir);
  if (json) drifts.push(json);
  const mermaid = compareArtefact('mermaid', paths.mermaid, content.mermaid, baseDir);
  if (mermaid) drifts.push(mermaid);
  return drifts;
}

/**
 * Regenerates both committed artefacts and verifies the result.
 *
 * The drift check is run **after** writing, by reading the files back, so the
 * returned `ok` is evidence rather than an assumption.
 *
 * @param manifest The manifest the accepted content produces.
 * @param paths    Artefact paths (defaults to {@link DEFAULT_ARTEFACT_PATHS}).
 * @param baseDir  Base directory relative paths resolve against.
 * @returns What was written plus the post-write drift check.
 */
export function writeArtefacts(
  manifest: StorylineManifest,
  paths: ArtefactPaths = DEFAULT_ARTEFACT_PATHS,
  baseDir: string = process.cwd(),
): ArtefactWriteResult {
  const content = renderArtefacts(manifest);
  const written: string[] = [];
  const targets: readonly (readonly [ArtefactFormat, string, string])[] = [
    ['json', paths.json, content.json],
    ['mermaid', paths.mermaid, content.mermaid],
  ];
  for (const [, path, text] of targets) {
    writeFileSync(resolve(baseDir, path), text, 'utf-8');
    written.push(path);
  }
  const drifts = checkArtefacts(manifest, paths, baseDir);
  return { paths, written, drifts, ok: drifts.length === 0 };
}

/**
 * The artefacts an accepted edit *would* produce, without writing anything
 * (the `--dry-run` preview of the regeneration step).
 *
 * @param manifest The manifest the candidate content produces.
 * @param paths    Artefact paths.
 * @param baseDir  Base directory relative paths resolve against.
 * @returns The rendered artefact text.
 */
export function previewArtefacts(
  manifest: StorylineManifest,
  paths: ArtefactPaths = DEFAULT_ARTEFACT_PATHS,
  baseDir: string = process.cwd(),
): {
  readonly content: ArtefactContent;
  readonly drifts: readonly ArtefactDrift[];
} {
  return {
    content: renderArtefacts(manifest),
    drifts: checkArtefacts(manifest, paths, baseDir),
  };
}
