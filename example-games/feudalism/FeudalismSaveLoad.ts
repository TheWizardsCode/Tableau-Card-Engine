/**
 * Feudalism save/load adapter.
 *
 * Provides state serialization/deserialization and checkpoint helpers
 * compatible with `SaveLoadStore` and `CheckpointManager`, following
 * the pattern established by `BeleagueredCastleSaveLoad.ts` and
 * `MainStreetSaveLoad.ts`.
 *
 * ## Checkpoint strategy
 *
 * - A single slot (`FEUDALISM_RUN_SLOT`) is reused for all checkpoints.
 *   The latest checkpoint always reflects the most recent save point.
 * - The RNG seed is tracked in the serialized state so that the game
 *   can be reconstructed deterministically on restore.
 */

import { createSeededRng, type SaveSerializer, SaveLoadStore, deserializeWithVersion } from '../../src/core-engine';
import type { VersionedPayload } from '../../src/core-engine';
import type { FeudalismSession, FeudalismPlayerState, FeudalismPhase } from './FeudalismGame';
import type { DevelopmentCard, PatronTile, Tier, ResourceTokens } from './FeudalismCards';


// ── Constants ───────────────────────────────────────────────

/** Schema version for Feudalism run checkpoints. */
export const FEUDALISM_SAVE_SCHEMA_VERSION = 1;

/** Game type identifier used in SaveLoadStore keys. */
export const FEUDALISM_GAME_TYPE = 'feudalism';

/** Slot ID for run checkpoints (reused for turn-by-turn saves). */
export const FEUDALISM_RUN_SLOT = 'run-checkpoint';

// ── Serialized state shape ──────────────────────────────────

/**
 * JSON-safe serialized form of a {@link FeudalismSession}.
 *
 * Cards and patron tiles are referenced by their `id` fields.
 * The RNG function is not serializable; instead the numeric seed
 * is stored and a new RNG is created on deserialization.
 */
export interface FeudalismSerializedState {
  /** Serialized player states. */
  players: Array<{
    name: string;
    isAI: boolean;
    tokens: ResourceTokens;
    /** IDs of purchased development cards, in order. */
    purchasedCardIds: number[];
    /** IDs of reserved development cards. */
    reservedCardIds: number[];
    /** IDs of earned patron tiles. */
    patronIds: number[];
  }>;
  /** Market rows per tier, with card IDs for visible cards and deck. */
  market: Record<Tier, {
    /** ID of each visible card (or null for empty slot). */
    visible: (number | null)[];
    /** IDs of cards remaining in the deck (top = last). */
    deckIds: number[];
  }>;
  /** Token supply counts. */
  tokenSupply: ResourceTokens;
  /** IDs of patron tiles remaining in the pool. */
  patronIds: number[];
  /** Current game phase. */
  phase: FeudalismPhase;
  /** Index of the current player. */
  currentPlayerIndex: number;
  /** Index of the player who started the game. */
  startingPlayerIndex: number;
  /** Index of the player who triggered end-game, or -1. */
  triggerPlayerIndex: number;
  /** The numeric seed for RNG reconstruction. */
  seed: number;
}

// ── Serialization helpers ───────────────────────────────────

/**
 * Serialize a {@link FeudalismSession} to a JSON-safe object.
 *
 * Cards and patrons are referenced by ID. The RNG function is not
 * serialized; the caller must provide the original seed.
 *
 * @param session - The current game session.
 * @param seed    - The numeric RNG seed used to set up the session.
 * @returns A serializable state object.
 */
export function serializeFeudalismState(
  session: FeudalismSession,
  seed: number,
): FeudalismSerializedState {
  return {
    players: session.players.map((p) => ({
      name: p.name,
      isAI: p.isAI,
      tokens: { ...p.tokens },
      purchasedCardIds: p.purchasedCards.map((c) => c.id),
      reservedCardIds: p.reservedCards.map((c) => c.id),
      patronIds: p.patrons.map((pt) => pt.id),
    })),
    market: {
      1: serializeMarketRow(session.market[1]),
      2: serializeMarketRow(session.market[2]),
      3: serializeMarketRow(session.market[3]),
    },
    tokenSupply: { ...session.tokenSupply },
    patronIds: session.patrons.map((pt) => pt.id),
    phase: session.phase,
    currentPlayerIndex: session.currentPlayerIndex,
    startingPlayerIndex: session.startingPlayerIndex,
    triggerPlayerIndex: session.triggerPlayerIndex,
    seed,
  };
}

function serializeMarketRow(row: { visible: (DevelopmentCard | null)[]; deck: DevelopmentCard[] }): FeudalismSerializedState['market'][Tier] {
  return {
    visible: row.visible.map((c) => c?.id ?? null),
    deckIds: row.deck.map((c) => c.id),
  };
}

/**
 * Deserialize a {@link FeudalismSerializedState} back into a
 * {@link FeudalismSession}.
 *
 * Cards and patrons are resolved by ID using the reference arrays.
 * A new RNG is created from the stored seed.
 *
 * @param saved - The serialized state to restore.
 * @returns A fully reconstructed game session (ready for play).
 */
