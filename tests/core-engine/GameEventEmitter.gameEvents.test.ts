import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GameEventEmitter,
  type GameEventName,
  type TurnStartedPayload,
} from '../../src/core-engine/GameEventEmitter';
import {
  SYNTHETIC_EVENT,
  type SyntheticFaceOffResolvedPayload,
} from './fixtures/augmentedGameEventMap';

/**
 * Tests for the engine extension mechanism: games register their own
 * typed events via `GameEventMap` interface augmentation, and the
 * catch-all `onAny` subscription covers both engine and game-specific
 * names.
 */
describe('GameEventEmitter game-specific events', () => {
  let emitter: GameEventEmitter;

  beforeEach(() => {
    emitter = new GameEventEmitter();
  });

  const syntheticPayload: SyntheticFaceOffResolvedPayload = {
    slot: 2,
    playerTotal: 11,
    adversaryTotal: 8,
    winner: 'player',
  };

  const turnPayload: TurnStartedPayload = {
    turnNumber: 0,
    playerIndex: 0,
    playerName: 'Alice',
    isAI: false,
  };

  // ── Augmented map (AC1) ─────────────────────────────────

  it('emits and receives an augmented game-specific event via on', () => {
    const listener = vi.fn();
    emitter.on(SYNTHETIC_EVENT, listener);

    emitter.emit(SYNTHETIC_EVENT, syntheticPayload);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(syntheticPayload);
  });

  it('supports once over the merged (augmented) map', () => {
    const listener = vi.fn();
    emitter.once(SYNTHETIC_EVENT, listener);

    emitter.emit(SYNTHETIC_EVENT, syntheticPayload);
    emitter.emit(SYNTHETIC_EVENT, syntheticPayload);

    expect(listener).toHaveBeenCalledOnce();
  });

  // ── Catch-all (AC2) ─────────────────────────────────────

  it('onAny receives engine and game-specific events with name and payload', () => {
    const anyListener = vi.fn();
    emitter.onAny(anyListener);

    emitter.emit('turn-started', turnPayload);
    emitter.emit(SYNTHETIC_EVENT, syntheticPayload);

    expect(anyListener).toHaveBeenCalledTimes(2);
    expect(anyListener).toHaveBeenNthCalledWith(1, 'turn-started', turnPayload);
    expect(anyListener).toHaveBeenNthCalledWith(
      2,
      SYNTHETIC_EVENT,
      syntheticPayload,
    );
  });

  it('onAny fires even when no per-name listener is attached', () => {
    const anyListener = vi.fn();
    emitter.onAny(anyListener);

    emitter.emit(SYNTHETIC_EVENT, syntheticPayload);

    expect(anyListener).toHaveBeenCalledOnce();
  });

  it('returns an unsubscribe function that stops delivery', () => {
    const anyListener = vi.fn();
    const offAny = emitter.onAny(anyListener);

    emitter.emit('game-ended', { finalTurnNumber: 3, winnerIndex: 0 });
    offAny();
    emitter.emit(SYNTHETIC_EVENT, syntheticPayload);

    expect(anyListener).toHaveBeenCalledOnce();
  });

  it('unsubscribing from inside an onAny handler does not skip the remaining peer', () => {
    const seen: Array<[GameEventName, unknown]> = [];
    let firstOff: (() => void) | undefined;
    let secondOff: (() => void) | undefined;

    const first: Parameters<GameEventEmitter['onAny']>[0] = (name, payload) => {
      seen.push([name, payload]);
      firstOff?.();
      secondOff?.();
    };
    const second: Parameters<GameEventEmitter['onAny']>[0] = (name, payload) => {
      seen.push([name, payload]);
    };

    firstOff = emitter.onAny(first);
    secondOff = emitter.onAny(second);

    emitter.emit('turn-started', turnPayload);
    // Snapshot semantics: both handlers still ran for the emission during
    // which they unsubscribed...
    expect(seen.map(([name]) => name)).toEqual([
      'turn-started',
      'turn-started',
    ]);

    // ...and neither receives subsequent emissions.
    emitter.emit('game-ended', { finalTurnNumber: 3, winnerIndex: 0 });
    expect(seen).toHaveLength(2);
  });

  it('emit stays a no-op when no listeners are attached', () => {
    expect(() => emitter.emit(SYNTHETIC_EVENT, syntheticPayload)).not.toThrow();
  });

  it('removeAllListeners() without an argument clears the catch-all too', () => {
    const anyListener = vi.fn();
    emitter.onAny(anyListener);
    emitter.emit(SYNTHETIC_EVENT, syntheticPayload);

    emitter.removeAllListeners();

    emitter.emit(SYNTHETIC_EVENT, syntheticPayload);
    expect(anyListener).toHaveBeenCalledOnce();
  });

  it('removeAllListeners(event) leaves the catch-all intact', () => {
    const anyListener = vi.fn();
    const namedListener = vi.fn();
    emitter.onAny(anyListener);
    emitter.on('turn-started', namedListener);

    emitter.removeAllListeners('turn-started');

    emitter.emit('turn-started', turnPayload);
    expect(namedListener).not.toHaveBeenCalled();
    expect(anyListener).toHaveBeenCalledOnce();
  });
});
