/**
 * GymHandPileScene -- Demonstrates hand, discard, and pile movement
 * flows using core-engine card-system APIs with animation helpers.
 *
 * This scene uses the reusable {@link HandView} and {@link PileView}
 * components for card display and interaction, separating rendering
 * from game logic.
 *
 * Features:
 *   - Move cards between hand and piles with deal/place/discard animations
 *   - Legal/illegal action feedback with shake animation
 *   - Card flip animation support
 *   - Positional movement tween demo with cancel support
 *   - Valid-drop highlights using Phaser Graphics primitives
 *   - Reduced-motion fallbacks for all animations
 *
 * @module example-games/gym/scenes/GymHandPileScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_HAND_PILE_KEY } from '../GymRegistry';
import { createStandardDeck, shuffleArray } from '../../../src/card-system/Deck';
import { Pile } from '../../../src/card-system/Pile';
import { createSeededRng } from '../../../src/core-engine/SeededRng';
import { GameEventEmitter } from '../../../src/core-engine';
import { HandView } from '../../../src/ui/HandView';
import { PileView } from '../../../src/ui/PileView';
import { flipCard } from '../../../src/ui/flipCard';
import { discardCard } from '../../../src/ui/discardCard';
import { dealCard } from '../../../src/ui/dealCard';
import { moveGameObject } from '../../../src/ui/moveGameObject';
import { shakeIllegalMove } from '../../../src/ui/shakeIllegalMove';
import { GAME_W } from '../../../src/ui/constants';
import { getCardTexture, ensureCardTextureFallbacks, preloadCardAssets } from '../../../src/ui/CardTextureHelpers';
import type { Card } from '../../../src/card-system/Card';

const HAND_SIZE = 5;
const DEFAULT_SEED = 42;

/** Colors for highlight zones. */
const HIGHLIGHT_COLOR = 0x44ff44;
const HIGHLIGHT_ALPHA = 0.35;