export function deserializeFeudalismState(
  saved: FeudalismSerializedState,
): FeudalismSession {
  // Recreate the RNG from the stored seed
  const rng = createSeededRng(saved.seed);

  // Reconstruct players
  const players: FeudalismPlayerState[] = saved.players.map((sp) => ({
    name: sp.name,
    isAI: sp.isAI,
    tokens: { ...sp.tokens },
    purchasedCards: sp.purchasedCardIds.map((id) => resolveCardById(id)),
    reservedCards: sp.reservedCardIds.map((id) => resolveCardById(id)),
    patrons: sp.patronIds.map((id) => resolvePatronById(id)),
  }));

  // Reconstruct market
  const market = {
    1: deserializeMarketRow(saved.market[1]),
    2: deserializeMarketRow(saved.market[2]),
    3: deserializeMarketRow(saved.market[3]),
  } as FeudalismSession['market'];

  return {
    players,
    market,
    tokenSupply: { ...saved.tokenSupply },
    patrons: saved.patronIds.map((id) => resolvePatronById(id)),
    phase: saved.phase,
    currentPlayerIndex: saved.currentPlayerIndex,
    startingPlayerIndex: saved.startingPlayerIndex,
    triggerPlayerIndex: saved.triggerPlayerIndex,
    seed: saved.seed,
    rng,
  };
}

function deserializeMarketRow(
  saved: FeudalismSerializedState['market'][Tier],
): { visible: (DevelopmentCard | null)[]; deck: DevelopmentCard[] } {
  return {
    visible: saved.visible.map((id) => id !== null ? resolveCardById(id) : null),
    deck: saved.deckIds.map((id) => resolveCardById(id)),
  };
}

// ── Card and Patron resolution ──────────────────────────────

import {
  ALL_DEVELOPMENT_CARDS,
  ALL_PATRONS,
} from './FeudalismCards';

/**
 * Resolve a development card by its ID from the master list.
 * Throws if the ID is not found.
 */
function resolveCardById(id: number): DevelopmentCard {
  const card = ALL_DEVELOPMENT_CARDS.find((c) => c.id === id);
  if (!card) {
    throw new Error(`[FeudalismSaveLoad] Unknown development card ID: ${id}`);
  }
  return card;
}

/**
 * Resolve a patron tile by its ID from the master list.
 * Throws if the ID is not found.
 */
function resolvePatronById(id: number): PatronTile {
  const patron = ALL_PATRONS.find((p) => p.id === id);
  if (!patron) {
    throw new Error(`[FeudalismSaveLoad] Unknown patron tile ID: ${id}`);
  }
  return patron;
}

// ── SaveSerializer ──────────────────────────────────────────

/**
 * Factory function to create a SaveSerializer for Feudalism.
 *
 * Returns a serializer that captures both the session and the seed.
 *
 * @param seed - The numeric RNG seed used for this game session.
 * @returns A SaveSerializer matching the in-memory and serialized state types.
 */
export function createFeudalismSerializer(
  seed: number,
): SaveSerializer<FeudalismSession, FeudalismSerializedState> {
  return {
    schemaVersion: FEUDALISM_SAVE_SCHEMA_VERSION,
    serialize: (session: FeudalismSession) => serializeFeudalismState(session, seed),
    deserialize: deserializeFeudalismState,
  };
}

// ── Checkpoint helpers ──────────────────────────────────────

/**
 * Save a snapshot of the current game session as a run checkpoint.
 *
 * Fire-and-forget in production. The seed is pulled from the session
 * directly for serialization.
 *
 * @param store   - Initialized SaveLoadStore instance.
 * @param session - Current game session.
 * @param seed    - Numeric RNG seed used for this session.
 * @param slotId  - Optional slot identifier (defaults to FEUDALISM_RUN_SLOT).
 */
export async function saveFeudalismCheckpoint(
  store: SaveLoadStore,
  session: FeudalismSession,
  seed: number,
  slotId: string = FEUDALISM_RUN_SLOT,
): Promise<void> {
  const serializer = createFeudalismSerializer(seed);
  await store.saveRunCheckpoint(FEUDALISM_GAME_TYPE, slotId, serializer, session);
}

/**
 * Load the most recently saved run checkpoint.
 *
 * Since the serializer requires the seed (stored in the state), we load
 * the raw stored data, extract the seed, then deserialize with the
 * proper serializer.
 *
 * @param store   - Initialized SaveLoadStore instance.
 * @param slotId  - Optional slot identifier (defaults to FEUDALISM_RUN_SLOT).
 * @returns The restored game session, or null if no checkpoint exists.
 */
export async function loadFeudalismCheckpoint(
  store: SaveLoadStore,
  slotId: string = FEUDALISM_RUN_SLOT,
): Promise<FeudalismSession | null> {
  const stored = await store.load<VersionedPayload<FeudalismSerializedState>>(
    'run-checkpoint', FEUDALISM_GAME_TYPE, slotId,
  );
  if (!stored) return null;

  const seed = stored.payload.data.seed;
  const serializer = createFeudalismSerializer(seed);
  return deserializeWithVersion(serializer, stored.payload);
}

/**
 * Delete the saved checkpoint so the next boot starts a fresh game.
 * Safe to call even if no checkpoint exists.
 *
 * @param store   - Initialized SaveLoadStore instance.
 * @param slotId  - Optional slot identifier (defaults to FEUDALISM_RUN_SLOT).
 */
export async function clearFeudalismCheckpoint(
  store: SaveLoadStore,
  slotId: string = FEUDALISM_RUN_SLOT,
): Promise<void> {
  await store.remove('run-checkpoint', FEUDALISM_GAME_TYPE, slotId);
}
