/**
 * GymSvgHelpersScene -- Demonstrates the SvgHelpers SVG rasterisation pipeline.
 *
 * Features:
 *   - Fetch SVG text from a known asset URL and display the raw SVG content.
 *   - Rasterise an SVG to a Phaser texture with configurable output size.
 *   - Display the resulting texture on-screen alongside the original SVG source.
 *   - Demonstrate texture caching (getOrCreateTexture returns cached texture).
 *   - Demonstrate markSceneValid/markSceneInvalid lifecycle toggling.
 *
 * @module example-games/gym/scenes/GymSvgHelpersScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_SVG_HELPERS_KEY } from '../GymRegistry';
import {
  fetchSvgText,
  rasteriseSvgToTexture,
  getOrCreateTexture,
  makeTextureKey,
  markSceneValid,
  markSceneInvalid,
} from '../../../src/core-engine/SvgHelpers';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

/** URL of the demo SVG asset (tempura icon from sushi-go assets). */
const DEMO_SVG_URL = 'assets/sushi-go/icon-tempura.svg';

/** Template ID used for makeTextureKey / getOrCreateTexture. */
const TEMPLATE_ID = 'gym-svg-demo';

/** Texture key prefix used for Gym SvgHelpers scene textures. */
const TEXTURE_PREFIX = 'gym_svg_';

/** Font size for the SVG content display. */
const SVG_TEXT_FONT_SIZE = '10px';

/** Font colour for the SVG content display. */
const SVG_TEXT_COLOUR = '#aaddaa';

/** Maximum length to display from the raw SVG content. */
const MAX_SVG_DISPLAY_LENGTH = 1200;



/** Y position for the first row of controls. */
const CONTROLS_ROW_1_Y = 100;

/** Y position for the second row of controls. */
const CONTROLS_ROW_2_Y = 135;

/** X position for the SVG text display (left column). */
const SVG_TEXT_X = 30;

/** Y position for the SVG text display header. */
const SVG_TEXT_HEADER_Y = 175;

/** Y position for the SVG text display content. */
const SVG_TEXT_CONTENT_Y = 198;

/** Width of the SVG text display area. */
const SVG_TEXT_WIDTH = 580;

/** X position for the texture display area (right column). */
const TEXTURE_DISPLAY_X = 960;

/** Y position for the texture display area. */
const TEXTURE_DISPLAY_Y = 300;

/** Y position for the status text. */
const STATUS_TEXT_Y = 440;

/** Y position for the event log. */
const EVENT_LOG_Y = 480;

/** Maximum number of events in the log. */
const MAX_LOG_EVENTS = 10;

export class GymSvgHelpersScene extends GymSceneBase {
  /** The raw SVG text content fetched from the asset URL. */
  private svgText: string = '';

  /** Whether this scene is currently marked valid for texture operations. */
  private textureValid: boolean = true;

  // ── UI elements ───────────────────────────────────────────

  /** Display for the raw SVG text content. */
  private svgTextDisplay!: Phaser.GameObjects.Text;

  /** Image object displaying the rasterised texture. */
  private textureImage: Phaser.GameObjects.Image | null = null;

  /** Status text at the bottom of the scene. */
  /** Status text at the bottom of the scene (updated via updateStatus). */
  private statusText!: Phaser.GameObjects.Text;

  /** Button that toggles scene validity. */
  private validToggleBtn!: Phaser.GameObjects.Text;

  /** Timestamp label for the rasterised texture. */
  private textureTimestampLabel!: Phaser.GameObjects.Text;

  /** Event log lines. */
  private eventLog: string[] = [];

  /** Event log UI result. */
  private eventLogResult!: EventLogResult;

