/**
 * Test fixture: a game declares its own typed event names by
 * augmenting the engine's `GameEventMap` interface (module
 * augmentation).
 *
 * This mirrors exactly what a consumer repository does — e.g. a game
 * declares `declare module '@core-engine/GameEventEmitter'` in its own
 * source — and is used by the engine extension tests to prove the
 * mechanism works for engine and game-specific names alike, with zero
 * engine edits. The example lives in a fixture (rather than inline in a
 * test) so the augmentation is applied once and shared by every test
 * that needs the synthetic event.
 */
import '@core-engine/GameEventEmitter';

/** Payload of the synthetic game event used by the extension tests. */
export interface SyntheticFaceOffResolvedPayload {
  /** Index of the contested slot. */
  readonly slot: number;
  /** Total points played by the player in the face-off. */
  readonly playerTotal: number;
  /** Total points played by the adversary in the face-off. */
  readonly adversaryTotal: number;
  /** Which side won the face-off. */
  readonly winner: 'player' | 'adversary';
}

/**
 * The synthetic game-specific event name, fixed as a literal type so
 * tests can reference it without widening the literal-key constraint.
 */
export const SYNTHETIC_EVENT = 'synthetic-face-off-resolved' as const;

declare module '@core-engine/GameEventEmitter' {
  interface GameEventMap {
    'synthetic-face-off-resolved': SyntheticFaceOffResolvedPayload;
  }
}
