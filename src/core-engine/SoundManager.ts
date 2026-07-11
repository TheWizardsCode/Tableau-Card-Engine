/**
 * SoundManager -- Phaser-agnostic audio management for the Tableau Card Engine.
 *
 * Provides a reusable sound system that integrates with {@link GameEventEmitter}
 * via declarative event-to-sound mappings. Follows the same dependency-injection
 * pattern as {@link PhaserEventBridge}: a minimal {@link SoundPlayer} interface
 * is defined here, and the concrete Phaser sound manager is injected at runtime.
 *
 * Features:
 *   - Register sounds by key
 *   - Play / stop sounds by key
 *   - Global volume control (0.0 -- 1.0)
 *   - Mute / unmute toggle
 *   - Declarative event-to-sound mapping via {@link connectToEvents}
 *   - Mute and volume preferences persist via localStorage
 *
 * @module @core-engine/SoundManager
 */

import {
  GameEventEmitter,
  type GameEventName,
} from './GameEventEmitter';

// ── Shared SFX key constants ──────────────────────────────────

/**
 * Common SFX key constants shared across all games.
 * All keys use the `sfx-` prefix with no game identifier.
 *
 * Games import and use these constants alongside their own game-specific keys.
 */
export const COMMON_SFX_KEYS = {
  /** Generic UI click / tap feedback. */
  UI_CLICK: 'sfx-ui-click',
  /** Active player changes. */
  TURN_CHANGE: 'sfx-turn-change',
  /** A round has ended. */
  ROUND_END: 'sfx-round-end',
  /** Scores are being revealed / calculated. */
  SCORE_REVEAL: 'sfx-score-reveal',
  /** Illegal / invalid action feedback. */
  ILLEGAL_MOVE: 'sfx-illegal-move',
} as const;

export type CommonSfxKey = (typeof COMMON_SFX_KEYS)[keyof typeof COMMON_SFX_KEYS];

// ── localStorage keys ───────────────────────────────────────

const STORAGE_KEY_MUTE = 'tce-sound-muted';
const STORAGE_KEY_VOLUME = 'tce-sound-volume';

// ── SoundPlayer interface (DI contract) ─────────────────────

/**
 * Minimal audio playback interface that the SoundManager delegates to.
 *
 * At runtime, this is satisfied by wrapping Phaser's `scene.sound`
 * (or any other audio backend). The core engine never imports Phaser
 * directly.
 */
export interface SoundPlayer {
  /** Play a previously loaded sound by its asset key. */
  play(key: string): void;
  /** Stop a currently playing sound by its asset key. */
  stop(key: string): void;
  /** Set the global volume (0.0 = silent, 1.0 = full). */
  setVolume(volume: number): void;
  /** Mute or unmute all audio. */
  setMute(muted: boolean): void;
}

// ── Event-to-sound mapping ──────────────────────────────────

/**
 * Maps a game event name to the sound key that should play when
 * that event fires. Used by {@link SoundManager.connectToEvents}.
 */
export type EventSoundMapping = Partial<Record<GameEventName, string>>;

// ── Persistence helpers ─────────────────────────────────────

/**
 * Minimal subset of the Storage API needed by SoundManager.
 * Allows injecting a fake for testing.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function loadBoolean(
  storage: StorageLike | null,
  key: string,
  fallback: boolean,
): boolean {
  if (!storage) return fallback;
  const raw = storage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function loadNumber(
  storage: StorageLike | null,
  key: string,
  fallback: number,
): number {
  if (!storage) return fallback;
  const raw = storage.getItem(key);
  if (raw === null) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ── SoundManager ────────────────────────────────────────────

/**
 * Configuration options for {@link SoundManager}.
 */
export interface SoundManagerOptions {
  /**
   * Storage backend for persisting mute/volume preferences.
   * Defaults to `globalThis.localStorage` when available.
   * Pass `null` to disable persistence.
   */
  storage?: StorageLike | null;

  /**
   * Optional ToneForge-backed player used for synth-mapped keys.
   * When present and a key appears in `synthKeyMap`, playback delegates
   * to this player instead of WAV assets.
   */
  synthPlayer?: SoundPlayer | null;

  /**
   * Map logical sound keys to tf-generated key names/factory IDs.
   * Example: `{ 'sfx-place': 'card-place' }`.
   */
  synthKeyMap?: Record<string, string>;