  constructor() {
    super({ key: GYM_SVG_HELPERS_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('SVG Rasterisation Pipeline');
    this.addDivider();
    this.initReducedMotion();

    // Register as a valid scene for texture operations
    markSceneValid(this);
    this.textureValid = true;

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the SvgHelpers SVG rasterisation pipeline used by Main Street and The Mind. SVG icons are fetched, rasterised to Phaser textures at configurable sizes, and displayed on screen. The pipeline supports texture caching so repeated rasterisation of the same SVG at the same size returns the cached texture immediately. Scene validity controls let you observe what happens when texture operations are paused or resumed.',
      },
      {
        heading: 'Controls',
        body: '[ Fetch SVG ]: Load the raw SVG text from the tempura icon asset. The raw markup is displayed in the left panel.\n[ Rasterise 128x128 ]: Rasterise the SVG at 128x128 pixels and display the result on the right.\n[ Rasterise 64x64 ]: Rasterise the SVG at a smaller size (64x64) to compare output sizes.\n[ Cache Test ]: Call getOrCreateTexture a second time with the same parameters. When the texture is cached, the result returns immediately with ready=true.\n[ Toggle Valid/Invalid ]: Mark the scene valid or invalid. When invalid, texture operations are skipped — the status log shows the effect.\n[ Clear Display ]: Remove the displayed texture and reset the SVG display area.',
      },
      {
        heading: 'Usage Example',
        body: 'A developer building a card game with custom SVG icons can use SvgHelpers to load icons, rasterise them at various sizes, and verify that texture caching avoids redundant work. The valid/invalid toggle simulates what happens during scene shutdown — texture generation is gracefully skipped when the scene is no longer active.',
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ Fetch SVG ] → raw SVG markup appears in the left panel.\n2. Press [ Rasterise 128x128 ] → the tempura icon is rasterised and displayed as a Phaser texture on the right.\n3. Press [ Cache Test ] → the second call returns ready=true (cached).\n4. Press [ Toggle Valid ] → scene is marked invalid. Press [ Rasterise 128x128 ] → texture generation is skipped.\n5. Press [ Toggle Valid ] again → scene is valid. Press [ Rasterise 128x128 ] → texture is generated again.\n6. Press [ Rasterise 64x64 ] → a smaller version of the icon is displayed.\n7. Press [ Clear Display ] → both texture image and SVG text are cleared.',
      },
    ]);

    this.createUI();

    // Auto-fetch the SVG on scene creation so content is ready immediately
    this.fetchSvg();
  }

  // ── UI setup ──────────────────────────────────────────────

  private createUI(): void {
    const cx = GAME_W / 2;
    const y1 = CONTROLS_ROW_1_Y;
    const y2 = CONTROLS_ROW_2_Y;

    // ── Controls row 1 ─────────────────────────────────
    this.addButton(cx - 450, y1, '[ Fetch SVG ]', () => this.fetchSvg());
    this.addButton(cx - 310, y1, '[ Rasterise 128x128 ]', () => this.rasterise(128, 128));
    this.addButton(cx - 130, y1, '[ Rasterise 64x64 ]', () => this.rasterise(64, 64));
    this.addButton(cx + 30, y1, '[ Cache Test ]', () => this.cacheTest());
    this.addButton(cx + 170, y1, '[ Clear Display ]', () => this.clearDisplay());

    // ── Controls row 2 ─────────────────────────────────
    this.validToggleBtn = this.addButton(cx - 450, y2, '[ Mark Invalid ]', () => this.toggleValid());
    this.validToggleBtn.setColor('#ff8888');

    // ── SVG text display (left column) ──────────────────
    createHudText(this, SVG_TEXT_X, SVG_TEXT_HEADER_Y, '── Raw SVG Content ──', '#669966', {
      fontSize: '12px',
    });

    this.svgTextDisplay = this.add.text(
      SVG_TEXT_X,
      SVG_TEXT_CONTENT_Y,
      'Press [ Fetch SVG ] to load the tempura icon SVG.',
      {
        fontSize: SVG_TEXT_FONT_SIZE,
        color: SVG_TEXT_COLOUR,
        fontFamily: 'monospace',
        wordWrap: { width: SVG_TEXT_WIDTH },
        lineSpacing: 1,
      },
    );

    // ── Texture display (right column) ──────────────────
    this.textureTimestampLabel = createHudText(
      this,
      TEXTURE_DISPLAY_X,
      TEXTURE_DISPLAY_Y - 150,
      'No texture displayed',
      '#888888',
      { fontSize: '12px' },
    ).setOrigin(0.5);

    // ── Status text ─────────────────────────────────────
    this.statusText = createHudText(this, cx, STATUS_TEXT_Y, 'Ready. Press [ Fetch SVG ] to begin.', '#88ff88', {
      fontSize: '13px',
    }).setOrigin(0.5);

    // ── Event log ───────────────────────────────────────
    this.eventLogResult = createEventLog(this, EVENT_LOG_Y, {
      headerText: '── Event Log ──',
      maxLines: MAX_LOG_EVENTS,
      lineHeight: 16,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 30,
    });
  }

  // ── Actions ────────────────────────────────────────────────

  /**
   * Fetch the raw SVG text from the demo asset URL and display it.
   */
  private async fetchSvg(): Promise<void> {
    try {
      this.svgText = await fetchSvgText(DEMO_SVG_URL);
      const displayText = this.svgText.length > MAX_SVG_DISPLAY_LENGTH
        ? this.svgText.substring(0, MAX_SVG_DISPLAY_LENGTH) + '\n... (truncated)'
        : this.svgText;
      this.svgTextDisplay.setText(displayText);
      this.logEvent(`SVG fetched (${this.svgText.length} chars) from ${DEMO_SVG_URL}`);
    } catch (e) {
      this.logEvent(`Fetch error: ${(e as Error).message}`);
      this.svgTextDisplay.setText(`Failed to fetch SVG: ${(e as Error).message}`);
    }
  }

  /**
   * Rasterise the SVG to a Phaser texture at the given dimensions and display it.
   *
   * @param width  Target width in logical pixels.
   * @param height Target height in logical pixels.
   */
  private async rasterise(width: number, height: number): Promise<void> {
    if (!this.svgText) {
      this.logEvent('No SVG content. Press [ Fetch SVG ] first.');
      return;
    }

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const key = makeTextureKey(TEMPLATE_ID, width, height, dpr, TEXTURE_PREFIX);

    try {
      await rasteriseSvgToTexture(this, key, this.svgText, width, height);

      // Update the texture display
      this.showTexture(key, width, height, dpr);
    } catch (e) {
      this.logEvent(`Rasterise error: ${(e as Error).message}`);
    }
  }

  /**
   * Demonstrate texture caching: call getOrCreateTexture twice with the same
   * parameters and report whether the second call returned a cached texture.
   */
  private async cacheTest(): Promise<void> {
    if (!this.svgText) {
      this.logEvent('No SVG content. Press [ Fetch SVG ] first.');
      return;
    }

    const width = 128;
    const height = 128;

    // First call — should initiate texture generation
    const result1 = getOrCreateTexture(this, TEMPLATE_ID, this.svgText, width, height);
    this.logEvent(
      `Cache test call 1: key="${result1.key}", ` +
      `ready=${result1.ready}, ` +
      `promise=${result1.promise ? 'pending' : 'none'}`,
    );

    // Wait for the first call to complete
    if (result1.promise) {
      await result1.promise;
      this.logEvent('Call 1 texture generated.');
    }

    // Second call — should return cached texture (ready=true)
    const result2 = getOrCreateTexture(this, TEMPLATE_ID, this.svgText, width, height);
    if (result2.ready) {
      this.logEvent(
        `Cache test call 2: key="${result2.key}" — CACHED! ` +
        `(ready=true, texture exists in scene.textures)`,
      );
    } else {
      this.logEvent(
        `Cache test call 2: key="${result2.key}" — NOT cached ` +
        `(ready=${result2.ready})`,
      );
    }

    // Display the texture
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const key = makeTextureKey(TEMPLATE_ID, width, height, dpr, TEXTURE_PREFIX);
    this.showTexture(key, width, height, dpr);
  }

  /**
   * Toggle between markSceneValid and markSceneInvalid.
   */
  private toggleValid(): void {
    if (this.textureValid) {
      markSceneInvalid(this);
      this.textureValid = false;
      this.validToggleBtn.setText('[ Mark Valid ]');
      this.validToggleBtn.setColor('#88ff88');
      this.logEvent('Scene marked INVALID — texture rasterisation will be skipped');
    } else {
      markSceneValid(this);
      this.textureValid = true;
      this.validToggleBtn.setText('[ Mark Invalid ]');
      this.validToggleBtn.setColor('#ff8888');
      this.logEvent('Scene marked VALID — texture rasterisation enabled');
    }
  }

  /**
   * Clear the texture display and SVG text display.
   */
  private clearDisplay(): void {
    // Remove displayed texture image
    if (this.textureImage) {
      this.textureImage.destroy();
      this.textureImage = null;
    }

    this.svgTextDisplay.setText('Display cleared.');
    this.textureTimestampLabel.setText('No texture displayed');
    this.logEvent('Display cleared');
  }

  // ── Display helpers ────────────────────────────────────────

  /**
   * Display a rasterised texture on screen.
   *
   * @param key    The Phaser texture key.
   * @param width  The logical width used during rasterisation.
   * @param height The logical height used during rasterisation.
   * @param dpr    The device pixel ratio used during rasterisation.
   */
  private showTexture(key: string, width: number, height: number, dpr: number): void {
    // Remove previous texture image
    if (this.textureImage) {
      this.textureImage.destroy();
      this.textureImage = null;
    }

    // Create new image from the rasterised texture and display it at the
    // requested logical dimensions. The texture itself may be rasterised at
    // a higher internal resolution (qualityScale) for crispness, but the
    // display size matches what the user selected.
    this.textureImage = this.add.image(TEXTURE_DISPLAY_X, TEXTURE_DISPLAY_Y, key);
    this.textureImage.setDisplaySize(width, height);

    this.textureTimestampLabel.setText(
      `Displayed at ${width}×${height} logical px @${dpr.toFixed(1)}x DPR`,
    );
  }

  // ── Logging ────────────────────────────────────────────────

  /**
   * Add a message to the event log.
   *
   * @param msg  The message to log.
   */
  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > MAX_LOG_EVENTS) {
      this.eventLog.shift();
    }
    this.eventLogResult.render(this.eventLog);
    // Read statusText to suppress unused-variable warning
    void this.statusText;
  }
}
