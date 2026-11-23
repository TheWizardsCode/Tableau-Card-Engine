#!/usr/bin/env node
/**
 * Episode-manifest validator CLI.
 *
 * The beat sheet's sibling of `storylines:validate`: loads one episode manifest,
 * resolves its `content.adapter` through the shipped adapter registry
 * (`src/story-line/content/adapters.ts`), binds the content file's cards and
 * declared resource key set, and reports the GDD §2.4 findings with the exact
 * manifest path that failed:
 *
 * ```bash
 * npm run storylines:manifest
 * npm run storylines:manifest -- --manifest path/to/episode.json
 * npm run storylines:manifest -- --manifest path/to/episode.json --json
 * npm run storylines:manifest -- --manifest m.json --content other.csv
 * ```
 *
 * Runs under `tsx` (`npx tsx scripts/storyline-manifest.ts …`); the content and
 * manifest modules are Phaser-free and game-import-free, so no Vite loader is
 * needed and no game repository is imported.
 *
 * **JSON stability.** The `--json` report is a contract: the key order is fixed
 * and no clock is read, so two runs over the same input are byte-identical.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CONTENT_ADAPTERS,
  getContentAdapter,
} from '../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../src/story-line/content/csv';
import {
  formatEpisodeManifestReport,
  validateEpisodeManifest,
  type EpisodeManifestValidationResult,
} from '../src/story-line/content/episode-manifest';
import { resolveResourceKeys } from '../src/story-line/resources';
import { parseArgv } from './storyline-cli-support';

/**
 * Repository-relative path of the committed Appendix A manifest.
 *
 * The default mode validates this file (bound to the content it declares), so a
 * bare `npm run storylines:manifest` is a real check of the worked example
 * rather than a vacuous pass.
 */
export const DEFAULT_EPISODE_MANIFEST_PATH =
  'example-games/gym/content/long-erasure-episode.json' as const;

/** CLI usage text, in the style of `VALIDATE_USAGE`. */
export const MANIFEST_USAGE = `Validate a story-line episode manifest against its content file.

Usage:
  npx tsx scripts/storyline-manifest.ts [options]

Options:
  --manifest <path>  Validate one episode manifest (default: ${DEFAULT_EPISODE_MANIFEST_PATH})
  --content <path>   Override the manifest's content.file (default: manifest.content.file)
  --json             Emit the machine-readable JSON report
  --help             Show this help

The manifest's content.adapter selects the shipped adapter that reads the
content file (${Object.keys(CONTENT_ADAPTERS).join(', ')}); the content file's cards and
declared resource keys are bound before validation. Relative paths resolve from
the current directory.

Exit codes: 0 = valid, 1 = any finding, an unreadable manifest or content file,
or an unknown content.adapter (reported on stderr).`;

/** Parsed manifest-CLI options. */
export interface StorylineManifestCliOptions {
  readonly manifestPath: string;
  /** Explicit `--content` override of `manifest.content.file`. */
  readonly contentPath?: string;
  readonly json: boolean;
  readonly help: boolean;
}

/**
 * Parses manifest-CLI argv.
 *
 * @param argv Raw arguments.
 * @returns The parsed options.
 */
export function parseManifestArgs(
  argv: readonly string[],
): StorylineManifestCliOptions {
  const { flags } = parseArgv(argv);
  const contentPath = flags.get('content');
  return {
    manifestPath: flags.get('manifest') ?? DEFAULT_EPISODE_MANIFEST_PATH,
    ...(contentPath === undefined ? {} : { contentPath }),
    json: flags.has('json'),
    help: flags.has('help'),
  };
}

/** The manifest's declared content binding (`content.adapter` / `content.file`). */
interface ContentBinding {
  readonly adapter: string;
  readonly file: string;
}

/**
 * Reads the manifest's `content` binding.
 *
 * Total: a malformed document yields an error string instead of throwing, so
 * the CLI's diagnostic path never becomes an uncaught exception.
 *
 * @param manifest The parsed manifest document.
 * @returns The binding, or a reviewer-facing diagnostic.
 */
function readContentBinding(
  manifest: unknown,
): ContentBinding | { readonly error: string } {
  const content =
    typeof manifest === 'object' && manifest !== null
      ? (manifest as Record<string, unknown>).content
      : undefined;
  if (typeof content !== 'object' || content === null) {
    return { error: 'manifest declares no content binding (content.adapter / content.file)' };
  }
  const { adapter, file } = content as Record<string, unknown>;
  if (typeof adapter !== 'string' || adapter === '') {
    return { error: 'manifest content.adapter is missing or not a string' };
  }
  if (typeof file !== 'string' || file === '') {
    return { error: 'manifest content.file is missing or not a string' };
  }
  return { adapter, file };
}

