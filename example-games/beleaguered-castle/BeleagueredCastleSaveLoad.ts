/**
 * Beleaguered Castle save/load adapter.
 *
 * Provides state serialization/deserialization and checkpoint helpers
 * compatible with `SaveLoadStore`, following the pattern established
 * by Main Street (`MainStreetSaveLoad.ts`).
 *
 * ## Checkpoint strategy
 *
 * - A single slot (`BC_RUN_SLOT`) is reused for all checkpoints:
 *   deal-complete and after-each-move. The latest checkpoint always
 *   reflects the most recent save point.
 * - No campaign progression data exists for Beleaguered Castle;
 *   only run checkpoints are saved.
 */

import type { Rank, Suit } from '../../src/card-system/Card';
import { createCard } from '../../src/card-system/Card';
import { Pile } from '../../src/card-system/Pile';
import type { SaveSerializer } from '../../src/core-engine';
import { SaveLoadStore } from '../../src/core-engine';
import type { BeleagueredCastleState } from './BeleagueredCastleState';
import { FOUNDATION_COUNT, TABLEAU_COUNT } from './BeleagueredCastleState';

// ── Constants ───────────────────────────────────────────────

/** Schema version for Beleaguered Castle run checkpoints. */
export const BC_SAVE_SCHEMA_VERSION = 1;

/** Game type identifier used in SaveLoadStore keys. */
export const BC_GAME_TYPE = 'beleaguered-castle';

/** Slot ID for run checkpoints (reused for deal-complete and after-move). */
export const BC_RUN_SLOT = 'run-checkpoint';

// ── Serialized state shape ──────────────────────────────────

/**
 * JSON-safe serialized form of `BeleagueredCastleState`.
 *
 * Foundations and tableau columns are represented as arrays of
 * `{ rank, suit }` pairs (bottom-to-top, last = top card).
 * All cards are always face-up in Beleaguered Castle.
 */
export interface BCSerializedState {
  /** Foundation piles, one per suit (0=clubs, 1=diamonds, 2=hearts, 3=spades). */
  foundations: Array<Array<{ rank: Rank; suit: Suit }>>;
  /** Tableau columns (0-7), each an array of cards bottom-to-top. */
  tableau: Array<Array<{ rank: Rank; suit: Suit }>>;
  /** The RNG seed used for the deal. */
  seed: number;
  /** Number of moves the player has made. */
  moveCount: number;
}

// ── Serialization helpers ───────────────────────────────────

/**
 * Serialize in-memory `BeleagueredCastleState` to a JSON-safe object.
 */
export function serializeBCState(
  state: BeleagueredCastleState,
): BCSerializedState {
  const foundations: BCSerializedState['foundations'] = [];
  for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
    foundations.push(
      state.foundations[fi].toArray().map((c) => ({ rank: c.rank, suit: c.suit })),
    );
  }

  const tableau: BCSerializedState['tableau'] = [];
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    tableau.push(
      state.tableau[col].toArray().map((c) => ({ rank: c.rank, suit: c.suit })),
    );
  }

  return {
    foundations,
    tableau,
    seed: state.seed,
    moveCount: state.moveCount,
  };
}

/**
 * Deserialize a JSON-safe object back into `BeleagueredCastleState`.
 *
 * All cards are created face-up (as in the actual game).
 */
export function deserializeBCState(
  saved: BCSerializedState,
): BeleagueredCastleState {
  const foundations: [Pile, Pile, Pile, Pile] = [
    new Pile(saved.foundations[0].map((c) => createCard(c.rank, c.suit, true))),
    new Pile(saved.foundations[1].map((c) => createCard(c.rank, c.suit, true))),
    new Pile(saved.foundations[2].map((c) => createCard(c.rank, c.suit, true))),
    new Pile(saved.foundations[3].map((c) => createCard(c.rank, c.suit, true))),
  ];

  const tableau = saved.tableau.map((col) =>
    new Pile(col.map((c) => createCard(c.rank, c.suit, true))),
  );

  return {
    foundations,
    tableau,
    seed: saved.seed,
    moveCount: saved.moveCount,
  };
}

// ── SaveSerializer ──────────────────────────────────────────

/**
 * `SaveSerializer` implementation for `SaveLoadStore` compatibility.
 */
export const bcStateSerializer: SaveSerializer<
  BeleagueredCastleState,
  BCSerializedState
> = {
  schemaVersion: BC_SAVE_SCHEMA_VERSION,
  serialize: serializeBCState,
  deserialize: deserializeBCState,
};

// ── Checkpoint helpers ──────────────────────────────────────

/**
 * Save a snapshot of the current game state as a run checkpoint.
 *
 * This is fire-and-forget (not awaited in the UI handler) to avoid
 * introducing input lag on slower storage backends.
 *
 * @param store  Initialized `SaveLoadStore` instance.
 * @param state  Current game state to persist.
 * @param slotId  Optional slot identifier (defaults to `BC_RUN_SLOT`).
 */
export async function saveBCSnapshot(
  store: SaveLoadStore,
  state: BeleagueredCastleState,
  slotId: string = BC_RUN_SLOT,
): Promise<void> {
  await store.saveRunCheckpoint(
    BC_GAME_TYPE,
    slotId,
    bcStateSerializer,
    state,
  );
}

/**
 * Load the most recently saved run checkpoint.
 *
 * @param store   Initialized `SaveLoadStore` instance.
 * @param slotId  Optional slot identifier (defaults to `BC_RUN_SLOT`).
 * @returns The restored game state, or `null` if no checkpoint exists.
 */
export async function loadBCSnapshot(
  store: SaveLoadStore,
  slotId: string = BC_RUN_SLOT,
): Promise<BeleagueredCastleState | null> {
  return store.loadRunCheckpoint(
    BC_GAME_TYPE,
    slotId,
    bcStateSerializer,
  );
}

/**
 * Delete the saved checkpoint so the next boot starts a fresh game.
 * Safe to call even if no checkpoint exists.
 *
 * @param store   Initialized `SaveLoadStore` instance.
 * @param slotId  Optional slot identifier (defaults to `BC_RUN_SLOT`).
 */
export async function clearBCSnapshot(
  store: SaveLoadStore,
  slotId: string = BC_RUN_SLOT,
): Promise<void> {
  await store.remove('run-checkpoint', BC_GAME_TYPE, slotId);
}
