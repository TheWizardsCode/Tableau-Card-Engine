/**
 * GlobalEventBuffer — Singleton that subscribes to the game event emitter
 * and accumulates all events from the start of the session.
 *
 * The Game Event Log overlay reads from this buffer so it shows events
 * that fired before the overlay was opened.
 *
 * @module @ui/debug/GlobalEventBuffer
 */

import type { GameEventEmitter, GameEventName } from '../../core-engine/GameEventEmitter';

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
  private _subscribed = false;
  private _listeners: Array<{ event: string; fn: (payload: unknown) => void }> = [];

  private constructor() {
    // singleton
  }

  static getInstance(): GlobalEventBuffer {
    if (!GlobalEventBuffer.instance) {
      GlobalEventBuffer.instance = new GlobalEventBuffer();
    }
    return GlobalEventBuffer.instance;
  }

  /** Subscribe to the given emitter (idempotent). */
  subscribe(emitter: GameEventEmitter): void {
    if (this._subscribed) return;
    this._subscribed = true;

    const eventNames: GameEventName[] = [
      'turn-started', 'turn-completed', 'animation-complete',
      'state-settled', 'game-ended', 'card-drawn', 'card-flipped',
      'card-swapped', 'card-discarded', 'card:discarded', 'card:dealt',
      'card:placed', 'ui-interaction', 'income-gained',
      'card-to-foundation', 'card-to-tableau', 'card-pickup',
      'card-snap-back', 'auto-complete-start', 'auto-complete-card',
      'undo', 'redo', 'card-selected', 'card-deselected', 'deal-card',
    ];

    for (const name of eventNames) {
      const fn = (payload: unknown) => {
        this._entries.push({
          timestamp: new Date().toISOString().slice(11, 23),
          eventName: name as string,
          payload,
        });
      };
      emitter.on(name, fn);
      this._listeners.push({ event: name as string, fn });
    }
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
    return this._subscribed;
  }
}
