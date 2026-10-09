/**
 * 1916: The Rising — versioned save/load persistence.
 *
 * Wraps the game's pure {@link RisingState} serialisation in the shared
 * {@link SaveSerializer} contract so the core {@link SaveLoadStore} can persist
 * and restore a session, and the {@link CheckpointManager} can autosave a
 * checkpoint at the end of every turn.
 *
 * The serializer stores the state's JSON string as its wire format and carries
 * {@link RISING_STATE_VERSION} as the schema version, so
 * {@link serializeWithVersion} / {@link deserializeWithVersion} reject a
 * payload written by an incompatible schema instead of silently corrupting a
 * session.
 *
 * @module src/TheRisingSaveLoad
 */

import {
  SaveLoadStore,
  deserializeWithVersion,
  serializeWithVersion,
  type SaveSerializer,
  type VersionedPayload,
} from '@core-engine/SaveLoad';
import { CheckpointManager } from '@core-engine/CheckpointManager';
import {
  RISING_STATE_VERSION,
  deserializeRisingState,
  serializeRisingState,
  type RisingState,
} from './TheRisingState';
import { THERISING_GAME_TYPE } from './TheRisingTranscript';

/** The checkpoint slot used for the end-of-turn autosave. */
export const THERISING_RUN_SLOT = 'turn-start';

/** The schema version written alongside every The Rising save. */
export const THERISING_SAVE_SCHEMA_VERSION = RISING_STATE_VERSION;

/** The Rising's serialized wire format: the state's JSON string. */
export type RisingSerializedState = string;

/**
 * The Rising's versioned save serializer.
 *
 * `serialize` / `deserialize` delegate to the state module's structural
 * helpers; the schema version is the state format version. No `migrate` hook
 * is provided, so any version mismatch is a hard failure.
 */
export const risingStateSerializer: SaveSerializer<RisingState, RisingSerializedState> = {
  schemaVersion: THERISING_SAVE_SCHEMA_VERSION,
  serialize: (state) => serializeRisingState(state),
  deserialize: (data) => deserializeRisingState(data),
};

/** Serialize a state into a version-tagged payload. */
export function serializeRisingStateVersioned(
  state: RisingState,
): VersionedPayload<RisingSerializedState> {
  return serializeWithVersion(risingStateSerializer, state);
}

/**
 * Restore a state from a version-tagged payload.
 *
 * @throws {Error} When the payload's schema version does not match the
 *   serializer (forward or backward incompatibility) or the payload fails the
 *   structural state guard.
 */
export function deserializeRisingStateVersioned(
  payload: VersionedPayload<RisingSerializedState>,
): RisingState {
  return deserializeWithVersion(risingStateSerializer, payload);
}

/**
 * Create a canonical {@link CheckpointManager} for The Rising run checkpoints.
 *
 * @param store - A {@link SaveLoadStore} instance.
 */
export function createTheRisingCheckpointManager(
  store: SaveLoadStore,
): CheckpointManager<RisingState, RisingSerializedState> {
  return new CheckpointManager(
    store,
    THERISING_GAME_TYPE,
    THERISING_RUN_SLOT,
    risingStateSerializer,
  );
}

/** Save the end-of-turn checkpoint for a state. Safe to call fire-and-forget. */
export async function saveTurnCheckpoint(
  store: SaveLoadStore,
  state: RisingState,
): Promise<void> {
  await createTheRisingCheckpointManager(store).save(state);
}

/** Load the most recent end-of-turn checkpoint, or `null` when none exists. */
export async function loadTurnCheckpoint(
  store: SaveLoadStore,
): Promise<RisingState | null> {
  return createTheRisingCheckpointManager(store).load();
}

/** Remove the end-of-turn checkpoint. Safe when none exists. */
export async function clearTurnCheckpoint(store: SaveLoadStore): Promise<void> {
  await createTheRisingCheckpointManager(store).clear();
}
