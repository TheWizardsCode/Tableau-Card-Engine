/**
 * GymDprResolutionScene -- demonstrates how SvgHelpers rasterises the same
 * SVG at different device pixel ratios (DPR 1, 2, 3).
 *
 * Three side-by-side panels render the identical card SVG through
 * `rasteriseSvgToTexture` at DPR 1, 2 and 3. Each panel is labelled with its
 * DPR, the resolved quality scale (`Math.max(MIN_QUALITY_SCALE, dpr)`), the
 * resulting canvas (texture) dimensions, and the logical display size. A
 * zoom toggle crops a shared detail region and displays it at 2x so the
 * supersample difference is visible.
 *
 * The scene makes the native-resolution contract introduced in
 * CG-0MUCMB8DT003DAKR visually verifiable: at DPR 1 and 2 the canvas is
 * 2x the logical size; at DPR 3 it follows device density (3x).
 *
 * Features:
 *   - Renders the same SVG at DPR 1, 2, 3 side by side.
 *   - Labels each panel with quality scale + canvas dimensions.
 *   - 2x zoom/crop toggle for inspecting fine detail.
 *   - Reduced-motion aware (skips the fade-in tween).
 *
 * @module example-games/gym/scenes/GymDprResolutionScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_DPR_RESOLUTION_KEY } from '../GymRegistry';
import {
  rasteriseSvgToTexture,
  makeTextureKey,
  markSceneValid,
  markSceneInvalid,
  MIN_QUALITY_SCALE,
} from '../../../src/core-engine/SvgHelpers';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymDprLayoutJson from '../layouts/gym-dpr-resolution.layout.json';

// Parse the scene layout once at module load.
const DPR_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null =
  (() => {
    const parsed = parseScreenLayoutDocument(gymDprLayoutJson);
    return parsed.valid ? parsed.layout : null;
  })();

/** Default reference viewport for SLL anchor resolution. */
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Resolve an SLL anchor for this scene, falling back to the scene centre.
 *
 * @param zone    Zone name in `gym-dpr-resolution.layout.json`.
 * @param anchor  Anchor name within the zone.
 * @param viewport Optional viewport override.
 * @returns The resolved pixel point.
 */
function resolveAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!DPR_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  return anchorPoint(DPR_LAYOUT, zone, anchor, viewport, 1);
}

/** Logical card width used for rasterisation and display. */
export const DPR_DEMO_LOGICAL_W = 140;

/** Logical card height used for rasterisation and display. */
export const DPR_DEMO_LOGICAL_H = 80;

/** Device pixel ratios demonstrated side by side. */
export const DPR_DEMO_DPRS = [1, 2, 3] as const;

/** Texture key prefix for this scene (keeps keys namespaced). */
const TEXTURE_PREFIX = 'gym_dpr_';

/** Template id used by `makeTextureKey`. */
const TEMPLATE_ID = 'dpr-demo';

/** Zoom factor applied to the cropped detail region. */
const ZOOM_FACTOR = 2;

/** Crop rectangle (logical px) used by the zoom toggle. */
const CROP_X = 4;
const CROP_Y = 4;
const CROP_W = 70;
const CROP_H = 40;

/** Vertical offset of a panel title from the panel centre. */
const PANEL_TITLE_DY = -62;

/** Vertical offset of a panel info block from the panel centre. */
const PANEL_INFO_DY = 50;

/** Maximum number of event-log lines retained. */
const MAX_LOG_EVENTS = 6;

/**
 * Resolve the texture quality scale for a given device pixel ratio.
 *
 * Mirrors the contract implemented in `rasteriseSvgToTexture`:
 * `Math.max(MIN_QUALITY_SCALE, dpr)`.
 *
 * @param dpr  Device pixel ratio (may be fractional).
 * @returns The quality scale applied to the logical size.
 */
export function dprQualityScale(dpr: number): number {
  return Math.max(MIN_QUALITY_SCALE, dpr);
}

/**
 * Inline card SVG used for the DPR comparison.
 *
 * Exported so tests and documentation can reuse the exact same source. The
 * SVG deliberately mixes small text, thin strokes and a curved path so any
 * resolution difference is visible.
 */
