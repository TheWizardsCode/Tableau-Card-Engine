/**
 * Shared GameOverOverlay component for the Tableau Card Engine.
 *
 * Provides a consistent game-over overlay that all games can use,
 * with a semi-transparent full-screen backdrop, title, auto-scaling
 * summary text, optional extra buttons, and bottom-row buttons
 * ([Play Again] and [Menu]).
 */

import { GAME_W, GAME_H, FONT_FAMILY } from './constants';
import {
  createOverlayBackground,
  dismissOverlay,
  type OverlayBackgroundOptions,
  type OverlayBoxOptions,
} from './Overlay';
import { createOverlayButton } from './OverlayButton';

// ── Types ───────────────────────────────────────────────────

/** A game-specific button shown above the bottom button row. */
export interface GameOverExtraButton {
  readonly label: string;
  readonly onClick: () => void;
}

/** Configuration for creating a shared game-over overlay. */
export interface GameOverOverlayConfig {
  /**
   * Game-specific summary text displayed in the text area.
   * Supports newline-separated lines.
   */
  readonly summaryText: string;

  /** Callback when the [Play Again] button is clicked. */
  readonly onPlayAgain: () => void;

  /**
   * Callback when the [Menu] button is clicked.
   * Defaults to navigating to `GameSelectorScene`.
   */
  readonly onMenu?: () => void;

  /**
   * Optional extra buttons shown in a row above the bottom
   * button row (e.g., [Share Score], [Save Replay]).
   */
  readonly extraButtons?: ReadonlyArray<GameOverExtraButton>;

  /** Label for the Play Again button (default: 'Play Again'). */
  readonly playAgainLabel?: string;

  /** Label for the Menu button (default: 'Menu'). */
  readonly menuLabel?: string;

  /** Custom title text shown at the top (default: 'Game Over'). */
  readonly title?: string;

  /** Title text color (default: '#ffcc88'). */
  readonly titleColor?: string;

  /** Override the overlay background options. */
  readonly background?: OverlayBackgroundOptions;

  /** Override the overlay box options. */
  readonly box?: OverlayBoxOptions;
}

/** Result of creating a game-over overlay. */
export interface GameOverOverlayResult {
  /** The full-screen input-blocking background. */
  readonly background: Phaser.GameObjects.Rectangle;
  /** The visible overlay box, if created. */
  readonly box: Phaser.GameObjects.Rectangle | null;
  /** The title text element. */
  readonly title: Phaser.GameObjects.Text;
  /** The summary text element (auto-scaling). */
  readonly summary: Phaser.GameObjects.Text;
  /** All created game objects for lifecycle management. */
  readonly objects: Phaser.GameObjects.GameObject[];
  /** Destroy all objects and dismiss the overlay. */
  readonly dismiss: () => void;
}

// ── Default layout constants ───────────────────────────────

const DEFAULT_BOX_WIDTH = 540;
const DEFAULT_BOX_HEIGHT = 420;
const DEFAULT_TITLE_COLOR = '#ffcc88';
const DEFAULT_SUMMARY_COLOR = '#ffffff';
const DEFAULT_BUTTON_DEPTH = 11;
const DEFAULT_TITLE_DEPTH = 11;
const DEFAULT_SUMMARY_DEPTH = 11;

/** Padding from the box top to the title. */
const TITLE_TOP_PADDING = 30;
/** Font size of the title. */
const TITLE_FONT_SIZE = '28px';
/** Maximum font size for summary text. */
const SUMMARY_FONT_MAX = 22;
/** Minimum font size for summary text. */
const SUMMARY_FONT_MIN = 12;

/** Height reserved for the extra buttons row (including padding around it). */
const EXTRA_ROW_HEIGHT = 50;
/** Gap between the title and the summary text area. */
const TITLE_SUMMARY_GAP = 8;
/** Gap between the summary text area and the buttons. */
const SUMMARY_BUTTONS_GAP = 8;
/** Padding inside the box from left/right edges. */
const BOX_HORIZONTAL_PADDING = 30;

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a shared game-over overlay with:
 * - Full-screen semi-transparent backdrop
 * - Centered overlay box
 * - Title (default: "Game Over")
 * - Auto-scaling summary text area
 * - Optional extra button row (game-specific actions)
 * - Bottom button row ([Play Again] and [Menu])
 *
 * @param scene  - The Phaser scene to add the overlay to.
 * @param config - Configuration for the game-over overlay.
 * @returns A GameOverOverlayResult with all created objects.
 */
