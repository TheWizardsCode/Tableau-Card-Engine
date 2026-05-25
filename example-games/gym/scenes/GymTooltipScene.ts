/**
 * GymTooltipScene -- Demonstrates the shared TooltipManager component.
 *
 * Features:
 *   - DOM-mode tooltip show/hide (HTML overlay)
 *   - Phaser-mode tooltip with game-object containers
 *   - Live tooltip positioning relative to interactive objects
 *   - Toggle between modes at runtime
 *
 * @module example-games/gym/scenes/GymTooltipScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_TOOLTIP_KEY } from '../GymRegistry';
import { GAME_W, GAME_H, FONT_FAMILY, TooltipManager } from '../../../src/ui';

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

    const cx = GAME_W / 2;
    let y = 60;

    // Mode toggle buttons
    this.addButton(cx - 180, y, '[ DOM Mode ]', () => this.setMode(true));
    this.addButton(cx + 20, y, '[ Phaser Mode ]', () => this.setMode(false));
    this.addButton(cx + 200, y, '[ Show Demo ]', () => this.showDemoTooltip());
    this.addButton(cx + 380, y, '[ Hide ]', () => this.hideTooltip());

    y += 40;
    const modeLabel = this.addLabel(cx, y, 'Mode: DOM overlay', { fontSize: '16px', color: '#88ccff' });
    modeLabel.setOrigin(0.5);
    modeLabel.setName('modeLabel');

    y += 50;
    this.addLabel(cx, y, '── Hover over the cards below ──', { fontSize: '14px', color: '#6699aa' }).setOrigin(0.5);

    // Create interactive demo cards
    y += 50;
    this.createDemoCards(y);

    y += 180;
    this.addLabel(cx, y, '── Event Log ──', { fontSize: '12px', color: '#6699aa' }).setOrigin(0.5);

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
      const label = this.add.text(0, 0, data.name.split(' — ')[0], {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);

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
    const baseY = 450;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = this.add.text(GAME_W / 2, baseY + i * 17, this.eventLog[i], {
        fontSize: '11px',
        color: '#aabbcc',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.logTexts.push(txt);
    }
  }

  shutdown(): void {
    this.domTooltipManager.destroy();
    this.phaserTooltipManager.destroy();
  }
}
