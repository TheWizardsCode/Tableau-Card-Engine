/**
 * Phaser Event Bridge for the Tableau Card Engine.
 *
 * Bidirectionally forwards events between a {@link GameEventEmitter}
 * and a Phaser scene's event system. This allows Phaser-based game
 * code to emit / listen to engine events through the familiar
 * `scene.events` API, while keeping the core emitter Phaser-free.
 *
 * Usage:
 * ```ts
 * const emitter = new GameEventEmitter();
 * const bridge = new PhaserEventBridge(emitter, scene.events);
 * // Now engine events appear on scene.events and vice versa.
 * bridge.destroy(); // Clean up when the scene shuts down.
 * ```
 */

import {
  GameEventEmitter,
  type GameEventMap,
  type GameEventName,
} from './GameEventEmitter';

// ── Minimal Phaser-compatible interface ─────────────────────

/**
 * Minimal subset of the Phaser EventEmitter API that the bridge
 * needs. Avoids importing Phaser at compile time so the core
 * engine module stays headless-compatible.
 */
export interface PhaserLikeEventEmitter {
  on(event: string, fn: (...args: unknown[]) => void, context?: unknown): this;
  off(
    event: string,
    fn: (...args: unknown[]) => void,
    context?: unknown,
  ): this;
  emit(event: string, ...args: unknown[]): boolean;
}

// ── Bridge ──────────────────────────────────────────────────

/** All event names we bridge. */
const ALL_EVENTS: GameEventName[] = [
  'turn-started',
  'turn-completed',
  'animation-complete',
  'state-settled',
  'game-ended',
];

/**
 * Bidirectional bridge between {@link GameEventEmitter} and a
 * Phaser-compatible event emitter (typically `scene.events`).
 *
 * Events emitted on one side are automatically forwarded to
 * the other side. Guard flags prevent infinite loops.
 */
export class PhaserEventBridge {
  private readonly engineUnsubs: Array<() => void> = [];
  private readonly phaserHandlers: Array<{
    event: string;
    handler: (...args: unknown[]) => void;
  }> = [];
  private forwarding = false;

  constructor(
    private readonly engine: GameEventEmitter,
    private readonly phaser: PhaserLikeEventEmitter,
  ) {
    this.wireEngineToPhaser();
    this.wirePhaserToEngine();
  }

  // ── Engine -> Phaser ────────────────────────────────────

  private wireEngineToPhaser(): void {
    for (const event of ALL_EVENTS) {
      const unsub = this.engine.on(event, (payload: GameEventMap[typeof event]) => {
        if (this.forwarding) return; // prevent re-entry
        this.forwarding = true;
        try {
          this.phaser.emit(event, payload);
        } finally {
          this.forwarding = false;
        }
      });
      this.engineUnsubs.push(unsub);
    }
  }

  // ── Phaser -> Engine ────────────────────────────────────

  private wirePhaserToEngine(): void {
    for (const event of ALL_EVENTS) {
      const handler = (payload: unknown) => {
        if (this.forwarding) return; // prevent re-entry
        this.forwarding = true;
        try {
          this.engine.emit(
            event,
            payload as GameEventMap[typeof event],
          );
        } finally {
          this.forwarding = false;
        }
      };
      this.phaser.on(event, handler);
      this.phaserHandlers.push({ event, handler });
    }
  }

  // ── Cleanup ─────────────────────────────────────────────

  /**
   * Remove all bridge listeners from both sides.
   * Call this when the scene shuts down or the bridge
   * is no longer needed.
   */
  destroy(): void {
    for (const unsub of this.engineUnsubs) {
      unsub();
    }
    this.engineUnsubs.length = 0;

    for (const { event, handler } of this.phaserHandlers) {
      this.phaser.off(event, handler);
    }
    this.phaserHandlers.length = 0;
  }
}
