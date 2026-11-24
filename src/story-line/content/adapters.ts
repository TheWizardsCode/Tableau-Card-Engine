/**
 * Shipped content adapters.
 *
 * Core ships one **default** adapter — the Gym demo content — so the authoring
 * toolchain has a working, game-free target out of the box, plus a registry the
 * `tsx` CLIs resolve `--game <id>` through. A game ships its own adapter (plain
 * data, see {@link ContentAdapter}); nothing here imports a game repository.
 *
 * The Gym adapter also demonstrates the seam's game-column story: the Gym
 * demo's coin/reputation deltas are ordinary extra columns, and its
 * `describeImpact` hook turns them into a human-readable manifest label
 * without core knowing what a coin is.
 *
 * @module
 */

import { DEFAULT_ARTEFACT_PATHS, type ArtefactPaths } from './artefact-paths';
import { LEGACY_CLOCK_COST_COLUMN, type ContentAdapter } from './types';

/** Relative path of the default (Gym) story-line content file. */
export const DEFAULT_CONTENT_PATH = 'example-games/gym/content/storylines.csv';

/** Relative path of the Gym's *Long Erasure* story-line content file. */
export const LONG_ERASURE_CONTENT_PATH =
  'example-games/gym/content/long-erasure.csv';

/**
 * The Gym demo content adapter.
 *
 * Columns mirror the Gym story fixture (`GymStorylineDemo`): the generic
 * story-line fields (including the declared `resources` keys and the optional
 * `context` prose) plus `trigger`, `cost`, `coinDelta` and `reputationDelta`
 * as game columns. The demo authors `context` on every card so the shipped
 * demo exercises the prose surface alongside the Long Erasure content.
 */
export const GYM_CONTENT_ADAPTER: ContentAdapter = {
  gameId: 'gym',
  columns: [
    'id',
    'name',
    'effect',
    'options',
    'storylineId',
    'storylineTitle',
    'resources',
    'trigger',
    'cost',
    'coinDelta',
    'reputationDelta',
    'context',
  ],
  fields: {
    id: 'id',
    name: 'name',
    effect: 'effect',
    options: 'options',
    storylineId: 'storylineId',
    storylineTitle: 'storylineTitle',
    resources: 'resources',
    context: 'context',
  },
  editableColumns: ['trigger', 'cost', 'coinDelta', 'reputationDelta'],
  newCardDefaults: {
    options: '',
    storylineId: '',
    storylineTitle: '',
    trigger: 'Incident',
    cost: '0',
    coinDelta: '0',
    reputationDelta: '0',
    context: '',
  },
  describeImpact: (card) => {
    const parts: string[] = [];
    const coins = Number(card.fields.coinDelta ?? '');
    const reputation = Number(card.fields.reputationDelta ?? '');
    const signed = (value: number): string =>
      value < 0 ? `−${Math.abs(value)}` : `+${value}`;
    if (Number.isFinite(coins) && coins !== 0) parts.push(`${signed(coins)} coins`);
    if (Number.isFinite(reputation) && reputation !== 0) {
      parts.push(`${signed(reputation)} reputation`);
    }
    return parts.join(' · ');
  },
};

/**
 * The Gym *Long Erasure* content adapter.
 *
 * Its own content file and storyline (`long-erasure`) keep the shipped Gym demo
 * rows untouched, so the committed options-parity goldens stay green. The
 * column set is the generic story-line shape plus the two narrative columns the
 * Phaser-free run module reads:
 *
 * - `act` — the act the card belongs to (`I`, `II`, `III` or `Ending`);
 * - {@link LEGACY_CLOCK_COST_COLUMN} (`clockCost`) — pressure-clock beats
 *   consumed when the card is drawn, the migration-only column G10 retires in
 *   favour of `beat.clockCost` (the manifest validator checks the two agree
 *   while both exist);
 * - `context` / `epilogue` — the optional authored prose the narrative panel and
 *   the closing screen read. The columns are part of the file's schema and may
 *   be blank: a blank cell reads as "no prose authored" (`null`).
 *
 * Mechanics ride on the **option** attributes (`#cost` / `#extra` / `#when`),
 * so no bespoke resource column exists: the declared set is the mapped
 * `resources` column (`hull, morale, stores, goodwill, charge`).
 *
 * `hull` is declared **irreversible** here as the authoring-side half of the
 * never-restored contract: the episode manifest's `resources.irreversible` is
 * the authoritative source, and this declaration gives the manifest-free CSV
 * validator the same vocabulary. The run wiring derives the projection from
 * the manifest and audits the two declarations for drift.
 */
