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
import { CARD_H, CARD_W, GAME_H, GAME_W } from '../../../src/ui/constants';
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
  private highlightLabels: Phaser.GameObjects.Text[] = [];
  // Active move tween reference (for cancellation)
  private activeMoveTween: Phaser.Tweens.Tween | null = null;

  // Pile position constants
  private readonly DECK_X = GAME_W / 2 - 250;
  private readonly DISCARD_X = GAME_W / 2 + 100;
  private readonly PILE_Y = 250;

  // Hand layout constants
  private readonly HAND_SPACING = 20;
  private readonly HAND_BASE_X = GAME_W / 2 - ((HAND_SIZE - 1) * this.HAND_SPACING) / 2;
  private readonly HAND_BASE_Y = GAME_H - CARD_H - 80;

  // Slider layout constants
  private readonly SLIDER_Y = GAME_H - 40;
  private readonly SLIDER_HORIZ_GAP = 40;
  private readonly SLIDER_START_X = 375;

  // Arc slider constants/state
  private readonly ARC_RADIUS_MIN = 0;
  private readonly ARC_RADIUS_MAX = 200;
  private readonly ARC_RADIUS_DEFAULT = 150;
  private readonly ARC_SLIDER_WIDTH = 150;
  private readonly ARC_SLIDER_HEIGHT = 6;
  private readonly ARC_SLIDER_X = this.SLIDER_START_X;
  private readonly SPACING_SLIDER_X = this.SLIDER_START_X + this.ARC_SLIDER_WIDTH + this.SLIDER_HORIZ_GAP;
  private readonly ROTATION_SLIDER_X = this.SLIDER_START_X + 2 * (this.ARC_SLIDER_WIDTH + this.SLIDER_HORIZ_GAP);
  private arcRadius = this.ARC_RADIUS_DEFAULT;
  private arcSliderTrack?: Phaser.GameObjects.Rectangle;
  private arcSliderFill?: Phaser.GameObjects.Rectangle;
  private arcSliderHandle?: Phaser.GameObjects.Graphics;
  private arcSliderHitArea?: Phaser.GameObjects.Zone;
  private arcSliderValueText?: Phaser.GameObjects.Text;
  private isArcSliderDragging = false;

  // Spacing slider state
  private spacingSliderTrack?: Phaser.GameObjects.Rectangle;
  private spacingSliderFill?: Phaser.GameObjects.Rectangle;
  private spacingSliderHandle?: Phaser.GameObjects.Graphics;
  private spacingSliderHitArea?: Phaser.GameObjects.Zone;
  private spacingSliderValueText?: Phaser.GameObjects.Text;
  private isSpacingSliderDragging = false;

  // Rotation slider constants/state
  private readonly ROTATION_DEGREES_MIN = 0;
  private readonly ROTATION_DEGREES_MAX = 45;
  private readonly ROTATION_DEGREES_DEFAULT = 25;
  private rotationSliderTrack?: Phaser.GameObjects.Rectangle;
  private rotationSliderFill?: Phaser.GameObjects.Rectangle;
  private rotationSliderHandle?: Phaser.GameObjects.Graphics;
  private rotationSliderHitArea?: Phaser.GameObjects.Zone;
  private rotationSliderValueText?: Phaser.GameObjects.Text;
  private isRotationSliderDragging = false;

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
      arcRadius: this.arcRadius,
      showLabels: false,
      maxRotationDegrees: this.ROTATION_DEGREES_DEFAULT,
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
      { heading: 'Controls', body: '[ Draw to Hand ]: Deal a card (with arc animation).\n[ Discard Selected ]: Discard the selected card (with fade animation).\n[ Recall from Discard ]: Move top of discard back to hand.\n[ Flip Selected ]: Flip the selected card (two-phase animation).\n[ Move Selected ]: Tween selected card to display area (move demo).\n[ Cancel Move ]: Cancel an active move animation.\n[ Show Valid Moves ]: Highlight valid drop zones.\n[ Show Illegal ]: Trigger an illegal-move shake demo.\n[ Reset ]: Shuffle a new deck and deal starting hand.\n[ Select Next ]: Cycle selection in your hand.\nArc slider (right of hand): Adjust hand curvature live (0 = straight).' }
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

    this.createArcRadiusSlider();
    this.createSpacingSlider();
    this.createRotationSlider();

    // Initialize
    this.reset();
  }

  private createArcRadiusSlider(): void {
    const sliderY = this.SLIDER_Y;

    this.arcSliderTrack = this.add.rectangle(0, sliderY, this.ARC_SLIDER_WIDTH, this.ARC_SLIDER_HEIGHT, 0x334433, 1)
      .setOrigin(0, 0.5);

    this.arcSliderFill = this.add.rectangle(0, sliderY, 1, this.ARC_SLIDER_HEIGHT, 0x88ff88, 1)
      .setOrigin(0, 0.5);

    this.arcSliderHandle = this.add.graphics();

    this.arcSliderValueText = this.add.text(0, sliderY - 20, '', {
      fontSize: '11px',
      color: '#88ff88',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.arcSliderHitArea = this.add.zone(0, sliderY, this.ARC_SLIDER_WIDTH + 24, 28)
      .setInteractive({ useHandCursor: true });

    this.arcSliderHitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isArcSliderDragging = true;
      this.setArcRadiusFromPointer(pointer.x);
    });

    this.input.on('pointermove', this.handleArcSliderPointerMove, this);
    this.input.on('pointerup', this.handleArcSliderPointerUp, this);

    this.events.once('shutdown', () => {
      this.input.off('pointermove', this.handleArcSliderPointerMove, this);
      this.input.off('pointerup', this.handleArcSliderPointerUp, this);
    });

    this.updateArcSliderPosition();
    this.updateArcSliderVisuals();
  }

  private handleArcSliderPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isArcSliderDragging) return;
    this.setArcRadiusFromPointer(pointer.x);
  }

  private handleArcSliderPointerUp(): void {
    this.isArcSliderDragging = false;
  }

  private setArcRadiusFromPointer(pointerX: number): void {
    if (!this.arcSliderTrack) return;

    const minX = this.arcSliderTrack.x;
    const maxX = minX + this.ARC_SLIDER_WIDTH;
    const clampedX = Math.max(minX, Math.min(maxX, pointerX));
    const ratio = (clampedX - minX) / this.ARC_SLIDER_WIDTH;
    const nextRadius = this.ARC_RADIUS_MIN + ratio * (this.ARC_RADIUS_MAX - this.ARC_RADIUS_MIN);

    this.arcRadius = nextRadius;
    this.handView.setArcRadius(this.arcRadius);
    this.updateArcSliderVisuals();
  }

  private updateArcSliderPosition(): void {
    if (!this.arcSliderTrack || !this.arcSliderFill || !this.arcSliderHitArea || !this.arcSliderValueText) {
      return;
    }

    const trackX = this.ARC_SLIDER_X;

    this.arcSliderTrack.setPosition(trackX, this.SLIDER_Y);
    this.arcSliderFill.setPosition(trackX, this.SLIDER_Y);
    this.arcSliderHitArea.setPosition(trackX + this.ARC_SLIDER_WIDTH / 2, this.SLIDER_Y);
    this.arcSliderValueText.setPosition(trackX + this.ARC_SLIDER_WIDTH / 2, this.SLIDER_Y - 20);

    this.updateArcSliderVisuals();
    // Also update spacing slider position so both sliders track the hand
    try { this.updateSpacingSliderPosition(); } catch (_) { /* spacing slider may not be initialised */ }
  }

  private updateArcSliderVisuals(): void {
    if (!this.arcSliderTrack || !this.arcSliderFill || !this.arcSliderHandle || !this.arcSliderValueText) {
      return;
    }

    const ratio = (this.arcRadius - this.ARC_RADIUS_MIN) / (this.ARC_RADIUS_MAX - this.ARC_RADIUS_MIN);
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const fillWidth = Math.max(1, this.ARC_SLIDER_WIDTH * clampedRatio);
    const handleX = this.arcSliderTrack.x + fillWidth;
    const handleY = this.arcSliderTrack.y;

    this.arcSliderFill.setSize(fillWidth, this.ARC_SLIDER_HEIGHT);
    this.arcSliderFill.setPosition(this.arcSliderTrack.x, handleY);

    this.arcSliderHandle.clear();
    this.arcSliderHandle.fillStyle(0xffffff, 1);
    this.arcSliderHandle.fillCircle(handleX, handleY, 8);
    this.arcSliderHandle.lineStyle(2, 0x88ff88, 1);
    this.arcSliderHandle.strokeCircle(handleX, handleY, 8);

    this.arcSliderValueText.setText(`Arc: ${Math.round(this.arcRadius)}`);
  }

  // ── Spacing slider ──────────────────────────────────────

  private createSpacingSlider(): void {
    const sliderY = this.SLIDER_Y;

    this.spacingSliderTrack = this.add.rectangle(0, sliderY, this.ARC_SLIDER_WIDTH, this.ARC_SLIDER_HEIGHT, 0x333344, 1)
      .setOrigin(0, 0.5);

    this.spacingSliderFill = this.add.rectangle(0, sliderY, 1, this.ARC_SLIDER_HEIGHT, 0x88ff88, 1)
      .setOrigin(0, 0.5);

    this.spacingSliderHandle = this.add.graphics();

    this.spacingSliderValueText = this.add.text(0, sliderY - 20, '', {
      fontSize: '11px',
      color: '#88ff88',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.spacingSliderHitArea = this.add.zone(0, sliderY, this.ARC_SLIDER_WIDTH + 24, 28)
      .setInteractive({ useHandCursor: true });

    this.spacingSliderHitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isSpacingSliderDragging = true;
      this.setSpacingFromPointer(pointer.x);
    });

    this.input.on('pointermove', this.handleSpacingSliderPointerMove, this);
    this.input.on('pointerup', this.handleSpacingSliderPointerUp, this);

    this.events.once('shutdown', () => {
      this.input.off('pointermove', this.handleSpacingSliderPointerMove, this);
      this.input.off('pointerup', this.handleSpacingSliderPointerUp, this);
    });

    this.updateSpacingSliderPosition();
    this.updateSpacingSliderVisuals();
  }

  private handleSpacingSliderPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isSpacingSliderDragging) return;
    this.setSpacingFromPointer(pointer.x);
  }

  private handleSpacingSliderPointerUp(): void {
    this.isSpacingSliderDragging = false;
  }

  private setSpacingFromPointer(pointerX: number): void {
    if (!this.spacingSliderTrack || !this.spacingSliderValueText) return;

    const minSpacing = Math.round(CARD_W * (1 - 0.75));
    const maxSpacing = Math.round(CARD_W * (1 + 0.75));

    const minX = this.spacingSliderTrack.x;
    const maxX = minX + this.ARC_SLIDER_WIDTH;
    const clampedX = Math.max(minX, Math.min(maxX, pointerX));
    const ratio = (clampedX - minX) / this.ARC_SLIDER_WIDTH;
    const nextSpacing = Math.round(minSpacing + ratio * (maxSpacing - minSpacing));

    this.handView.setSpacing(nextSpacing);
    this.updateSpacingSliderVisuals();
  }

  private updateSpacingSliderPosition(): void {
    if (!this.spacingSliderTrack || !this.spacingSliderFill || !this.spacingSliderHitArea || !this.spacingSliderValueText) {
      return;
    }

    const trackX = this.SPACING_SLIDER_X;

    this.spacingSliderTrack.setPosition(trackX, this.SLIDER_Y);
    this.spacingSliderFill.setPosition(trackX, this.SLIDER_Y);
    this.spacingSliderHitArea.setPosition(trackX + this.ARC_SLIDER_WIDTH / 2, this.SLIDER_Y);
    this.spacingSliderValueText.setPosition(trackX + this.ARC_SLIDER_WIDTH / 2, this.SLIDER_Y - 20);

    this.updateSpacingSliderVisuals();
    // Also update rotation slider position so all sliders track the hand
    try { this.updateRotationSliderPosition(); } catch (_) { /* rotation slider may not be initialised */ }
  }

  private updateSpacingSliderVisuals(): void {
    if (!this.spacingSliderTrack || !this.spacingSliderFill || !this.spacingSliderHandle || !this.spacingSliderValueText) {
      return;
    }

    const minSpacing = Math.round(CARD_W * (1 - 0.75));
    const maxSpacing = Math.round(CARD_W * (1 + 0.75));
    const cur = this.handView.getSpacing ? this.handView.getSpacing() : this.HAND_SPACING;

    const ratio = (cur - minSpacing) / (maxSpacing - minSpacing);
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const fillWidth = Math.max(1, this.ARC_SLIDER_WIDTH * clampedRatio);
    const handleX = this.spacingSliderTrack.x + fillWidth;
    const handleY = this.spacingSliderTrack.y;

    this.spacingSliderFill.setSize(fillWidth, this.ARC_SLIDER_HEIGHT);
    this.spacingSliderFill.setPosition(this.spacingSliderTrack.x, handleY);

    this.spacingSliderHandle.clear();
    this.spacingSliderHandle.fillStyle(0xffffff, 1);
    this.spacingSliderHandle.fillCircle(handleX, handleY, 8);
    this.spacingSliderHandle.lineStyle(2, 0x88ff88, 1);
    this.spacingSliderHandle.strokeCircle(handleX, handleY, 8);

    this.spacingSliderValueText.setText(`Spacing: ${Math.round(cur)}`);
  }

  // ── Rotation slider ───────────────────────────────────

  private createRotationSlider(): void {
    const sliderY = this.SLIDER_Y;

    this.rotationSliderTrack = this.add.rectangle(0, sliderY, this.ARC_SLIDER_WIDTH, this.ARC_SLIDER_HEIGHT, 0x333344, 1)
      .setOrigin(0, 0.5);

    this.rotationSliderFill = this.add.rectangle(0, sliderY, 1, this.ARC_SLIDER_HEIGHT, 0x88ff88, 1)
      .setOrigin(0, 0.5);

    this.rotationSliderHandle = this.add.graphics();

    this.rotationSliderValueText = this.add.text(0, sliderY - 20, '', {
      fontSize: '11px',
      color: '#88ff88',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.rotationSliderHitArea = this.add.zone(0, sliderY, this.ARC_SLIDER_WIDTH + 24, 28)
      .setInteractive({ useHandCursor: true });

    this.rotationSliderHitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isRotationSliderDragging = true;
      this.setRotationFromPointer(pointer.x);
    });

    this.input.on('pointermove', this.handleRotationSliderPointerMove, this);
    this.input.on('pointerup', this.handleRotationSliderPointerUp, this);

    this.events.once('shutdown', () => {
      this.input.off('pointermove', this.handleRotationSliderPointerMove, this);
      this.input.off('pointerup', this.handleRotationSliderPointerUp, this);
    });

    this.updateRotationSliderPosition();
    this.updateRotationSliderVisuals();
  }

  private handleRotationSliderPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isRotationSliderDragging) return;
    this.setRotationFromPointer(pointer.x);
  }

  private handleRotationSliderPointerUp(): void {
    this.isRotationSliderDragging = false;
  }

  private setRotationFromPointer(pointerX: number): void {
    if (!this.rotationSliderTrack || !this.rotationSliderValueText) return;

    const minX = this.rotationSliderTrack.x;
    const maxX = minX + this.ARC_SLIDER_WIDTH;
    const clampedX = Math.max(minX, Math.min(maxX, pointerX));
    const ratio = (clampedX - minX) / this.ARC_SLIDER_WIDTH;
    const nextRotation = this.ROTATION_DEGREES_MIN + ratio * (this.ROTATION_DEGREES_MAX - this.ROTATION_DEGREES_MIN);

    this.handView.setMaxRotationDegrees(nextRotation);
    this.updateRotationSliderVisuals();
  }

  private updateRotationSliderPosition(): void {
    if (!this.rotationSliderTrack || !this.rotationSliderFill || !this.rotationSliderHitArea || !this.rotationSliderValueText) {
      return;
    }

    const trackX = this.ROTATION_SLIDER_X;

    this.rotationSliderTrack.setPosition(trackX, this.SLIDER_Y);
    this.rotationSliderFill.setPosition(trackX, this.SLIDER_Y);
    this.rotationSliderHitArea.setPosition(trackX + this.ARC_SLIDER_WIDTH / 2, this.SLIDER_Y);
    this.rotationSliderValueText.setPosition(trackX + this.ARC_SLIDER_WIDTH / 2, this.SLIDER_Y - 20);

    this.updateRotationSliderVisuals();
  }

  private updateRotationSliderVisuals(): void {
    if (!this.rotationSliderTrack || !this.rotationSliderFill || !this.rotationSliderHandle || !this.rotationSliderValueText) {
      return;
    }

    const cur = this.handView.getMaxRotationDegrees ? this.handView.getMaxRotationDegrees() : this.ROTATION_DEGREES_DEFAULT;

    const ratio = cur / this.ROTATION_DEGREES_MAX;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const fillWidth = Math.max(1, this.ARC_SLIDER_WIDTH * clampedRatio);
    const handleX = this.rotationSliderTrack.x + fillWidth;
    const handleY = this.rotationSliderTrack.y;

    this.rotationSliderFill.setSize(fillWidth, this.ARC_SLIDER_HEIGHT);
    this.rotationSliderFill.setPosition(this.rotationSliderTrack.x, handleY);

    this.rotationSliderHandle.clear();
    this.rotationSliderHandle.fillStyle(0xffffff, 1);
    this.rotationSliderHandle.fillCircle(handleX, handleY, 8);
    this.rotationSliderHandle.lineStyle(2, 0x88ff88, 1);
    this.rotationSliderHandle.strokeCircle(handleX, handleY, 8);

    this.rotationSliderValueText.setText(`Rotation: ${Math.round(cur)}°`);
  }

  private getHandPositionForIndex(index: number, handCount: number): { x: number; y: number } {
    const x = this.HAND_BASE_X + index * this.HAND_SPACING;

    if (this.arcRadius <= 0 || handCount < 3) {
      return { x, y: this.HAND_BASE_Y };
    }

    const firstX = this.HAND_BASE_X;
    const lastX = this.HAND_BASE_X + (handCount - 1) * this.HAND_SPACING;
    const arcCenterX = (firstX + lastX) / 2;
    const halfSpan = Math.max((lastX - firstX) / 2, 1);
    const normalized = (x - arcCenterX) / halfSpan;
    // Inverted arc: central card should be at the highest point while edges remain at baseY.
    // Use a parabolic profile that peaks at normalized=0 and falls to zero at normalized=±1.
    const offsetY = ((1 - normalized * normalized) * halfSpan * halfSpan) / (2 * this.arcRadius);

    return { x, y: this.HAND_BASE_Y - offsetY };
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

    const destination = this.getHandPositionForIndex(this.hand.length - 1, this.hand.length);
    const deckX = this.DECK_X;
    const deckY = this.PILE_Y;

    if (this.reducedMotion) {
      // Instant placement for reduced motion
      this.handView.setCards(this.hand);
      this.handView.setSelected(this.selectedIdx >= 0 ? this.selectedIdx : null);
      this.updateArcSliderPosition();
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
      this.updateArcSliderPosition();
      this.deckView.update();
      gameEvents.removeAllListeners();
      this.logEvent(`Drew ${card.rank}${card.suit} to hand (animated)`);
    });

    dealCard({
      scene: this,
      target: animSprite,
      destX: destination.x,
      destY: destination.y,
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
        this.updateArcSliderPosition();
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
      this.updateArcSliderPosition();
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

    const destination = this.getHandPositionForIndex(this.hand.length - 1, this.hand.length);
    const sourceX = this.DISCARD_X;
    const sourceY = this.PILE_Y;

    if (this.reducedMotion) {
      this.handView.setCards(this.hand);
      this.handView.setSelected(this.selectedIdx >= 0 ? this.selectedIdx : null);
      this.updateArcSliderPosition();
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
      this.updateArcSliderPosition();
      this.discardView.update();
      gameEvents.removeAllListeners();
      this.logEvent(`Recalled ${card.rank}${card.suit} from discard (animated)`);
    });

    dealCard({
      scene: this,
      target: animSprite,
      destX: destination.x,
      destY: destination.y,
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

    const highlightW = CARD_W + 16;
    const highlightH = CARD_H + 16;

    // Deck zone: centred on the deck pile sprite
    const deckZoneX = this.DECK_X - highlightW / 2;
    const deckZoneY = this.PILE_Y - highlightH / 2;

    // Discard zone: centred on the discard pile sprite
    const discardZoneX = this.DISCARD_X - highlightW / 2;
    const discardZoneY = this.PILE_Y - highlightH / 2;

    g.fillStyle(HIGHLIGHT_COLOR, HIGHLIGHT_ALPHA);
    g.lineStyle(2, HIGHLIGHT_COLOR, 0.8);
    g.fillRoundedRect(deckZoneX, deckZoneY, highlightW, highlightH, 8);
    g.strokeRoundedRect(deckZoneX, deckZoneY, highlightW, highlightH, 8);
    g.fillRoundedRect(discardZoneX, discardZoneY, highlightW, highlightH, 8);
    g.strokeRoundedRect(discardZoneX, discardZoneY, highlightW, highlightH, 8);

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

    // Reset arc slider to default on scene reset (no persistence).
    this.arcRadius = this.ARC_RADIUS_DEFAULT;
    this.handView.setArcRadius(this.arcRadius);
    this.updateArcSliderVisuals();

    // Reset rotation slider to default (backwards-compatible: 0 = no tilt)
    this.handView.setMaxRotationDegrees(this.ROTATION_DEGREES_DEFAULT);
    try { this.updateRotationSliderVisuals(); } catch (_) { /* ignore */ }

    // Sync UI components
    this.handView.setCards(this.hand);
    this.handView.setSelected(null);
    this.updateArcSliderPosition();
    this.deckView.setPile(this.drawPile);
    this.discardView.setPile(this.discardPile);

    this.logEvent('Reset: new deck shuffled, hand dealt');
  }

  private clearHighlights(): void {
    if (this.highlightGraphics) {
      this.highlightGraphics.clear();
    }
    // Remove any highlight labels
    for (const label of this.highlightLabels) {
      try { label.destroy(); } catch (_) { /* ignore */ }
    }
    this.highlightLabels = [];
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