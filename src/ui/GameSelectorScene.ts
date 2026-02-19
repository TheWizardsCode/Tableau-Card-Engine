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

const GAME_W = 800;
const GAME_H = 600;
const FONT_FAMILY = 'monospace';

const CARD_W = 280;
const CARD_H = 200;
const CARD_GAP = 40;
const CARD_RADIUS = 12;
const CARD_BG = 0x1a3a1a;
const CARD_BG_HOVER = 0x2a5a2a;
const CARD_BORDER = 0x4a8a4a;
const CARD_BORDER_HOVER = 0x88ff88;

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

  private layoutGameCards(): void {
    const count = this.games.length;
    if (count === 0) return;

    // Calculate total width needed and starting x
    const totalWidth = count * CARD_W + (count - 1) * CARD_GAP;
    const startX = (GAME_W - totalWidth) / 2 + CARD_W / 2;
    const centerY = GAME_H / 2;

    for (let i = 0; i < count; i++) {
      const game = this.games[i];
      const x = startX + i * (CARD_W + CARD_GAP);
      this.createGameCard(x, centerY, game);
    }
  }

  private createGameCard(
    x: number,
    y: number,
    entry: GameEntry,
  ): void {
    // Card background
    const bg = this.add.graphics();
    this.drawCard(bg, x, y, CARD_BG, CARD_BORDER);

    // Title text
    const title = this.add
      .text(x, y - 40, entry.title, {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: CARD_W - 40 },
      })
      .setOrigin(0.5);

    // Description text
    this.add
      .text(x, y + 20, entry.description, {
        fontSize: '12px',
        color: '#aaddaa',
        fontFamily: FONT_FAMILY,
        align: 'center',
        wordWrap: { width: CARD_W - 40 },
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    // Play button
    const playBtn = this.add
      .text(x, y + CARD_H / 2 - 30, '[ Play ]', {
        fontSize: '16px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Interactive hit area covering the whole card
    const hitZone = this.add
      .zone(x, y, CARD_W, CARD_H)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      bg.clear();
      this.drawCard(bg, x, y, CARD_BG_HOVER, CARD_BORDER_HOVER);
      title.setColor('#aaffaa');
      playBtn.setColor('#aaffaa');
    });

    hitZone.on('pointerout', () => {
      bg.clear();
      this.drawCard(bg, x, y, CARD_BG, CARD_BORDER);
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
    fillColor: number,
    strokeColor: number,
  ): void {
    const left = x - CARD_W / 2;
    const top = y - CARD_H / 2;

    graphics.fillStyle(fillColor, 1);
    graphics.fillRoundedRect(left, top, CARD_W, CARD_H, CARD_RADIUS);
    graphics.lineStyle(2, strokeColor, 1);
    graphics.strokeRoundedRect(left, top, CARD_W, CARD_H, CARD_RADIUS);
  }
}