export function createGameOverOverlay(
  scene: Phaser.Scene,
  config: GameOverOverlayConfig,
): GameOverOverlayResult {
  const title = config.title ?? 'Game Over';
  const titleColor = config.titleColor ?? DEFAULT_TITLE_COLOR;
  const playAgainLabel = config.playAgainLabel ?? 'Play Again';
  const menuLabel = config.menuLabel ?? 'Menu';
  const extraButtons = config.extraButtons ?? [];

  // Overlay background
  const boxWidth = config.box?.width ?? DEFAULT_BOX_WIDTH;
  const boxHeight = config.box?.height ?? DEFAULT_BOX_HEIGHT;

  const overlay = createOverlayBackground(
    scene,
    config.background ?? { depth: 10, alpha: 0.75 },
    config.box ?? { width: boxWidth, height: boxHeight, alpha: 0.9 },
  );

  const objects: Phaser.GameObjects.GameObject[] = [...overlay.objects];
  const boxCenterX = GAME_W / 2;
  const boxTop = (GAME_H / 2) - (boxHeight / 2);

  // Track whether we have extra buttons to know if we need the extra row
  const hasExtraButtons = extraButtons.length > 0;

  // ── Title ──────────────────────────────────────────────────
  const titleObj = scene.add
    .text(boxCenterX, boxTop + TITLE_TOP_PADDING, title, {
      fontSize: TITLE_FONT_SIZE,
      color: titleColor,
      fontFamily: FONT_FAMILY,
    })
    .setOrigin(0.5)
    .setDepth(DEFAULT_TITLE_DEPTH);
  objects.push(titleObj);

  // ── Calculate layout positions ─────────────────────────────
  const titleBottom = boxTop + TITLE_TOP_PADDING + 34; // approx title height
  const contentAreaTop = titleBottom + TITLE_SUMMARY_GAP;

  // Bottom buttons Y: bottom of box - padding
  const bottomButtonsY = boxTop + boxHeight - 30;

  // Extra buttons Y: above bottom buttons
  const extraButtonsY = bottomButtonsY - (hasExtraButtons ? EXTRA_ROW_HEIGHT : 0);

  // Summary text area bottom (above buttons)
  const summaryAreaBottom = extraButtonsY - SUMMARY_BUTTONS_GAP;
  const summaryAreaTop = contentAreaTop;
  const summaryAvailableHeight = summaryAreaBottom - summaryAreaTop;
  const summaryMaxWidth = boxWidth - (BOX_HORIZONTAL_PADDING * 2);

  // ── Summary text with auto-scaling font ────────────────────
  const summaryFontSize = computeAutoScaleFontSize(
    config.summaryText,
    summaryMaxWidth,
    summaryAvailableHeight,
  );

  const summaryObj = scene.add
    .text(boxCenterX, summaryAreaTop, config.summaryText, {
      fontSize: `${summaryFontSize}px`,
      color: DEFAULT_SUMMARY_COLOR,
      fontFamily: FONT_FAMILY,
      align: 'center',
      wordWrap: { width: summaryMaxWidth, useAdvancedWrap: true },
    })
    .setOrigin(0.5, 0)
    .setDepth(DEFAULT_SUMMARY_DEPTH);
  objects.push(summaryObj);

  // ── Extra buttons (game-specific, optional) ────────────────
  if (hasExtraButtons) {
    const extraBtnSpacing = Math.min(boxWidth / (extraButtons.length + 1), 160);
    const extraStartX = boxCenterX - ((extraButtons.length - 1) * extraBtnSpacing) / 2;

    extraButtons.forEach((btn, idx) => {
      const btnX = extraStartX + idx * extraBtnSpacing;
      const btnObj = createOverlayButton(
        scene,
        btnX,
        extraButtonsY,
        btn.label,
        DEFAULT_BUTTON_DEPTH,
      );
      btnObj.on('pointerdown', btn.onClick);
      objects.push(btnObj);
    });
  }

  // ── Bottom row: [Play Again] and [Menu] ───────────────────
  const bottomBtnSpacing = 180;
  const playAgainX = boxCenterX - bottomBtnSpacing / 2;
  const menuX = boxCenterX + bottomBtnSpacing / 2;

  const playAgainBtn = createOverlayButton(
    scene,
    playAgainX,
    bottomButtonsY,
    `[ ${playAgainLabel} ]`,
    DEFAULT_BUTTON_DEPTH,
  );
  playAgainBtn.on('pointerdown', config.onPlayAgain);
  objects.push(playAgainBtn);

  const menuCallback = config.onMenu ?? (() => {
    scene.scene.start('GameSelectorScene');
  });
  const menuBtn = createOverlayButton(
    scene,
    menuX,
    bottomButtonsY,
    `[ ${menuLabel} ]`,
    DEFAULT_BUTTON_DEPTH,
  );
  menuBtn.on('pointerdown', menuCallback);
  objects.push(menuBtn);

  // ── Result ─────────────────────────────────────────────────
  return {
    background: overlay.background,
    box: overlay.box,
    title: titleObj,
    summary: summaryObj,
    objects,
    dismiss: () => dismissOverlay(objects),
  };
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Compute an optimal font size for summary text so that it fits
 * within the available width and height.
 *
 * Uses a binary search between SUMMARY_FONT_MIN and
 * SUMMARY_FONT_MAX to find the largest font size where the
 * estimated text height fits within the available space.
 *
 * Estimation assumes each line is approximately lineHeight
 * tall, and that word-wrapping may occur.
 *
 * @param text       - The summary text to display.
 * @param maxWidth   - Maximum width available for the text.
 * @param maxHeight  - Maximum height available for the text.
 * @returns Optimal font size in pixels.
 */
export function computeAutoScaleFontSize(
  text: string,
  maxWidth: number,
  maxHeight: number,
): number {
  // Estimate average character width at a given font size
  const avgCharWidthRatio = 0.6; // approximate ratio of font size to char width
  const lineHeightRatio = 1.4; // approximate line height ratio

  if (!text || maxHeight <= 0) {
    return SUMMARY_FONT_MIN;
  }

  // Binary search for the optimal font size
  let low = SUMMARY_FONT_MIN;
  let high = SUMMARY_FONT_MAX;
  let best = SUMMARY_FONT_MIN;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const charWidth = mid * avgCharWidthRatio;
    const lineHeight = mid * lineHeightRatio;

    // Estimate lines needed
    const charsPerLine = Math.max(1, Math.floor(maxWidth / charWidth));
    const lines = text.split('\n').reduce((total, paragraph) => {
      // Wrap long paragraphs
      const wrappedLines = Math.max(1, Math.ceil(paragraph.length / charsPerLine));
      return total + wrappedLines;
    }, 0);

    const estimatedHeight = lines * lineHeight;

    if (estimatedHeight <= maxHeight) {
      best = mid;
      low = mid + 1; // try larger
    } else {
      high = mid - 1; // try smaller
    }
  }

  return best;
}
