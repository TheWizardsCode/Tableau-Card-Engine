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

import type { ContentAdapter } from './types';

/** Relative path of the default (Gym) story-line content file. */
export const DEFAULT_CONTENT_PATH = 'example-games/gym/data/storylines.csv';

/**
 * The Gym demo content adapter.
 *
 * Columns mirror the Gym story fixture (`GymStorylineDemo`): the generic
 * story-line fields plus `trigger`, `cost`, `coinDelta` and
 * `reputationDelta` as game columns.
 */
export const GYM_CONTENT_ADAPTER: ContentAdapter = {
  gameId: 'gym',
  columns: [
    'id',
    'name',
    'effect',
    'options',
    'hasChoices',
    'acceptNextCardId',
    'rejectNextCardId',
    'storylineId',
    'storylineTitle',
    'trigger',
    'cost',
    'coinDelta',
    'reputationDelta',
  ],
  fields: {
    id: 'id',
    name: 'name',
    effect: 'effect',
    hasChoices: 'hasChoices',
    acceptNextCardId: 'acceptNextCardId',
    rejectNextCardId: 'rejectNextCardId',
    options: 'options',
    storylineId: 'storylineId',
    storylineTitle: 'storylineTitle',
  },
  editableColumns: ['trigger', 'cost', 'coinDelta', 'reputationDelta'],
  newCardDefaults: {
    options: '',
    hasChoices: 'false',
    acceptNextCardId: '',
    rejectNextCardId: '',
    storylineId: '',
    storylineTitle: '',
    trigger: 'Incident',
    cost: '0',
    coinDelta: '0',
    reputationDelta: '0',
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

/** Every adapter shipped with the engine, keyed by game id. */
export const CONTENT_ADAPTERS: Readonly<Record<string, ContentAdapter>> = {
  [GYM_CONTENT_ADAPTER.gameId]: GYM_CONTENT_ADAPTER,
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
