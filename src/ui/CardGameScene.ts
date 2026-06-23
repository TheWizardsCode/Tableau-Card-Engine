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
import { createSceneMenuButton } from './SceneHeader';
import { createStandardUndoRedoButtons } from './Renderer';

// ── Audio path utility ───────────────────────────────────────

/**
 * Build an array of audio asset URLs with fallback to `assets/audio/default/`.
 *
 * Phaser's loader accepts an array of URLs for `this.load.audio()` and tries
 * each in order until one succeeds. This enables the convention where each
 * game stores its audio in `assets/audio/<gameDir>/` and shared/common sounds
 * are placed in `assets/audio/default/`.
 *
 * @param gameDir  Subdirectory under `assets/audio/` for the current game.
 * @param filename Audio filename (e.g. `'card-draw.wav'`).
 * @returns Array of URLs: [game-specific, default]
 *
 * @example
 * ```ts
 * this.load.audio('sfx-card-draw', audioPathWithFallback('golf', 'card-draw.wav'));
 * // Tries assets/audio/golf/card-draw.wav first,
 * // then assets/audio/default/card-draw.wav
 * ```
 */
export function audioPathWithFallback(gameDir: string, filename: string): string[] {
  return [
    `assets/audio/${gameDir}/${filename}`,
    `assets/audio/default/${filename}`,
  ];
}

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
  /** Menu button – navigates to GameSelectorScene. */
  protected menuButton!: Phaser.GameObjects.Container;

  // ── Undo/Redo buttons ─────────────────────────────────────

  /** Undo button container (null before {@link initUndoRedoButtons}). */
  protected undoButton: Phaser.GameObjects.Container | null = null;
  /** Redo button container (null before {@link initUndoRedoButtons}). */
  protected redoButton: Phaser.GameObjects.Container | null = null;

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
    options?: Pick<SoundManagerOptions, 'synthPlayer' | 'synthKeyMap' | 'namespace'>,
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
      namespace: options?.namespace,
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
   * The button is created automatically (showButton:true by default).
   *
   * @param sections  Help content sections (typically loaded from a JSON file).
   */
  protected initHelpPanel(sections: HelpSection[]): void {
    this.helpPanel = new HelpPanel(this, { sections });
    this.helpButton = this.helpPanel.helpButton!;
  }

  /**
   * Create the settings panel (volume / mute controls) and its toggle button.
   *
   * The button is created automatically (showButton:true by default).
   *
   * Requires {@link initSoundSystem} to have been called first; does nothing
   * if `soundManager` is null.
   *
   * @param difficultyNames  Optional ordered list of difficulty names.
   */
  protected initSettingsPanel(difficultyNames?: readonly string[]): void {
    if (!this.soundManager) return;
    this.settingsPanel = new SettingsPanel(this, {
      soundManager: this.soundManager,
      difficultyNames,
    });
    this.settingsButton = this.settingsPanel.settingsButton!;
  }

  /**
   * Create a "Menu" button in the top-left header bar that navigates
   * to the GameSelectorScene on click.
   *
   * Styled as a compact action button – call this after initHUDContainer
   * so the button is parented into the HUD layer.
   */
  protected initMenuButton(): void {
    this.menuButton = createSceneMenuButton(this);
    try {
      if (this.hudContainer) {
        this.hudContainer.add(this.menuButton);
      }
    } catch {
      // ignore
    }
  }

  // ── Undo/Redo buttons ─────────────────────────────────────

  /**
   * Initialize standard undo/redo action buttons positioned to avoid overlap
   * with the settings and help toggle buttons.
   *
   * The buttons are placed to the left of the settings button, with undo on the
   * left and redo to its right. Positioning is resolution-independent — computed
   * dynamically from the scene viewport using the same formula as the settings
   * button's default position.
   *
   * This method is opt-in: only scenes that call it get undo/redo buttons.
   * Safe to call only after {@link initHUDContainer}.
   *
   * @param onUndo - Callback invoked when the Undo button is clicked.
   * @param onRedo - Callback invoked when the Redo button is clicked.
   */
  protected initUndoRedoButtons(onUndo: () => void, onRedo: () => void): void {
    const { undoButton, redoButton } = createStandardUndoRedoButtons(
      this, onUndo, onRedo,
      { parent: this.hudContainer ?? undefined },
    );
    this.undoButton = undoButton;
    this.redoButton = redoButton;
  }

  /**
   * Update the enabled/disabled visual state of the undo/redo buttons.
   *
   * Sets button alpha to 1.0 when enabled, 0.5 when disabled.
   * Safe to call before {@link initUndoRedoButtons} (does nothing).
   *
   * @param canUndo - Whether undo is currently available.
   * @param canRedo - Whether redo is currently available.
   */
  protected refreshUndoRedoButtons(canUndo: boolean, canRedo: boolean): void {
    if (this.undoButton) {
      this.undoButton.setAlpha(canUndo ? 1 : 0.5);
    }
    if (this.redoButton) {
      this.redoButton.setAlpha(canRedo ? 1 : 0.5);
    }
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
    this.undoButton?.destroy();
    this.undoButton = null;
    this.redoButton?.destroy();
    this.redoButton = null;
    this.hudContainer?.destroy();
  }
}
