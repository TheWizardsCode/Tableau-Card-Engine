/**
 * CardGameScene -- Abstract base class for Tableau Card Engine game scenes.
 *
 * Provides the shared boilerplate that all card game scenes require:
 *   - Event system setup (GameEventEmitter + PhaserEventBridge + window exposure)
 *   - Sound system setup (SoundPlayer adapter + SoundManager + SFX registration)
 *   - Help and Settings panels (HelpPanel + HelpButton + SettingsPanel + SettingsButton)
 *   - Replay mode detection (URL parameter parsing)
 *   - State-settled event emission
 *   - Standard shutdown/cleanup
 *
 * Subclasses extend this class and call the `init*` helpers from their
 * `create()` method, providing game-specific configuration (SFX keys,
 * event-to-sound mappings, help content) as arguments.
 *
 * @module @ui/CardGameScene
 */

import Phaser from 'phaser';
import {
  GameEventEmitter,
  PhaserEventBridge,
  SoundManager,
} from '../core-engine';
import type {
  SoundPlayer,
  EventSoundMapping,
  GamePhase,
  SoundManagerOptions,
} from '../core-engine';
import { HelpPanel } from './HelpPanel';
import { HelpButton } from './HelpButton';
import { SettingsPanel } from './SettingsPanel';
import { SettingsButton } from './SettingsButton';
import type { HelpSection } from './HelpPanel';

/**
 * Abstract base class for card game scenes.
 *
 * Provides initializers for the event system, sound system, help panel,
 * and settings panel -- the boilerplate blocks that are otherwise
 * copy-pasted across every game scene.
 *
 * ### Usage pattern
 *
 * ```ts
 * export class MyGameScene extends CardGameScene {
 *   constructor() { super({ key: 'MyGameScene' }); }
 *
 *   create(): void {
 *     // Replay detection (call early)
 *     this.detectReplayMode();
 *
 *     // Event system (must come before sound)
 *     this.initEventSystem();
 *
 *     // Sound system (skipped in replay mode)
 *     if (!this.replayMode) {
 *       this.initSoundSystem(
 *         Object.values(MY_SFX_KEYS),
 *         { 'card-drawn': MY_SFX_KEYS.DRAW },
 *       );
 *     }
 *
 *     // Help & settings panels (skipped in replay mode)
 *     if (!this.replayMode) {
 *       this.initHelpPanel(helpContent as HelpSection[]);
 *       this.initSettingsPanel();
 *     }
 *
 *     // ... game-specific setup ...
 *   }
 * }
 * ```
 */
export abstract class CardGameScene extends Phaser.Scene {
  // ── Event system ─────────────────────────────────────────

  /** Typed event emitter for engine events. */
  protected gameEvents!: GameEventEmitter;
  /** Bridge that forwards engine events to/from Phaser scene events. */
  protected eventBridge!: PhaserEventBridge;

  // ── Sound system ─────────────────────────────────────────

  /** Sound manager instance (null when in replay mode or before init). */
  protected soundManager: SoundManager | null = null;

  // ── HUD container ─────────────────────────────────────────

  /** Shared HUD container for overlay/sidebar UI (depth 1000).
   *  Created by calling {@link initHUDContainer} early in `create()`. */
  public hudContainer!: Phaser.GameObjects.Container;

  // ── UI panels ────────────────────────────────────────────

  /** Help panel overlay. */
  protected helpPanel!: HelpPanel;
  /** Help toggle button. */
  protected helpButton!: HelpButton;
  /** Settings panel overlay. */
  protected settingsPanel!: SettingsPanel;
  /** Settings toggle button. */
  protected settingsButton!: SettingsButton;

  // ── Replay mode ──────────────────────────────────────────

  /** When true, the scene suppresses input and AI turns for replay use. */
  protected replayMode = false;

  // ── Initializers ─────────────────────────────────────────

  /**
   * Detect replay mode from the URL query parameter `?mode=replay`.
   *
   * Call this early in `create()` so that subsequent init methods
   * can branch on `this.replayMode`.
   */
  protected detectReplayMode(): void {
    this.replayMode =
      new URLSearchParams(window.location.search).get('mode') === 'replay';
  }

