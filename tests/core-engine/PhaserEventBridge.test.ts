import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameEventEmitter } from '../../src/core-engine/GameEventEmitter';
import {
  PhaserEventBridge,
  type PhaserLikeEventEmitter,
} from '../../src/core-engine/PhaserEventBridge';
import type {
  TurnStartedPayload,
  StateSettledPayload,
  GameEndedPayload,
} from '../../src/core-engine/GameEventEmitter';

/**
 * Minimal mock that implements PhaserLikeEventEmitter for testing.
 * Mirrors the behaviour of Phaser.Events.EventEmitter closely enough
 * to validate the bridge without depending on Phaser.
 */
class MockPhaserEmitter implements PhaserLikeEventEmitter {
  private handlers: Map<string, Array<(...args: unknown[]) => void>> =
    new Map();

  on(
    event: string,
    fn: (...args: unknown[]) => void,
  ): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(fn);
    return this;
  }

  off(
    event: string,
    fn: (...args: unknown[]) => void,
  ): this {
    const list = this.handlers.get(event);
    if (!list) return this;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return false;
    const snapshot = [...list];
    for (const fn of snapshot) {
      fn(...args);
    }
    return true;
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.length ?? 0;
  }
}

describe('PhaserEventBridge', () => {
  let engine: GameEventEmitter;
  let phaser: MockPhaserEmitter;
  let bridge: PhaserEventBridge;

  beforeEach(() => {
    engine = new GameEventEmitter();
    phaser = new MockPhaserEmitter();
    bridge = new PhaserEventBridge(engine, phaser);
  });

  // ── Engine -> Phaser forwarding ───────────────────────

  describe('engine -> phaser', () => {
    it('should forward turn-started from engine to phaser', () => {
      const listener = vi.fn();
      phaser.on('turn-started', listener);

      const payload: TurnStartedPayload = {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      };
      engine.emit('turn-started', payload);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should forward state-settled from engine to phaser', () => {
      const listener = vi.fn();
      phaser.on('state-settled', listener);

      const payload: StateSettledPayload = {
        turnNumber: 3,
        phase: 'playing',
      };
      engine.emit('state-settled', payload);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should forward game-ended from engine to phaser', () => {
      const listener = vi.fn();
      phaser.on('game-ended', listener);

      const payload: GameEndedPayload = {
        finalTurnNumber: 20,
        winnerIndex: 1,
        reason: 'Bot wins',
      };
      engine.emit('game-ended', payload);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(payload);
    });
  });

  // ── Phaser -> Engine forwarding ───────────────────────

  describe('phaser -> engine', () => {
    it('should forward turn-started from phaser to engine', () => {
      const listener = vi.fn();
      engine.on('turn-started', listener);

      const payload: TurnStartedPayload = {
        turnNumber: 2,
        playerIndex: 1,
        playerName: 'Bot',
        isAI: true,
      };
      phaser.emit('turn-started', payload);

      // The engine listener receives it (plus the bridge's own
      // internal listener, but we check the external one)
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should forward state-settled from phaser to engine', () => {
      const listener = vi.fn();
      engine.on('state-settled', listener);

      const payload: StateSettledPayload = {
        turnNumber: 5,
        phase: 'ended',
      };
      phaser.emit('state-settled', payload);

      expect(listener).toHaveBeenCalledWith(payload);
    });
  });

  // ── No infinite loops ─────────────────────────────────

  describe('loop prevention', () => {
    it('should not cause infinite loops when engine emits', () => {
      const engineListener = vi.fn();
      const phaserListener = vi.fn();

      engine.on('turn-started', engineListener);
      phaser.on('turn-started', phaserListener);

      const payload: TurnStartedPayload = {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      };

      engine.emit('turn-started', payload);

      // Engine listener: 1 call (direct)
      // Phaser listener: 1 call (forwarded from engine)
      // No further re-entry
      expect(engineListener).toHaveBeenCalledOnce();
      expect(phaserListener).toHaveBeenCalledOnce();
    });

    it('should not cause infinite loops when phaser emits', () => {
      const engineListener = vi.fn();
      const phaserListener = vi.fn();

      engine.on('turn-started', engineListener);
      phaser.on('turn-started', phaserListener);

      const payload: TurnStartedPayload = {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      };

      phaser.emit('turn-started', payload);

      // Phaser listener: 1 call (direct)
      // Engine listener: 1 call (forwarded from phaser)
      // No further re-entry
      expect(phaserListener).toHaveBeenCalledOnce();
      expect(engineListener).toHaveBeenCalledOnce();
    });
  });

  // ── destroy ───────────────────────────────────────────

  describe('destroy', () => {
    it('should stop forwarding engine events to phaser after destroy', () => {
      const listener = vi.fn();
      phaser.on('turn-started', listener);

      bridge.destroy();

      engine.emit('turn-started', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should stop forwarding phaser events to engine after destroy', () => {
      const listener = vi.fn();
      engine.on('turn-started', listener);

      bridge.destroy();

      phaser.emit('turn-started', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove bridge listeners from engine', () => {
      // Bridge registers 5 listeners on the engine (one per event)
      expect(engine.listenerCount('turn-started')).toBe(1);
      expect(engine.listenerCount('turn-completed')).toBe(1);
      expect(engine.listenerCount('animation-complete')).toBe(1);
      expect(engine.listenerCount('state-settled')).toBe(1);
      expect(engine.listenerCount('game-ended')).toBe(1);

      bridge.destroy();

      expect(engine.listenerCount('turn-started')).toBe(0);
      expect(engine.listenerCount('turn-completed')).toBe(0);
      expect(engine.listenerCount('animation-complete')).toBe(0);
      expect(engine.listenerCount('state-settled')).toBe(0);
      expect(engine.listenerCount('game-ended')).toBe(0);
    });

    it('should remove bridge listeners from phaser', () => {
      expect(phaser.listenerCount('turn-started')).toBe(1);
      expect(phaser.listenerCount('game-ended')).toBe(1);

      bridge.destroy();

      expect(phaser.listenerCount('turn-started')).toBe(0);
      expect(phaser.listenerCount('game-ended')).toBe(0);
    });

    it('should be safe to call destroy multiple times', () => {
      expect(() => {
        bridge.destroy();
        bridge.destroy();
      }).not.toThrow();
    });
  });

  // ── Multiple bridges ──────────────────────────────────

  describe('multiple bridges', () => {
    it('should support independent bridges on separate emitters', () => {
      const engine2 = new GameEventEmitter();
      const phaser2 = new MockPhaserEmitter();
      const bridge2 = new PhaserEventBridge(engine2, phaser2);

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      phaser.on('turn-started', listener1);
      phaser2.on('turn-started', listener2);

      engine.emit('turn-started', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).not.toHaveBeenCalled();

      bridge2.destroy();
    });
  });
});