  /**
   * Optional game namespace to scope Phaser audio asset keys.
   *
   * When set, every {@link register} call automatically prepends
   * `"{namespace}:"` to the **asset key** stored in the registry.
   * Game code still addresses sounds by the unprefixed logical key.
   *
   * This prevents Phaser audio key collisions when multiple games
   * are loaded in the same session.
   *
   * @example
   * ```ts
   * const sm = new SoundManager(player, { namespace: 'golf' });
   * sm.register('sfx-card-draw');           // logical key: 'sfx-card-draw'
   *                                        // stored asset key: 'golf:sfx-card-draw'
   * sm.play('sfx-card-draw');              // plays 'golf:sfx-card-draw' via player
   * ```
   */
  namespace?: string;
}

/**
 * Manages sound playback, volume, mute state, and event-driven
 * audio triggering for the Tableau Card Engine.
 *
 * Usage:
 * ```ts
 * const player: SoundPlayer = wrapPhaserSound(scene.sound);
 * const sm = new SoundManager(player);
 * sm.register('card-draw', 'sfx-card-draw');
 * sm.play('card-draw');
 * ```
 */
export class SoundManager {
  private readonly player: SoundPlayer;
  private readonly storage: StorageLike | null;
  private synthPlayer: SoundPlayer | null;
  private synthKeyMap: Record<string, string>;
  private readonly registry = new Map<string, string>();
  private readonly eventUnsubs: Array<() => void> = [];
  private readonly namespace: string;

  private _muted: boolean;
  private _volume: number;

  constructor(player: SoundPlayer, options?: SoundManagerOptions) {
    this.player = player;

    this.synthPlayer = options?.synthPlayer ?? null;
    this.synthKeyMap = options?.synthKeyMap ?? {};
    this.namespace = options?.namespace ?? '';

    // Resolve storage backend
    if (options?.storage !== undefined) {
      this.storage = options.storage;
    } else {
      try {
        this.storage =
          typeof globalThis !== 'undefined' && globalThis.localStorage
            ? globalThis.localStorage
            : null;
      } catch {
        this.storage = null;
      }
    }

    // Restore persisted preferences
    this._muted = loadBoolean(this.storage, STORAGE_KEY_MUTE, false);
    this._volume = loadNumber(this.storage, STORAGE_KEY_VOLUME, 0.5);

    // Apply initial state to the player
    this.player.setMute(this._muted);
    this.player.setVolume(this._volume);
    this.synthPlayer?.setMute(this._muted);
    this.synthPlayer?.setVolume(this._volume);
  }

  // ── Registration ────────────────────────────────────────

  /**
   * Register a sound effect by logical key.
   *
   * When a {@link SoundManagerOptions.namespace} is set on the manager,
   * the stored asset key is automatically scoped as `"{namespace}:{assetKey}"`.
   * This prevents Phaser audio key collisions when multiple games coexist.
   *
   * @param key       Logical name used by game code (e.g. 'sfx-card-draw').
   * @param assetKey  The Phaser asset key loaded via `scene.load.audio()`.
   *                  If omitted, `key` is used as the asset key. When a
   *                  namespace is configured it is **not** automatically
   *                  prepended to an explicit assetKey – the caller is
   *                  responsible for using the same scoped key in preload.
   */
  register(key: string, assetKey?: string): void {
    const resolvedKey = this.namespace && !assetKey
      ? `${this.namespace}:${key}`
      : (assetKey ?? key);
    this.registry.set(key, resolvedKey);
  }

  // ── Playback ────────────────────────────────────────────

  /**
   * Play a registered sound by its logical key.
   * Does nothing if the key is not registered or audio is muted.
   */
  play(key: string): void {
    if (this._muted) return;
    const synthMappedKey = this.synthKeyMap[key];
    if (this.synthPlayer && synthMappedKey !== undefined) {
      this.synthPlayer.play(synthMappedKey);
      return;
    }

    const assetKey = this.registry.get(key);
    if (assetKey === undefined) return;
    this.player.play(assetKey);
  }

  /**
   * Stop a registered sound by its logical key.
   */
  stop(key: string): void {
    const synthMappedKey = this.synthKeyMap[key];
    if (this.synthPlayer && synthMappedKey !== undefined) {
      this.synthPlayer.stop(synthMappedKey);
      return;
    }

    const assetKey = this.registry.get(key);
    if (assetKey === undefined) return;
    this.player.stop(assetKey);
  }

  // ── Volume ──────────────────────────────────────────────