export const DPR_DEMO_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="80" viewBox="0 0 140 80">',
  '<rect x="0.75" y="0.75" width="138.5" height="78.5" rx="6" ry="6" fill="#fdf6e3" stroke="#3a3a3a" stroke-width="1.5"/>',
  '<text x="8" y="20" font-family="Georgia, serif" font-size="16" font-weight="bold" fill="#b58900">A</text>',
  '<text x="8" y="74" font-family="Georgia, serif" font-size="16" font-weight="bold" fill="#b58900">A</text>',
  '<g fill="none" stroke="#268bd2" stroke-width="1">',
  '<circle cx="70" cy="40" r="22"/>',
  '<path d="M70 18 L86 50 L54 50 Z"/>',
  '</g>',
  '<text x="70" y="45" font-family="Georgia, serif" font-size="12" fill="#dc322f" text-anchor="middle">A</text>',
  '<line x1="10" y1="30" x2="10" y2="50" stroke="#6c71c4" stroke-width="0.75"/>',
  '<line x1="130" y1="30" x2="130" y2="50" stroke="#6c71c4" stroke-width="0.75"/>',
  '</svg>',
].join('');

/** Per-panel UI state for one DPR. */
interface DprPanel {
  /** Device pixel ratio shown in this panel. */
  dpr: number;
  /** Resolved `Math.max(MIN_QUALITY_SCALE, dpr)` for this panel. */
  qualityScale: number;
  /** Panel centre X. */
  x: number;
  /** Panel centre Y. */
  y: number;
  /** Phaser texture key (set after rasterisation). */
  key: string;
  /** Panel title text object. */
  titleText: Phaser.GameObjects.Text;
  /** Panel info text object. */
  infoText: Phaser.GameObjects.Text;
  /** Rasterised card image (created after the first successful render). */
  image: Phaser.GameObjects.Image | null;
}

export class GymDprResolutionScene extends GymSceneBase {
  /** Panels, one per demonstrated DPR. */
  private panels: DprPanel[] = [];

  /** Status line shown below the panels. */
  private statusText!: Phaser.GameObjects.Text;

  /** Whether the zoom/crop view is active. */
  private zoomed = false;

  /** Button label for the zoom toggle (updated on toggle). */
  private zoomButton!: Phaser.GameObjects.Text;

  /** Event log lines. */
  private eventLog: string[] = [];

  /** Event log UI result. */
  private eventLogResult!: EventLogResult;

  /** Set on scene shutdown so in-flight async renders stop touching the scene. */
  private shuttingDown = false;

