/**
 * GymTooltipScene -- Demonstrates the shared TooltipManager component.
 *
 * Features:
 *   - DOM-mode tooltip show/hide (HTML overlay)
 *   - Phaser-mode tooltip with game-object containers
 *   - Live tooltip positioning relative to interactive objects
 *   - Toggle between modes at runtime
 *
 * Layout is managed declaratively via the Screen Layout Language (SLL).
 * Zone anchors define primary positions; secondary positions are derived
 * relative to those anchors.
 *
 * @module example-games/gym/scenes/GymTooltipScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_TOOLTIP_KEY } from '../GymRegistry';
import { GAME_W, GAME_H, FONT_FAMILY, TooltipManager } from '../../../src/ui';
import { createHudText } from '../../../src/ui/Renderer';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymTooltipLayoutJson from '../layouts/gym-tooltip.layout.json';

// Parse the shared Tooltip scene layout once at module load.
const TOOLTIP_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymTooltipLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Resolve a primary anchor position from the SLL layout.
 * Falls back to the default viewport if no layout is available.
 */
function resolveAnchor(
  zone: string,
  anchor: string,
  viewport?: { width: number; height: number },
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!TOOLTIP_LAYOUT) {
    return { x: 0, y: 0 };
  }
  const vp = viewport ?? DEFAULT_VIEWPORT;
  return anchorPoint(TOOLTIP_LAYOUT, zone, anchor, vp, 1);
}

export class GymTooltipScene extends GymSceneBase {
  private domTooltipManager!: TooltipManager;
  private phaserTooltipManager!: TooltipManager;