export class GymHandPileScene extends GymSceneBase {
  private hand: Card[] = [];
  private discardPile!: Pile<Card>;
  private drawPile!: Pile<Card>;
  private selectedIdx: number = -1;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];

  // Reusable UI components
  private handView!: HandView;
  private deckView!: PileView;
  private discardView!: PileView;

  // Highlight graphics
  private highlightGraphics: Phaser.GameObjects.Graphics | null = null;
  // Active move tween reference (for cancellation)
  private activeMoveTween: Phaser.Tweens.Tween | null = null;

  // Pile position constants
  private readonly DECK_X = GAME_W / 2 - 250;
  private readonly DISCARD_X = GAME_W / 2 + 100;
  private readonly PILE_Y = 150;

  // Hand layout constants
  private readonly HAND_BASE_X = 60;
  private readonly HAND_BASE_Y = 130;
  private readonly HAND_SPACING = 56;

  constructor() {
    super({ key: GYM_HAND_PILE_KEY });
  }

  preload(): void {
    preloadCardAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Hand & Pile Interactions');
    this.addDivider();
    this.initReducedMotion();

    ensureCardTextureFallbacks(this);

    // Create HandView for the player's hand
    this.handView = new HandView(this, {
      baseX: this.HAND_BASE_X,
      baseY: this.HAND_BASE_Y,
      spacing: this.HAND_SPACING,
      reducedMotion: this.reducedMotion,
    });

    // Wire selection click handler
    this.handView.on('cardclick', (idx: number) => {
      if (idx >= 0 && idx < this.hand.length) {
        this.selectedIdx = idx;
        this.logEvent(`Selected card ${idx}: ${this.hand[idx].rank}${this.hand[idx].suit}`);
      }
    });

    // Create PileViews for deck and discard
    this.deckView = new PileView(this, {
      x: this.DECK_X,
      y: this.PILE_Y,
      label: 'Deck',
    });
    this.deckView.onClick(() => this.drawToHand());

    this.discardView = new PileView(this, {
      x: this.DISCARD_X,
      y: this.PILE_Y,
      label: 'Discard',
    });
    this.discardView.onClick(() => this.recallFromDiscard());

    this.initHelp([
      { heading: 'Overview', body: 'Demonstrates hand/pile card movement with animations: deal, place, discard, move, flip, shake (illegal), and drop-zone highlights. Uses HandView and PileView components.' },
      { heading: 'Controls', body: '[ Draw to Hand ]: Deal a card (with arc animation).\n[ Discard Selected ]: Discard the selected card (with fade animation).\n[ Recall from Discard ]: Move top of discard back to hand.\n[ Flip Selected ]: Flip the selected card (two-phase animation).\n[ Move Selected ]: Tween selected card to display area (move demo).\n[ Cancel Move ]: Cancel an active move animation.\n[ Show Valid Moves ]: Highlight valid drop zones.\n[ Show Illegal ]: Trigger an illegal-move shake demo.\n[ Reset ]: Shuffle a new deck and deal starting hand.\n[ Select Next ]: Cycle selection in your hand.' }
    ]);

    const cx = GAME_W / 2;
    let y = 60;

    // Controls row 1
    this.addButton(cx - 450, y, '[ Draw ]', () => this.drawToHand());
    this.addButton(cx - 340, y, '[ Discard ]', () => this.discardSelected());
    this.addButton(cx - 220, y, '[ Recall ]', () => this.recallFromDiscard());
    this.addButton(cx - 100, y, '[ Flip ]', () => this.flipSelected());
    this.addButton(cx + 10, y, '[ Move ]', () => this.moveSelectedCard());
    this.addButton(cx + 110, y, '[ Cancel Move ]', () => this.cancelMove());

    y += 26;
    // Controls row 2
    this.addButton(cx - 350, y, '[ Show Valid ]', () => this.showValidMoves());
    this.addButton(cx - 180, y, '[ Show Illegal ]', () => this.showIllegalMove());
    this.addButton(cx + 10, y, '[ Select Next ]', () => this.selectNext());
    this.addButton(cx + 180, y, '[ Reset ]', () => this.reset());

    y += 35;
    this.addLabel(cx, y, '── Event Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);

    // Initialize
    this.reset();
  }

  private drawToHand(): void {
    if (this.drawPile.isEmpty()) {
      this.logEvent('Cannot draw: draw pile is empty');
      this.showIllegalShake();
      return;
    }
    const card = this.drawPile.pop()!;
    card.faceUp = true;
    this.hand.push(card);

    const destX = this.HAND_BASE_X + (this.hand.length - 1) * this.HAND_SPACING;
    const destY = this.HAND_BASE_Y;
    const deckX = this.DECK_X;
    const deckY = this.PILE_Y;

    if (this.reducedMotion) {
      // Instant placement for reduced motion
      this.handView.setCards(this.hand);
      this.handView.setSelected(this.selectedIdx >= 0 ? this.selectedIdx : null);
      this.deckView.update();
      this.logEvent(`Drew ${card.rank}${card.suit} to hand (instant, reduced-motion)`);
      return;
    }

    // Create a temporary sprite at the deck position to animate
    const animSprite = this.add.image(deckX, deckY, getCardTexture(card));

    const gameEvents = new GameEventEmitter();
    gameEvents.on('card:dealt', () => {
      try { animSprite.destroy(); } catch (_) { /* ignore */ }
      this.handView.setCards(this.hand);
      this.handView.setSelected(this.selectedIdx >= 0 ? this.selectedIdx : null);
      this.deckView.update();
      gameEvents.removeAllListeners();
      this.logEvent(`Drew ${card.rank}${card.suit} to hand (animated)`);
    });

    dealCard({
      scene: this,
      target: animSprite,
      destX,
      destY,
      sourceX: deckX,
      sourceY: deckY,
      duration: 400,
      gameEvents,
      cardId: `${card.rank}${card.suit}`,
    });

    // Update pile visuals immediately
    this.deckView.update();
  }

  private discardSelected(): void {
    if (this.selectedIdx < 0 || this.selectedIdx >= this.hand.length) {
      this.logEvent('No card selected or invalid selection');
      this.showIllegalShake();
      return;
    }
    // Remove the card from hand model
    const card = this.hand.splice(this.selectedIdx, 1)[0];

    const spriteIdx = this.selectedIdx;
    const sprite = this.handView.getSpriteAt(spriteIdx);

    // We'll push to discardPile when the animation completes.
    if (sprite && !this.reducedMotion) {
      const gameEvents = new GameEventEmitter();
      (gameEvents as any).on('card:discarded', () => {
        card.faceUp = false;
        this.discardPile.push(card);
        this.selectedIdx = -1;
        this.clearHighlights();
        this.handView.setCards(this.hand);
        this.handView.setSelected(null);
        this.discardView.update();
        (gameEvents as any).removeAllListeners();
        this.logEvent(`Discarded ${card.rank}${card.suit} (animated)`);
      });

      discardCard({
        scene: this,
        target: sprite as any,
        offsetY: 30,
        duration: 350,
        destroyAfter: true,
        gameEvents: gameEvents as any,
        cardId: `${card.rank}${card.suit}`,
      });
    } else {
      if (sprite) {
        // For reduced-motion, immediately clean up the sprite
        try { sprite.destroy(); } catch (_) { /* ignore */ }
      }
      card.faceUp = false;
      this.discardPile.push(card);
      this.selectedIdx = -1;
      this.clearHighlights();
      this.handView.setCards(this.hand);
      this.handView.setSelected(null);
      this.discardView.update();
      this.logEvent(`Discarded ${card.rank}${card.suit} (instant)`);
    }
  }

  private recallFromDiscard(): void {
    if (this.discardPile.isEmpty()) {
      this.logEvent('Cannot recall: discard pile is empty');
      this.showIllegalShake();
      return;
    }
    const card = this.discardPile.pop()!;
    card.faceUp = true;
    this.hand.push(card);

    const destX = this.HAND_BASE_X + (this.hand.length - 1) * this.HAND_SPACING;
    const destY = this.HAND_BASE_Y;
    const sourceX = this.DISCARD_X;
    const sourceY = this.PILE_Y;

    if (this.reducedMotion) {
      this.handView.setCards(this.hand);
      this.handView.setSelected(this.selectedIdx >= 0 ? this.selectedIdx : null);
      this.discardView.update();
      this.logEvent(`Recalled ${card.rank}${card.suit} from discard (instant)`);
      return;
    }

    const animSprite = this.add.image(sourceX, sourceY, getCardTexture(card));

    const gameEvents = new GameEventEmitter();
    gameEvents.on('card:dealt', () => {
      try { animSprite.destroy(); } catch (_) {}
      this.handView.setCards(this.hand);
      this.handView.setSelected(this.selectedIdx >= 0 ? this.selectedIdx : null);
      this.discardView.update();
      gameEvents.removeAllListeners();
      this.logEvent(`Recalled ${card.rank}${card.suit} from discard (animated)`);
    });

    dealCard({
      scene: this,
      target: animSprite,
      destX,
      destY,
      sourceX,
      sourceY,
      duration: 350,
      gameEvents,
      cardId: `${card.rank}${card.suit}`,
    });

    this.discardView.update();
  }

  private selectNext(): void {
    if (this.hand.length === 0) {
      this.logEvent('No cards in hand to select');
      return;
    }
    this.selectedIdx = (this.selectedIdx + 1) % this.hand.length;
    const card = this.hand[this.selectedIdx];
    this.logEvent(`Selected card ${this.selectedIdx}: ${card.rank}${card.suit}`);
    this.handView.setSelected(this.selectedIdx);
  }

  private flipSelected(): void {
    if (this.selectedIdx < 0 || this.selectedIdx >= this.hand.length) {
      this.logEvent('No card selected to flip');
      return;
    }
    const sprite = this.handView.getSpriteAt(this.selectedIdx);
    if (!sprite) {
      this.logEvent('No sprite for selected card');
      return;
    }

    const card = this.hand[this.selectedIdx];
    card.faceUp = !card.faceUp;
    const newTexture = getCardTexture(card);

    if (this.reducedMotion) {
      sprite.setTexture(newTexture);
      this.logEvent(`Flipped card (instant, reduced-motion) -> ${newTexture}`);
    } else {
      flipCard({
        scene: this,
        target: sprite,
        newTexture,
        duration: 300,
        onComplete: () => {
          this.logEvent(`Flipped card (animated) -> ${newTexture}`);
        },
      });
    }
  }

  private moveSelectedCard(): void {
    if (this.selectedIdx < 0 || this.selectedIdx >= this.hand.length) {
      this.logEvent('No card selected to move');
      this.showIllegalShake();
      return;
    }
    if (this.activeMoveTween) {
      this.logEvent('Move already active; cancel first');
      return;
    }

    const sprite = this.handView.getSpriteAt(this.selectedIdx);
    if (!sprite) {
      this.logEvent('No sprite for selected card');
      return;
    }

    const destX = GAME_W / 2 + 200;
    const destY = 200;

    if (this.reducedMotion) {
      sprite.setPosition(destX, destY);
      this.logEvent(`Moved card (instant, reduced-motion)`);
    } else {
      this.activeMoveTween = moveGameObject({
        scene: this,
        target: sprite,
        destX,
        destY,
        duration: 500,
        onComplete: () => {
          this.activeMoveTween = null;
          this.logEvent('Move completed (animated)');
        },
      });
    }
  }

  private cancelMove(): void {
    if (this.activeMoveTween) {
      this.activeMoveTween.stop();
      this.activeMoveTween = null;
      this.logEvent('Move cancelled');
    } else {
      this.logEvent('No active move to cancel');
    }
  }

  private showValidMoves(): void {
    this.clearHighlights();
    if (!this.highlightGraphics) {
      this.highlightGraphics = this.add.graphics();
    }
    const g = this.highlightGraphics;

    const zones = [
      { x: GAME_W / 2 - 250, y: 150, label: 'Discard Pile' },
      { x: GAME_W / 2 + 100, y: 150, label: 'Display Area' },
    ];

    g.fillStyle(HIGHLIGHT_COLOR, HIGHLIGHT_ALPHA);
    g.lineStyle(2, HIGHLIGHT_COLOR, 0.8);
    for (const zone of zones) {
      g.fillRoundedRect(zone.x, zone.y, 140, 80, 8);
      g.strokeRoundedRect(zone.x, zone.y, 140, 80, 8);
      this.add.text(zone.x + 70, zone.y + 40, zone.label, {
        fontSize: '10px',
        color: '#44ff44',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    this.logEvent('Showing valid drop zones (green highlights)');
    this.time?.delayedCall(3000, () => this.clearHighlights());
  }

  private showIllegalMove(): void {
    this.showIllegalShake();
  }

  private showIllegalShake(): void {
    const target = this.selectedIdx >= 0
      ? this.handView.getSpriteAt(this.selectedIdx)
      : null;

    if (target) {
      if (this.reducedMotion) {
        target.setTint(0xff4444);
        this.time?.delayedCall(200, () => {
          try { target.clearTint(); } catch (_) { /* ignore */ }
        });
        this.logEvent('Illegal move (brief tint, reduced-motion)');
      } else {
        shakeIllegalMove({
          scene: this,
          target,
          tint: 0xff4444,
          shakeDistance: 6,
          duration: 50,
          repeat: 2,
          onComplete: () => {
            this.logEvent('Illegal move shake completed');
          },
        });
        this.logEvent('Illegal move shake triggered');
      }
    } else {
      this.logEvent('Illegal action (no visual target)');
    }
  }

  private reset(): void {
    const rng = createSeededRng(DEFAULT_SEED);
    const deck = createStandardDeck();
    shuffleArray(deck, rng);
    this.drawPile = new Pile<Card>(deck);
    this.discardPile = new Pile<Card>();
    // Draw initial hand
    this.hand = [];
    for (let i = 0; i < HAND_SIZE && !this.drawPile.isEmpty(); i++) {
      const card = this.drawPile.pop()!;
      card.faceUp = true;
      this.hand.push(card);
    }
    this.selectedIdx = -1;
    this.clearHighlights();
    this.cancelMove();

    // Sync UI components
    this.handView.setCards(this.hand);
    this.handView.setSelected(null);
    this.deckView.setPile(this.drawPile);
    this.discardView.setPile(this.discardPile);

    this.logEvent('Reset: new deck shuffled, hand dealt');
  }

  private clearHighlights(): void {
    if (this.highlightGraphics) {
      this.highlightGraphics.clear();
    }
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 14) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const baseY = 230;
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