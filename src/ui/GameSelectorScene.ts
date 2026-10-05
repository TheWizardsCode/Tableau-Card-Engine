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
import { createVersionLabel } from './versionDisplay';
import { createAlphaBadge } from './AlphaBadge';
import { anchorPoint } from './screen-layout';
import type { ScreenLayoutDocument } from './screen-layout-schema';
import type { IncompatibleGame } from './game-manifest';

// ── Types ──────────────────────────────────────────────────

export interface GameEntry {
  /** The Phaser scene key to start (must already be registered). */
  sceneKey: string;
  /** Display name shown on the card. */
  title: string;
  /** Short description (1-2 sentences). */
  description: string;
  /**
   * Optional thumbnail reference shown on the card. Static games pass a
   * bare asset key (loaded from `assets/<key>.png`); runtime-plugin games
   * pass an already-resolved URL (e.g. `tce-games://<id>/assets/x.png`),
   * which is loaded directly from that URL.
   */
  thumbnail?: string;
  /**
   * When true, the card renders locked and cannot be started (Steam bonus
   * gating — see `steam-lock.ts`).
   */
  locked?: boolean;
  /** Explains how to unlock a locked card. */
  lockMessage?: string;
}

// ── Constants ──────────────────────────────────────────────

const SCENE_KEY = 'GameSelectorScene';

/** Registry key where the game catalogue is stored. */
export const REGISTRY_KEY_GAMES = 'gameSelector.games';

/**
 * Registry key where incompatible runtime games are stored (F5). The Game
 * Selector hides these from the grid and lists them in a notice instead.
 */
export const REGISTRY_KEY_INCOMPATIBLE_GAMES = 'gameSelector.incompatibleGames';

const FONT_FAMILY = 'monospace';

/**
 * SLL document for the Game Selector's non-grid chrome. Only the
 * incompatible-games notice needs a position here (the card grid keeps its
 * own adaptive layout); positioning it through `anchorPoint` keeps the
 * notice free of hardcoded pixel coordinates (runtime-plugin F5).
 */
const SELECTOR_LAYOUT: ScreenLayoutDocument = {
  version: 1,
  id: 'game-selector',
  baseViewport: { width: GAME_W, height: GAME_H },
  requiredZones: ['notice'],
  zones: {
    notice: {
      rect: { x: 0.5, y: 0.97 },
      anchors: {
        bottomCenter: { x: 0.5, y: 0.97 },
      },
    },
  },
};

/**
 * Vertical space reserved above the notice zone when incompatible games are
 * present, so the card grid never overlaps the notice. Not applied when
 * there is no notice — the static-only selector stays pixel-identical.
 */
const NOTICE_RESERVED_H = 48;

/** Regex matching any URL with a scheme (e.g. `tce-games://`, `data:`). */
const THUMBNAIL_URL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/** True when *thumbnail* is an already-resolved URL rather than an asset key. */
function isThumbnailUrl(thumbnail: string): boolean {
  return THUMBNAIL_URL_PATTERN.test(thumbnail);
}

/**
 * Shape guard for registry-sourced incompatible-game notices. The registry is
 * an untyped store, so a malformed value must be ignored rather than crash
 * the selector (graceful degradation, AC4).
 */
function isIncompatibleGame(value: unknown): value is IncompatibleGame {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { entry?: unknown; reason?: unknown };
  if (typeof candidate.reason !== 'string') return false;
  if (typeof candidate.entry !== 'object' || candidate.entry === null) return false;
  return typeof (candidate.entry as { title?: unknown }).title === 'string';
}

/** Maximum card dimensions -- actual size may shrink to fit the grid. */
const MAX_CARD_W = 400;
const MAX_CARD_H = 180;
const CARD_GAP = 24;
const CARD_RADIUS = 12;
const CARD_BG = 0x1a3a1a;
const CARD_BG_HOVER = 0x2a5a2a;
const CARD_BORDER = 0x4a8a4a;
const CARD_BORDER_HOVER = 0x88ff88;
/** Locked-card palette (dimmed, no interaction highlight). */
const LOCKED_CARD_BG = 0x141d16;
const LOCKED_CARD_BG_HOVER = 0x1c281e;
const LOCKED_CARD_BORDER = 0x3a4a3a;
const LOCKED_TITLE = '#7f9a7f';
const LOCKED_LABEL = '#668866';
const LOCK_MESSAGE_COLOR = '#c9a65a';

/** Thumbnail dimensions (16:9 aspect ratio, fits within card right side). */
const THUMB_W = 120;
const THUMB_H = 68;
/** Padding between description text and thumbnail. */
const THUMB_PAD = 8;

/** Vertical space reserved for the heading area (title + subtitle). */
const HEADER_H = 80;
/** Horizontal and bottom margin around the card grid. */
const GRID_MARGIN = 20;

// ── Top-right branding group (GitHub icon + version label) ──

/** Margin from the top-right canvas edges for the branding group. */
const BRAND_MARGIN = 10;
/** GitHub Octocat icon size (px) — matches the inline SVG dimensions. */
const GITHUB_ICON_SIZE = 28;
/** Vertical gap (px) between the GitHub icon and the version label. */
const BRAND_GAP = 4;

