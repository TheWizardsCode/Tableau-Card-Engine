/**
 * Default resume overlay for the CheckpointManager.
 *
 * Provides a Phaser-compatible "Resume Saved Game?" overlay with
 * [Resume] and [New Game] buttons. Uses a minimal scene interface
 * so the core engine module stays headless-compatible (no Phaser
 * import at compile time).
 *
 * ## Usage
 *
 * ```ts
 * import { CheckpointManager, createDefaultResumeOverlay } from '@core-engine';
 *
 * const manager = new CheckpointManager(store, 'my-game', 'run-checkpoint', serializer);
 *
 * manager.checkAndResume(
 *   () => startFreshGame(),
 *   (state) => restoreFromCheckpoint(state),
 *   (state, onResume, onNewGame) =>
 *     createDefaultResumeOverlay(scene, state, onResume, onNewGame),
 * );
 * ```
 *
 * @module core-engine/CheckpointResumeOverlay
 */

// ── Minimal Phaser-compatible interfaces ────────────────────

/**
 * Minimal subset of the Phaser.GameObjects.Text API.
 * Avoids importing Phaser at compile time.
 */
interface OverlayText {
  setOrigin(x: number, y: number): this;
  setDepth(depth: number): this;
  setInteractive(useHandCursor?: PhaserLikeInteractiveOptions): this;
  on(event: 'pointerover' | 'pointerout' | 'pointerdown', fn: (...args: unknown[]) => void): this;
  setColor(color: string): this;
  destroy(): void;
}

/**
 * Interactive options for Phaser game objects.
 */
interface PhaserLikeInteractiveOptions {
  useHandCursor?: boolean;
}

/**
 * Minimal subset of a Phaser.Scene that the default overlay needs.
 * Avoids importing Phaser at compile time while remaining compatible
 * with any Phaser scene at runtime.
 */
export interface ResumeOverlayScene {
  add: {
    text(
      x: number,
      y: number,
      text: string,
      style?: Record<string, unknown>,
    ): OverlayText;
  };
}

// ── Constants ───────────────────────────────────────────────

/** Display depth for overlay text and buttons (above background). */
const TEXT_DEPTH = 2001;

/** Y-offset for the title text from center. */
const TITLE_Y_OFFSET = -120;

/** Y-offset for the info text from center. */
const INFO_Y_OFFSET = -60;

/** Y-offset for the button row from center. */
const BUTTON_Y_OFFSET = 20;

/** Horizontal spacing between buttons. */
const BUTTON_SPACING = 120;

/** Default font family. */
const DEFAULT_FONT_FAMILY = 'Arial, sans-serif';

// ── Default Overlay Factory ─────────────────────────────────

/**
 * Create the built-in default "Resume Saved Game?" overlay.
 *
 * Renders a title, info text, [Resume] button, and [New Game] button
 * centered on the screen. The overlay is created directly on the scene
 * as visible game objects.
 *
 * Games may use this function as the `createResumeOverlay` callback
 * in {@link CheckpointManager.checkAndResume}, or provide their own
 * custom overlay.
 *
 * @param scene      - A Phaser scene (or any object matching the minimal
 *                     {@link ResumeOverlayScene} interface).
 * @param _state     - The loaded checkpoint state (unused by default overlay,
 *                     but received for compatibility with the callback signature).
 * @param onResume   - Callback when the user clicks [Resume].
 * @param onNewGame  - Callback when the user clicks [New Game].
 */
export function createDefaultResumeOverlay<TState>(
  scene: ResumeOverlayScene,
  _state: TState,
  onResume: () => void,
  onNewGame: () => void,
): void {
  const centerX = 640; // GAME_W / 2
  const centerY = 360; // GAME_H / 2

  // Title: "Resume Saved Game?"
  const title: OverlayText = scene.add.text(centerX, centerY + TITLE_Y_OFFSET, 'Resume Saved Game?', {
    fontSize: '22px',
    color: '#ffcc00',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontStyle: 'bold',
  });
  title.setOrigin(0.5, 0.5).setDepth(TEXT_DEPTH);

  // Info text
  const infoText: OverlayText = scene.add.text(
    centerX,
    centerY + INFO_Y_OFFSET,
    'A checkpoint was found from a previous game.\nResume where you left off or start fresh.',
    {
      fontSize: '14px',
      color: '#cccccc',
      fontFamily: DEFAULT_FONT_FAMILY,
      align: 'center',
    },
  );
  infoText.setOrigin(0.5, 0.5).setDepth(TEXT_DEPTH);

  // [ Resume ] button
  const resumeBtn: OverlayText = scene.add.text(
    centerX - BUTTON_SPACING,
    centerY + BUTTON_Y_OFFSET,
    '[ Resume ]',
    {
      fontSize: '14px',
      color: '#88ff88',
      fontFamily: DEFAULT_FONT_FAMILY,
    },
  );
  resumeBtn.setOrigin(0.5, 0.5);
  resumeBtn.setDepth(TEXT_DEPTH);
  resumeBtn.setInteractive({ useHandCursor: true });

  resumeBtn.on('pointerover', () => resumeBtn.setColor('#aaffaa'));
  resumeBtn.on('pointerout', () => resumeBtn.setColor('#88ff88'));
  resumeBtn.on('pointerdown', () => {
    // Clean up overlay objects
    title.destroy();
    infoText.destroy();
    resumeBtn.destroy();
    newGameBtn.destroy();
    onResume();
  });

  // [ New Game ] button
  const newGameBtn: OverlayText = scene.add.text(
    centerX + BUTTON_SPACING,
    centerY + BUTTON_Y_OFFSET,
    '[ New Game ]',
    {
      fontSize: '14px',
      color: '#88ff88',
      fontFamily: DEFAULT_FONT_FAMILY,
    },
  );
  newGameBtn.setOrigin(0.5, 0.5);
  newGameBtn.setDepth(TEXT_DEPTH);
  newGameBtn.setInteractive({ useHandCursor: true });

  newGameBtn.on('pointerover', () => newGameBtn.setColor('#aaffaa'));
  newGameBtn.on('pointerout', () => newGameBtn.setColor('#88ff88'));
  newGameBtn.on('pointerdown', () => {
    // Clean up overlay objects
    title.destroy();
    infoText.destroy();
    resumeBtn.destroy();
    newGameBtn.destroy();
    onNewGame();
  });
}
