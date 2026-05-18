/**
 * GymDeckRngScene -- Demonstrates deck lifecycle and deterministic
 * seeded randomness using core-engine SeededRng and card-system Deck APIs.
 *
 * Features:
 *   - Create and shuffle a standard 52-card deck
 *   - Draw cards with visible state changes
 *   - Enter a seed to reproduce identical shuffle/draw sequences
 *   - Reset the deck to start over
 *
 * @module example-games/gym/scenes/GymDeckRngScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_DECK_RNG_KEY } from '../GymRegistry';
import { createStandardDeck, shuffleArray } from '../../../src/card-system/Deck';
import { createSeededRng } from '../../../src/core-engine/SeededRng';
import { GAME_W } from '../../../src/ui/constants';

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

  constructor() {
    super({ key: GYM_DECK_RNG_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Deck & Seeded RNG');
    this.addDivider();

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
    this.addButton(cx + 350, y, '[ Reset ]', () => this.resetDeck());

    y += 40;

    // ── Status ───────────────────────────────────────────
    this.deckCountText = this.addLabel(cx - 200, y, 'Deck: 0 cards', { fontSize: '16px', color: '#88ff88' });
    this.drawnCountText = this.addLabel(cx + 100, y, 'Drawn: 0 cards', { fontSize: '16px', color: '#88ff88' });

    y += 30;

    // ── Event log area ───────────────────────────────────
    this.addLabel(cx, y, '── Event Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);

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
    this.updateStatus();
    this.logEvent(`Drew ${card.rank} of ${card.suit} (${this.deck.length} remaining)`);
  }

  private resetDeck(): void {
    this.rng = createSeededRng(this.seed);
    this.deck = createStandardDeck();
    this.drawn = [];
    this.updateStatus();
    this.logEvent(`Deck reset (unshuffled, seed=${this.seed})`);
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

    const baseY = 150;
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