// ── Scene ──────────────────────────────────────────────────

export class GameSelectorScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEY;

  private games: GameEntry[] = [];
  private incompatibleGames: IncompatibleGame[] = [];

  constructor() {
    super({ key: SCENE_KEY });
  }

  init(data: { games?: GameEntry[]; incompatibleGames?: IncompatibleGame[] }): void {
    if (data.games) {
      this.games = data.games;
    } else {
      // Fall back to registry
      const fromRegistry = this.registry.get(REGISTRY_KEY_GAMES);
      if (Array.isArray(fromRegistry)) {
        this.games = fromRegistry as GameEntry[];
      }
    }

    if (data.incompatibleGames) {
      this.incompatibleGames = data.incompatibleGames.filter(isIncompatibleGame);
    } else {
      const fromRegistry = this.registry.get(REGISTRY_KEY_INCOMPATIBLE_GAMES);
      if (Array.isArray(fromRegistry)) {
        this.incompatibleGames = fromRegistry.filter(isIncompatibleGame);
      }
    }
  }

  preload(): void {
    for (const entry of this.games) {
      if (!entry.thumbnail) continue;
      // Static entries carry a bare asset key; runtime-plugin entries carry an
      // already-resolved URL (e.g. `tce-games://…`) and are loaded directly.
      const url = isThumbnailUrl(entry.thumbnail)
        ? entry.thumbnail
        : `assets/${entry.thumbnail}.png`;
      this.load.image(entry.thumbnail, url);
    }

    // Load GitHub Octocat icon from inline SVG data URI
    const githubSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 98 96" width="28" height="28"><path fill="#ffffff" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></svg>`;
    const githubIconUri = `data:image/svg+xml,${encodeURIComponent(githubSvgContent)}`;
    this.load.image('github-icon', githubIconUri);
  }

  create(): void {
    // Background
    this.cameras.main.setBackgroundColor('#1a2a1a');

    // Title
    this.add
      .text(GAME_W / 2, 30, 'Tableau Card Engine', {
        fontSize: '32px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Subtitle
    this.add
      .text(GAME_W / 2, 58, 'Select a game to play', {
        fontSize: '16px',
        color: '#669966',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    // ALPHA badge stacked above/over the menu title
    createAlphaBadge(this, {
      x: GAME_W / 2,
      titleY: 30,
      titleFontSizePx: 32,
    });

    // Layout game cards
    this.layoutGameCards();

    // Runtime-plugin incompatibility notice (hidden games + reason)
    this.renderIncompatibleNotice();

    // Version label (top-right corner, below the GitHub icon)
    createVersionLabel(
      this,
      undefined, // default depth
      GAME_W - BRAND_MARGIN, // right-aligned with the icon
      BRAND_MARGIN + GITHUB_ICON_SIZE + BRAND_GAP, // just below the icon
      1, // originX: right edge
      0, // originY: top edge
    );

    // GitHub link (top-right corner)
    this.createGitHubLink();
  }

  /**
   * Create a clickable GitHub icon link in the top-right corner.
   * Uses the GitHub Octocat logo and opens the repository in a new browser tab.
   */
  private createGitHubLink(): void {
    const GITHUB_URL = 'https://github.com/TheWizardsCode/Tableau-Card-Engine';
    const ICON_X = GAME_W - BRAND_MARGIN;
    const ICON_Y = BRAND_MARGIN;

    // GitHub Octocat icon (loaded from SVG in preload)
    const logo = this.add.image(ICON_X, ICON_Y, 'github-icon');
    logo.setOrigin(1, 0); // top-right anchor
    logo.setDepth(800);

    // Make clickable
    logo.setInteractive({ useHandCursor: true });
    logo.on('pointerdown', () => {
      window.open(GITHUB_URL, '_blank');
    });

    // Accessible alt text (invisible label for screen readers)
    this.add.text(ICON_X, ICON_Y, 'GitHub repository', {
      fontSize: '1px',
      color: 'transparent',
    }).setOrigin(1, 0).setDepth(800);
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
    if (count <= 9) return { cols: 3, rows: Math.ceil(count / 3) };
    // 10+ games: 4 columns
    return { cols: 4, rows: Math.ceil(count / 4) };
  }

  private layoutGameCards(): void {
    const count = this.games.length;
    if (count === 0) return;

    const { cols, rows } = this.computeGrid(count);

    // Available space for the card grid. When incompatible runtime games are
    // listed in the notice, reserve a band at the bottom so the grid does not
    // overlap it.
    const availW = GAME_W - 2 * GRID_MARGIN;
    const noticeReserve = this.incompatibleGames.length > 0 ? NOTICE_RESERVED_H : 0;
    const availH = GAME_H - HEADER_H - GRID_MARGIN - noticeReserve;

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

  // ── Incompatible runtime games notice ──────────────────

  /**
   * Render a non-blocking notice listing runtime games that were discovered
   * but cannot run under this launcher's core-engine version. The games are
   * absent from the card grid (they are never part of `this.games`).
   *
   * Positioned through SLL (`anchorPoint`) so no pixel coordinates are
   * hardcoded here.
   */
  private renderIncompatibleNotice(): void {
    if (this.incompatibleGames.length === 0) return;

    const point = anchorPoint(SELECTOR_LAYOUT, 'notice', 'bottomCenter', {
      width: GAME_W,
      height: GAME_H,
    });

    const body = this.incompatibleGames
      .map((game) => `Incompatible game: ${game.entry.title} — ${game.reason}`)
      .join('\n');

    this.add
      .text(point.x, point.y, body, {
        fontSize: '12px',
        color: '#ffcc66',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 2,
        wordWrap: { width: GAME_W - 2 * GRID_MARGIN },
      })
      .setOrigin(0.5, 1);
  }

  // ── Card rendering ─────────────────────────────────────

  /**
   * Check whether a thumbnail texture is available in the texture manager.
   * Returns false if the entry has no thumbnail key or the texture was not loaded.
   */
  private hasThumbnail(entry: GameEntry): boolean {
    if (!entry.thumbnail) return false;
    return this.textures.exists(entry.thumbnail);
  }

  private createGameCard(
    x: number,
    y: number,
    cardW: number,
    cardH: number,
    entry: GameEntry,
  ): void {
    const bg = this.add.graphics();
    const locked = entry.locked === true;
    const idleBg = locked ? LOCKED_CARD_BG : CARD_BG;
    const idleBorder = locked ? LOCKED_CARD_BORDER : CARD_BORDER;
    const hoverBg = locked ? LOCKED_CARD_BG_HOVER : CARD_BG_HOVER;
    const hoverBorder = locked ? CARD_BORDER : CARD_BORDER_HOVER;
    this.drawCard(bg, x, y, cardW, cardH, idleBg, idleBorder);

    const showThumb = this.hasThumbnail(entry);

    // When thumbnail is present, reserve space on the right for the image.
    // Description text is left-aligned in the remaining space.
    const thumbAreaW = showThumb ? THUMB_W + THUMB_PAD : 0;
    const textAreaW = cardW - 32 - thumbAreaW;
    const textAlign = showThumb ? 'left' : 'center';
    const textOriginX = showThumb ? 0 : 0.5;
    const textX = showThumb ? x - cardW / 2 + 16 : x;

    // Title
    const title = this.add
      .text(x, y - cardH / 2 + 28, entry.title, {
        fontSize: '18px',
        color: locked ? LOCKED_TITLE : '#ffffff',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: cardW - 32 },
      })
      .setOrigin(0.5, 0);

    // Description -- vertically centered between title bottom and play button top
    const descY = y + 4;
    const desc = this.add
      .text(textX, descY, entry.description, {
        fontSize: '11px',
        color: '#aaddaa',
        fontFamily: FONT_FAMILY,
        align: textAlign,
        wordWrap: { width: textAreaW },
        lineSpacing: 2,
      })
      .setOrigin(textOriginX, 0.5);

    // Crop description if it overflows the card body
    const maxDescH = cardH - 80; // leave room for title + play button
    if (desc.height > maxDescH) {
      desc.setCrop(0, 0, desc.width, maxDescH);
    }

    // Thumbnail image (right side of card)
    if (showThumb && entry.thumbnail) {
      const thumbX = x + cardW / 2 - 16 - THUMB_W / 2;
      const thumbY = y;
      const thumb = this.add.image(thumbX, thumbY, entry.thumbnail);
      thumb.setDisplaySize(THUMB_W, THUMB_H);
    }

    // Play button (a locked card shows a lock action that does nothing)
    const playBtn = this.add
      .text(x, y + cardH / 2 - 22, locked ? '[ Locked ]' : '[ Play ]', {
        fontSize: '14px',
        color: locked ? LOCKED_LABEL : '#88ff88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Lock message (locked cards only): explains how to unlock the game.
    if (locked && entry.lockMessage) {
      this.add
        .text(x, y + cardH / 2 - 44, `🔒 ${entry.lockMessage}`, {
          fontSize: '11px',
          color: LOCK_MESSAGE_COLOR,
          fontFamily: FONT_FAMILY,
          align: 'center',
          wordWrap: { width: cardW - 32 },
        })
        .setOrigin(0.5, 1);
    }

    // Interactive hit area
    const hitZone = this.add
      .zone(x, y, cardW, cardH)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      bg.clear();
      this.drawCard(bg, x, y, cardW, cardH, hoverBg, hoverBorder);
      title.setColor(locked ? LOCK_MESSAGE_COLOR : '#aaffaa');
      playBtn.setColor(locked ? LOCK_MESSAGE_COLOR : '#aaffaa');
    });

    hitZone.on('pointerout', () => {
      bg.clear();
      this.drawCard(bg, x, y, cardW, cardH, idleBg, idleBorder);
      title.setColor(locked ? LOCKED_TITLE : '#ffffff');
      playBtn.setColor(locked ? LOCKED_LABEL : '#88ff88');
    });

    hitZone.on('pointerdown', () => {
      // A locked card never starts its scene; the lock message explains why.
      if (locked) return;
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
