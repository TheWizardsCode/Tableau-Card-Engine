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
import { preloadCardAssets, getCardTexture, ensureCardTextureFallbacks } from '../../../src/ui/CardTextureHelpers';

/** Default seed for deterministic demonstrations. */
const DEFAULT_SEED = 42;

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
  private lastDrawnCard: ReturnType<typeof createStandardDeck>[0] | null = null;
  private flipAnimActive: boolean = false;

  constructor() {
    super({ key: GYM_DECK_RNG_KEY });
  }

  preload(): void {
    // Preload standard SVG card assets (faces + back).
    preloadCardAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Deck & Seeded RNG');
    this.addDivider();
    this.initReducedMotion();

    // Ensure runtime fallbacks exist in headless/test environments
    ensureCardTextureFallbacks(this);

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

    // ── Controls (positioned via SLL controls zone) ────────────
    const controlsAnchor = this.getGymAnchor('controls', 'left');
    const cx = controlsAnchor?.x ?? GAME_W / 2;
    let y = controlsAnchor?.y ?? 60;

    this.addLabel(cx, y, 'Seed:');
    this.seedText = this.add.text(cx + 50, y, String(this.seed), {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });

    this.addButton(cx + 180, y, '[ -1 ]', () => this.adjustSeed(-1));
    this.addButton(cx + 240, y, '[ +1 ]', () => this.adjustSeed(1));
    this.addButton(cx + 310, y, '[ Reset Seed ]', () => this.resetSeed());
    this.addButton(cx + 450, y, '[ Shuffle ]', () => this.shuffleDeck());
    this.addButton(cx + 560, y, '[ Draw ]', () => this.drawCard());

    y += 28;
    this.addButton(cx + 50, y, '[ Flip Last ]', () => this.flipLastDrawn());
    this.addButton(cx + 210, y, '[ Deal ]', () => this.dealCardAction());
    this.addButton(cx + 350, y, '[ Reset ]', () => this.resetDeck());

    // ── Status ───────────────────────────────────────────
    this.deckCountText = this.addLabel(cx + 100, y, 'Deck: 0 cards', { fontSize: '16px', color: '#88ff88' });
    this.drawnCountText = this.addLabel(cx + 400, y, 'Drawn: 0 cards', { fontSize: '16px', color: '#88ff88' });

    // ── Card display area (positioned via SLL cardDisplay zone) ──
    const cardDisplay = this.getGymAnchor('cardDisplay', 'center');
    const cardDisplayY = cardDisplay?.y ?? 280;
    this.addLabel(cardDisplay?.x ?? cx, cardDisplayY - 40, '── Last Drawn Card ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);

    // ── Event log area (positioned below card display) ──────
    this.addLabel(cardDisplay?.x ?? cx, cardDisplayY + 140, '── Event Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);

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
    // Show the back (card.faceUp is false by default)
    this.showCardSprite(card);
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
    if (!this.lastDrawnSprite || !this.lastDrawnCard) {
      this.logEvent('No visible card sprite to flip');
      return;
    }

    const sprite = this.lastDrawnSprite;
    const card = this.lastDrawnCard;

    // Toggle face state
    card.faceUp = !card.faceUp;
    const newTexture = getCardTexture(card);

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
    const cardDisplay = this.getGymAnchor('cardDisplay', 'center');
    const destX = cardDisplay?.x ?? (GAME_W / 2 + 80);
    const destY = cardDisplay?.y ?? 180;

    const sprite = this.add.image(destX - 280, destY - 80, getCardTexture(card));
    this.lastDrawnSprite = sprite;
    this.lastDrawnCard = card;

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
        sourceX: destX - 280,
        sourceY: destY - 80,
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

  private showCardSprite(card: ReturnType<typeof createStandardDeck>[0]): void {
    const cardDisplay = this.getGymAnchor('cardDisplay', 'center');
    const spriteX = cardDisplay?.x ?? (GAME_W / 2 + 80);
    const spriteY = cardDisplay?.y ?? 180;
    const texture = getCardTexture(card);
    const sprite = this.add.image(spriteX, spriteY, texture);
    // Label below
    const label = this.add.text(spriteX, spriteY + 50, `${card.rank}${card.suit}`, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Store references; we clean up old sprites when drawing new ones
    if (this.lastDrawnSprite) {
      this.lastDrawnSprite.destroy();
    }
    this.lastDrawnSprite = sprite;
    this.lastDrawnCard = card;

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
    this.lastDrawnCard = null;
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

    const cardDisplay = this.getGymAnchor('cardDisplay', 'center');
    const baseY = cardDisplay?.y ? cardDisplay.y + 100 : 280;
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