  /** Current volume level (0.0 -- 1.0). */
  get volume(): number {
    return this._volume;
  }

  /**
   * Set the global volume. Clamped to [0.0, 1.0].
   * Persists to localStorage if available.
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    this.player.setVolume(this._volume);
    this.synthPlayer?.setVolume(this._volume);
    this.persist(STORAGE_KEY_VOLUME, String(this._volume));
  }

  // ── Mute ────────────────────────────────────────────────

  /** Whether audio is currently muted. */
  get muted(): boolean {
    return this._muted;
  }

  /**
   * Set the mute state.
   * Persists to localStorage if available.
   */
  setMute(muted: boolean): void {
    this._muted = muted;
    this.player.setMute(muted);
    this.synthPlayer?.setMute(muted);
    this.persist(STORAGE_KEY_MUTE, String(muted));
  }

  /** Toggle mute on/off. Returns the new mute state. */
  toggleMute(): boolean {
    this.setMute(!this._muted);
    return this._muted;
  }

  /**
   * Attach or replace synth integration at runtime.
   * Useful when a tf module is loaded asynchronously after scene boot.
   */
  setSynthIntegration(
    synthPlayer: SoundPlayer | null,
    synthKeyMap: Record<string, string> = {},
  ): void {
    this.synthPlayer = synthPlayer;
    this.synthKeyMap = synthKeyMap;
    this.synthPlayer?.setMute(this._muted);
    this.synthPlayer?.setVolume(this._volume);
  }

  // ── Event-to-sound mapping ──────────────────────────────

  /**
   * Subscribe to {@link GameEventEmitter} events and automatically
   * play the mapped sound when each event fires.
   *
   * @param emitter  The game event emitter to subscribe to.
   * @param mapping  A map of event names to sound keys.
   *
   * @example
   * ```ts
   * sm.connectToEvents(gameEvents, {
   *   'card-drawn': 'card-draw',
   *   'card-swapped': 'card-swap',
   *   'game-ended': 'round-end',
   * });
   * ```
   */
  connectToEvents(
    emitter: GameEventEmitter,
    mapping: EventSoundMapping,
  ): void {
    for (const [event, soundKey] of Object.entries(mapping)) {
      if (soundKey === undefined) continue;
      const key = soundKey; // capture for closure
      const unsub = emitter.on(event as GameEventName, () => {
        this.play(key);
      });
      this.eventUnsubs.push(unsub);
    }
  }

  // ── Inspection ───────────────────────────────────────────

  /**
   * Check if a logical key has been registered.
   */
  has(key: string): boolean {
    return this.registry.has(key);
  }

  /**
   * Return all registered logical keys.
   */
  keys(): IterableIterator<string> {
    return this.registry.keys();
  }

  // ── Cleanup ─────────────────────────────────────────────

  /**
   * Remove all event subscriptions created by {@link connectToEvents}.
   * Call this when the scene shuts down.
   */
  destroy(): void {
    for (const unsub of this.eventUnsubs) {
      unsub();
    }
    this.eventUnsubs.length = 0;
  }

  /**
   * Remove all registered sound keys.
   * Call this when unloading a game scene to free up registrations
   * for the next game.
   */
  clearRegistrations(): void {
    this.registry.clear();
  }

  // ── Private helpers ─────────────────────────────────────

  private persist(key: string, value: string): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(key, value);
    } catch {
      // Quota exceeded or security error -- ignore silently
    }
  }
}

// ── Shared safe-play utility ──────────────────────────

/**
 * Safely play a sound on a scene-like object with a `sound.play` method,
 * ignoring any errors (e.g. missing audio key, null sound manager).
 *
 * This is a drop-in replacement for bare `this.scene.sound.play?.()` calls
 * in overlay helpers that don't have access to the namespaced SoundManager.
 * It preserves the optional-chaining behaviour (no-op if `sound` is null).
 *
 * @param scene  A Phaser Scene (or any object with a `sound.play?` method).
 * @param key    The audio key to play.
 *
 * @example
 * ```ts
 * import { safePlaySound } from '@core-engine/SoundManager';
 * safePlaySound(this.scene, SFX_KEYS.GAME_END);
 * ```
 */
export function safePlaySound(
  scene: { sound: { play?: (key: string) => void } | null } | null,
  key: string,
): void {
  try {
    scene?.sound?.play?.(key);
  } catch {
    /* ignore — missing audio keys must not crash the game loop */
  }
}
