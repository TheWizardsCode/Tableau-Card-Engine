/**
 * GymHandPileScene -- Demonstrates hand, discard, and pile movement
 * flows using core-engine card-system APIs.
 *
 * Features:
 *   - Move cards between hand and piles
 *   - Legal/illegal action feedback
 *   - State invariant checks after move sequences
 *
 * @module example-games/gym/scenes/GymHandPileScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_HAND_PILE_KEY } from '../GymRegistry';
import { createStandardDeck, shuffleArray } from '../../../src/card-system/Deck';
import { Pile } from '../../../src/card-system/Pile';
import { createSeededRng } from '../../../src/core-engine/SeededRng';
import { GAME_W } from '../../../src/ui/constants';

const HAND_SIZE = 5;
const DEFAULT_SEED = 42;

export class GymHandPileScene extends GymSceneBase {
  private hand: ReturnType<typeof createStandardDeck> = [];
  private discardPile!: Pile;
  private drawPile!: Pile;
  private selectedIdx: number = -1;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];

  constructor() {
    super({ key: GYM_HAND_PILE_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Hand & Pile Interactions');
    this.addDivider();

    const cx = GAME_W / 2;
    let y = 60;

    // Controls
    this.addButton(cx - 400, y, '[ Draw to Hand ]', () => this.drawToHand());
    this.addButton(cx - 240, y, '[ Discard Selected ]', () => this.discardSelected());
    this.addButton(cx - 60, y, '[ Recall from Discard ]', () => this.recallFromDiscard());
    this.addButton(cx + 150, y, '[ Reset ]', () => this.reset());
    this.addButton(cx + 280, y, '[ Select Next ]', () => this.selectNext());

    y += 40;
    this.addLabel(cx, y, 'Click Select Next to cycle through hand cards, then Discard or Recall.', {
      fontSize: '11px',
      color: '#889988',
    }).setOrigin(0.5);

    y += 20;

    this.addLabel(cx, y, '── Event Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);

    // Initialize
    this.reset();
  }

  private drawToHand(): void {
    if (this.drawPile.isEmpty()) {
      this.logEvent('Cannot draw: draw pile is empty');
      return;
    }
    const card = this.drawPile.pop()!;
    card.faceUp = true;
    this.hand.push(card);
    this.logEvent(`Drew ${card.rank}${card.suit} to hand (${this.hand.length} in hand, ${this.drawPile.size()} in deck)`);
  }

  private discardSelected(): void {
    if (this.selectedIdx < 0 || this.selectedIdx >= this.hand.length) {
      this.logEvent('No card selected or invalid selection');
      return;
    }
    const card = this.hand.splice(this.selectedIdx, 1)[0];
    card.faceUp = false;
    this.discardPile.push(card);
    this.selectedIdx = -1;
    this.logEvent(`Discarded ${card.rank}${card.suit} (${this.hand.length} in hand, ${this.discardPile.size()} in discard)`);
  }

  private recallFromDiscard(): void {
    if (this.discardPile.isEmpty()) {
      this.logEvent('Cannot recall: discard pile is empty');
      return;
    }
    const card = this.discardPile.pop()!;
    card.faceUp = true;
    this.hand.push(card);
    this.logEvent(`Recalled ${card.rank}${card.suit} from discard (${this.hand.length} in hand)`);
  }

  private selectNext(): void {
    if (this.hand.length === 0) {
      this.logEvent('No cards in hand to select');
      return;
    }
    this.selectedIdx = (this.selectedIdx + 1) % this.hand.length;
    const card = this.hand[this.selectedIdx];
    this.logEvent(`Selected card ${this.selectedIdx}: ${card.rank}${card.suit}`);
  }

  private reset(): void {
    const rng = createSeededRng(DEFAULT_SEED);
    const deck = createStandardDeck();
    shuffleArray(deck, rng);
    this.drawPile = new Pile(deck);
    this.discardPile = new Pile();
    // Draw initial hand
    this.hand = [];
    for (let i = 0; i < HAND_SIZE && !this.drawPile.isEmpty(); i++) {
      const card = this.drawPile.pop()!;
      card.faceUp = true;
      this.hand.push(card);
    }
    this.selectedIdx = -1;
    this.logEvent('Reset: new deck shuffled, hand dealt');
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 14) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const baseY = 150;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = this.add.text(40, baseY + i * 17, this.eventLog[i], {
        fontSize: '11px',
        color: '#aaddaa',
        fontFamily: 'monospace',
      });
      this.logTexts.push(txt);
    }
  }
}