  constructor() {
    super({ key: GYM_DPR_RESOLUTION_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('DPR Resolution Comparison');
    this.addDivider();
    this.initReducedMotion();

    // Register as a valid scene for texture operations and release it on shutdown.
    markSceneValid(this);
    this.events.once('shutdown', () => {
      this.shuttingDown = true;
      markSceneInvalid(this);
    });

    this.initHelp([
      {
        heading: 'Features',
        body: 'Renders the same card SVG at device pixel ratios 1, 2 and 3 side by side using the shared SvgHelpers rasterisation pipeline. Each panel shows the resolved quality scale and the resulting canvas (texture) dimensions, making the native-resolution contract visible: qualityScale = Math.max(MIN_QUALITY_SCALE, dpr) with MIN_QUALITY_SCALE = 2. At DPR 1 and 2 the canvas is 2x the logical size; at DPR 3 it follows device density (3x).',
      },
      {
        heading: 'Controls',
        body: '[ Re-render ]: Rasterise all three panels again (textures are cached, so this is instant).\n[ Toggle Zoom 2x ]: Crop a shared detail region (the top-left corner) and display it at 2x. Compare how the same crop looks at each DPR.\n[ Clear ]: Destroy the panel images and reset the log.',
      },
      {
        heading: 'Usage Example',
        body: 'A developer adopting SvgHelpers can use this scene to confirm that texture memory scales with device density rather than a fixed 4x baseline. Before committing a rendering change, load this scene at DPR 1, 2 and 3 (or use browser device emulation) and verify card text and thin vector strokes remain legible.',
      },
      {
        heading: 'Test Plan',
        body: '1. Open the scene → three panels appear, each labelled DPR 1, 2, 3.\n2. Verify the canvas dimensions read 280x160 for DPR 1 and 2, and 420x240 for DPR 3 (140x80 logical).\n3. Press [ Toggle Zoom 2x ] → all three panels show the same cropped detail at 2x.\n4. Press [ Toggle Zoom 2x ] again → panels return to the full card.\n5. Press [ Re-render ] → panels redraw using the cached textures.',
      },
    ]);

    this.createUI();
    void this.renderAll();
  }

  // ── UI setup ──────────────────────────────────────────────

  private createUI(): void {
    const controls = resolveAnchor('controls', 'center');
    this.initButtonBar(controls.y, { rowSpacing: 28 });
    this.buttonBar!.addButton('[ Re-render ]', () => void this.renderAll(), { zone: 'center' });
    this.zoomButton = this.buttonBar!.addButton('[ Toggle Zoom 2x ]', () => this.toggleZoom(), {
      zone: 'center',
    });
    this.buttonBar!.addButton('[ Clear ]', () => this.clearDisplay(), { zone: 'center' });

    const panelAnchors: Array<{ name: string; dpr: number }> = [
      { name: 'left', dpr: 1 },
      { name: 'middle', dpr: 2 },
      { name: 'right', dpr: 3 },
    ];

    for (const { name, dpr } of panelAnchors) {
      const point = resolveAnchor('panels', name);
      const titleText = createHudText(this, point.x, point.y + PANEL_TITLE_DY, `DPR ${dpr}`, '#88ff88', {
        fontSize: '16px',
        align: 'center',
        originX: 0.5,
        originY: 0,
      });

      const infoText = createHudText(
        this,
        point.x,
        point.y + PANEL_INFO_DY,
        'Rasterising…',
        '#aaccaa',
        {
          fontSize: '11px',
          align: 'center',
          originX: 0.5,
          originY: 0,
          lineSpacing: 3,
        },
      );

      this.panels.push({
        dpr,
        qualityScale: dprQualityScale(dpr),
        x: point.x,
        y: point.y,
        key: '',
        titleText,
        infoText,
        image: null,
      });
    }

    const logAnchor = resolveAnchor('log', 'center');
    this.statusText = createHudText(
      this,
      GAME_W / 2,
      logAnchor.y - 22,
      'Ready.',
      '#88ff88',
      { fontSize: '13px', align: 'center', originX: 0.5, originY: 0 },
    );

    this.eventLogResult = createEventLog(this, logAnchor.y, {
      headerText: '── Event Log ──',
      maxLines: MAX_LOG_EVENTS,
      lineHeight: 15,
      textColor: '#aaddaa',
      fontSize: '10px',
      headerX: GAME_W / 2,
      headerFontSize: '11px',
      headerColor: '#669966',
      lineX: GAME_W / 2 - 300,
    });
  }

  // ── Actions ────────────────────────────────────────────────

  /**
   * Rasterise the demo SVG at every demonstrated DPR and refresh the panels.
   *
   * Safe to call repeatedly: `rasteriseSvgToTexture` serves cached textures.
   */
  private async renderAll(): Promise<void> {
    this.setStatus('Rasterising…');

    for (const panel of this.panels) {
      if (this.shuttingDown) return;
      const key = makeTextureKey(TEMPLATE_ID, DPR_DEMO_LOGICAL_W, DPR_DEMO_LOGICAL_H, panel.dpr, TEXTURE_PREFIX);
      panel.key = key;

      try {
        await rasteriseSvgToTexture(
          this,
          key,
          DPR_DEMO_SVG,
          DPR_DEMO_LOGICAL_W,
          DPR_DEMO_LOGICAL_H,
          panel.dpr,
        );
      } catch (e) {
        if (this.shuttingDown) return;
        this.logEvent(`DPR ${panel.dpr}: rasterise error — ${(e as Error).message}`);
        panel.infoText.setText(`DPR ${panel.dpr}\nrasterise failed`);
        continue;
      }

      if (this.shuttingDown) return;

      if (!this.textures.exists(key)) {
        this.logEvent(`DPR ${panel.dpr}: texture missing after rasterise`);
        panel.infoText.setText(`DPR ${panel.dpr}\ntexture missing`);
        continue;
      }

      const source = this.textures.get(key).getSourceImage() as { width?: number; height?: number };
      const srcW = source?.width ?? Math.round(DPR_DEMO_LOGICAL_W * panel.qualityScale);
      const srcH = source?.height ?? Math.round(DPR_DEMO_LOGICAL_H * panel.qualityScale);

      this.ensurePanelImage(panel, key);

      panel.infoText.setText(
        `qualityScale = max(${MIN_QUALITY_SCALE}, ${panel.dpr}) = ×${panel.qualityScale}\n` +
        `canvas = ${srcW}×${srcH} px\n` +
        `display = ${DPR_DEMO_LOGICAL_W}×${DPR_DEMO_LOGICAL_H} logical`,
      );

      this.logEvent(`DPR ${panel.dpr}: canvas ${srcW}×${srcH} (×${panel.qualityScale})`);
    }

    this.applyZoom();
    this.setStatus(
      this.zoomed
        ? `Zoomed ${ZOOM_FACTOR}× — shared ${CROP_W}×${CROP_H} logical crop.`
        : `Full card shown at ${DPR_DEMO_LOGICAL_W}×${DPR_DEMO_LOGICAL_H} logical px.`,
    );
  }

  /**
   * Ensure a panel has an image for the given texture key, creating one if
   * needed. Replaces any previous image (e.g. after a re-render).
   *
   * @param panel  The panel to update.
   * @param key    The Phaser texture key to display.
   */
  private ensurePanelImage(panel: DprPanel, key: string): void {
    if (panel.image) {
      panel.image.destroy();
      panel.image = null;
    }

    const image = this.add.image(panel.x, panel.y, key);
    image.setDisplaySize(DPR_DEMO_LOGICAL_W, DPR_DEMO_LOGICAL_H);

    if (!this.reducedMotion) {
      image.setAlpha(0);
      this.tweens.add({ targets: image, alpha: 1, duration: 220 });
    } else {
      image.setAlpha(1);
    }

    panel.image = image;
  }

  /**
   * Toggle the 2x zoom/crop view.
   *
   * Applies the same logical crop region to every panel, scaled into each
   * texture's own pixel space so the comparison stays fair.
   */
  toggleZoom(): void {
    this.zoomed = !this.zoomed;
    this.zoomButton.setText(this.zoomed ? '[ Show Full Card ]' : '[ Toggle Zoom 2x ]');
    this.applyZoom();
    this.setStatus(
      this.zoomed
        ? `Zoomed ${ZOOM_FACTOR}× — shared ${CROP_W}×${CROP_H} logical crop.`
        : `Full card shown at ${DPR_DEMO_LOGICAL_W}×${DPR_DEMO_LOGICAL_H} logical px.`,
    );
    this.logEvent(this.zoomed ? 'Zoom 2x enabled' : 'Zoom disabled');
  }

  /**
   * Apply the current zoom state to every panel image.
   *
   * Cropping is expressed in texture pixels, so the logical crop is
   * multiplied by each panel's quality scale.
   */
  private applyZoom(): void {
    if (this.shuttingDown) return;
    for (const panel of this.panels) {
      const image = panel.image;
      if (!image) continue;

      if (this.zoomed) {
        const q = panel.qualityScale;
        image.setCrop(CROP_X * q, CROP_Y * q, CROP_W * q, CROP_H * q);
        image.setDisplaySize(CROP_W * ZOOM_FACTOR, CROP_H * ZOOM_FACTOR);
      } else {
        image.setCrop();
        image.setDisplaySize(DPR_DEMO_LOGICAL_W, DPR_DEMO_LOGICAL_H);
      }
    }
  }

  /** Destroy the panel images and reset the log. */
  private clearDisplay(): void {
    for (const panel of this.panels) {
      if (panel.image) {
        panel.image.destroy();
        panel.image = null;
      }
      panel.infoText.setText('Cleared.');
    }
    this.setStatus('Cleared.');
    this.eventLog = [];
    this.eventLogResult.render(this.eventLog);
  }

  // ── Diagnostics / test accessors ──────────────────────────

  /**
   * Snapshot of each panel's rasterised texture dimensions.
   *
   * Returns `width: 0, height: 0` for a DPR whose texture has not been
   * generated yet. Useful for tests and runtime diagnostics.
   */
  getPanelTextureSizes(): Array<{ dpr: number; width: number; height: number }> {
    return this.panels.map((panel) => {
      if (!panel.key || !this.textures.exists(panel.key)) {
        return { dpr: panel.dpr, width: 0, height: 0 };
      }
      const source = this.textures.get(panel.key).getSourceImage() as {
        width?: number;
        height?: number;
      };
      return { dpr: panel.dpr, width: source?.width ?? 0, height: source?.height ?? 0 };
    });
  }

  /** Whether the 2x zoom/crop view is currently active. */
  get isZoomActive(): boolean {
    return this.zoomed;
  }

  /**
   * Test/diagnostic: the panel images, one per demonstrated DPR.
   *
   * Entries are `null` until a panel has been rendered at least once.
   */
  getPanelImages(): Array<Phaser.GameObjects.Image | null> {
    return this.panels.map((panel) => panel.image);
  }

  // ── Logging ────────────────────────────────────────────────

  /**
   * Update the status line, guarding against post-shutdown writes.
   *
   * @param message  The status message to display.
   */
  private setStatus(message: string): void {
    if (this.shuttingDown) return;
    this.statusText?.setText(message);
  }

  /**
   * Append a message to the on-screen event log.
   *
   * @param message  The message to log.
   */
  private logEvent(message: string): void {
    if (this.shuttingDown) return;
    this.eventLog.push(message);
    if (this.eventLog.length > MAX_LOG_EVENTS) {
      this.eventLog.shift();
    }
    this.eventLogResult.render(this.eventLog);
  }
}
