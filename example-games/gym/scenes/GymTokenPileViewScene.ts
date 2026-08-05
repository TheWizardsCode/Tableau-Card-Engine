/**
 * GymTokenPileViewScene -- Demonstrates TokenPileView reusable component
 * for token/counter piles where cards aren't the only visual model.
 *
 * Features:
 *   - Multiple token piles with different renderers (simple coloured tokens,
 *     card-back tokens, custom renderer, feudalism-style tokens)
 *   - Add/remove operations with live count label updates
 *   - Click interaction with event log output
 *   - Both built-in renderers side by side
 *   - Reduced-motion support
 *
 * @module example-games/gym/scenes/GymTokenPileViewScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_TOKEN_PILE_VIEW_KEY } from '../GymRegistry';
import { createHudText } from '../../../src/ui/Renderer';
import {
  TokenPileView,
  createSimpleTokenRenderer,
  createCardBackTokenRenderer,
  createFeudalismTokenRenderer,
} from '../../../src/ui/TokenPileView';
import { createEventLog, type EventLogResult } from '../../../src/ui/GymSceneUtils';
import { ensureCardTextureFallbacks } from '../../../src/ui/CardTextureHelpers';

// ── Token data types ────────────────────────────────────────

interface ResourceToken {
  type: string;
  count: number;
}

interface CardBackToken {
  cardType?: string;
}

interface CustomShapeToken {
  shape: 'circle' | 'square' | 'diamond' | 'star';
  color: number;
  count: number;
}

interface FeudalismToken {
  type: string;
  count: number;
}

// ── Scene ────────────────────────────────────────────────────

export class GymTokenPileViewScene extends GymSceneBase {
  // Token piles
  private resourcePile!: TokenPileView<ResourceToken>;
  private cardBackPile!: TokenPileView<CardBackToken>;
  private customPile!: TokenPileView<CustomShapeToken>;
  private feudalismPile!: TokenPileView<FeudalismToken>;

  // Token data
  private resourceTokens: ResourceToken[] = [];
  private cardBackTokens: CardBackToken[] = [];
  private customTokens: CustomShapeToken[] = [];
  private feudalismTokens: FeudalismToken[] = [];

  // Event log
  private eventLog!: EventLogResult;
  private logEntries: string[] = [];

  // Public accessors for testing
  /** @internal Whether the simple token renderer is in use. */
  readonly hasSimpleTokenRenderer = true;
  /** @internal Whether the card back renderer is in use. */
  readonly hasCardBackRenderer = true;
  /** @internal Whether a custom renderer is in use. */
  readonly hasCustomRenderer = true;

  constructor() {
    super({ key: GYM_TOKEN_PILE_VIEW_KEY });
  }

  preload(): void {
    // Preload card back texture for card-back renderer
    this.load.image('card_back', 'assets/cards/classic-vector/back.png');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Token Pile View Demo');
    this.addDivider();
    this.initReducedMotion();

    ensureCardTextureFallbacks(this);

    // ── Layout constants ──────────────────────────────────

    const pilesStartX = 180;
    const pilesStartY = 100;
    const pileSpacingX = 220;

    // ── 1. Simple token renderer pile ─────────────────────

    this.resourceTokens = this.createDefaultResourceTokens();

    this.resourcePile = new TokenPileView<ResourceToken>(this, {
      x: pilesStartX,
      y: pilesStartY,
      label: 'Resources',
      tokenRadius: 16,
      tokenRenderer: createSimpleTokenRenderer(this, 0x333333),
      count: this.resourceTokens.reduce((sum, t) => sum + t.count, 0),
    });
    this.resourcePile.setTokens(this.resourceTokens);
    this.resourcePile.onClick(() => {
      this.logEvent('Clicked Resources pile');
    });

    // ── 2. Card-back token renderer pile ──────────────────

    this.cardBackTokens = this.createDefaultCardBackTokens();

    // Create an in-memory card texture for the renderer using Phaser's
    // texture generation to avoid relying on actual card sprite assets.
    // We use a generateTexture approach for a simple card-back-like shape.
    const cardBackKey = 'gym_token_card_back';
    if (!this.textures.exists(cardBackKey)) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0x335577, 1);
      gfx.fillRoundedRect(0, 0, 48, 68, 4);
      gfx.lineStyle(2, 0x88aacc, 1);
      gfx.strokeRoundedRect(0, 0, 48, 68, 4);
      gfx.generateTexture(cardBackKey, 48, 68);
      gfx.destroy();
    }

    this.cardBackPile = new TokenPileView<CardBackToken>(this, {
      x: pilesStartX + pileSpacingX,
      y: pilesStartY,
      label: 'Card Backs',
      tokenRadius: 24,
      tokenRenderer: createCardBackTokenRenderer(cardBackKey),
      count: this.cardBackTokens.length,
    });
    this.cardBackPile.setTokens(this.cardBackTokens);
    this.cardBackPile.onClick(() => {
      this.logEvent('Clicked Card Backs pile');
    });

    // ── 3. Custom renderer pile ───────────────────────────

    this.customTokens = this.createDefaultCustomTokens();

    this.customPile = new TokenPileView<CustomShapeToken>(this, {
      x: pilesStartX + pileSpacingX * 2,
      y: pilesStartY,
      label: 'Shapes',
      tokenRadius: 18,
      tokenRenderer: this.customShapeRenderer.bind(this),
      count: this.customTokens.reduce((sum, t) => sum + t.count, 0),
    });
    this.customPile.setTokens(this.customTokens);
    this.customPile.onClick(() => {
      this.logEvent('Clicked Shapes pile');
    });

    // ── 4. Feudalism-style token renderer pile ────────────

    this.feudalismTokens = this.createDefaultFeudalismTokens();

    this.feudalismPile = new TokenPileView<FeudalismToken>(this, {
      x: pilesStartX + pileSpacingX * 3,
      y: pilesStartY,
      label: 'Feudalism',
      tokenRadius: 16,
      tokenRenderer: createFeudalismTokenRenderer(0xffffff),
      count: this.feudalismTokens.reduce((sum, t) => sum + t.count, 0),
    });
    this.feudalismPile.setTokens(this.feudalismTokens);
    this.feudalismPile.onClick(() => {
      this.logEvent('Clicked Feudalism pile');
    });

    // ── Controls ──────────────────────────────────────────

    const controlsY = pilesStartY + 120;
    const btnLabels = [
      { label: '[ +Resource ]', pileIdx: 0, action: 'add' },
      { label: '[ -Resource ]', pileIdx: 0, action: 'remove' },
      { label: '[ +Card Back ]', pileIdx: 1, action: 'add' },
      { label: '[ -Card Back ]', pileIdx: 1, action: 'remove' },
      { label: '[ +Shape ]', pileIdx: 2, action: 'add' },
      { label: '[ -Shape ]', pileIdx: 2, action: 'remove' },
      { label: '[ +Feudal ]', pileIdx: 3, action: 'add' },
      { label: '[ -Feudal ]', pileIdx: 3, action: 'remove' },
      { label: '[ Reset All ]', pileIdx: -1, action: 'reset' },
    ];

    this.initButtonBar(controlsY);
    btnLabels.forEach((cfg) => {
      const isAdd = cfg.action === 'add';
      const isReset = cfg.action === 'reset';
      this.buttonBar!.addButton(
        cfg.label,
        () => {
          if (isReset) {
            this.resetPiles();
          } else if (isAdd) {
            this.addTokenToPile(cfg.pileIdx);
          } else {
            this.removeTokenFromPile(cfg.pileIdx);
          }
        },
        { zone: 'center', fontSize: '12px' },
      );
    });

    // ── Pile labels below controls ────────────────────────

    const labelY = controlsY + 70;
    const pileLabels = [
      { text: 'Resource tokens', x: pilesStartX },
      { text: 'Card-back tokens', x: pilesStartX + pileSpacingX },
      { text: 'Custom shapes', x: pilesStartX + pileSpacingX * 2 },
      { text: 'Feudalism tokens', x: pilesStartX + pileSpacingX * 3 },
    ];

    for (const pl of pileLabels) {
      createHudText(this, pl.x, labelY, pl.text, '#aaccaa', { fontSize: '11px' }).setOrigin(0.5, 0);
    }

    // ── Renderer labels ───────────────────────────────────

    const rendererLabelY = labelY + 20;
    const rendererLabels = [
      { text: 'Renderer: createSimpleTokenRenderer', x: pilesStartX },
      { text: 'Renderer: createCardBackTokenRenderer', x: pilesStartX + pileSpacingX },
      { text: 'Renderer: custom shape renderer', x: pilesStartX + pileSpacingX * 2 },
      { text: 'Renderer: createFeudalismTokenRenderer', x: pilesStartX + pileSpacingX * 3 },
    ];

    for (const rl of rendererLabels) {
      createHudText(this, rl.x, rendererLabelY, rl.text, '#779977', { fontSize: '10px' }).setOrigin(0.5, 0);
    }

    // ── Event log ─────────────────────────────────────────

    const logBaseY = rendererLabelY + 50;
    this.eventLog = createEventLog(this, logBaseY, {
      headerText: '── Event Log ──',
      maxLines: 12,
      lineHeight: 16,
      fontSize: '11px',
      lineX: 60,
    });
    this.eventLog.render([]);

    // ── Help panel ────────────────────────────────────────

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the TokenPileView reusable UI component for rendering token/counter piles where cards aren\'t the only visual model. This component provides circular tokens with optional icon overlays and count labels, and supports custom renderers for any data shape.',
      },
      {
        heading: 'Controls',
        body: '[ +Resource ]: Add a random resource token to the Resources pile.\n[ -Resource ]: Remove the last resource token.\n[ +Card Back ]: Add a card-back token.\n[ -Card Back ]: Remove the last card-back token.\n[ +Shape ]: Add a random shape token (circle, square, diamond, star).\n[ -Shape ]: Remove the last shape token.\n[ +Feudal ]: Add a feudalism-style resource token.\n[ -Feudal ]: Remove the last feudalism token.\n[ Reset All ]: Restore all piles to their default starting tokens.\nClick on any token pile to see the click event in the log.',
      },
      {
        heading: 'Renderers',
        body: 'Four renderers are demonstrated:\n1. createSimpleTokenRenderer — coloured circles with type-mapped icon colours and count overlays.\n2. createCardBackTokenRenderer — card-back textures for card-like tokens with optional cardType variant.\n3. Custom shape renderer — draws coloured circles, squares, diamonds, and stars with count overlays.\n4. createFeudalismTokenRenderer — feudalism-style resource tokens with resource-type colours and count overlays.',
      },
    ]);

    // Register shutdown lifecycle handler
    this.events.on('shutdown', this.shutdown, this);

    // Initial log
    this.logEvent('Scene ready — 4 token piles with different renderers');
  }

  // ── Public testing helpers ───────────────────────────────

  /**
   * Get current counts for all token piles.
   * @internal Exposed for testing.
   */
  getPileCounts(): number[] {
    return [
      this.resourcePile.getCount(),
      this.cardBackPile.getCount(),
      this.customPile.getCount(),
      this.feudalismPile.getCount(),
    ];
  }

  /**
   * Add a token to the specified pile (0-3).
   * @internal Exposed for testing.
   */
  addTokenToPile(pileIndex: number): void {
    switch (pileIndex) {
      case 0: this.addResourceToken(); break;
      case 1: this.addCardBackToken(); break;
      case 2: this.addCustomToken(); break;
      case 3: this.addFeudalismToken(); break;
    }
  }

  /**
   * Remove a token from the specified pile (0-3).
   * @internal Exposed for testing.
   */
  removeTokenFromPile(pileIndex: number): void {
    switch (pileIndex) {
      case 0: this.removeResourceToken(); break;
      case 1: this.removeCardBackToken(); break;
      case 2: this.removeCustomToken(); break;
      case 3: this.removeFeudalismToken(); break;
    }
  }

  /**
   * Get current event log entries.
   * @internal Exposed for testing.
   */
  getEventLogEntries(): string[] {
    return [...this.logEntries];
  }

  /**
   * Get the container for the first token pile.
   * @internal Exposed for testing so tests can emit pointer events.
   */
  getFirstPileContainer(): Phaser.GameObjects.Container {
    return this.resourcePile.getContainer();
  }

  /**
   * Get the container for the card-back token pile.
   * @internal Exposed for testing so tests can inspect rendered sprites.
   */
  getCardBackPileContainer(): Phaser.GameObjects.Container {
    return this.cardBackPile.getContainer();
  }

  // ── Default token data ───────────────────────────────────

  private createDefaultResourceTokens(): ResourceToken[] {
    return [
      { type: 'wheat', count: 3 },
      { type: 'barley', count: 2 },
      { type: 'oats', count: 1 },
      { type: 'flax', count: 2 },
      { type: 'turnip', count: 1 },
    ];
  }

  private createDefaultCardBackTokens(): CardBackToken[] {
    return [
      { cardType: 'treasure' },
      { cardType: 'monster' },
      { cardType: 'spell' },
      { cardType: 'artifact' },
      { cardType: 'treasure' },
    ];
  }

  private createDefaultCustomTokens(): CustomShapeToken[] {
    return [
      { shape: 'circle', color: 0xff4444, count: 2 },
      { shape: 'square', color: 0x44ff44, count: 1 },
      { shape: 'diamond', color: 0x4444ff, count: 3 },
      { shape: 'star', color: 0xffff44, count: 1 },
      { shape: 'circle', color: 0xff44ff, count: 2 },
    ];
  }

  private createDefaultFeudalismTokens(): FeudalismToken[] {
    return [
      { type: 'wheat', count: 4 },
      { type: 'barley', count: 3 },
      { type: 'flax', count: 2 },
      { type: 'mead', count: 1 },
    ];
  }

  // ── Add/remove operations ────────────────────────────────

  private resourceTypes: ResourceToken['type'][] = ['wheat', 'barley', 'oats', 'flax', 'turnip', 'mead'];
  private cardTypes: CardBackToken['cardType'][] = ['treasure', 'monster', 'spell', 'artifact', 'potion'];
  private shapes: CustomShapeToken['shape'][] = ['circle', 'square', 'diamond', 'star'];
  private feudalismTypes: FeudalismToken['type'][] = ['wheat', 'barley', 'oats', 'flax', 'turnip', 'mead'];

  private addResourceToken(): void {
    const type = this.resourceTypes[Math.floor(Math.random() * this.resourceTypes.length)];
    this.resourceTokens.push({ type, count: 1 + Math.floor(Math.random() * 3) });
    this.resourcePile.setTokens(this.resourceTokens);
    this.logEvent(`Added ${type} resource token — total count: ${this.resourcePile.getCount()}`);
  }

  private removeResourceToken(): void {
    if (this.resourceTokens.length === 0) {
      this.logEvent('Resources pile is empty — nothing to remove');
      return;
    }
    const removed = this.resourceTokens.pop()!;
    this.resourcePile.setTokens(this.resourceTokens);
    this.logEvent(`Removed ${removed.type} — total count: ${this.resourcePile.getCount()}`);
  }

  private addCardBackToken(): void {
    const cardType = this.cardTypes[Math.floor(Math.random() * this.cardTypes.length)];
    this.cardBackTokens.push({ cardType });
    this.cardBackPile.setTokens(this.cardBackTokens);
    this.logEvent(`Added ${cardType} card-back — total: ${this.cardBackPile.getCount()}`);
  }

  private removeCardBackToken(): void {
    if (this.cardBackTokens.length === 0) {
      this.logEvent('Card Backs pile is empty — nothing to remove');
      return;
    }
    const removed = this.cardBackTokens.pop()!;
    this.cardBackPile.setTokens(this.cardBackTokens);
    this.logEvent(`Removed ${removed.cardType} — total: ${this.cardBackPile.getCount()}`);
  }

  private addCustomToken(): void {
    const shape = this.shapes[Math.floor(Math.random() * this.shapes.length)];
    const color = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff][Math.floor(Math.random() * 6)];
    const count = 1 + Math.floor(Math.random() * 3);
    this.customTokens.push({ shape, color, count });
    this.customPile.setTokens(this.customTokens);
    this.logEvent(`Added ${shape} shape token — total count: ${this.customPile.getCount()}`);
  }

  private removeCustomToken(): void {
    if (this.customTokens.length === 0) {
      this.logEvent('Shapes pile is empty — nothing to remove');
      return;
    }
    const removed = this.customTokens.pop()!;
    this.customPile.setTokens(this.customTokens);
    this.logEvent(`Removed ${removed.shape} — total count: ${this.customPile.getCount()}`);
  }

  private addFeudalismToken(): void {
    const type = this.feudalismTypes[Math.floor(Math.random() * this.feudalismTypes.length)];
    this.feudalismTokens.push({ type, count: 1 + Math.floor(Math.random() * 3) });
    this.feudalismPile.setTokens(this.feudalismTokens);
    this.logEvent(`Added ${type} feudalism token — total count: ${this.feudalismPile.getCount()}`);
  }

  private removeFeudalismToken(): void {
    if (this.feudalismTokens.length === 0) {
      this.logEvent('Feudalism pile is empty — nothing to remove');
      return;
    }
    const removed = this.feudalismTokens.pop()!;
    this.feudalismPile.setTokens(this.feudalismTokens);
    this.logEvent(`Removed ${removed.type} — total count: ${this.feudalismPile.getCount()}`);
  }

  private resetPiles(): void {
    this.resourceTokens = this.createDefaultResourceTokens();
    this.cardBackTokens = this.createDefaultCardBackTokens();
    this.customTokens = this.createDefaultCustomTokens();
    this.feudalismTokens = this.createDefaultFeudalismTokens();

    this.resourcePile.setTokens(this.resourceTokens);
    this.cardBackPile.setTokens(this.cardBackTokens);
    this.customPile.setTokens(this.customTokens);
    this.feudalismPile.setTokens(this.feudalismTokens);

    this.logEvent('All piles reset to defaults');
  }

  // ── Custom shape renderer ─────────────────────────────────

  /**
   * Custom renderer for shape tokens.
   * Draws different geometric shapes with colors and count overlays.
   */
  private customShapeRenderer(
    token: CustomShapeToken,
    container: Phaser.GameObjects.Container,
    index: number,
  ): void {
    const cx = -index * 34;
    const r = 14;

    // Circle (base shape for all)
    const circle = this.add.circle(cx, 0, r, token.color, 0.3);
    circle.setStrokeStyle(2, token.color, 0.8);
    container.add(circle);

    // Draw shape-specific inner icon
    const innerR = 6;
    switch (token.shape) {
      case 'square': {
        const sq = this.add.rectangle(cx, 0, innerR * 2, innerR * 2, token.color, 0.8);
        container.add(sq);
        break;
      }
      case 'diamond': {
        const diamond = this.add.rectangle(cx, 0, innerR * 2, innerR * 2, token.color, 0.8);
        diamond.setAngle(45);
        container.add(diamond);
        break;
      }
      case 'star': {
        // Simple star approximation: two overlapping triangles
        const star1 = this.add.rectangle(cx, 0, innerR * 2, innerR * 2, token.color, 0.8);
        star1.setAngle(0);
        container.add(star1);
        const star2 = this.add.rectangle(cx, 0, innerR * 2, innerR * 2, token.color, 0.8);
        star2.setAngle(45);
        container.add(star2);
        break;
      }
      case 'circle':
      default: {
        const dot = this.add.circle(cx, 0, innerR, token.color, 0.8);
        container.add(dot);
        break;
      }
    }

    // Count overlay
    const count = token.count;
    const countLabel = this.add.text(cx, 0, `${count}`, {
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add(countLabel);
  }

  // ── Event logging ────────────────────────────────────────

  private logEvent(msg: string): void {
    this.logEntries.push(msg);
    if (this.logEntries.length > 50) this.logEntries.splice(0, this.logEntries.length - 50);
    this.eventLog.render(this.logEntries);
  }

  // ── Shutdown ──────────────────────────────────────────────

  private shutdown(): void {
    // Destroy token piles
    try { this.resourcePile?.destroy(); } catch (_) { /* ignore */ }
    try { this.cardBackPile?.destroy(); } catch (_) { /* ignore */ }
    try { this.customPile?.destroy(); } catch (_) { /* ignore */ }
    try { this.feudalismPile?.destroy(); } catch (_) { /* ignore */ }

    // Destroy event log
    try { this.eventLog?.destroy(); } catch (_) { /* ignore */ }

    // Clear state
    this.resourceTokens = [];
    this.cardBackTokens = [];
    this.customTokens = [];
    this.feudalismTokens = [];
    this.logEntries = [];

    // Unregister this listener
    this.events.off('shutdown', this.shutdown, this);
  }
}
