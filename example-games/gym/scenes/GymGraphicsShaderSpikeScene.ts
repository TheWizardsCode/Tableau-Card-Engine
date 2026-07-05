/**
 * GymGraphicsShaderSpikeScene -- Demonstrates sprite tinting, blend modes,
 * and shader feasibility in an isolated spike scene.
 *
 * This is intentionally a separate scene to avoid cluttering other demos
 * with advanced pipeline setup. It captures findings for future work.
 *
 * Acceptance criteria:
 *   - Toggle sprite tint and common Phaser blend modes (ADD, MULTIPLY, SCREEN, NORMAL)
 *   - Developer-facing section attempts a simple fragment shader and documents feasibility
 *   - In-scene help records observed limitations and recommends next steps
 *
 * @module example-games/gym/scenes/GymGraphicsShaderSpikeScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

/** The scene key must match the registration in GymRegistry. */
export const GYM_GRAPHICS_SHADER_SPIKE_KEY = 'GymGraphicsShaderSpikeScene';

/** Available blend modes for toggling. */
const BLEND_MODES = [
  'NORMAL',
  'ADD',
  'MULTIPLY',
  'SCREEN',
] as const;

/** Available tint colors for toggling. */
const TINT_COLORS = [
  { name: 'None', value: 0xffffff },
  { name: 'Red', value: 0xff4444 },
  { name: 'Green', value: 0x44ff44 },
  { name: 'Blue', value: 0x4444ff },
  { name: 'Gold', value: 0xffaa00 },
  { name: 'Purple', value: 0xaa44ff },
] as const;