/** The content file's declared resource key set, derived as the guard derives it. */
function declaredResourcesOf(cards: readonly { resourceKeys: readonly string[] }[]): readonly string[] {
  const declaredKeys = cards.flatMap((card) => card.resourceKeys);
  return resolveResourceKeys(declaredKeys.length > 0 ? declaredKeys : undefined);
}

/** Renders the human-readable report: provenance first, then the validator's report. */
function formatTextReport(
  result: EpisodeManifestValidationResult,
  paths: { manifest: string; content: string; adapter: string },
): string {
  return [
    'Story-line episode manifest',
    '===========================',
    `Manifest file: ${paths.manifest}`,
    `Manifest id: ${result.manifestId === '' ? '(unnamed)' : result.manifestId}`,
    `Content file: ${paths.content}`,
    `Content adapter: ${paths.adapter}`,
    '',
    formatEpisodeManifestReport(result),
  ].join('\n');
}

/**
 * Renders the stable JSON report.
 *
 * Key order is fixed and no timestamp is emitted, so a report is byte-comparable
 * across runs. Each finding carries the manifest id (the validator's own field)
 * and the report carries the manifest and content paths it was produced from.
 */
function formatJsonReport(
  result: EpisodeManifestValidationResult,
  paths: { manifest: string; content: string; adapter: string },
): string {
  return JSON.stringify(
    {
      valid: result.valid,
      manifestId: result.manifestId,
      manifest: paths.manifest,
      content: paths.content,
      adapter: paths.adapter,
      counts: {
        acts: result.counts.acts,
        scenes: result.counts.scenes,
        beats: result.counts.beats,
      },
      rules: [...result.rules],
      findings: result.findings.map((finding) => ({
        code: finding.code,
        path: finding.path,
        message: finding.message,
        ...(finding.reason === undefined ? {} : { reason: finding.reason }),
        manifestId: finding.manifestId,
      })),
    },
    null,
    2,
  );
}

/**
 * Runs the manifest CLI.
 *
 * @param argv Raw arguments (defaults to `process.argv.slice(2)`).
 * @returns Exit code: 0 when valid, 1 on any finding or diagnostic.
 */
export function runStorylineManifestCli(
  argv: readonly string[] = process.argv.slice(2),
): number {
  const opts = parseManifestArgs(argv);
  if (opts.help) {
    process.stdout.write(`${MANIFEST_USAGE}\n`);
    return 0;
  }

  const manifestPath = resolve(process.cwd(), opts.manifestPath);
  let manifestText: string;
  try {
    manifestText = readFileSync(manifestPath, 'utf-8');
  } catch (err) {
    process.stderr.write(
      `storyline-manifest: cannot read ${manifestPath}: ${(err as Error).message}\n`,
    );
    return 1;
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText) as unknown;
  } catch (err) {
    process.stderr.write(
      `storyline-manifest: cannot parse ${manifestPath}: ${(err as Error).message}\n`,
    );
    return 1;
  }

  const binding = readContentBinding(manifest);
  if ('error' in binding) {
    process.stderr.write(`storyline-manifest: ${binding.error} (${manifestPath})\n`);
    return 1;
  }

  const adapter = getContentAdapter(binding.adapter);
  if (!adapter) {
    process.stderr.write(
      `storyline-manifest: unknown content.adapter "${binding.adapter}" ` +
        `(shipped adapters: ${Object.keys(CONTENT_ADAPTERS).join(', ')})\n`,
    );
    return 1;
  }

  const contentPath = resolve(process.cwd(), opts.contentPath ?? binding.file);
  let contentText: string;
  try {
    contentText = readFileSync(contentPath, 'utf-8');
  } catch (err) {
    process.stderr.write(
      `storyline-manifest: cannot read content ${contentPath}: ${(err as Error).message}\n`,
    );
    return 1;
  }

  const cards = cardsFromCsv(parseCsv(contentText), adapter);
  const result = validateEpisodeManifest(
    manifest,
    cards,
    declaredResourcesOf(cards),
    adapter,
  );

  const paths = { manifest: manifestPath, content: contentPath, adapter: adapter.gameId };
  process.stdout.write(
    `${opts.json ? formatJsonReport(result, paths) : formatTextReport(result, paths)}\n`,
  );
  return result.valid ? 0 : 1;
}

/**
 * CLI entry point.
 *
 * @param argv Raw arguments (defaults to `process.argv.slice(2)`).
 * @returns The process exit code.
 */
export function main(argv: readonly string[] = process.argv.slice(2)): number {
  return runStorylineManifestCli(argv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
