import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GameEventEmitter,
  type StateSettledPayload,
} from '../../src/core-engine/GameEventEmitter';
import {
  PhaserEventBridge,
  type PhaserLikeEventEmitter,
} from '../../src/core-engine/PhaserEventBridge';
import { GlobalEventBuffer } from '../../src/ui/debug/GlobalEventBuffer';
import {
  SYNTHETIC_EVENT,
  type SyntheticFaceOffResolvedPayload,
} from './fixtures/augmentedGameEventMap';

/**
 * Minimal mock that implements the `PhaserLikeEventEmitter` subset the
 * bridge needs. Deliberately name-agnostic: it accepts any event name,
 * which is what lets a game-specific event cross the bridge.
 */
class MockPhaserEmitter implements PhaserLikeEventEmitter {
  private handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, fn: (...args: unknown[]) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(fn);
    this.handlers.set(event, list);
    return this;
  }

  off(event: string, fn: (...args: unknown[]) => void): this {
    const list = this.handlers.get(event);
    if (!list) return this;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return false;
    for (const fn of [...list]) {
      fn(...args);
    }
    return true;
  }
}

const syntheticPayload: SyntheticFaceOffResolvedPayload = {
  slot: 1,
  playerTotal: 9,
  adversaryTotal: 9,
  winner: 'adversary',
};

const settledPayload: StateSettledPayload = {
  turnNumber: 4,
  phase: 'playing',
};

describe('game-specific event forwarding', () => {
  let engine: GameEventEmitter;
  let phaser: MockPhaserEmitter;
  let bridge: PhaserEventBridge;

  beforeEach(() => {
    engine = new GameEventEmitter();
    phaser = new MockPhaserEmitter();
    bridge = new PhaserEventBridge(engine, phaser);
    GlobalEventBuffer.getInstance().clear();
  });

  // ── PhaserEventBridge (AC3) ─────────────────────────────

  it('forwards a game-specific event from the engine to Phaser', () => {
    const listener = vi.fn();
    phaser.on(SYNTHETIC_EVENT, listener);

    engine.emit(SYNTHETIC_EVENT, syntheticPayload);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(syntheticPayload);
  });

  it('still forwards engine events to Phaser (regression)', () => {
    const listener = vi.fn();
    phaser.on('state-settled', listener);

    engine.emit('state-settled', settledPayload);

    expect(listener).toHaveBeenCalledWith(settledPayload);
  });

  it('stops forwarding game-specific events after destroy()', () => {
    const listener = vi.fn();
    phaser.on(SYNTHETIC_EVENT, listener);

    bridge.destroy();
    engine.emit(SYNTHETIC_EVENT, syntheticPayload);

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not re-forward an event that arrived from Phaser (no loop)', () => {
    const engineListener = vi.fn();
    engine.on('state-settled', engineListener);

    // Phaser -> engine direction keeps working; the catch-all
    // engine -> Phaser subscription must not bounce it back.
    phaser.emit('state-settled', settledPayload);

    expect(engineListener).toHaveBeenCalledOnce();
  });

  // ── GlobalEventBuffer (AC4) ─────────────────────────────

  it('buffers game-specific events alongside engine events', () => {
    const buffer = GlobalEventBuffer.getInstance();
    buffer.subscribe(engine);

    engine.emit('state-settled', settledPayload);
    engine.emit(SYNTHETIC_EVENT, syntheticPayload);

    const entries = buffer.getEntries();
    expect(entries.map((entry) => entry.eventName)).toEqual([
      'state-settled',
      SYNTHETIC_EVENT,
    ]);
    expect(entries[1].payload).toEqual(syntheticPayload);
  });

  it('re-binds to a new emitter instead of missing the new session', () => {
    const buffer = GlobalEventBuffer.getInstance();
    const first = new GameEventEmitter();
    const second = new GameEventEmitter();

    buffer.subscribe(first);
    buffer.subscribe(second);

    first.emit(SYNTHETIC_EVENT, syntheticPayload);
    second.emit(SYNTHETIC_EVENT, syntheticPayload);

    // Only the currently-subscribed emitter feeds the buffer; re-binding does
    // not leave a stale subscription behind (or duplicate entries).
    expect(buffer.getEntries()).toHaveLength(1);
  });

  it('buffers game-specific events emitted before the overlay opens', () => {
    const buffer = GlobalEventBuffer.getInstance();
    buffer.subscribe(engine);

    engine.emit(SYNTHETIC_EVENT, syntheticPayload);

    // The overlay reads from the buffer, so an event emitted before it
    // opened is still visible.
    expect(buffer.getEntries()).toHaveLength(1);
    expect(buffer.getEntries()[0].eventName).toBe(SYNTHETIC_EVENT);
  });
});