export const LONG_ERASURE_CONTENT_ADAPTER: ContentAdapter = {
  gameId: 'long-erasure',
  columns: [
    'id',
    'name',
    'effect',
    'options',
    'storylineId',
    'storylineTitle',
    'resources',
    'act',
    LEGACY_CLOCK_COST_COLUMN,
    'context',
    'epilogue',
  ],
  fields: {
    id: 'id',
    name: 'name',
    effect: 'effect',
    options: 'options',
    storylineId: 'storylineId',
    storylineTitle: 'storylineTitle',
    resources: 'resources',
    context: 'context',
    epilogue: 'epilogue',
  },
  editableColumns: ['act', LEGACY_CLOCK_COST_COLUMN],
  irreversibleResources: ['hull'],
  newCardDefaults: {
    options: '',
    storylineId: 'long-erasure',
    storylineTitle: 'The Long Erasure',
    resources: 'hull,morale,stores,goodwill,charge',
    act: 'I',
    [LEGACY_CLOCK_COST_COLUMN]: '1',
    context: '',
    epilogue: '',
  },
};

/** Every adapter shipped with the engine, keyed by game id. */
export const CONTENT_ADAPTERS: Readonly<Record<string, ContentAdapter>> = {
  [GYM_CONTENT_ADAPTER.gameId]: GYM_CONTENT_ADAPTER,
  [LONG_ERASURE_CONTENT_ADAPTER.gameId]: LONG_ERASURE_CONTENT_ADAPTER,
};

/** The adapter the CLIs use when `--game` is omitted. */
export const DEFAULT_CONTENT_ADAPTER: ContentAdapter = GYM_CONTENT_ADAPTER;

/**
 * Looks up a shipped content adapter by game id.
 *
 * @param gameId The adapter's game id (e.g. `gym`).
 * @returns The adapter, or `undefined` when no such adapter is shipped.
 */
export function getContentAdapter(gameId: string): ContentAdapter | undefined {
  return CONTENT_ADAPTERS[gameId];
}

/**
 * Resolves a `--game` argument to an adapter, defaulting to the Gym adapter
 * when the argument is absent.
 *
 * @param gameId Optional game id.
 * @returns The adapter, or `undefined` when an unknown id was supplied.
 */
export function resolveContentAdapter(gameId?: string): ContentAdapter | undefined {
  if (gameId === undefined || gameId === '') return DEFAULT_CONTENT_ADAPTER;
  return getContentAdapter(gameId);
}

/**
 * One shipped content file: where it lives, which adapter reads it and where
 * its generated artefacts belong.
 *
 * The CLIs treat this as the canonical content registry, so `storylines:validate`
 * and `storylines:graph` (run with no `--csv`) cover **every** shipped content
 * file rather than only the default one — a second content file cannot silently
 * escape validation or the artefact drift guard.
 */
export interface ContentFileSpec {
  /** Repository-relative CSV path. */
  readonly csv: string;
  /** Id of the shipped adapter that reads {@link ContentFileSpec.csv}. */
  readonly adapterId: string;
  /** Repository-relative paths of the JSON manifest and Mermaid artefacts. */
  readonly artefacts: ArtefactPaths;
}

/**
 * Every content file shipped with the Gym, with its adapter and artefacts.
 *
 * The first entry is the default Gym demo content, so `DEFAULT_CONTENT_FILES[0]`
 * always matches {@link DEFAULT_CONTENT_PATH} / {@link DEFAULT_ARTEFACT_PATHS}.
 */
export const DEFAULT_CONTENT_FILES: readonly ContentFileSpec[] = [
  {
    csv: DEFAULT_CONTENT_PATH,
    adapterId: GYM_CONTENT_ADAPTER.gameId,
    artefacts: DEFAULT_ARTEFACT_PATHS,
  },
  {
    csv: LONG_ERASURE_CONTENT_PATH,
    adapterId: LONG_ERASURE_CONTENT_ADAPTER.gameId,
    artefacts: {
      json: 'example-games/gym/content/long-erasure-manifest.json',
      mermaid: 'example-games/gym/content/long-erasure-graph.mmd',
    },
  },
];

/**
 * Finds the content-file spec a CSV path belongs to.
 *
 * @param csvPath Repository-relative or absolute CSV path.
 * @returns The matching spec, or `undefined` for an ad-hoc file.
 */
export function findContentFileSpec(csvPath: string): ContentFileSpec | undefined {
  const normalised = csvPath.replace(/\\/g, '/');
  return DEFAULT_CONTENT_FILES.find(
    (spec) => normalised === spec.csv || normalised.endsWith(`/${spec.csv}`),
  );
}
