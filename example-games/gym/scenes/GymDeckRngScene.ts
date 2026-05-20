/**
 * GymDeckRngScene -- Demonstrates deck lifecycle, deterministic
 * seeded randomness, and card flip animations.
 *
 * Features:
 *   - Create and shuffle a standard 52-card deck
 *   - Draw cards with visible state changes and flip animation
 *   - Enter a seed to reproduce identical shuffle/draw sequences
 *   - Reset the deck to start over
 *   - Flip animation using flipCard helper with reduced-motion fallback
 *
 * @module example-games/gym/scenes/GymDeckRngScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_DECK_RNG_KEY } from '../GymRegistry';
import { createStandardDeck, shuffleArray } from '../../../src/card-system/Deck';
import { createSeededRng } from '../../../src/core-engine/SeededRng';
import { flipCard } from '../../../src/ui/flipCard';
import { dealCard } from '../../../src/ui/dealCard';
import { GameEventEmitter } from '../../../src/core-engine';
import { GAME_W } from '../../../src/ui/constants';

/** Default seed for deterministic demonstrations. */
const DEFAULT_SEED = 42;

/** Texture key for card back. */
const CARD_BACK_TEXTURE = 'card-back-gym';
/** Texture key for card front placeholder. */
const CARD_FRONT_TEXTURE = 'card-front-gym';

export class GymDeckRngScene extends GymSceneBase {
  private deck: ReturnType<typeof createStandardDeck> = [];
  private drawn: ReturnType<typeof createStandardDeck> = [];
  private seed: number = DEFAULT_SEED;
  private rng: ReturnType<typeof createSeededRng> = createSeededRng(DEFAULT_SEED);

