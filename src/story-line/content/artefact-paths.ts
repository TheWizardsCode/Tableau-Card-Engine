/**
 * Paths of the committed story-line artefacts.
 *
 * Kept in a **Node-free** module so browser bundles (the story-line editor
 * page and its tests) can import a game's content registry — which pairs each
 * content file with its artefacts — without pulling in `node:fs`. The writer
 * and drift checker live in {@link ./artefacts}, which re-exports these
 * declarations as the single source of truth.
 *
 * @module
 */

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