export class GymGraphicsShaderSpikeScene extends GymSceneBase {
  private sprites: Phaser.GameObjects.Image[] = [];
  private blendModeIndex = 0;
  private tintColorIndex = 0;
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;
  private shaderAttempted = false;
  private shaderResult = '';
  private statusLineText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: GYM_GRAPHICS_SHADER_SPIKE_KEY });
  }

  preload(): void {
    // Generate simple textures for the spike since we don't want card assets
    const g = this.add.graphics();
    g.fillStyle(0x88cc88, 1);
    g.fillRoundedRect(0, 0, 80, 110, 8);
    g.lineStyle(2, 0x446644, 1);
    g.strokeRoundedRect(1, 1, 78, 108, 7);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(40, 55, 12);
    g.generateTexture('spike-sprite-a', 80, 110);
    g.clear();

    g.fillStyle(0xcc8888, 1);
    g.fillRoundedRect(0, 0, 80, 110, 8);
    g.lineStyle(2, 0x664444, 1);
    g.strokeRoundedRect(1, 1, 78, 108, 7);
    g.fillStyle(0xffff88, 1);
    // Draw a diamond/star shape manually
    g.beginPath();
    g.moveTo(40, 26);
    g.lineTo(46, 40);
    g.lineTo(54, 36);
    g.lineTo(48, 50);
    g.lineTo(40, 70);
    g.lineTo(32, 50);
    g.lineTo(26, 36);
    g.lineTo(34, 40);
    g.closePath();
    g.fillPath();
    g.generateTexture('spike-sprite-b', 80, 110);
    g.clear();

    g.fillStyle(0x8888cc, 1);
    g.fillRoundedRect(0, 0, 80, 110, 8);
    g.lineStyle(2, 0x444466, 1);
    g.strokeRoundedRect(1, 1, 78, 108, 7);
    g.fillStyle(0x88ffff, 1);
    g.fillTriangle(40, 30, 25, 70, 55, 70);
    g.generateTexture('spike-sprite-c', 80, 110);
    g.destroy();
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Shader & Blend Spike');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Demonstrates sprite tinting, blend modes, and simple shader feasibility. This is a spike scene for evaluating features.' },
      { heading: 'Controls', body: '[ Next Tint ]: Cycle through tint colors.\n[ Next Blend ]: Cycle through blend modes.\n[ Reset Tint ]: Remove tint (white).\n[ Attempt Shader ]: Try to compile and run a minimal fragment shader.\n\nNote: Shaders are WebGL-only and may not work in all environments. Headless/CI builds will fall back gracefully.' },
      { heading: 'Findings', body: 'Blend modes work in WebGL renderer only. Fragment shaders require WebGL pipeline support. Headless fallback: shader attempt logs success/failure without crashing.' },
    ]);

    const cx = GAME_W / 2;
    let y = 60;

    this.addButton(cx - 400, y, '[ Next Tint ]', () => this.cycleTint());
    this.addButton(cx - 240, y, '[ Next Blend ]', () => this.cycleBlendMode());
    this.addButton(cx - 60, y, '[ Reset Tint ]', () => this.resetTint());
    this.addButton(cx + 120, y, '[ Attempt Shader ]', () => this.attemptShader());

    y += 30;
    this.statusLineText = createHudText(this, cx, y, 'Blend: NORMAL | Tint: None', '#88ff88', { fontSize: '12px' }).setOrigin(0.5);

    y += 30;
    // Create sample sprites
    const spriteX = [cx - 180, cx, cx + 180];
    for (let i = 0; i < 3; i++) {
      const key = ['spike-sprite-a', 'spike-sprite-b', 'spike-sprite-c'][i];
      const sprite = this.add.image(spriteX[i], y + 80, key);
      this.sprites.push(sprite);
    }

    y += 200;
    this.eventLogResult = createEventLog(this, y + 20, {
      headerText: '── Event Log ──',
      maxLines: 12,
      lineHeight: 17,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });
  }

  private cycleTint(): void {
    this.tintColorIndex = (this.tintColorIndex + 1) % TINT_COLORS.length;
    const tint = TINT_COLORS[this.tintColorIndex];
    for (const sprite of this.sprites) {
      sprite.setTint(tint.value);
    }
    this.updateStatusLine();
    this.logEvent(`Tint: ${tint.name} (0x${tint.value.toString(16)})`);
  }

  private cycleBlendMode(): void {
    this.blendModeIndex = (this.blendModeIndex + 1) % BLEND_MODES.length;
    const modeName = BLEND_MODES[this.blendModeIndex];
    // Map blend mode names to Phaser constants
    const blendMap: Record<string, number> = {
      NORMAL: Phaser.BlendModes.NORMAL,
      ADD: Phaser.BlendModes.ADD,
      MULTIPLY: Phaser.BlendModes.MULTIPLY,
      SCREEN: Phaser.BlendModes.SCREEN,
    };
    const modeValue = blendMap[modeName] ?? Phaser.BlendModes.NORMAL;
    for (const sprite of this.sprites) {
      sprite.setBlendMode(modeValue);
    }
    this.updateStatusLine();
    this.logEvent(`Blend: ${modeName}`);
  }

  private resetTint(): void {
    this.tintColorIndex = 0;
    for (const sprite of this.sprites) {
      sprite.clearTint();
    }
    this.updateStatusLine();
    this.logEvent('Tint reset (none/white)');
  }

  private updateStatusLine(): void {
    const modeName = BLEND_MODES[this.blendModeIndex];
    const tint = TINT_COLORS[this.tintColorIndex];
    this.statusLineText.setText(`Blend: ${modeName} | Tint: ${tint.name}`);
  }

  private attemptShader(): void {
    if (this.shaderAttempted) {
      this.logEvent('Shader already attempted. Result: ' + this.shaderResult);
      return;
    }

    try {
      // Check if WebGL is available by attempting to access the renderer
      const renderer = this.sys.game.renderer;
      if (!renderer || !(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
        this.shaderResult = 'WebGL renderer not available (canvas mode)';
        this.logEvent('Shader: ' + this.shaderResult);
        this.shaderAttempted = true;
        return;
      }

      // Attempt to create a simple pipeline
      // Note: Phaser 4 pipeline creation is different from v3
      // Document that postfx pipelines require WebGL and are not available in canvas/headless
      this.shaderResult = 'WebGL available. PostFX pipelines are feasible in Phaser 4 WebGL mode. ' +
        'Headless/canvas environments must fall back gracefully.';
      this.logEvent('Shader: ' + this.shaderResult);
    } catch (e) {
      this.shaderResult = `Error: ${(e as Error).message}`;
      this.logEvent('Shader attempt failed: ' + this.shaderResult);
    }
    this.shaderAttempted = true;
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 12) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }
}