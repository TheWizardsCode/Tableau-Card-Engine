/**
 * Browser integration test for PhaserEventBridge.
 *
 * Verifies that the bridge correctly forwards events between
 * a GameEventEmitter and a real Phaser.Events.EventEmitter
 * running inside a Chromium browser context.
 *
 * Does NOT boot a full Phaser game -- only uses the standalone
 * Phaser.Events.EventEmitter class, so no WebGL context is consumed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { GameEventEmitter } from '../../src/core-engine/GameEventEmitter';
import { PhaserEventBridge } from '../../src/core-engine/PhaserEventBridge';
import type {
  TurnStartedPayload,
  StateSettledPayload,
  GameEndedPayload,
} from '../../src/core-engine/GameEventEmitter';

describe('PhaserEventBridge (browser)', () => {
  let engine: GameEventEmitter;
  let phaserEmitter: Phaser.Events.EventEmitter;
  let bridge: PhaserEventBridge;

  function setup() {
    engine = new GameEventEmitter();
    phaserEmitter = new Phaser.Events.EventEmitter();
    bridge = new PhaserEventBridge(engine, phaserEmitter);
  }

  afterEach(() => {
    bridge?.destroy();
    phaserEmitter?.destroy();
    engine?.removeAllListeners();
  });

  // ── Engine -> Phaser (real Phaser EventEmitter) ───────

  it('should forward turn-started from engine to real Phaser EventEmitter', () => {
    setup();
    let received: TurnStartedPayload | null = null;
    phaserEmitter.on('turn-started', (payload: TurnStartedPayload) => {
      received = payload;
    });

    const payload: TurnStartedPayload = {
      turnNumber: 0,
      playerIndex: 0,
      playerName: 'Alice',
      isAI: false,
    };
    engine.emit('turn-started', payload);

    expect(received).toEqual(payload);
  });

  it('should forward state-settled from engine to real Phaser EventEmitter', () => {
    setup();
    let received: StateSettledPayload | null = null;
    phaserEmitter.on('state-settled', (payload: StateSettledPayload) => {
      received = payload;
    });

    const payload: StateSettledPayload = {
      turnNumber: 5,
      phase: 'playing',
    };
    engine.emit('state-settled', payload);

    expect(received).toEqual(payload);
  });

  // ── Phaser -> Engine (real Phaser EventEmitter) ───────

  it('should forward turn-started from real Phaser EventEmitter to engine', () => {
    setup();
    let received: TurnStartedPayload | null = null;
    engine.on('turn-started', (payload) => {
      received = payload;
    });

    const payload: TurnStartedPayload = {
      turnNumber: 3,
      playerIndex: 1,
      playerName: 'Bot',
      isAI: true,
    };
    phaserEmitter.emit('turn-started', payload);

    expect(received).toEqual(payload);
  });

  it('should forward game-ended from real Phaser EventEmitter to engine', () => {
    setup();
    let received: GameEndedPayload | null = null;
    engine.on('game-ended', (payload) => {
      received = payload;
    });

    const payload: GameEndedPayload = {
      finalTurnNumber: 20,
      winnerIndex: 0,
      reason: 'Alice wins!',
    };
    phaserEmitter.emit('game-ended', payload);

    expect(received).toEqual(payload);
  });

  // ── No infinite loops with real Phaser ────────────────

  it('should not cause infinite loops with real Phaser EventEmitter', () => {
    setup();
    let engineCallCount = 0;
    let phaserCallCount = 0;

    engine.on('state-settled', () => {
      engineCallCount++;
    });
    phaserEmitter.on('state-settled', () => {
      phaserCallCount++;
    });

    engine.emit('state-settled', { turnNumber: 0, phase: 'playing' });

    // engine listener: 1 (direct emit)
    // phaser listener: 1 (forwarded from engine)
    expect(engineCallCount).toBe(1);
    expect(phaserCallCount).toBe(1);
  });

  // ── Cleanup with real Phaser ──────────────────────────

  it('should stop forwarding after destroy with real Phaser EventEmitter', () => {
    setup();
    let received = false;
    phaserEmitter.on('turn-started', () => {
      received = true;
    });

    bridge.destroy();

    engine.emit('turn-started', {
      turnNumber: 0,
      playerIndex: 0,
      playerName: 'Alice',
      isAI: false,
    });

    expect(received).toBe(false);
  });
});
