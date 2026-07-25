/**
 * GymParameterizedOverlayScene -- Demonstrates the ParameterizedOverlay system.
 *
 * Features:
 *   - Three parameterized overlay configs: game-over, round-end, confirmation
 *   - Declarative config format with title, body, and button array
 *   - overlayCenterY offset positioning with two different offsets
 *   - Button callbacks fire and are logged in the event log
 *   - Auto-closes any open overlay before opening a new one
 *
 * @module example-games/gym/scenes/GymParameterizedOverlayScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_PARAMETERIZED_OVERLAY_KEY } from '../GymRegistry';
import { createParameterizedOverlay, overlayCenterY, dismissParameterizedOverlay } from '../../../src/ui/ParameterizedOverlay';
import type { ParameterizedOverlayConfig } from '../../../src/ui/ParameterizedOverlay';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymParameterizedOverlayLayoutJson from '../layouts/gym-parameterized-overlay.layout.json';

// ── SLL Layout ──────────────────────────────────────────────

/**
 * Parse the shared Parameterized Overlay scene layout once at module load.
 */
const OVERLAY_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymParameterizedOverlayLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Resolve an anchor from the Parameterized Overlay SLL layout.
 * Falls back to the default viewport if no layout is available.
 */
function resolveOverlayAnchor(
  zone: string,
  anchor: string,
  viewport?: { width: number; height: number },
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!OVERLAY_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  const vp = viewport ?? DEFAULT_VIEWPORT;
  return anchorPoint(OVERLAY_LAYOUT, zone, anchor, vp, 1);
}

// ── Overlay configs ─────────────────────────────────────────

interface OverlayConfigEntry {
  readonly title: string;
  readonly config: ParameterizedOverlayConfig;
  readonly offset: number;
}

// Reusable button configuration helper
function createButton(
  label: string,
  x: number,
  y: number,
  onClick: () => void,
) {
  return { label, x, y, onClick };
}

/**
 * Build the three overlay configs demonstrated in this scene.
 *
 * Each config uses a different overlayCenterY offset to show
 * vertical positioning.
 *
 * @param logCallback  Function to call when a button is pressed for logging.
 * @param closeCallback Function to close the current overlay.
 * @returns Array of overlay config entries.
 */
function createOverlayConfigs(
  logCallback: (msg: string) => void,
  closeCallback: () => void,
): ReadonlyArray<OverlayConfigEntry> {
  return [
    {
      title: 'Game Over',
      offset: 20,
      config: {
        title: 'Game Over',
        titleColor: '#ff8877',
        detailText:
          'Final Score: 2,450\nTime Played: 12:34\nBest Score: 3,200',
        titleY: overlayCenterY(20) - 80,
        detailY: overlayCenterY(20) - 10,
        titleDepth: 12,
        detailDepth: 12,
        buttons: [
          createButton('[ Play Again ]', GAME_W / 2 - 100, overlayCenterY(20) + 80, () => {
            logCallback('Play Again clicked');
            closeCallback();
          }),
          createButton('[ Main Menu ]', GAME_W / 2 + 100, overlayCenterY(20) + 80, () => {
            logCallback('Main Menu clicked');
            closeCallback();
          }),
        ],
        background: { depth: 10, alpha: 0.85 },
        box: { width: 400, height: 260, alpha: 0.9 },
      },
    },
    {
      title: 'Round End',
      offset: -40,
      config: {
        title: 'Round Complete',
        titleColor: '#88ff88',
        detailText:
          'Cards Played: 12\nPoints Earned: 850\nBonus Multiplier: x1.5',
        titleY: overlayCenterY(-40) - 80,
        detailY: overlayCenterY(-40) - 10,
        titleDepth: 12,
        detailDepth: 12,
        buttons: [
          createButton('[ Next Round ]', GAME_W / 2 - 100, overlayCenterY(-40) + 80, () => {
            logCallback('Next Round clicked');
            closeCallback();
          }),
          createButton('[ View Scores ]', GAME_W / 2 + 100, overlayCenterY(-40) + 80, () => {
            logCallback('View Scores clicked');
            closeCallback();
          }),
        ],
        background: { depth: 10, alpha: 0.7 },
        box: { width: 400, height: 260, alpha: 0.9 },
      },
    },
    {
      title: 'Confirm Action',
      offset: 0,
      config: {
        title: 'Confirm Action',
        titleColor: '#ffcc88',
        detailText:
          'Are you sure you want to quit?\n\nYour progress in this round\nwill be lost.',
        titleY: overlayCenterY(0) - 80,
        detailY: overlayCenterY(0) - 10,
        titleDepth: 12,
        detailDepth: 12,
        buttons: [
          createButton('[ Confirm ]', GAME_W / 2 - 100, overlayCenterY(0) + 80, () => {
            logCallback('Confirm clicked');
            closeCallback();
          }),
          createButton('[ Cancel ]', GAME_W / 2 + 100, overlayCenterY(0) + 80, () => {
            logCallback('Cancel clicked');
            closeCallback();
          }),
        ],
        background: { depth: 10, alpha: 0.75 },
        box: { width: 380, height: 240, alpha: 0.9 },
      },
    },
  ];
}

// ── Scene ───────────────────────────────────────────────────

export class GymParameterizedOverlayScene extends GymSceneBase {
  /** Current overlay objects (null when no overlay is active). */
  private overlayObjects: Phaser.GameObjects.GameObject[] | null = null;