  // UI elements
  private seedText!: Phaser.GameObjects.Text;
  private deckCountText!: Phaser.GameObjects.Text;
  private drawnCountText!: Phaser.GameObjects.Text;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];
  private lastDrawnSprite: Phaser.GameObjects.Image | null = null;
  private flipAnimActive: boolean = false;

  constructor() {
    super({ key: GYM_DECK_RNG_KEY });
  }

  preload(): void {
    // Generate simple procedural card textures for flip demo
    const graphics = this.add.graphics();
    // Card back - blue with pattern
    graphics.fillStyle(0x2244aa, 1);
    graphics.fillRoundedRect(0, 0, 60, 84, 6);
    graphics.lineStyle(1, 0x3366cc, 1);
    graphics.strokeRoundedRect(2, 2, 56, 80, 4);
    graphics.generateTexture(CARD_BACK_TEXTURE, 60, 84);
    // Card front - light with border
    graphics.clear();
    graphics.fillStyle(0xfafafa, 1);
    graphics.fillRoundedRect(0, 0, 60, 84, 6);
    graphics.lineStyle(1, 0x333333, 1);
    graphics.strokeRoundedRect(1, 1, 58, 82, 5);
    graphics.generateTexture(CARD_FRONT_TEXTURE, 60, 84);
    graphics.destroy();
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Deck & Seeded RNG');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Overview',
        body: 'Demonstrates deck lifecycle and deterministic seeded randomness with flip and deal animations.'
      },
      {
        heading: 'Controls',
        body: '[ -1 ] / [ +1 ]: Adjust seed.\n[ Reset Seed ]: Restore default seed.\n[ Shuffle ]: Shuffle the deck with the current seed.\n[ Draw ]: Draw the top card (with flip animation).\n[ Flip Last ]: Flip the last drawn card (animation demo).\n[ Deal ]: Deal a card with arc animation.\n[ Reset ]: Reset deck to unshuffled state.\n\nTip: Press "?" (or click the ? button) to toggle this help.'
      }
    ]);

    // ── Controls ─────────────────────────────────────────
    const cx = GAME_W / 2;
    let y = 60;

    this.addLabel(cx - 300, y, 'Seed:');
    this.seedText = this.add.text(cx - 250, y, String(this.seed), {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });

    this.addButton(cx - 120, y, '[ -1 ]', () => this.adjustSeed(-1));
    this.addButton(cx - 60, y, '[ +1 ]', () => this.adjustSeed(1));
    this.addButton(cx + 10, y, '[ Reset Seed ]', () => this.resetSeed());
    this.addButton(cx + 150, y, '[ Shuffle ]', () => this.shuffleDeck());
    this.addButton(cx + 260, y, '[ Draw ]', () => this.drawCard());

    y += 28;
    this.addButton(cx - 250, y, '[ Flip Last ]', () => this.flipLastDrawn());
    this.addButton(cx - 90, y, '[ Deal ]', () => this.dealCardAction());
    this.addButton(cx + 50, y, '[ Reset ]', () => this.resetDeck());

    y += 32;

    // ── Status ───────────────────────────────────────────
    this.deckCountText = this.addLabel(cx - 200, y, 'Deck: 0 cards', { fontSize: '16px', color: '#88ff88' });
    this.drawnCountText = this.addLabel(cx + 100, y, 'Drawn: 0 cards', { fontSize: '16px', color: '#88ff88' });

    y += 30;

    // ── Card display area ────────────────────────────────
    this.addLabel(cx, y + 10, '── Last Drawn Card ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);

    y += 40;
    // ── Event log area ───────────────────────────────────
    this.addLabel(cx, y + 50, '── Event Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);

    // Initialize deck
    this.resetDeck();
  }

  // ── Actions ──────────────────────────────────────────────

  private adjustSeed(delta: number): void {
    this.seed = Math.max(0, this.seed + delta);
    this.seedText.setText(String(this.seed));
    this.logEvent(`Seed changed to ${this.seed}`);
  }

  private resetSeed(): void {
    this.seed = DEFAULT_SEED;
    this.seedText.setText(String(this.seed));
    this.logEvent(`Seed reset to ${DEFAULT_SEED}`);
  }

  private shuffleDeck(): void {
    this.rng = createSeededRng(this.seed);
    this.deck = createStandardDeck();
    shuffleArray(this.deck, this.rng);
    this.drawn = [];
    this.clearLastDrawnSprite();
    this.updateStatus();
    this.logEvent(`Shuffled deck with seed=${this.seed}`);
  }

  private drawCard(): void {
    if (this.deck.length === 0) {
      this.logEvent('Cannot draw: deck is empty');
      return;
    }
    const card = this.deck.pop()!;
    this.drawn.push(card);
    this.clearLastDrawnSprite();
    this.showCardSprite(card, CARD_BACK_TEXTURE);
    this.updateStatus();
    this.logEvent(`Drew ${card.rank} of ${card.suit} (${this.deck.length} remaining)`);
  }

  private flipLastDrawn(): void {
    if (this.drawn.length === 0) {
      this.logEvent('No drawn card to flip');
      return;
    }
    if (this.flipAnimActive) {
      this.logEvent('Flip animation already active');
      return;
    }
    if (!this.lastDrawnSprite) {
      this.logEvent('No visible card sprite to flip');
      return;
    }

    const sprite = this.lastDrawnSprite;
    const currentTexture = sprite.texture.key;

    // Toggle between front and back texture
    const newTexture = currentTexture === CARD_BACK_TEXTURE ? CARD_FRONT_TEXTURE : CARD_BACK_TEXTURE;

    if (this.reducedMotion) {
      // Instant texture swap for reduced motion
      sprite.setTexture(newTexture);
      this.logEvent(`Flipped card (instant, reduced-motion) -> ${newTexture}`);
    } else {
      // Animated flip
      this.flipAnimActive = true;
      flipCard({
        scene: this,
        target: sprite,
        newTexture,
        duration: 300,
        onComplete: () => {
          this.flipAnimActive = false;
          this.logEvent(`Flipped card (animated) -> ${newTexture}`);
        },
      });
    }
  }

  private dealCardAction(): void {
    if (this.deck.length === 0) {
      this.logEvent('Cannot deal: deck is empty');
      return;
    }
    const card = this.deck.pop()!;
    this.drawn.push(card);
    this.clearLastDrawnSprite();

    // Create a sprite at the deck position and deal it to the drawn area
    const cx = GAME_W / 2;
    const destX = cx + 80;
    const destY = 180;

    const sprite = this.add.image(cx - 200, 100, CARD_BACK_TEXTURE);
    this.lastDrawnSprite = sprite;

    if (this.reducedMotion) {
      // Instant placement for reduced motion
      sprite.setPosition(destX, destY);
      this.updateStatus();
      this.logEvent(`Dealt ${card.rank} of ${card.suit} (instant, reduced-motion)`);
    } else {
      const gameEvents = new GameEventEmitter();
      gameEvents.on('card:dealt', () => {
        this.updateStatus();
        this.logEvent(`Dealt ${card.rank} of ${card.suit} (animated)`);
        gameEvents.removeAllListeners();
      });
      dealCard({
        scene: this,
        target: sprite,
        destX,
        destY,
        sourceX: cx - 200,
        sourceY: 100,
        duration: 400,
        gameEvents,
        cardId: `${card.rank}${card.suit}`,
      });
      // Update immediately for responsiveness
      this.updateStatus();
    }
  }

  private resetDeck(): void {
    this.rng = createSeededRng(this.seed);
    this.deck = createStandardDeck();
    this.drawn = [];
    this.clearLastDrawnSprite();
    this.updateStatus();
    this.logEvent(`Deck reset (unshuffled, seed=${this.seed})`);
  }

  // ── Card sprite helpers ──────────────────────────────────

  private showCardSprite(card: ReturnType<typeof createStandardDeck>[0], texture: string): void {
    const cx = GAME_W / 2;
    const sprite = this.add.image(cx + 80, 180, texture);
    // Label below
    const label = this.add.text(cx + 80, 230, `${card.rank}${card.suit}`, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Store reference; we clean up old sprites when drawing new ones
    if (this.lastDrawnSprite) {
      this.lastDrawnSprite.destroy();
    }
    this.lastDrawnSprite = sprite;

    // Clean up label on scene shutdown
    this.events.once('shutdown', () => {
      try { label.destroy(); } catch (_) { /* ignore */ }
      try { sprite.destroy(); } catch (_) { /* ignore */ }
    });
  }

  private clearLastDrawnSprite(): void {
    if (this.lastDrawnSprite) {
      try { this.lastDrawnSprite.destroy(); } catch (_) { /* ignore */ }
      this.lastDrawnSprite = null;
    }
  }

  // ── UI helpers ───────────────────────────────────────────

  private updateStatus(): void {
    this.deckCountText.setText(`Deck: ${this.deck.length} cards`);
    this.drawnCountText.setText(`Drawn: ${this.drawn.length} cards`);
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 12) this.eventLog.shift();

    // Remove old log texts
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];

    const baseY = 280;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = this.add.text(40, baseY + i * 18, this.eventLog[i], {
        fontSize: '12px',
        color: '#aaddaa',
        fontFamily: 'monospace',
      });
      this.logTexts.push(txt);
    }
  }
}