  // Demo objects
  private demoCards: Phaser.GameObjects.Container[] = [];
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];

  // Mode toggle
  private useDomMode = true;

  constructor() {
    super({ key: GYM_TOOLTIP_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.initHeader('Tooltip Demo');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Overview',
        body: 'Demonstrates the shared TooltipManager in both DOM-overlay mode and Phaser GameObject mode. Hover over demo cards to see tooltips.',
      },
      {
        heading: 'Controls',
        body: '[ DOM Mode ] / [ Phaser Mode ]: Switch tooltip rendering mode.\n[ Show Demo Tooltip ]: Force-show a sample tooltip.\n[ Hide Tooltip ]: Hide any visible tooltip.\nHover over the coloured cards below to trigger contextual tooltips.',
      },
    ]);

    const headerAnchor = resolveAnchor('header', 'center');
    const labelAnchor = resolveAnchor('label', 'center');
    const contentAnchor = resolveAnchor('content', 'center');
    const logAnchor = resolveAnchor('log', 'center');

    // Mode toggle buttons — centred horizontally on header anchor, offset ±180/20/200/380
    this.addButton(headerAnchor.x - 180, headerAnchor.y, '[ DOM Mode ]', () => this.setMode(true));
    this.addButton(headerAnchor.x + 20, headerAnchor.y, '[ Phaser Mode ]', () => this.setMode(false));
    this.addButton(headerAnchor.x + 200, headerAnchor.y, '[ Show Demo ]', () => this.showDemoTooltip());
    this.addButton(headerAnchor.x + 380, headerAnchor.y, '[ Hide ]', () => this.hideTooltip());

    // Mode label — at label anchor y
    const modeLabel = createHudText(this, labelAnchor.x, labelAnchor.y, 'Mode: DOM overlay', '#88ccff', { fontSize: '16px' });
    modeLabel.setOrigin(0.5);
    modeLabel.setName('modeLabel');

    // Hover prompt — 50 px below label
    createHudText(this, labelAnchor.x, labelAnchor.y + 50, '── Hover over the cards below ──', '#6699aa', { fontSize: '14px' }).setOrigin(0.5);

    // Create interactive demo cards — at content anchor y
    this.createDemoCards(contentAnchor.y);

    // Event log header — at log anchor y
    createHudText(this, logAnchor.x, logAnchor.y, '── Event Log ──', '#6699aa', { fontSize: '12px' }).setOrigin(0.5);

    // Create tooltip managers
    this.domTooltipManager = new TooltipManager(this);

    this.phaserTooltipManager = new TooltipManager(this, undefined, {
      phaserRender: (container, scene, _hideTooltip, ctx) => {
        const cardName = ctx.cardName as string | undefined;
        if (!cardName) return container;

        const text = scene.add.text(0, 0, cardName, {
          fontSize: '14px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          wordWrap: { width: 200 },
        }).setOrigin(0, 0);

        const bg = scene.add.rectangle(0, 0, text.width + 16, text.height + 16, 0x000000, 0.9).setOrigin(0, 0);
        bg.setStrokeStyle(1, (ctx.borderColor as number) ?? 0x888888);

        text.setPosition(8, 8);
        container.add([bg, text]);
        container.setPosition(ctx.x ?? 0, ctx.y ?? 0);
        container.setDepth(800);
        return container;
      },
    });
  }

  private createDemoCards(startY: number): void {
    const cardData = [
      { name: '🔴 Red Card — Attack: Deal 3 damage', color: 0xcc3333, x: GAME_W / 2 - 200 },
      { name: '🔵 Blue Card — Shield: Block 2 damage', color: 0x3366cc, x: GAME_W / 2 },
      { name: '🟢 Green Card — Heal: Restore 2 HP', color: 0x33aa33, x: GAME_W / 2 + 200 },
    ];

    for (const data of cardData) {
      const card = this.add.container(data.x, startY);
      const bg = this.add.rectangle(0, 0, 150, 80, data.color, 0.8);
      bg.setStrokeStyle(2, 0xffffff);
      const label = createHudText(this, 0, 0, data.name.split(' — ')[0], '#ffffff', { fontSize: '14px' }).setOrigin(0.5);

      card.add([bg, label]);
      // Set hit area on the background rectangle for interactivity
      bg.setInteractive({ useHandCursor: true });

      bg.on('pointerover', () => {
        bg.setStrokeStyle(3, 0xffdd44);
        card.setScale(1.1);
        this.showCardTooltip(data.name, data.x, startY, data.color);
      });

      bg.on('pointerout', () => {
        bg.setStrokeStyle(2, 0xffffff);
        card.setScale(1.0);
        this.hideTooltip();
      });

      bg.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        this.showCardTooltip(data.name, pointer.x, pointer.y, data.color);
      });

      this.demoCards.push(card);
    }
  }

  private setMode(domMode: boolean): void {
    this.useDomMode = domMode;
    const label = this.children.getByName('modeLabel') as Phaser.GameObjects.Text | undefined;
    if (label) {
      label.setText(domMode ? 'Mode: DOM overlay' : 'Mode: Phaser GameObject');
    }
    this.logEvent(`Switched to ${domMode ? 'DOM' : 'Phaser'} mode`);
    this.hideTooltip();
  }

  private showCardTooltip(content: string, x: number, y: number, color: number): void {
    if (this.useDomMode) {
      this.domTooltipManager.show(content, x, y);
    } else {
      this.phaserTooltipManager.show('', x, y, {
        cardName: content,
        borderColor: color,
      });
    }
  }

  private showDemoTooltip(): void {
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    if (this.useDomMode) {
      this.domTooltipManager.show(
        'Demo Tooltip\nThis is a DOM-based overlay tooltip.\nIt uses an HTML div element.',
        cx, cy,
      );
    } else {
      this.phaserTooltipManager.show('', cx, cy, {
        cardName: 'Demo Tooltip\nThis is a Phaser-based tooltip.\nIt uses GameObject containers.',
        borderColor: 0xffaa00,
      });
    }
    this.logEvent('Demo tooltip shown');
  }

  private hideTooltip(): void {
    this.domTooltipManager.hide();
    this.phaserTooltipManager.hide();
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 10) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const logAnchor = resolveAnchor('log', 'center');
    // Event log entries start 70 px below the log header anchor
    const baseY = logAnchor.y + 70;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = createHudText(this, GAME_W / 2, baseY + i * 17, this.eventLog[i], '#aabbcc', { fontSize: '11px' }).setOrigin(0.5);
      this.logTexts.push(txt);
    }
  }

  shutdown(): void {
    this.domTooltipManager.destroy();
    this.phaserTooltipManager.destroy();
  }
}
