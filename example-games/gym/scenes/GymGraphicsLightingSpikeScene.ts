/**
 * GymGraphicsLightingSpikeScene -- Evaluates Phaser's lighting pipeline
 * for card-glow and shadow effects.
 *
 * This is a feasibility spike scene to determine whether the lighting
 * pipeline can be used safely in the engine, including WebGL requirements,
 * performance considerations, and asset-format requirements.
 *
 * Acceptance criteria:
 *   - Attempts to set up Phaser's LightPlugin and render sample sprites with a point light
 *   - Documents whether the lighting pipeline can be used safely
 *   - Falls back gracefully when lights are unavailable (headless/WebGL disabled)
 *
 * @module example-games/gym/scenes/GymGraphicsLightingSpikeScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

export const GYM_GRAPHICS_LIGHTING_SPIKE_KEY = 'GymGraphicsLightingSpikeScene';

export class GymGraphicsLightingSpikeScene extends GymSceneBase {
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;
  private lightingAvailable = false;
  private lightActive = true;
  /** Reference to the LightsManager Light object created via addLight(). */
  private light: Phaser.GameObjects.Light | null = null;

  constructor() {
    super({ key: GYM_GRAPHICS_LIGHTING_SPIKE_KEY });
  }

  preload(): void {
    // Generate simple textures for lighting demo
    const g = this.add.graphics();
    g.fillStyle(0xcccccc, 1);
    g.fillRoundedRect(0, 0, 80, 110, 8);
    g.generateTexture('lighting-sprite-a', 80, 110);
    g.clear();
    g.fillStyle(0x888888, 1);
    g.fillRoundedRect(0, 0, 80, 110, 8);
    g.generateTexture('lighting-sprite-b', 80, 110);
    g.destroy();
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.initHeader('Lighting Spike');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Feasibility spike for Phaser lighting pipeline. Tests point light on sample sprites and evaluates WebGL requirements.' },
      { heading: 'Controls', body: '[ Toggle Light ]: Turn the point light on/off.\n[ Move Light ]: Move the point light position.\n\nFindings: Lighting requires WebGL. Headless/canvas environments will show a fallback message.' },
    ]);

    const cx = GAME_W / 2;
    let y = 60;

    this.addButton(cx - 100, y, '[ Toggle Light ]', () => this.toggleLight());
    this.addButton(cx + 100, y, '[ Move Light ]', () => this.moveLight());

    y += 30;

    // Attempt to enable lighting
    try {
      const renderer = this.sys.game.renderer;
      const isWebGL = renderer && (renderer as any).isWebGLRenderer !== undefined
        ? !!(renderer as any).isWebGLRenderer
        : renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer;

      if (isWebGL) {
        this.lightingAvailable = true;
        this.logEvent('WebGL renderer detected. Lighting may be available.');

        // Create sprites for the lit scene and enable lighting on them (Phaser 4 API)
        try {
          const spriteA = this.add.image(cx - 150, y + 120, 'lighting-sprite-a');
          spriteA.setLighting(true);
        } catch (_e) { /* lighting component not available */ }
        try {
          const spriteB = this.add.image(cx + 150, y + 120, 'lighting-sprite-b');
          spriteB.setLighting(true);
        } catch (_e) { /* lighting component not available */ }

        // Try to add a Light via the LightsManager
        try {
          this.lights.enable();
          this.light = this.lights.addLight(cx, y + 100, 300, 0xffffff, 1.0);
          this.logEvent('Light added successfully via LightsManager.');
        } catch (e) {
          this.logEvent(`Light add error: ${(e as Error).message}`);
          this.lightingAvailable = false;
        }
      } else {
        this.logEvent('WebGL renderer not available. Lighting not supported.');
        this.lightingAvailable = false;
      }
    } catch (e) {
      this.logEvent(`Lighting check error: ${(e as Error).message}`);
      this.lightingAvailable = false;
    }

    if (!this.lightingAvailable) {
      // Show fallback sprites without lighting
      this.add.image(cx - 150, y + 120, 'lighting-sprite-a');
      this.add.image(cx + 150, y + 120, 'lighting-sprite-b');
      createHudText(this, cx, y + 120, 'Lighting unavailable\n(showing fallback sprites)', '#ff8844', {
        fontSize: '12px',
        align: 'center',
      }).setOrigin(0.5);
    }

    y += 260;
    this.eventLogResult = createEventLog(this, y + 20, {
      headerText: '── Findings & Event Log ──',
      maxLines: 14,
      lineHeight: 16,
      textColor: '#aaddaa',
      fontSize: '10px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 20,
    });

    // Record findings
    this.logEvent('--- Lighting Spike Findings ---');
    this.logEvent(`WebGL available: ${this.lightingAvailable ? 'Yes' : 'No'}`);
    this.logEvent('Lighting in Phaser 4 requires WebGL context.');
    this.logEvent('Headless/canvas environments must fall back gracefully.');
    this.logEvent('Recommendation: make lighting optional with a feature flag.');
  }

  private toggleLight(): void {
    if (!this.lightingAvailable) {
      this.logEvent('Lighting not available on this platform.');
      return;
    }

    try {
      this.lightActive = !this.lightActive;
      if (this.light && this.light.intensity !== undefined) {
        this.light.setIntensity(this.lightActive ? 1.0 : 0.0);
        this.logEvent(`Light ${this.lightActive ? 'enabled' : 'disabled'} (intensity=${this.lightActive ? '1.0' : '0.0'}).`);
      } else {
        this.logEvent('No light reference available to toggle.');
      }
    } catch (e) {
      this.logEvent(`Light toggle error: ${(e as Error).message}`);
    }
  }

  private moveLight(): void {
    if (!this.lightingAvailable) {
      this.logEvent('Lighting not available; cannot move.');
      return;
    }

    // Move light to a new random position
    try {
      const cx = GAME_W / 2;
      const newX = cx + (Math.random() - 0.5) * 300;
      const newY = 160 + Math.random() * 200;
      // Move the stored light reference directly
      if (this.light) {
        this.light.x = newX;
        this.light.y = newY;
        this.logEvent(`Light moved to (${Math.round(newX)}, ${Math.round(newY)})`);
      } else {
        this.logEvent('No light reference available to move.');
      }
    } catch (e) {
      this.logEvent(`Move light error: ${(e as Error).message}`);
    }
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 14) this.eventLog.shift();
    // Guard against rendering before the eventLogResult has been created.
    if (this.eventLogResult && typeof this.eventLogResult.render === 'function') {
      try {
        this.eventLogResult.render(this.eventLog);
      } catch (_) {
        // Ignore render errors in headless/test environments.
      }
    }
  }
}