  /**
   * Initialize the event system: create a {@link GameEventEmitter},
   * a {@link PhaserEventBridge}, and expose the emitter on
   * `window.__GAME_EVENTS__` for the replay tool.
   *
   * Must be called before {@link initSoundSystem}.
   */
  protected initEventSystem(): void {
    this.gameEvents = new GameEventEmitter();
    this.eventBridge = new PhaserEventBridge(this.gameEvents, this.events);
    (window as unknown as Record<string, unknown>).__GAME_EVENTS__ =
      this.gameEvents;
  }

  /**
   * Initialize the sound system: wrap Phaser's sound manager as a
   * {@link SoundPlayer}, create a {@link SoundManager}, register the
   * given SFX keys, and connect the event-to-sound mapping.
   *
   * Typically guarded by `if (!this.replayMode)` in the subclass.
   *
   * @param sfxKeys  Array of SFX asset keys to register.
   * @param mapping  Declarative event-name → SFX-key mapping.
   */
  protected initSoundSystem(
    sfxKeys: readonly string[],
    mapping: EventSoundMapping,
    options?: Pick<SoundManagerOptions, 'synthPlayer' | 'synthKeyMap'>,
  ): void {
    const phaserSound = this.sound;
    const player: SoundPlayer = {
      play: (key: string) => { phaserSound.play(key); },
      stop: (key: string) => { phaserSound.stopByKey(key); },
      setVolume: (v: number) => { phaserSound.volume = v; },
      setMute: (m: boolean) => { phaserSound.mute = m; },
    };
    this.soundManager = new SoundManager(player, {
      synthPlayer: options?.synthPlayer ?? null,
      synthKeyMap: options?.synthKeyMap,
    });

    for (const sfxKey of sfxKeys) {
      this.soundManager.register(sfxKey);
    }

    this.soundManager.connectToEvents(this.gameEvents, mapping);
  }

  /**
   * Create the shared HUD container at depth 1000.
   *
   * Call this before {@link initHelpPanel} and {@link initSettingsPanel}
   * so that help/settings panels are parented into the HUD container
   * for correct z-ordering above gameplay content.
   */
  protected initHUDContainer(): void {
    this.hudContainer = this.add.container(0, 0);
    this.hudContainer.setDepth(1000);
  }

  /**
   * Create the help panel and its toggle button.
   *
   * @param sections  Help content sections (typically loaded from a JSON file).
   */
  protected initHelpPanel(sections: HelpSection[]): void {
    this.helpPanel = new HelpPanel(this, { sections });
    this.helpButton = new HelpButton(this, this.helpPanel);
  }

  /**
   * Create the settings panel (volume / mute controls) and its toggle button.
   *
   * Requires {@link initSoundSystem} to have been called first; does nothing
   * if `soundManager` is null.
   */
  protected initSettingsPanel(difficultyNames?: readonly string[]): void {
    if (!this.soundManager) return;
    this.settingsPanel = new SettingsPanel(this, {
      soundManager: this.soundManager,
      difficultyNames,
    });
    this.settingsButton = new SettingsButton(this, this.settingsPanel);
  }

  // ── Event helpers ────────────────────────────────────────

  /**
   * Emit a `state-settled` event indicating the game UI is in a stable
   * state, ready for the next action or screenshot capture.
   *
   * @param turnNumber  The current turn/step number.
   * @param phase       The current game phase.
   */
  protected emitStateSettled(turnNumber: number, phase: GamePhase): void {
    this.gameEvents.emit('state-settled', { turnNumber, phase });
  }

  // ── Shutdown ─────────────────────────────────────────────

  /**
   * Clean up shared resources created by the `init*` methods.
   *
   * Subclasses should call `this.shutdownBase()` from their own
   * `shutdown()` method (either before or after game-specific cleanup).
   *
   * Handles null-safety: each resource is only destroyed if it was
   * initialized (so partial init in replay mode is fine).
   */
  protected shutdownBase(): void {
    this.soundManager?.destroy();
    this.soundManager = null;
    this.eventBridge?.destroy();
    this.gameEvents?.removeAllListeners();
    this.helpPanel?.destroy();
    this.helpButton?.destroy();
    this.settingsPanel?.destroy();
    this.settingsButton?.destroy();
    this.hudContainer?.destroy();
  }
}
