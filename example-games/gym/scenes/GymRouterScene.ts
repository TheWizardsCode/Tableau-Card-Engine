/**
 * GymRouterScene -- Landing page for the Gym that displays all
 * registered demo scenes as clickable cards and navigates to them.
 *
 * This scene is registered in the global Game Selector as a single
 * entry point. When the user selects "Gym" from the game catalogue,
 * they arrive here and can choose which engine feature to explore.
 *
 * @module example-games/gym/scenes/GymRouterScene
 */

import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../../src/ui/constants';
import { createSceneMenuButton } from '../../../src/ui/SceneHeader';
import { GYM_ROUTER_KEY, GYM_SCENE_CATALOGUE } from '../GymRegistry';
import type { GymSceneEntry } from '../GymRegistry';

// ── Layout constants ───────────────────────────────────────

const FONT_FAMILY = 'monospace';
const CARD_W = 320;
const CARD_H = 120;
const CARD_GAP = 16;
const CARD_RADIUS = 10;
const CARD_BG = 0x162216;
const CARD_BG_HOVER = 0x264a26;
const CARD_BORDER = 0x3a7a3a;
const CARD_BORDER_HOVER = 0x88ff88;
const HEADER_H = 70;
const GRID_MARGIN = 20;

// ── Scene ───────────────────────────────────────────────────

export class GymRouterScene extends Phaser.Scene {
  static readonly KEY = GYM_ROUTER_KEY;

  constructor() {
    super({ key: GYM_ROUTER_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');

    // Menu button (returns to Game Selector)
    createSceneMenuButton(this);

    // Title
    this.add
      .text(GAME_W / 2, 24, 'TCE Gym', {
        fontSize: '28px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Subtitle
    this.add
      .text(GAME_W / 2, 52, 'Select a scene to explore core-engine features', {
        fontSize: '13px',
        color: '#669966',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.layoutSceneCards();

    // Help for the router
    try {
      // Lazy-init help panel so the router doesn't crash headless tests
      (this as any).initHelp?.([{
        heading: 'Overview',
        body: 'The Gym is a collection of demo scenes that showcase core-engine features. Click any card to open that demo scene.'
      }, {
        heading: 'Navigation',
        body: 'Click a scene card to open it. Use the [ Menu ] button to return to the main Game Selector.'
      }]);
    } catch (_) { /* ignore in environments without help UI */ }
  }

  // ── Adaptive grid layout ────────────────────────────────

  private computeGrid(count: number): { cols: number; rows: number } {
    if (count <= 2) return { cols: count, rows: 1 };
    if (count <= 6) return { cols: 2, rows: Math.ceil(count / 2) };
    if (count <= 9) return { cols: 3, rows: Math.ceil(count / 3) };
    return { cols: 4, rows: Math.ceil(count / 4) };
  }

  private layoutSceneCards(): void {
    const entries = GYM_SCENE_CATALOGUE;
    const count = entries.length;
    if (count === 0) return;

    const { cols, rows } = this.computeGrid(count);
    const availW = GAME_W - 2 * GRID_MARGIN;
    const availH = GAME_H - HEADER_H - GRID_MARGIN;
    const cardW = Math.min(CARD_W, Math.floor((availW - (cols - 1) * CARD_GAP) / cols));
    const cardH = Math.min(CARD_H, Math.floor((availH - (rows - 1) * CARD_GAP) / rows));
    const gridW = cols * cardW + (cols - 1) * CARD_GAP;
    const gridH = rows * cardH + (rows - 1) * CARD_GAP;
    const originX = (GAME_W - gridW) / 2;
    const originY = HEADER_H + (availH - gridH) / 2;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = originX + col * (cardW + CARD_GAP) + cardW / 2;
      const y = originY + row * (cardH + CARD_GAP) + cardH / 2;
      this.createSceneCard(x, y, cardW, cardH, entries[i]);
    }
  }

  private createSceneCard(
    x: number,
    y: number,
    cardW: number,
    cardH: number,
    entry: GymSceneEntry,
  ): void {
    const bg = this.add.graphics();
    this.drawCard(bg, x, y, cardW, cardH, CARD_BG, CARD_BORDER);

    // Title
    const title = this.add
      .text(x, y - cardH / 2 + 18, entry.title, {
        fontSize: '15px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Description
    const desc = this.add
      .text(x, y + 6, entry.description, {
        fontSize: '10px',
        color: '#aaddaa',
        fontFamily: FONT_FAMILY,
        align: 'center',
        wordWrap: { width: cardW - 24 },
        lineSpacing: 2,
      })
      .setOrigin(0.5);

    // Crop description overflow
    const maxDescH = cardH - 60;
    if (desc.height > maxDescH) {
      desc.setCrop(0, 0, desc.width, maxDescH);
    }

    // "[ Open ]" button label
    const openLabel = this.add
      .text(x, y + cardH / 2 - 16, '[ Open ]', {
        fontSize: '13px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Interactive hit area
    const hitZone = this.add
      .zone(x, y, cardW, cardH)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      bg.clear();
      this.drawCard(bg, x, y, cardW, cardH, CARD_BG_HOVER, CARD_BORDER_HOVER);
      title.setColor('#ccffcc');
      openLabel.setColor('#bbffbb');
    });

    hitZone.on('pointerout', () => {
      bg.clear();
      this.drawCard(bg, x, y, cardW, cardH, CARD_BG, CARD_BORDER);
      title.setColor('#ffffff');
      openLabel.setColor('#88ff88');
    });

    hitZone.on('pointerdown', () => {
      this.scene.start(entry.sceneKey);
    });
  }

  private drawCard(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    stroke: number,
  ): void {
    const left = x - w / 2;
    const top = y - h / 2;
    g.fillStyle(fill, 1);
    g.fillRoundedRect(left, top, w, h, CARD_RADIUS);
    g.lineStyle(1.5, stroke, 1);
    g.strokeRoundedRect(left, top, w, h, CARD_RADIUS);
  }
}