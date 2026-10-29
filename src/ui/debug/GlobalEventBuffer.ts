/**
 * GlobalEventBuffer — Singleton that subscribes to the game event emitter
 * and accumulates all events from the start of the session.
 *
 * The Game Event Log overlay reads from this buffer so it shows events
 * that fired before the overlay was opened.
 *
 * @module @ui/debug/GlobalEventBuffer
 */

import type { GameEventEmitter } from '../../core-engine/GameEventEmitter';

export interface BufferedEvent {
  timestamp: string;
  eventName: string;
  payload: unknown;
}

/**
 * Global singleton event buffer.
 * Subscribes to the emitter once and accumulates all events.
 */
export class GlobalEventBuffer {
  private static instance: GlobalEventBuffer | null = null;

  private _entries: BufferedEvent[] = [];
  private _unsubscribe: (() => void) | null = null;
  private _subscribedEmitter: GameEventEmitter | null = null;

  private constructor() {
    // singleton
  }

  static getInstance(): GlobalEventBuffer {
    if (!GlobalEventBuffer.instance) {
      GlobalEventBuffer.instance = new GlobalEventBuffer();
    }
    return GlobalEventBuffer.instance;
  }

  /**
   * Subscribe to the given emitter (idempotent).
   *
   * Uses the emitter's catch-all subscription, so every event — engine or
   * game-specific (declared by the game via `GameEventMap` interface
   * augmentation) — is buffered from session start without a per-game
   * name list here.
   */
  subscribe(emitter: GameEventEmitter): void {
    if (this._subscribedEmitter === emitter) return;

    // Re-binding to a different emitter (e.g. after a scene restart) replaces
    // the previous subscription instead of silently missing the new session.
    this._unsubscribe?.();
    this._subscribedEmitter = emitter;

    this._unsubscribe = emitter.onAny((eventName, payload) => {
      this._entries.push({
        timestamp: new Date().toISOString().slice(11, 23),
        eventName,
        payload,
      });
    });
  }

  /** Get all buffered events. */
  getEntries(): readonly BufferedEvent[] {
    return this._entries;
  }

  /** Clear the buffer. */
  clear(): void {
    this._entries = [];
  }

  /** Whether the buffer has been subscribed. */
  get subscribed(): boolean {
    return this._subscribedEmitter !== null;
  }
}
