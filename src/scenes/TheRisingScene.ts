/**
 * TheRisingScene -- the Phaser scene shell for 1916: The Rising.
 *
 * Extends {@link CardGameScene} for the shared engine boilerplate (event
 * system, sound system, help/settings panels, menu button) and layers the
 * game-specific presentation on top:
 *
 *   - the SLL layout adapter ({@link createTheRisingLayout}) resolves every UI
 *     position from `src/layouts/rising.layout.json` — no hardcoded pixels;
 *   - the renderer ({@link TheRisingRenderer}) paints the Spirit Row, the
 *     timeline, the hand, the Clouded recovery pile and the HUD;
 *   - the animator ({@link TheRisingAnimator}) animates card movement with
 *     shared SFX and reduced-motion support.
 *
 * The scene is intentionally a *shell*: interaction (placement, drag-and-drop,
 * conversation) is layered on by later phases. It creates a fresh initial
 * state and paints it so the board boots cleanly from the Game Selector.
 *
 * @module TheRisingScene
 */

import {
  CardGameScene,
  audioPathWithFallback,
} from '@ui/CardGameScene';
import { getReducedMotion, getSelectedDifficulty } from '@ui/SettingsStore';
import { SaveLoadStore } from '@core-engine';
import { TranscriptStore } from '@core-engine/transcript';
import { GAME_H, GAME_W } from '@ui/constants';
import {
  TheRisingRenderer,
} from './TheRisingRenderer';
import { TheRisingAnimator } from './TheRisingAnimator';
import {
  THE_RISING_LAYOUT,
  createTheRisingLayout,
  type TheRisingLayout,
} from './TheRisingLayoutAdapter';
import {
  THERISING_AUDIO_FILES,
  THERISING_AUDIO_NAMESPACE,
  THERISING_SFX_KEYS,
} from './TheRisingConstants';
import {
  THERISING_DEFAULT_DIFFICULTY,
  THERISING_DIFFICULTIES,
  createInitialState,
  resolveDifficulty,
  type Difficulty,
  type RisingState,
} from '../TheRisingState';
import { TheRisingTurnController } from './TheRisingTurnController';
import { TheRisingTranscriptRecorder } from '../TheRisingTranscript';
import {
  saveTurnCheckpoint,
} from '../TheRisingSaveLoad';
import { buildRisingHelpSections, risingHelpValuesFor } from '../TheRisingHelpContent';

/** The scene key used to register and start {@link TheRisingScene}. */
export const THERISING_SCENE_KEY = 'TheRisingScene';

// The help copy lives in `src/help-content.json`; the scene builds the
// difficulty-specific sections at runtime via `buildRisingHelpSections`.
export { THERISING_HELP_SECTIONS } from '../TheRisingHelpContent';

/**
 * The 1916: The Rising scene.
 *
 * Game state lives on {@link risingState}; presentation objects are owned by
 * {@link renderer} and {@link animator}.
 */
