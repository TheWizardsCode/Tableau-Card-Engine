/**
 * Type declarations for the reference card-pack builder
 * (`scripts/build-card-pack.mjs`, feature F7 / CG-0MUZIS3G6008UQGO).
 *
 * The script is plain ESM so it can run under `tsx` without a build step;
 * these declarations give its programmatic API types for the TypeScript test
 * (`tests/scripts/build-card-pack.test.ts`).
 */

/** One entry in the runtime `packs/manifest.json`. */
export interface CardPackManifestEntry {
  id: string;
  gameId: string;
  title: string;
  description: string;
  version: string;
  coreEngineVersion: string;
  cards: string;
  assets?: string[];
  entitlement?: { steamAppId?: number };
}

/** A `packs/manifest.json` document. */
export interface CardPackManifestDocument {
  version: number;
  packs: CardPackManifestEntry[];
}

/** A pack that passed validation and was copied into the packs root. */
export interface BuiltCardPack {
  id: string;
  gameId: string;
  /** Absolute destination directory (`<outRoot>/<gameId>/<id>`). */
  packDir: string;
  /** Absolute path to the copied CSV fragment. */
  csvPath: string;
  /** Copied files, relative to `packDir`, slash-separated and sorted. */
  files: string[];
  /** The manifest entry written for the pack. */
  entry: CardPackManifestEntry;
}

/** A pack rejected whole, with the reason it was not built. */
export interface RejectedCardPack {
  id: string;
  gameId: string;
  reason: string;
}

/** Result of {@link buildCardPack}. */
export interface BuildCardPackResult {
  inputDir: string;
  outRoot: string;
  manifestPath: string;
  /** The merged document, or `null` when every pack was rejected. */
  document: CardPackManifestDocument | null;
  packs: BuiltCardPack[];
  rejected: RejectedCardPack[];
}

/** Options accepted by {@link buildCardPack}. */
export interface BuildCardPackOptions {
  inputDir: string;
  projectRoot?: string;
  outRoot?: string;
}

/** Thrown when the pack source manifest is unreadable or invalid. */
export class CardPackBuildError extends Error {}

export const DEFAULT_OUT_ROOT: string;
export const PACK_MANIFEST_FILENAME: string;
export const PACK_MANIFEST_VERSION: number;

/** Validate a pack CSV fragment's header. */
export function validatePackCsv(
  csv: string,
): { ok: true; header: string[] } | { ok: false; reason: string };

/**
 * Upsert *entry* (keyed by `(gameId, id)`) into `<outRoot>/manifest.json`.
 */
export function mergePackManifestEntry(
  outRoot: string,
  entry: Record<string, unknown>,
  version?: number,
): { manifestPath: string; document: CardPackManifestDocument };

/** Build one authored card-pack source tree into an installable packs root. */
export function buildCardPack(options: BuildCardPackOptions): BuildCardPackResult;

/** Render the human-readable CLI summary for a build result. */
export function formatBuildSummary(result: BuildCardPackResult): string;

/** Parse the CLI arguments into a build-options object. */
export function parseBuildArgs(args: Record<string, string | boolean>): {
  inputDir: string | undefined;
  outRoot: string | undefined;
  help: boolean;
};

/** CLI entry point; returns the process exit code. */
export function main(argv?: string[]): number;
