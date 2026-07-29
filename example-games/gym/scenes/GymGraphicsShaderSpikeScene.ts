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
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymShaderSpikeLayoutJson from '../layouts/gym-shader-spike.layout.json';

// Parse the shared Shader Spike scene layout once at module load.
const SHADER_SPIKE_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymShaderSpikeLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function resolveShaderAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!SHADER_SPIKE_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  return anchorPoint(SHADER_SPIKE_LAYOUT, zone, anchor, viewport, 1);
}

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
      {
        heading: 'Features',
        body: 'Spike scene evaluating sprite tinting, blend modes (NORMAL, ADD, MULTIPLY, SCREEN), and WebGL shader feasibility. In a real card game, tinting highlights valid plays (green tint for playable cards), blend modes create visual layering effects for card overlaps or ghosted previews, and custom shaders could produce animated card borders, foil effects, or dynamic backgrounds.'
      },
      {
        heading: 'Controls',
        body: '[ Next Tint ]: Cycle through tint colours — None, Red, Green, Blue, Gold, Purple. Tint is applied to all three sample sprites simultaneously.\n[ Next Blend ]: Cycle through blend modes — NORMAL, ADD, MULTIPLY, SCREEN. Blend mode applies to all sprites.\n[ Reset Tint ]: Remove all tinting from sprites (reset to white/none).'
      },
      {
        heading: 'Usage Example',
        body: 'A developer building a card game wants to add visual feedback when a card can be played: green tint for valid targets, red tint for invalid ones. This spike verifies that Phaser\'s setTint() works reliably. The blend mode test checks whether ADD mode can create a "glowing" effect when two cards overlap. The shader spike evaluates whether more advanced effects like animated foil borders are feasible for future development.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ Next Tint ] six times → cycles through all 6 tint colours, status line updates\n2. Press [ Next Blend ] four times → cycles through all 4 blend modes, status line updates\n3. Press [ Reset Tint ] → all sprites return to white/none\n4. Verify status line shows current blend mode and tint colour correctly'
      }
    ]);

    const cx = GAME_W / 2;
    const controlsAnchor = resolveShaderAnchor('controls', 'center');
    const statusAnchor = resolveShaderAnchor('status', 'center');
    const contentAnchor = resolveShaderAnchor('content', 'center');
    const logAnchor = resolveShaderAnchor('log', 'center');
    const y = controlsAnchor.y;

    this.initButtonBar(y);
    this.buttonBar!.addButton('[ Next Tint ]', () => this.cycleTint(), { zone: 'center' });
    this.buttonBar!.addButton('[ Next Blend ]', () => this.cycleBlendMode(), { zone: 'center' });
    this.buttonBar!.addButton('[ Reset Tint ]', () => this.resetTint(), { zone: 'center' });
    this.statusLineText = createHudText(this, cx, statusAnchor.y, 'Blend: NORMAL | Tint: None', '#88ff88', { fontSize: '12px' }).setOrigin(0.5);

    // Create sample sprites at content anchor Y
    const spriteX = [cx - 180, cx, cx + 180];
    const spriteY = contentAnchor.y;
    for (let i = 0; i < 3; i++) {
      const key = ['spike-sprite-a', 'spike-sprite-b', 'spike-sprite-c'][i];
      const sprite = this.add.image(spriteX[i], spriteY, key);
      this.sprites.push(sprite);
    }

    this.eventLogResult = createEventLog(this, logAnchor.y + 20, {
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

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 12) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }
}