  /** Event log lines. */
  private eventLog: string[] = [];

  /** Event log renderer. */
  private eventLogResult!: EventLogResult;

  /** The overlay configs exposed for testing. */
  readonly overlayConfigs: ReadonlyArray<OverlayConfigEntry>;

  /** Number of help sections (exposed for testing). */
  readonly helpSectionCount: number = 4;

  constructor() {
    super({ key: GYM_PARAMETERIZED_OVERLAY_KEY });

    // Build overlay configs with bound callbacks
    this.overlayConfigs = createOverlayConfigs(
      (msg: string) => this.logEvent(msg),
      () => this.closeOverlay(),
    );
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Parameterized Overlay');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the ParameterizedOverlay system (createParameterizedOverlay, overlayCenterY). Three different overlay configs showcase declarative config format: game-over (red tones, +20 offset), round-end (green tones, -40 offset), and confirmation (amber tones, center 0 offset). Each config defines title, body text, buttons, and background/box options. Button callbacks fire and are logged in the event log below.'
      },
      {
        heading: 'Controls',
        body: '[ Game Over ]: Opens a game-over overlay with "Final Score" details and [ Play Again ] / [ Main Menu ] buttons. Uses overlayCenterY(+20).\n[ Round End ]: Opens a round-end overlay with round statistics and [ Next Round ] / [ View Scores ] buttons. Uses overlayCenterY(-40).\n[ Confirm Action ]: Opens a confirmation dialog with warning text and [ Confirm ] / [ Cancel ] buttons. Uses overlayCenterY(0).\nClick any button inside the overlay to close it and log the action.'
      },
      {
        heading: 'API Reference',
        body: 'createParameterizedOverlay(scene, config): Creates a full overlay with background, centered title, detail text, and interactive buttons in a single call.\n\noverlayCenterY(offset): Returns GAME_H / 2 + offset for vertical positioning of overlay elements.\n\nParameterizedOverlayConfig: { title, titleColor, detailText, titleY, detailY, titleDepth, detailDepth, buttons, background?, box? }\n\nParameterizedOverlayButton: { label, x, y, onClick, config? }'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ Game Over ] → overlay appears with "Game Over" title, score details, and [ Play Again ] / [ Main Menu ] buttons\n2. Press [ Play Again ] → overlay closes, event log records the action\n3. Press [ Round End ] → overlay appears at different vertical position (-40 offset) with "Round Complete" and round stats\n4. Press [ Next Round ] → overlay closes, event log records the action\n5. Press [ Confirm Action ] → confirmation overlay at center (0 offset) with warning text\n6. Press [ Cancel ] → overlay closes, event log records the action\n7. Verify each overlay uses different colors, body text, and button labels'
      },
    ]);

    const controlsAnchor = resolveOverlayAnchor('controls', 'center');
    const offsetAnchor = resolveOverlayAnchor('offsetIndicators', 'center');
    const logAnchor = resolveOverlayAnchor('log', 'center');

    // ── Controls row ──────────────────────────────────────

    const cx = controlsAnchor.x;
    const cy = controlsAnchor.y;

    this.addButton(cx - 240, cy, '[ Game Over ]', () => {
      this.openOverlay(0);
    });
    this.addButton(cx - 70, cy, '[ Round End ]', () => {
      this.openOverlay(1);
    });
    this.addButton(cx + 100, cy, '[ Confirm Action ]', () => {
      this.openOverlay(2);
    });

    // ── Offset indicator labels ───────────────────────────

    // Show the overlayCenterY offsets used by each overlay
    const offsetY = offsetAnchor.y;
    const offsetLabels = [
      `Game Over offset: +20  →  centerY: ${overlayCenterY(20)}`,
      `Round End offset: -40  →  centerY: ${overlayCenterY(-40)}`,
      `Confirm offset:    0   →  centerY: ${overlayCenterY(0)}`,
    ];

    for (let i = 0; i < offsetLabels.length; i++) {
      createHudText(this, cx, offsetY + i * 18, offsetLabels[i], '#889988', {
        fontSize: '12px',
      }).setOrigin(0.5);
    }

    // ── Event log ─────────────────────────────────────────

    const logY = logAnchor.y;
    this.eventLogResult = createEventLog(this, logY + 20, {
      headerText: '── Event Log ──',
      maxLines: 12,
      lineHeight: 17,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });

    this.logEvent('Scene ready — click an overlay button above');
  }

  // ── Overlay management ────────────────────────────────────

  /**
   * Open a parameterized overlay by index.
   * Closes any existing overlay first.
   */
  private openOverlay(index: number): void {
    const entry = this.overlayConfigs[index];
    if (!entry) {
      this.logEvent(`Unknown overlay index: ${index}`);
      return;
    }

    // Close any existing overlay first
    this.closeOverlay();

    // Create the parameterized overlay
    this.overlayObjects = createParameterizedOverlay(this, entry.config);

    this.logEvent(`Opened: ${entry.title} (offset ${entry.offset >= 0 ? '+' : ''}${entry.offset})`);
  }

  /**
   * Close the currently open overlay, if any.
   */
  private closeOverlay(): void {
    if (this.overlayObjects && this.overlayObjects.length > 0) {
      dismissParameterizedOverlay(this.overlayObjects);
      this.overlayObjects = null;
    }
  }

  /**
   * Add an entry to the event log and re-render.
   */
  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 12) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }
}
