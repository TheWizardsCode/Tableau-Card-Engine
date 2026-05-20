/**
 * GymHandPileScene -- Demonstrates hand, discard, and pile movement
 * flows using core-engine card-system APIs with animation helpers.
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
import { flipCard } from '../../../src/ui/flipCard';
import { discardCard } from '../../../src/ui/discardCard';
import { moveGameObject } from '../../../src/ui/moveGameObject';
import { shakeIllegalMove } from '../../../src/ui/shakeIllegalMove';
import { GAME_W } from '../../../src/ui/constants';
import { preloadCardAssets, getCardTexture, ensureCardTextureFallbacks } from '../../../src/ui/CardTextureHelpers';

const HAND_SIZE = 5;
const DEFAULT_SEED = 42;

/** Colors for highlight zones. */
const HIGHLIGHT_COLOR = 0x44ff44;
const HIGHLIGHT_ALPHA = 0.35;

export class GymHandPileScene extends GymSceneBase {
  private hand: ReturnType<typeof createStandardDeck> = [];
  private discardPile!: Pile;
  private drawPile!: Pile;
  private selectedIdx: number = -1;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];

  // Card sprites for hand cards
  private handSprites: Phaser.GameObjects.Image[] = [];
  // Highlight graphics
  private highlightGraphics: Phaser.GameObjects.Graphics | null = null;
  // Active move tween reference (for cancellation)
  private activeMoveTween: Phaser.Tweens.Tween | null = null;
  // Card display area sprite
  private displayCard: Phaser.GameObjects.Image | null = null;
  private displayLabel: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: GYM_HAND_PILE_KEY });
  }

  preload(): void {
    // Preload standard SVG card assets (faces + back).
    preloadCardAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Hand & Pile Interactions');
    this.addDivider();
    this.initReducedMotion();

    // Ensure runtime fallbacks exist in headless/test environments
    ensureCardTextureFallbacks(this);

    this.initHelp([
      { heading: 'Overview', body: 'Demonstrates hand/pile card movement with animations: deal, place, discard, move, flip, shake (illegal), and drop-zone highlights.' },
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
    this.updateHandDisplay();
    this.logEvent(`Drew ${card.rank}${card.suit} to hand (${this.hand.length} in hand, ${this.drawPile.size()} in deck)`);
  }

  private discardSelected(): void {
    if (this.selectedIdx < 0 || this.selectedIdx >= this.hand.length) {
      this.logEvent('No card selected or invalid selection');
      this.showIllegalShake();
      return;
    }
    const card = this.hand.splice(this.selectedIdx, 1)[0];

    // Use discardCard animation on the sprite if not reduced motion
    const spriteIdx = this.selectedIdx;
    const sprite = this.handSprites[spriteIdx];
    if (sprite && !this.reducedMotion) {
      // discardCard destroys the sprite by default; just play animation
      discardCard({
        scene: this,
        target: sprite as any,
        offsetY: 30,
        duration: 350,
        destroyAfter: true,
      });
      this.logEvent(`Discarded ${card.rank}${card.suit} (animated)`);
    } else {
      if (sprite) sprite.destroy();
      this.logEvent(`Discarded ${card.rank}${card.suit} (instant)`);
    }

    card.faceUp = false;
    this.discardPile.push(card);
    this.selectedIdx = -1;
    this.clearHighlights();
    this.updateHandDisplay();
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
    this.updateHandDisplay();
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
    this.updateHandDisplay();
  }

  private flipSelected(): void {
    if (this.selectedIdx < 0 || this.selectedIdx >= this.hand.length) {
      this.logEvent('No card selected to flip');
      return;
    }
    const sprite = this.handSprites[this.selectedIdx];
    if (!sprite) {
      this.logEvent('No sprite for selected card');
      return;
    }

    const card = this.hand[this.selectedIdx];

    // Toggle face state on the model and compute texture accordingly
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

    const sprite = this.handSprites[this.selectedIdx];
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

    // Draw valid zones as green rounded rects
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

    // Auto-clear after 3 seconds
    this.time?.delayedCall(3000, () => this.clearHighlights());
  }

  private showIllegalMove(): void {
    this.showIllegalShake();
  }

  private showIllegalShake(): void {
    // Shake demo on a label or on the selected card sprite
    const target = this.selectedIdx >= 0 && this.selectedIdx < this.handSprites.length
      ? this.handSprites[this.selectedIdx]
      : null;

    if (target) {
      if (this.reducedMotion) {
        // Brief tint flash for reduced-motion
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
      // No sprite to shake, just log
      this.logEvent('Illegal action (no visual target)');
    }
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
    this.clearHighlights();
    this.cancelMove();
    this.updateHandDisplay();
    this.logEvent('Reset: new deck shuffled, hand dealt');
  }

  private updateHandDisplay(): void {
    // Clear old sprites
    for (const s of this.handSprites) {
      try { s.destroy(); } catch (_) { /* ignore */ }
    }
    this.handSprites = [];

    // Clean up display card
    if (this.displayCard) {
      try { this.displayCard.destroy(); } catch (_) { /* ignore */ }
      this.displayCard = null;
    }
    if (this.displayLabel) {
      try { this.displayLabel.destroy(); } catch (_) { /* ignore */ }
      this.displayLabel = null;
    }

    const baseX = 60;
    const baseY = 130;
    const spacing = 56;

    for (let i = 0; i < this.hand.length; i++) {
      const card = this.hand[i];
      const textureKey = getCardTexture(card);
      const sprite = this.add.image(baseX + i * spacing, baseY, textureKey);
      sprite.setTint(i === this.selectedIdx ? 0x88ff88 : 0xffffff);

      // Card label
      const label = this.add.text(baseX + i * spacing, baseY + 42, `${card.rank}${card.suit}`, {
        fontSize: '9px',
        color: i === this.selectedIdx ? '#88ff88' : '#aaaaaa',
        fontFamily: 'monospace',
      }).setOrigin(0.5);

      this.handSprites.push(sprite);

      // Clean label on scene shutdown
      this.events.once('shutdown', () => {
        try { label.destroy(); } catch (_) { /* ignore */ }
      });
    }

    // Show pile sizes
    this.add.text(baseX, baseY + 65, `Deck: ${this.drawPile.size()}`, {
      fontSize: '11px',
      color: '#888888',
      fontFamily: 'monospace',
    });
    this.add.text(baseX + 100, baseY + 65, `Discard: ${this.discardPile.size()}`, {
      fontSize: '11px',
      color: '#888888',
      fontFamily: 'monospace',
    });
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
