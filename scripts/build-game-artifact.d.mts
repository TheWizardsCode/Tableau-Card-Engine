/**
 * Type declarations for the reference runtime game artifact builder
 * (`scripts/build-game-artifact.mjs`, feature F7).
 *
 * The script is plain ESM so it can run under `tsx` without a build step;
 * these declarations give its programmatic API types for the TypeScript test
 * (`tests/scripts/build-game-artifact.test.ts`).
 */

/** Catalogue metadata parsed from a game's `GAME_INFO` export. */
export interface ArtifactGameInfo {
  sceneKey: string;
  title: string;
  description: string;
  thumbnail?: string;
}

/** A game resolved by `discoverGames` (the subset the builder uses). */
export interface ArtifactDiscoveredGame {
  id: string;
  path: string;
  scenePath: string;
  absoluteScenePath: string;
  sceneClass: string;
  info: ArtifactGameInfo;
}

/** One entry in the runtime `games/manifest.json`. */
export interface ArtifactManifestEntry {
  id: string;
  sceneKey: string;
  title: string;
  description: string;
  thumbnail?: string;
  coreEngineVersion: string;
  entry: string;
}

export const DEFAULT_OUT_ROOT: string;
export const DEFAULT_CORE_ENGINE_RANGE: string;
export const SHARED_EXTERNAL_MATCHERS: ReadonlyArray<string | RegExp>;

/** True when *id* is a shared dependency that must stay external. */
export function isSharedExternal(id: string): boolean;

/** Render the temporary artifact entry module source. */
export function renderArtifactEntry(
  discovered: Pick<
    ArtifactDiscoveredGame,
    'sceneClass' | 'absoluteScenePath' | 'info'
  >,
): string;

/** Upsert *entry* (keyed by id) into `<outRoot>/manifest.json`. */
export function mergeManifestEntry(
  outRoot: string,
  entry: Record<string, unknown>,
): {
  manifestPath: string;
  document: { version: number; games: Array<Record<string, unknown>> };
};

export interface BuildGameArtifactOptions {
  gameId: string;
  projectRoot?: string;
  presetPath?: string;
  config?: unknown;
  outRoot?: string;
  coreEngineVersion?: string;
}

export interface BuildGameArtifactResult {
  id: string;
  outDir: string;
  outRoot: string;
  entryPath: string;
  manifestPath: string;
  manifestEntry: ArtifactManifestEntry;
  sceneClass: string;
  externalised: { phaser: boolean; sharedSpecifiers: number };
  bundleBytes: number;
}

/** Build one game into a runtime artifact. */
export function buildGameArtifact(
  options: BuildGameArtifactOptions,
): Promise<BuildGameArtifactResult>;

/** Parse `--key value` / `--flag` CLI arguments. */
export function parseArgs(argv: string[]): Record<string, string | boolean>;
