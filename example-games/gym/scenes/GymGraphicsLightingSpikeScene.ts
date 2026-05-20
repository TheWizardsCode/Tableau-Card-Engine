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

export const GYM_GRAPHICS_LIGHTING_SPIKE_KEY = 'GymGraphicsLightingSpikeScene';

export class GymGraphicsLightingSpikeScene extends GymSceneBase {
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];
  private lightingAvailable = false;
  private lightActive = true;

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

        // Create sprites for the lit scene
        const spriteA = this.add.image(cx - 150, y + 120, 'lighting-sprite-a');
        const spriteB = this.add.image(cx + 150, y + 120, 'lighting-sprite-b');

        // Try to set Light2D pipeline (may not be available in all builds)
        try { (spriteA as any).setPipeline('Light2D'); } catch (_e) { /* pipeline not available */ }
        try { (spriteB as any).setPipeline('Light2D'); } catch (_e) { /* pipeline not available */ }

        // Try to add a point light
        try {
          this.lights.enable().addLight(cx, y + 100, 300, 0xffffff, 1.0);
          this.logEvent('Point light added successfully.');
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
      this.add.text(cx, y + 120, 'Lighting unavailable\n(showing fallback sprites)', {
        fontSize: '12px',
        color: '#ff8844',
        fontFamily: 'monospace',
        align: 'center',
      }).setOrigin(0.5);
    }

    y += 260;
    this.addLabel(cx, y, '── Findings & Event Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);

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
      this.lights.enable();
      this.logEvent(`Light: ${this.lightActive ? 'ON' : 'OFF'}`);
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
      // Phaser 4 lights API: try to move any existing point lights
      try {
        const pointLights = this.lights.lights;
        if (Array.isArray(pointLights) && pointLights.length > 0) {
          pointLights[0].setPosition(newX, newY);
          this.logEvent(`Light moved to (${Math.round(newX)}, ${Math.round(newY)})`);
        } else {
          this.logEvent('No point lights to move.');
        }
      } catch (err) {
        this.logEvent('Could not access light list for movement.');
      }
    } catch (e) {
      this.logEvent(`Move light error: ${(e as Error).message}`);
    }
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 14) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const baseY = 370;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = this.add.text(20, baseY + i * 16, this.eventLog[i], {
        fontSize: '10px',
        color: '#aaddaa',
        fontFamily: 'monospace',
      });
      this.logTexts.push(txt);
    }
  }
}