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
import type { HelpSection } from '@ui/HelpPanel';
import { getReducedMotion } from '@ui/SettingsStore';
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
import { createInitialState, type RisingState } from '../TheRisingState';

/** The scene key used to register and start {@link TheRisingScene}. */
export const THERISING_SCENE_KEY = 'TheRisingScene';

/** Static help content shown in the in-game help panel. */
export const THERISING_HELP_SECTIONS: readonly HelpSection[] = [
  {
    heading: 'About 1916: The Rising',
    body: 'You are a seanchaí, a keeper of memory. Meet the spirits of Irish '
      + 'history and rebuild the timeline from the Norman landings to the '
      + 'Easter Rising.',
  },
  {
    heading: 'The board',
    body: 'The Spirit Row offers the figures you can meet. Meeting a spirit '
      + 'costs Memory and reveals a first-person testimony. Placed spirits sit '
      + 'on the Timeline in chronological order. The HUD shows your remaining '
      + 'Memory, the Rising clock and your accumulated Insight.',
  },
  {
    heading: 'Goal',
    body: 'Complete the seven-chapter timeline in the correct order and reach '
      + 'the Insight target before the Rising clock reaches 1916.',
  },
];

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

    // A fresh session. Interaction and dealing are layered on by later phases.
    this.risingState = createInitialState({ seed: 0 });

    this.boardRenderer = new TheRisingRenderer(this, this.risingState, this.risingLayout);
    this.boardRenderer.refreshAll();

    this.animator = new TheRisingAnimator(this, this.soundManager);
    this.animator.reducedMotion = this.resolveReducedMotion();

    // Help and settings panels (skipped in replay mode).
    if (!this.replayMode) {
      this.initHelpPanel([...THERISING_HELP_SECTIONS]);
      this.initSettingsPanel();
    }

    this.emitStateSettled(this.risingState.turn, 'setup');
  }

  /** Destroy owned display objects and run the shared base cleanup. */
  shutdown(): void {
    if (this.boardRenderer) {
      try {
        this.boardRenderer.destroy();
      } catch {
        // The renderer may be partially constructed if create() failed.
      }
    }
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

  private resolveReducedMotion(): boolean {
    try {
      if (this.replayMode) return true;
      return getReducedMotion();
    } catch {
      return false;
    }
  }
}