export class TheRisingScene extends CardGameScene {
  /** The current game state (initialised in {@link create}). */
  public risingState!: RisingState;
  /** The resolved SLL layout for this scene. */
  public risingLayout!: TheRisingLayout;
  /** The board renderer (Spirit Row, timeline, hand, HUD). */
  public boardRenderer!: TheRisingRenderer;
  /** The card animator (deal, place, reject). */
  public animator!: TheRisingAnimator;
  /** The interactive turn controller (clicks, drag-and-drop, undo/redo). */
  public turnController!: TheRisingTurnController;
  /** The transcript recorder for this session. */
  public transcriptRecorder!: TheRisingTranscriptRecorder;
  /** The transcript persistence store. */
  public transcriptStore!: TranscriptStore;
  /** The shared save/load store backing end-of-turn checkpoints. */
  public saveStore!: SaveLoadStore;
  /** The resolved difficulty preset for this session. */
  public difficulty: Difficulty = THERISING_DEFAULT_DIFFICULTY;
  /**
   * Live modal-overlay objects (conversation dialogue), following the shared
   * AGENTS.md overlay convention. The overlay module pushes its objects here
   * and resets the array on dismiss.
   */
  public overlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: THERISING_SCENE_KEY });
  }

  /**
   * Load the game's SFX assets.
   *
   * Each key is registered against the game-specific audio path with the
   * shared default alongside, so a distribution that omits an optional SFX
   * still resolves the shared fallback. A key that loads nowhere is skipped
   * by `SoundManager` rather than throwing.
   */
  preload(): void {
    for (const [name, key] of Object.entries(THERISING_SFX_KEYS)) {
      const file = THERISING_AUDIO_FILES[name as keyof typeof THERISING_SFX_KEYS];
      if (!file) continue;
      this.load.audio(key, audioPathWithFallback('the-rising', file));
    }
  }

  /**
   * Build the board: run the shared base setup, wire the sound system from
   * the event mapping, resolve the SLL layout, create the initial state and
   * paint it through the renderer.
   */
  create(): void {
    // Shared engine setup: event system, HUD container, menu button.
    super.create();

    // Sound system (skipped in replay mode, which renders silently).
    if (!this.replayMode) {
      this.initSoundSystem(Object.values(THERISING_SFX_KEYS), {
        'card:dealt': THERISING_SFX_KEYS.SPIRIT_DEAL,
        'card:placed': THERISING_SFX_KEYS.SPIRIT_PLACE,
        'card-flipped': THERISING_SFX_KEYS.SPIRIT_REVEAL,
        'ui-interaction': THERISING_SFX_KEYS.UI_CLICK,
        'turn-started': THERISING_SFX_KEYS.TURN_CHANGE,
      }, { namespace: THERISING_AUDIO_NAMESPACE });
    }

    // Resolve the SLL layout against the live viewport so the board adapts to
    // the actual canvas size (the adapter defaults to the canonical 1280×720).
    const viewport = this.resolveViewport();
    this.risingLayout = createTheRisingLayout(THE_RISING_LAYOUT, viewport);

    // Difficulty preset: the persisted settings-panel selection, defaulting to
    // Normal. The preset drives starting Memory, the Insight target and the
    // clock band width (AC5).
    this.difficulty = this.resolveSessionDifficulty();

    // A fresh session.
    this.risingState = createInitialState({ seed: 0, difficulty: this.difficulty });

    // Transcript recording (AC2): auto-saved to browser storage on every key
    // event. Skipped in replay mode, which renders silently.
    this.transcriptRecorder = new TheRisingTranscriptRecorder(this.risingState);
    this.transcriptStore = new TranscriptStore();
    if (!this.replayMode) {
      this.transcriptRecorder.attachAutoSave(this.transcriptStore);
    }

    // End-of-turn checkpoint autosave (AC3).
    this.saveStore = new SaveLoadStore();

    this.boardRenderer = new TheRisingRenderer(this, this.risingState, this.risingLayout);
    this.boardRenderer.refreshAll();

    this.animator = new TheRisingAnimator(this, this.soundManager);
    this.animator.reducedMotion = this.resolveReducedMotion();

    // Interactive layer: market/hand/timeline clicks, drag-and-drop and the
    // placement undo/redo history (F5).
    this.turnController = new TheRisingTurnController({
      scene: this,
      renderer: this.boardRenderer,
      animator: this.animator,
      getState: () => this.risingState,
      setState: (state) => { this.risingState = state; },
      panel: this.hudContainer,
      transcript: this.transcriptRecorder,
      onStateSettled: (turn) => this.emitStateSettled(turn, 'playing'),
      onTurnCompleted: (state) => this.onTurnCompleted(state),
    });
    this.turnController.attach();

    // Undo/redo buttons reflect the placement history (AC5).
    if (!this.replayMode) {
      this.initUndoRedoButtons(
        () => {
          this.turnController.undo();
          this.refreshUndoRedoButtonState();
        },
        () => {
          this.turnController.redo();
          this.refreshUndoRedoButtonState();
        },
      );
      this.refreshUndoRedoButtonState();
    }

    // Help and settings panels (skipped in replay mode). The help copy is
    // built from `src/help-content.json` with the live difficulty values so
    // the Insight target in the text matches the active session (AC6).
    if (!this.replayMode) {
      this.initHelpPanel(buildRisingHelpSections(risingHelpValuesFor(this.difficulty)));
      this.initSettingsPanel(THERISING_DIFFICULTIES, this.difficulty, false);
    }

    this.emitStateSettled(this.risingState.turn, 'setup');
  }

  /** Destroy owned display objects and run the shared base cleanup. */
  shutdown(): void {
    if (this.turnController) {
      try {
        this.turnController.destroy();
      } catch {
        // The controller may be partially constructed if create() failed.
      }
    }
    if (this.boardRenderer) {
      try {
        this.boardRenderer.destroy();
      } catch {
        // The renderer may be partially constructed if create() failed.
      }
    }
    this.overlayObjects = [];
    this.shutdownBase();
  }

  // ── Helpers ─────────────────────────────────────────────

  private resolveViewport(): { width: number; height: number } {
    const width = this.scale?.width ?? GAME_W;
    const height = this.scale?.height ?? GAME_H;
    return {
      width: width > 0 ? width : GAME_W,
      height: height > 0 ? height : GAME_H,
    };
  }

  /**
   * Resolve the difficulty preset from the persisted settings-panel selection,
   * falling back to Normal when none is stored or the value is unknown.
   */
  private resolveSessionDifficulty(): Difficulty {
    try {
      return resolveDifficulty(getSelectedDifficulty(undefined, THERISING_DIFFICULTIES));
    } catch {
      return THERISING_DEFAULT_DIFFICULTY;
    }
  }

  /**
   * End-of-turn hook: autosave a checkpoint so a session can be resumed.
   *
   * Storage is best-effort — a failure (or unavailable storage) never blocks
   * play, and the checkpoint save is fire-and-forget.
   */
  private onTurnCompleted(state: RisingState): void {
    void saveTurnCheckpoint(this.saveStore, state).catch(() => {
      // A failed checkpoint save must never interrupt play.
    });
  }

  private resolveReducedMotion(): boolean {
    try {
      if (this.replayMode) return true;
      return getReducedMotion();
    } catch {
      return false;
    }
  }

  /** Sync the undo/redo button enabled state with the placement history. */
  private refreshUndoRedoButtonState(): void {
    if (!this.turnController) return;
    try {
      this.refreshUndoRedoButtons(
        this.turnController.undoRedo.canUndo(),
        this.turnController.undoRedo.canRedo(),
      );
    } catch {
      // Ignore — buttons may not exist in replay mode.
    }
  }
}
