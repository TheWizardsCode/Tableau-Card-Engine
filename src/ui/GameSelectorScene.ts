/**
 * GameSelectorScene -- A reusable landing page that displays available
 * example games as clickable cards and starts the selected game's scene.
 *
 * The game catalogue can be provided in three ways (checked in order):
 * 1. Via `init(data)` when starting the scene: `scene.start('GameSelectorScene', { games })`
 * 2. Via the Phaser game registry: `game.registry.set('gameSelector.games', games)`
 * 3. Falls back to an empty list (shows nothing)
 *
 * The registry key used is exported as `REGISTRY_KEY_GAMES`.
 */
import Phaser from 'phaser';
import { GAME_W, GAME_H } from './constants';

// ── Types ──────────────────────────────────────────────────

export interface GameEntry {
  /** The Phaser scene key to start (must already be registered). */
  sceneKey: string;
  /** Display name shown on the card. */
  title: string;
  /** Short description (1-2 sentences). */
  description: string;
}

// ── Constants ──────────────────────────────────────────────

const SCENE_KEY = 'GameSelectorScene';

/** Registry key where the game catalogue is stored. */
export const REGISTRY_KEY_GAMES = 'gameSelector.games';

const FONT_FAMILY = 'monospace';

/** Maximum card dimensions -- actual size may shrink to fit the grid. */
const MAX_CARD_W = 340;
const MAX_CARD_H = 180;
const CARD_GAP = 24;
const CARD_RADIUS = 12;
const CARD_BG = 0x1a3a1a;
const CARD_BG_HOVER = 0x2a5a2a;
const CARD_BORDER = 0x4a8a4a;
const CARD_BORDER_HOVER = 0x88ff88;

/** Vertical space reserved for the heading area (title + subtitle). */
const HEADER_H = 110;
/** Horizontal and bottom margin around the card grid. */
const GRID_MARGIN = 30;

// ── Scene ──────────────────────────────────────────────────

export class GameSelectorScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEY;

  private games: GameEntry[] = [];

  constructor() {
    super({ key: SCENE_KEY });
  }

  init(data: { games?: GameEntry[] }): void {
    if (data.games) {
      this.games = data.games;
    } else {
      // Fall back to registry
      const fromRegistry = this.registry.get(REGISTRY_KEY_GAMES);
      if (Array.isArray(fromRegistry)) {
        this.games = fromRegistry as GameEntry[];
      }
    }
  }

  create(): void {
    // Background
    this.cameras.main.setBackgroundColor('#1a2a1a');

    // Title
    this.add
      .text(GAME_W / 2, 50, 'Tableau Card Engine', {
        fontSize: '32px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Subtitle
    this.add
      .text(GAME_W / 2, 85, 'Select a game to play', {
        fontSize: '16px',
        color: '#669966',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    // Layout game cards
    this.layoutGameCards();
  }

  // ── Adaptive grid layout ────────────────────────────────

  /**
   * Compute the number of columns for the grid.
   * Aims for the most balanced rectangular grid that fits within the
   * available width, preferring wider cards over more columns.
   */
  private computeGrid(count: number): { cols: number; rows: number } {
    if (count <= 2) return { cols: count, rows: 1 };
    if (count <= 4) return { cols: 2, rows: Math.ceil(count / 2) };
    if (count <= 6) return { cols: 3, rows: Math.ceil(count / 3) };
    // 7+ games: 4 columns
    return { cols: 4, rows: Math.ceil(count / 4) };
  }

  private layoutGameCards(): void {
    const count = this.games.length;
    if (count === 0) return;

    const { cols, rows } = this.computeGrid(count);

    // Available space for the card grid
    const availW = GAME_W - 2 * GRID_MARGIN;
    const availH = GAME_H - HEADER_H - GRID_MARGIN;

    // Card size: fit within the available space, capped at the maximums
    const cardW = Math.min(MAX_CARD_W, Math.floor((availW - (cols - 1) * CARD_GAP) / cols));
    const cardH = Math.min(MAX_CARD_H, Math.floor((availH - (rows - 1) * CARD_GAP) / rows));

    // Total grid size after sizing cards
    const gridW = cols * cardW + (cols - 1) * CARD_GAP;
    const gridH = rows * cardH + (rows - 1) * CARD_GAP;

    // Top-left origin so the grid is centered horizontally and vertically
    // in the space below the header.
    const originX = (GAME_W - gridW) / 2 + cardW / 2;
    const originY = HEADER_H + (availH - gridH) / 2 + cardH / 2;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = originX + col * (cardW + CARD_GAP);
      const y = originY + row * (cardH + CARD_GAP);
      this.createGameCard(x, y, cardW, cardH, this.games[i]);
    }
  }

  // ── Card rendering ─────────────────────────────────────

  private createGameCard(
    x: number,
    y: number,
    cardW: number,
    cardH: number,
    entry: GameEntry,
  ): void {
    const bg = this.add.graphics();
    this.drawCard(bg, x, y, cardW, cardH, CARD_BG, CARD_BORDER);

    const textWrap = cardW - 32;

    // Title
    const title = this.add
      .text(x, y - cardH / 2 + 28, entry.title, {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: textWrap },
      })
      .setOrigin(0.5, 0);

    // Description -- vertically centered between title bottom and play button top
    const descY = y + 4;
    const desc = this.add
      .text(x, descY, entry.description, {
        fontSize: '11px',
        color: '#aaddaa',
        fontFamily: FONT_FAMILY,
        align: 'center',
        wordWrap: { width: textWrap },
        lineSpacing: 2,
      })
      .setOrigin(0.5);

    // Crop description if it overflows the card body
    const maxDescH = cardH - 80; // leave room for title + play button
    if (desc.height > maxDescH) {
      desc.setCrop(0, 0, desc.width, maxDescH);
    }

    // Play button
    const playBtn = this.add
      .text(x, y + cardH / 2 - 22, '[ Play ]', {
        fontSize: '14px',
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
      title.setColor('#aaffaa');
      playBtn.setColor('#aaffaa');
    });

    hitZone.on('pointerout', () => {
      bg.clear();
      this.drawCard(bg, x, y, cardW, cardH, CARD_BG, CARD_BORDER);
      title.setColor('#ffffff');
      playBtn.setColor('#88ff88');
    });

    hitZone.on('pointerdown', () => {
      this.scene.start(entry.sceneKey);
    });
  }

  private drawCard(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    cardW: number,
    cardH: number,
    fillColor: number,
    strokeColor: number,
  ): void {
    const left = x - cardW / 2;
    const top = y - cardH / 2;

    graphics.fillStyle(fillColor, 1);
    graphics.fillRoundedRect(left, top, cardW, cardH, CARD_RADIUS);
    graphics.lineStyle(2, strokeColor, 1);
    graphics.strokeRoundedRect(left, top, cardW, cardH, CARD_RADIUS);
  }
}
