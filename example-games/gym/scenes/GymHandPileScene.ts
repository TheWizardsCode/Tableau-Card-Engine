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
 *   - Toggle between horizontal row and vertical cascade layout
 *     to demonstrate the extended HandView layoutDirection option
 *
 * @module example-games/gym/scenes/GymHandPileScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_HAND_PILE_KEY } from '../GymRegistry';
import { createStandardDeck, shuffleArray } from '../../../src/card-system/Deck';
import { rankValue } from '../../../src/card-system/rankValue';
import { Pile } from '../../../src/card-system/Pile';
import { createSeededRng } from '../../../src/core-engine/SeededRng';
import { GameEventEmitter } from '../../../src/core-engine';
import { HandView } from '../../../src/ui/HandView';
import { PileView } from '../../../src/ui/PileView';
import { flipCard } from '../../../src/ui/flipCard';
import { discardCard } from '../../../src/ui/discardCard';
import { moveGameObject } from '../../../src/ui/moveGameObject';
import { shakeIllegalMove } from '../../../src/ui/shakeIllegalMove';
import { CARD_H, CARD_W, GAME_H, GAME_W } from '../../../src/ui/constants';
import { getCardTexture, ensureCardTextureFallbacks, preloadCardAssets } from '../../../src/ui/CardTextureHelpers';
import { createHudText } from '../../../src/ui/Renderer';
import { Slider } from '../../../src/ui/Slider';
import { HighlightManager } from '../../../src/ui/HighlightManager';
import type { Card } from '../../../src/card-system/Card';

const HAND_SIZE = 5;
const DEFAULT_SEED = 42;



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

  // Highlight manager
  private highlightManager!: HighlightManager;
  // Active move tween reference (for cancellation)
  private activeMoveTween: Phaser.Tweens.Tween | null = null;
  // State for tracking the moved card so Cancel Move can return it
  private movedCardIndex: number = -1;
  private movedCardOrigX: number = 0;
  private movedCardOrigY: number = 0;
  private cardMoved: boolean = false;
  // Discard pile visual drop zone graphics
  private discardZoneGraphics!: Phaser.GameObjects.Graphics;

  // Pile position constants — deck and discard on the right side
  private readonly DECK_X = GAME_W - 300;
  private readonly DISCARD_X = GAME_W - 160;
  private readonly PILE_Y = 250;

  // Hand layout constants
  private readonly HAND_SPACING = 20;
  private readonly HAND_CENTER_X = GAME_W / 2;
  private readonly HAND_BASE_Y = GAME_H - CARD_H - 80;

  // Slider layout constants
  private readonly SLIDER_Y = GAME_H - 40;
  private readonly SLIDER_HORIZ_GAP = 40;
  private readonly SLIDER_START_X = 375;
  private readonly ARC_SLIDER_WIDTH = 150;
  private readonly ARC_RADIUS_DEFAULT = 150;
  private readonly ROTATION_DEGREES_DEFAULT = 25;
  // Cascade / vertical layout state
  private readonly CASCADE_SPACING = 42;
  private readonly CASCADE_X = GAME_W / 2;
  private readonly CASCADE_TOP_Y = 220;
  private isVerticalLayout = false;
  private layoutLabel!: Phaser.GameObjects.Text;

  private arcRadius = this.ARC_RADIUS_DEFAULT;
  private arcSlider!: Slider;
  private spacingSlider!: Slider;
  private rotationSlider!: Slider;

  // Discard animation mode
  private discardMode: 'shrink' | 'animate' = 'animate';
  private discardModeLabel!: Phaser.GameObjects.Text;

  // Discard pile face-up display state
  private faceUpLabel!: Phaser.GameObjects.Text;

  // Drag-and-drop demo state
  private dragEnabled: boolean = false;
  private dragLabel!: Phaser.GameObjects.Text;
  private dragButton!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: GYM_HAND_PILE_KEY });
  }

  preload(): void {
    preloadCardAssets(this);
    // Load the illegal-move sound used by shakeIllegalMove
    this.load.audio('sfx-illegal-move', 'assets/audio/default/illegal-move.wav');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Hand & Pile Interactions');
    this.addDivider();
    this.initReducedMotion();

    ensureCardTextureFallbacks(this);

    // Create HandView for the player's hand
    this.handView = new HandView(this, {
      baseX: this.HAND_CENTER_X,
      baseY: this.HAND_BASE_Y,
      spacing: this.HAND_SPACING,
      centerX: this.HAND_CENTER_X,
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
        this.showDiscardZoneHighlight();
      }
    });

    // Wire drag-and-drop event handlers
    this.handView.on('dragstart', (_sourceRange: { from: number; to: number }) => {
      this.logEvent('Drag started');
      this.clearHighlights();
      this.highlightDropZones();
    });
    this.handView.on('dragmove', (payload: { sourceRange: { from: number; to: number }; x: number; y: number }) => {
      const targetIdx = this.hitTestDropZones(payload.x, payload.y);
      this.handView.setDragTargetPileIndex(targetIdx);
    });
    this.handView.on('dragend', (payload: {
      sourceRange: { from: number; to: number };
      targetPileIndex: number | null;
      accepted: boolean;
    }) => {
      this.clearHighlights();
      if (payload.accepted && payload.targetPileIndex !== null) {
        this.acceptDragDrop(payload);
      } else {
        this.logEvent(`Drop rejected (target=${payload.targetPileIndex}, accepted=${payload.accepted})`);
        // Rebuild hand so the card sprite is back in its original place
        this.time.delayedCall(200, () => {
          this.handView.setCards(this.hand);
          this.handView.setSelected(this.selectedIdx >= 0 ? this.selectedIdx : null);
        });
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

    // Create a visual drop zone indicator behind the discard pile
    this.createDiscardZoneIndicator();

    // Click handler: if a card is selected, discard it; otherwise recall from discard
    this.discardView.onClick(() => {
      if (this.selectedIdx >= 0 && this.selectedIdx < this.hand.length) {
        this.discardSelected();
      } else {
        this.recallFromDiscard();
      }
    });

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates HandView and PileView reusable UI components for card movement, selection, and animation. These components provide draggable hands, arc layouts, pile management, and a rich set of card animations (deal, discard, flip, move tween, illegal-move shake). In a real game like Golf or Lost Cities, HandView renders the player hand and PileView shows draw/discard piles with click-to-interact support.'
      },
      {
        heading: 'Controls',
        body: '[ Draw ]: Deal a card from the deck to the hand with an arc animation. Demonstrates animateAddCard().\n[ Discard ]: Discard the selected card to the discard pile (animates based on mode).\n[ Recall ]: Move the top card of the discard pile back to the hand.\n[ Flip ]: Flip the selected card (two-phase scale animation).\n[ Move ]: Tween the selected card to a display area. Demonstrates moveGameObject().\n[ Cancel Move ]: Cancel an active move tween and return the card to the hand.\n[ Show Valid ]: Highlight deck and discard zones as valid drop targets using HighlightManager.\n[ Show Illegal ]: Trigger an illegal-move shake animation on the selected card.\n[ Select Next ]: Cycle forward through cards in the hand.\n[ Sort Hand ]: Sort hand by suit then rank.\n[ Shuffle Hand ]: Randomly shuffle the hand.\n[ Reset ]: Shuffle a fresh deck and deal a new starting hand.\n[ Enable Drag ] / [ Disable Drag ]: Toggle drag-and-drop mode. When enabled, drag a card from hand to the discard pile.\n[ Toggle Discard Mode ]: Switch between animate (move+flip to discard pile, default) and shrink (fade+shrink in place).\n[ Toggle Face Up ]: Toggle the discard pile between face-up and face-down display. The order of cards is preserved — only the visible face changes.\nArc slider: Adjust hand curvature live (0 = straight, 200 = maximum arc).\nSpacing slider: Adjust gap between cards in the hand.\nRotation slider: Adjust maximum rotation angle for cards at the edges of an arc layout.\n[ Toggle Layout ]: Switch between horizontal row and vertical cascade layout.'
      },
      {
        heading: 'Usage Example',
        body: 'In a game of Golf, the player needs to draw from a deck, discard unwanted cards, and flip face-down cards. The animated draw and discard demonstrated here show how cards arc-visually move between piles, while the flip animation reveals hidden cards. The illegal-move shake provides instant feedback when the player tries an invalid action like drawing from an empty pile.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ Draw ] → card animates from deck to hand, event log confirms\n2. Press [ Select Next ] twice → second card selected, log shows selection\n3. Press [ Discard ] → selected card animates to discard pile (animate mode by default)\n4. Press [ Recall ] → card returns from discard to hand\n5. Press [ Flip ] → selected card flips face-down then face-up\n6. Press [ Show Valid ] → green highlights appear on deck and discard zones\n7. Press [ Show Illegal ] → selected card shakes if one is selected\n8. Press [ Toggle Discard Mode ] → switches to shrink mode\n9. Press [ Discard ] → card fades+shrinks in place (shrink mode)\n10. Press [ Toggle Discard Mode ] → switches back to animate mode\n11. Press [ Enable Drag ] → drag a card from hand to discard pile, verify log shows acceptance\n12. Adjust Arc slider → hand curvature changes live\n13. Press [ Toggle Layout ] → layout switches between horizontal and vertical cascade\n14. Press [ Toggle Face Up ] → discard pile shows face-down; press again → face-up\n15. Press [ Reset ] → new hand dealt, all state cleared, face-up state resets to face-up'
      }
    ]);

    const cx = GAME_W / 2;

    // Controls rows 1 + 2 (wrapping)
    this.initButtonBar(60);
    this.buttonBar!.addButton('[ Draw ]', () => this.drawToHand(), { zone: 'center' });
    this.buttonBar!.addButton('[ Discard ]', () => this.discardSelected(), { zone: 'center' });
    this.buttonBar!.addButton('[ Recall ]', () => this.recallFromDiscard(), { zone: 'center' });
    this.buttonBar!.addButton('[ Flip ]', () => this.flipSelected(), { zone: 'center' });
    this.buttonBar!.addButton('[ Move ]', () => this.moveSelectedCard(), { zone: 'center' });
    this.buttonBar!.addButton('[ Cancel Move ]', () => this.cancelMove(), { zone: 'center' });
    this.buttonBar!.addButton('[ Show Valid ]', () => this.showValidMoves(), { zone: 'center' });
    this.buttonBar!.addButton('[ Show Illegal ]', () => this.showIllegalMove(), { zone: 'center' });
    this.buttonBar!.addButton('[ Select Next ]', () => this.selectNext(), { zone: 'center' });
    this.buttonBar!.addButton('[ Sort Hand ]', () => this.sortHand(), { zone: 'center' });
    this.buttonBar!.addButton('[ Shuffle Hand ]', () => this.shuffleHand(), { zone: 'center' });
    this.buttonBar!.addButton('[ Reset ]', () => this.reset(), { zone: 'center' });

    // Controls row 3 — Drag-and-drop demo and discard mode toggle
    const row3Y = 112;
    this.initButtonBar(row3Y);
    this.dragButton = this.buttonBar!.addButton('[ Enable Drag ]', () => this.toggleDrag(), { zone: 'center' });
    this.dragLabel = createHudText(this, cx - 250, row3Y, 'Drag: off  (click card, then drag to discard)', '#777777', { fontSize: '11px' }).setOrigin(0, 0.5);
    this.buttonBar!.addButton('[ Toggle Discard Mode ]', () => this.toggleDiscardMode(), { zone: 'center' });
    this.discardModeLabel = createHudText(this, cx + 190, row3Y, 'Discard: animate', '#88ff88', { fontSize: '11px' }).setOrigin(0, 0.5);
    this.buttonBar!.addButton('[ Toggle Face Up ]', () => this.toggleDiscardFaceUp(), { zone: 'center' });
    this.faceUpLabel = createHudText(this, cx + 470, row3Y, 'Face: up', '#88ff88', { fontSize: '11px' }).setOrigin(0, 0.5);

    createHudText(this, cx, 147, '── Event Log ──', '#669966', { fontSize: '12px' }).setOrigin(0.5);

    // Create sliders using the shared utility
    const sliderY = this.SLIDER_Y;
    const sliderWidth = this.ARC_SLIDER_WIDTH;
    const sliderHorizGap = this.SLIDER_HORIZ_GAP;
    const startX = this.SLIDER_START_X;

    const arcSliderX = startX;
    const spacingSliderX = startX + sliderWidth + sliderHorizGap;
    const rotationSliderX = startX + 2 * (sliderWidth + sliderHorizGap);

    this.arcSlider = new Slider(this, arcSliderX, sliderY, {
      initialValue: this.ARC_RADIUS_DEFAULT,
      minValue: 0,
      maxValue: 200,
      label: 'Arc',
      width: sliderWidth,
      textColor: '#88ff88',
    });
    this.arcSlider.onValueChange = (value: number) => {
      this.arcRadius = value;
      this.handView.setArcRadius(value);
    };

    const minSpacing = Math.round(CARD_W * (1 - 0.75));
    const maxSpacing = Math.round(CARD_W * (1 + 0.75));
    this.spacingSlider = new Slider(this, spacingSliderX, sliderY, {
      initialValue: this.HAND_SPACING,
      minValue: minSpacing,
      maxValue: maxSpacing,
      label: 'Spacing',
      width: sliderWidth,
      textColor: '#88ff88',
    });
    this.spacingSlider.onValueChange = (value: number) => {
      this.handView.setSpacing(Math.round(value));
    };

    this.rotationSlider = new Slider(this, rotationSliderX, sliderY, {
      initialValue: this.ROTATION_DEGREES_DEFAULT,
      minValue: 0,
      maxValue: 45,
      label: 'Rotation',
      width: sliderWidth,
      textColor: '#88ff88',
    });
    this.rotationSlider.onValueChange = (value: number) => {
      this.handView.setMaxRotationDegrees(value);
    };

    // Toggle button and layout label — placed alongside the sliders
    this.initButtonBar(sliderY - 4);
    this.buttonBar!.addButton('[ Toggle Layout ]', () => this.toggleLayoutDirection(), { zone: 'left' });
    this.layoutLabel = createHudText(this, startX + 3 * (sliderWidth + sliderHorizGap) + 175, sliderY, 'Layout: horizontal', '#88ff88', { fontSize: '12px' });

    // Sliders self-manage their own pointermove/pointerup listeners,
    // registering only when actively dragged and unregistering on pointerup.
    // No scene-level forwarding is needed — each slider handles its own
    // drag lifecycle internally.

    // Initialize highlight manager for drop-zone rendering
    this.highlightManager = new HighlightManager(this);

    // Also wire selection change to update discard zone highlight
    this.handView.on('selectionchange', (index: number | null) => {
      if (index === null) {
        this.hideDiscardZoneHighlight();
      }
    });

    // Register shutdown lifecycle handler for explicit cleanup
    this.events.on('shutdown', this.shutdown, this);

    // Initialize
    this.reset();
  }



  /**
   * Show or hide a slider's visual components and disable its input zone.
   */
  private setSliderVisible(slider: Slider, visible: boolean): void {
    slider.track.setVisible(visible);
    slider.fill.setVisible(visible);
    slider.handle.setVisible(visible);
    slider.valueText.setVisible(visible);
    slider.hitArea.setVisible(visible);
    // Disable the input zone so it doesn't swallow pointer events
    if (slider.hitArea.input) {
      slider.hitArea.input.enabled = visible;
    }
  }

  /**
   * Toggle between horizontal and vertical (cascade) layout.
   * Adjusts HandView position, spacing, and slider availability accordingly.
   */
  private toggleLayoutDirection(): void {
    this.isVerticalLayout = !this.isVerticalLayout;

    if (this.isVerticalLayout) {
      // Switch to vertical cascade layout
      this.handView.setBaseX(this.CASCADE_X);
      this.handView.setBaseY(this.CASCADE_TOP_Y);
      this.handView.setSpacing(this.CASCADE_SPACING);
      this.handView.setLayoutDirection('vertical');
      this.handView.setSelected(null);

      // Sync the spacing slider to match cascade spacing
      this.spacingSlider.setValue(this.CASCADE_SPACING);

      // Hide arc and rotation sliders (ignored in vertical mode)
      this.setSliderVisible(this.arcSlider, false);
      this.setSliderVisible(this.rotationSlider, false);

      this.layoutLabel.setText('Layout: vertical cascade');
      this.logEvent('Switched to vertical cascade layout — cards stack top-to-bottom');
    } else {
      // Restore horizontal layout
      this.handView.setCenterX(this.HAND_CENTER_X);
      this.handView.setBaseY(this.HAND_BASE_Y);
      this.handView.setSpacing(this.HAND_SPACING);
      this.handView.setLayoutDirection('horizontal');
      this.handView.setSelected(null);

      // Restore arc, rotation, and spacing sliders to defaults
      this.arcRadius = this.ARC_RADIUS_DEFAULT;
      this.arcSlider.setValue(this.ARC_RADIUS_DEFAULT);
      this.arcSlider.onValueChange?.(this.ARC_RADIUS_DEFAULT);
      this.rotationSlider.setValue(this.ROTATION_DEGREES_DEFAULT);
      this.rotationSlider.onValueChange?.(this.ROTATION_DEGREES_DEFAULT);
      this.spacingSlider.setValue(this.HAND_SPACING);

      // Show arc and rotation sliders again
      this.setSliderVisible(this.arcSlider, true);
      this.setSliderVisible(this.rotationSlider, true);

      this.layoutLabel.setText('Layout: horizontal');
      this.logEvent('Switched to horizontal layout — cards spread in a row');
    }
  }

  /** Find the sorted insertion index for a card (suit then rank). */
  private findSortedIndex(card: Card): number {
    for (let i = 0; i < this.hand.length; i++) {
      const existing = this.hand[i];
      const suitCmp = existing.suit.localeCompare(card.suit);
      if (suitCmp > 0) return i;                 // existing suit after card suit → insert before
      if (suitCmp < 0) continue;                  // existing suit before — keep looking
      if (rankValue(existing.rank) > rankValue(card.rank)) return i; // same suit, higher rank → insert before
    }
    return this.hand.length; // append at end
  }

  private async drawToHand(): Promise<void> {
    if (this.drawPile.isEmpty()) {
      this.logEvent('Cannot draw: draw pile is empty');
      this.showIllegalShake();
      return;
    }
    const card = this.drawPile.pop()!;
    card.faceUp = true;

    // Determine insertion index to maintain sorted order
    const insertIndex = this.findSortedIndex(card);

    // Delegate animation and card integration to HandView
    await this.handView.animateAddCard(card, {
      sourceX: this.DECK_X,
      sourceY: this.PILE_Y,
      duration: 400,
      insertAtIndex: insertIndex,
    });

    // Sync the scene's hand model after HandView has integrated the card
    this.hand.splice(insertIndex, 0, card);
    this.handView.setSelected(this.selectedIdx >= 0 ? this.selectedIdx : null);
    this.deckView.update();

    if (this.reducedMotion) {
      this.logEvent(`Drew ${card.rank}${card.suit} to hand (instant, reduced-motion)`);
    } else {
      this.logEvent(`Drew ${card.rank}${card.suit} to hand (animated)`);
    }
  }

  private discardSelected(): void {
    if (this.selectedIdx < 0 || this.selectedIdx >= this.hand.length) {
      this.logEvent('No card selected or invalid selection');
      this.showIllegalShake();
      return;
    }
    // Remove the card from hand model
    const card = this.hand.splice(this.selectedIdx, 1)[0];

    // Immediately update the data model before any animation starts.
    // This ensures the card is always in discardPile (not orphaned)
    // even if the animation completion event never fires.
    card.faceUp = false;
    this.discardPile.push(card);

    const spriteIdx = this.selectedIdx;
    const sprite = this.handView.getSpriteAt(spriteIdx);

    if (sprite && !this.reducedMotion) {
      const gameEvents = new GameEventEmitter();
      gameEvents.on('card:discarded', () => {
        this.selectedIdx = -1;
        this.clearHighlights();
        this.handView.setCards(this.hand);
        this.handView.setSelected(null);
        this.discardView.update();
        gameEvents.removeAllListeners();
        const modeLabel = this.discardMode === 'animate' ? 'move+flip' : 'fade';
        this.logEvent(`Discarded ${card.rank}${card.suit} (${modeLabel})`);
      });

      if (this.discardMode === 'animate') {
        // Animate card from its hand position to the discard pile, flipping on arrival
        discardCard({
          scene: this,
          target: sprite as any,
          destX: this.DISCARD_X,
          destY: this.PILE_Y,
          flipOnArrivalTexture: getCardTexture(card),
          duration: 400,
          depth: 2,
          destroyAfter: true,
          gameEvents,
          cardId: `${card.rank}${card.suit}`,
        });
      } else {
        // Shrink/fade in place (original behavior)
        discardCard({
          scene: this,
          target: sprite as any,
          offsetY: 30,
          duration: 350,
          destroyAfter: true,
          gameEvents,
          cardId: `${card.rank}${card.suit}`,
        });
      }
    } else {
      if (sprite) {
        // For reduced-motion, immediately clean up the sprite
        try { sprite.destroy(); } catch (_) { /* ignore */ }
      }
      // Data model already updated above — just UI cleanup
      this.selectedIdx = -1;
      this.clearHighlights();
      this.handView.setCards(this.hand);
      this.handView.setSelected(null);
      this.discardView.update();
      const modeLabel = this.discardMode === 'animate' ? 'move+flip' : 'fade';
      this.logEvent(`Discarded ${card.rank}${card.suit} (${modeLabel}, instant)`);
    }
  }

  private async recallFromDiscard(): Promise<void> {
    if (this.discardPile.isEmpty()) {
      this.logEvent('Cannot recall: discard pile is empty');
      this.showIllegalShake();
      return;
    }
    const card = this.discardPile.pop()!;
    card.faceUp = true;

    // Determine insertion index to maintain sorted order
    const insertIndex = this.findSortedIndex(card);

    // Delegate animation and card integration to HandView
    await this.handView.animateAddCard(card, {
      sourceX: this.DISCARD_X,
      sourceY: this.PILE_Y,
      duration: 350,
      insertAtIndex: insertIndex,
    });

    // Sync the scene's hand model after HandView has integrated the card
    this.hand.splice(insertIndex, 0, card);
    this.handView.setSelected(this.selectedIdx >= 0 ? this.selectedIdx : null);
    this.discardView.update();

    if (this.reducedMotion) {
      this.logEvent(`Recalled ${card.rank}${card.suit} from discard (instant, reduced-motion)`);
    } else {
      this.logEvent(`Recalled ${card.rank}${card.suit} from discard (animated)`);
    }
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

    const imgSprite = sprite as Phaser.GameObjects.Image;
    if (this.reducedMotion) {
      imgSprite.setTexture(newTexture);
      this.logEvent(`Flipped card (instant, reduced-motion) -> ${newTexture}`);
    } else {
      flipCard({
        scene: this,
        target: imgSprite,
        newTexture,
        duration: 300,
        onComplete: () => {
          this.logEvent(`Flipped card (animated) -> ${newTexture}`);
        },
      });
    }
  }

  private sortHand(): void {
    if (this.hand.length === 0) {
      this.logEvent('No cards to sort');
      return;
    }
    // Delegate sort animation to HandView — cards and sprites are
    // reordered internally; no manual sort + setCards needed.
    this.handView.sortCards(
      (a, b) => {
        if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
        return rankValue(a.rank) - rankValue(b.rank);
      },
      { animate: !this.reducedMotion },
    );
    this.logEvent('Hand sorted by suit then rank');
  }

  private shuffleHand(): void {
    if (this.hand.length === 0) {
      this.logEvent('No cards to shuffle');
      return;
    }
    shuffleArray(this.hand);
    this.selectedIdx = -1;
    this.handView.setCards(this.hand);
    this.handView.setSelected(null);
    this.logEvent('Hand shuffled');
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

    // Store original position and index so Cancel Move can return the card
    this.movedCardIndex = this.selectedIdx;
    this.movedCardOrigX = (sprite as any).x;
    this.movedCardOrigY = (sprite as any).y;
    this.cardMoved = true;

    const destX = GAME_W / 2 + 200;
    const destY = 200;

    if (this.reducedMotion) {
      (sprite as any).setPosition(destX, destY);
      this.logEvent(`Moved card (instant, reduced-motion)`);
    } else {
      this.activeMoveTween = moveGameObject({
        scene: this,
        target: sprite as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
        destX,
        destY,
        duration: 500,
        onComplete: () => {
          this.activeMoveTween = null;
          // cardMoved remains true so Cancel Move can still return the card
          this.logEvent('Move completed (animated)');
        },
      });
    }
  }

  private cancelMove(): void {
    // Stop any active move tween
    if (this.activeMoveTween) {
      this.activeMoveTween.stop();
      this.activeMoveTween = null;
    }

    // If a card was moved, return it to its original hand position
    if (this.cardMoved && this.movedCardIndex >= 0) {
      const sprite = this.handView.getSpriteAt(this.movedCardIndex);
      if (sprite) {
        if (this.reducedMotion) {
          (sprite as any).setPosition(this.movedCardOrigX, this.movedCardOrigY);
          this.logEvent('Move cancelled — card returned to hand (instant)');
        } else {
          this.tweens.add({
            targets: sprite as any,
            x: this.movedCardOrigX,
            y: this.movedCardOrigY,
            duration: 250,
            ease: 'Quad.easeOut',
            onComplete: () => {
              this.logEvent('Move cancelled — card returned to hand');
            },
          });
        }
      }

      // Clear the moved state
      this.cardMoved = false;
      this.movedCardIndex = -1;
    } else {
      this.logEvent('No active move to cancel');
    }
  }

  private showValidMoves(): void {
    this.clearHighlights();

    const highlightW = CARD_W + 16;
    const highlightH = CARD_H + 16;

    // Deck zone: centred on the deck pile sprite
    const deckZoneX = this.DECK_X - highlightW / 2;
    const deckZoneY = this.PILE_Y - highlightH / 2;

    // Discard zone: centred on the discard pile sprite
    const discardZoneX = this.DISCARD_X - highlightW / 2;
    const discardZoneY = this.PILE_Y - highlightH / 2;

    this.highlightManager.addZone('deck-valid', {
      x: deckZoneX, y: deckZoneY, w: highlightW, h: highlightH,
      style: 'fill', color: 0x44ff44, alpha: 0.35,
      lifetime: 3000,
    });
    this.highlightManager.addZone('discard-valid', {
      x: discardZoneX, y: discardZoneY, w: highlightW, h: highlightH,
      style: 'fill', color: 0x44ff44, alpha: 0.35,
      lifetime: 3000,
    });

    this.logEvent('Showing valid drop zones (green highlights)');
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
        (target as any).setTint(0xff4444);
        this.time?.delayedCall(200, () => {
          try { (target as any).clearTint(); } catch (_) { /* ignore */ }
        });
        this.logEvent('Illegal move (brief tint, reduced-motion)');
      } else {
        shakeIllegalMove({
          scene: this,
          target: target as unknown as Phaser.GameObjects.Image,
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

    // Reset to horizontal layout if in vertical mode
    if (this.isVerticalLayout) {
      this.isVerticalLayout = false;
      this.handView.setCenterX(this.HAND_CENTER_X);
      this.handView.setBaseY(this.HAND_BASE_Y);
      this.handView.setSpacing(this.HAND_SPACING);
      this.handView.setLayoutDirection('horizontal');
      this.setSliderVisible(this.arcSlider, true);
      this.setSliderVisible(this.rotationSlider, true);
      this.layoutLabel.setText('Layout: horizontal');
    }

    // Reset sliders to defaults
    this.arcRadius = this.ARC_RADIUS_DEFAULT;
    this.arcSlider.setValue(this.ARC_RADIUS_DEFAULT);
    this.handView.setArcRadius(this.arcRadius);

    // Reset rotation slider to default
    this.rotationSlider.setValue(this.ROTATION_DEGREES_DEFAULT);
    this.handView.setMaxRotationDegrees(this.ROTATION_DEGREES_DEFAULT);

    // Reset face-up state to face-up
    this.discardView.setFaceUp(true);
    this.faceUpLabel.setText('Face: up');
    this.faceUpLabel.setColor('#88ff88');

    // Sync UI components
    this.handView.setCards(this.hand);
    this.handView.setSelected(null);
    this.deckView.setPile(this.drawPile);
    this.discardView.setPile(this.discardPile);

    this.logEvent('Reset: new deck shuffled, hand dealt');
  }

  private clearHighlights(): void {
    this.highlightManager.clearAll();
  }

  // ── Discard pile visual zone ─────────────────────────────

  /**
   * Create a persistent visual drop zone indicator behind the discard pile.
   *
   * Draws a semi-transparent rounded rectangle that serves as a visual
   * cue for where the discard pile is located, making it clear that
   * clicking here performs a discard action.
   */
  private createDiscardZoneIndicator(): void {
    this.discardZoneGraphics = this.add.graphics();

    // Zone slightly larger than a card for a generous drop target
    const zoneW = CARD_W + 24;
    const zoneH = CARD_H + 24;
    const zoneX = this.DISCARD_X - zoneW / 2;
    const zoneY = this.PILE_Y - zoneH / 2;

    // Default subtle outline (shown when no card is selected)
    this.discardZoneGraphics.lineStyle(2, 0x88aa88, 0.5);
    this.discardZoneGraphics.fillStyle(0x335533, 0.15);
    this.discardZoneGraphics.fillRoundedRect(zoneX, zoneY, zoneW, zoneH, 10);
    this.discardZoneGraphics.strokeRoundedRect(zoneX, zoneY, zoneW, zoneH, 10);

    // Move the discard pile sprite in front of the zone
    this.discardView.getSprite().setDepth(1);
    this.discardView.getCountText().setDepth(1);
  }

  /**
   * Show a green highlight on the discard drop zone when a card
   * is selected, indicating it can be clicked to discard.
   */
  private showDiscardZoneHighlight(): void {
    const highlightW = CARD_W + 24;
    const highlightH = CARD_H + 24;
    const zoneX = this.DISCARD_X - highlightW / 2;
    const zoneY = this.PILE_Y - highlightH / 2;

    this.highlightManager.addZone('discard-click-target', {
      x: zoneX,
      y: zoneY,
      w: highlightW,
      h: highlightH,
      style: 'fill',
      color: 0x44ff44,
      alpha: 0.25,
      strokeColor: 0x44ff44,
      strokeWidth: 3,
    });
  }

  /**
   * Remove the discard zone highlight when the card selection is cleared.
   */
  private hideDiscardZoneHighlight(): void {
    this.highlightManager.removeZone('discard-click-target');
  }

  // ── Drag-and-drop demo helpers ──────────────────────────

  /** Toggle drag-and-drop mode on/off. */
  private toggleDrag(): void {
    this.dragEnabled = !this.dragEnabled;
    this.handView.setDragEnabled(this.dragEnabled);

    if (this.dragEnabled) {
      this.dragButton.setText('[ Disable Drag ]');
      this.dragLabel.setText('Drag: ON  (drag card to the discard pile)');
      this.dragLabel.setColor('#88ff88');
      // Validator always returns true — the scene decides what to do in dragend
      this.handView.setDragValidator(() => true);
      this.logEvent('Drag mode ON — cards are draggable to the discard pile');
    } else {
      this.dragButton.setText('[ Enable Drag ]');
      this.dragLabel.setText('Drag: off  (click card, then drag to discard)');
      this.dragLabel.setColor('#777777');
      this.handView.setDragValidator(null);
      this.handView.setSelected(null);
      this.clearHighlights();
      this.logEvent('Drag mode OFF — restored click-to-select behavior');
    }
  }

  /** Toggle discard pile display between face-up and face-down. */
  private toggleDiscardFaceUp(): void {
    const isFaceUp = this.discardView.getFaceUp();
    this.discardView.setFaceUp(!isFaceUp);

    if (!isFaceUp) {
      this.faceUpLabel.setText('Face: up');
      this.faceUpLabel.setColor('#88ff88');
      this.logEvent('Discard pile set to face-up');
    } else {
      this.faceUpLabel.setText('Face: down');
      this.faceUpLabel.setColor('#ff8888');
      this.logEvent('Discard pile set to face-down (visual only, card order preserved)');
    }
  }

  /** Toggle discard animation mode between animate and shrink. */
  private toggleDiscardMode(): void {
    if (this.discardMode === 'animate') {
      this.discardMode = 'shrink';
      this.discardModeLabel.setText('Discard: shrink');
      this.discardModeLabel.setColor('#ffaa44');
      this.logEvent('Discard mode switched to shrink (fade+shrink in place)');
    } else {
      this.discardMode = 'animate';
      this.discardModeLabel.setText('Discard: animate');
      this.discardModeLabel.setColor('#88ff88');
      this.logEvent('Discard mode switched to animate (move to discard pile)');
    }
  }

  /**
   * Hit-test pointer position against the discard pile zone.
   * Returns target pile index (1, discard) or null if not over the discard pile.
   * The deck is intentionally excluded as a drop target.
   */
  private hitTestDropZones(pointerX: number, pointerY: number): number | null {
    const halfW = CARD_W + 40;  // ~136px half-width for generous grab zone
    const halfH = CARD_H / 2 + 60; // ~125px vertical tolerance

    // Only check discard pile zone
    if (
      Math.abs(pointerX - this.DISCARD_X) < halfW &&
      Math.abs(pointerY - this.PILE_Y) < halfH
    ) {
      return 1; // discard
    }

    return null;
  }

  /** Draw a green highlight on the discard drop zone. */
  private highlightDropZones(): void {
    const highlightW = CARD_W + 16;
    const highlightH = CARD_H + 16;

    const discardX = this.DISCARD_X - highlightW / 2;
    const discardY = this.PILE_Y - highlightH / 2;

    this.highlightManager.addZone('discard-drop', {
      x: discardX, y: discardY, w: highlightW, h: highlightH,
      style: 'fill', color: 0x44ff44, alpha: 0.35,
    });
  }

  /**
   * Process an accepted drag-and-drop.
   * Moves the dragged card(s) to the target pile and updates the display.
   */
  private acceptDragDrop(payload: {
    sourceRange: { from: number; to: number };
    targetPileIndex: number | null;
  }): void {
    // We only drag single cards in this demo (horizontal mode: from === to)
    const cardIdx = payload.sourceRange.from;
    if (cardIdx < 0 || cardIdx >= this.hand.length) {
      this.logEvent('Drag accept failed: invalid card index');
      return;
    }

    const card = this.hand[cardIdx];

    // Wait a brief frame for the acceptance animation to start, then update
    this.time.delayedCall(50, () => {
      // Move card from hand to discard pile
      this.hand.splice(cardIdx, 1);
      card.faceUp = false;
      this.discardPile.push(card);

      this.selectedIdx = -1;
      this.handView.setCards(this.hand);
      this.handView.setSelected(null);
      this.deckView.update();
      this.discardView.update();
      this.logEvent(`Drop accepted: ${card.rank}${card.suit} moved to discard`);
    });
  }

  /**
   * Clean up all scene-created objects, tweens, and event listeners
   * when the scene shuts down.
   *
   * Registered as a `shutdown` event listener in `create()` so it fires
   * automatically when the Scene Manager stops this scene. This prevents
   * memory leaks from stale references (highlightGraphics, sliders, etc.)
   * and stops any active tweens before they can fire callbacks on a
   * non-existent scene.
   *
   * The base class (`GymSceneBase`) also registers its own `shutdown`
   * listener via initHelp() for helpPanel/helpButton cleanup — both run
   * independently during shutdown.
   */
  private shutdown(): void {
    // Stop any active move tween
    if (this.activeMoveTween) {
      this.activeMoveTween.stop();
      this.activeMoveTween = null;
    }

    // Destroy highlight manager
    try { this.highlightManager?.destroy(); } catch (_) { /* ignore */ }

    // Destroy discard zone graphics
    try { this.discardZoneGraphics?.destroy(); } catch (_) { /* ignore */ }

    // Destroy sliders (each has a built-in destroy() that cleans up
    // sub-objects — track, fill, handle, valueText, hitArea — and
    // removes any self-registered pointermove/pointerup listeners)
    try { this.arcSlider?.destroy(); } catch (_) { /* ignore */ }
    try { this.spacingSlider?.destroy(); } catch (_) { /* ignore */ }
    try { this.rotationSlider?.destroy(); } catch (_) { /* ignore */ }

    // Destroy UI view components (HandView and PileView both have
    // destroy() that cleans up sprites, labels, and event listeners)
    try { this.handView?.destroy(); } catch (_) { /* ignore */ }
    try { this.deckView?.destroy(); } catch (_) { /* ignore */ }
    try { this.discardView?.destroy(); } catch (_) { /* ignore */ }

    // Destroy layout, drag, and discard mode UI text labels
    try { this.layoutLabel?.destroy(); } catch (_) { /* ignore */ }
    try { this.dragLabel?.destroy(); } catch (_) { /* ignore */ }
    try { this.dragButton?.destroy(); } catch (_) { /* ignore */ }
    try { this.discardModeLabel?.destroy(); } catch (_) { /* ignore */ }
    try { this.faceUpLabel?.destroy(); } catch (_) { /* ignore */ }

    // Destroy all event log text objects
    for (const t of this.logTexts) {
      try { t.destroy(); } catch (_) { /* ignore */ }
    }
    this.logTexts = [];

    // Clear internal state arrays
    this.hand = [];
    this.eventLog = [];

    // Unregister this listener to avoid double-call if the scene
    // is shut down again
    this.events.off('shutdown', this.shutdown, this);
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 14) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const baseY = 230;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = createHudText(this, 40, baseY + i * 17, this.eventLog[i], '#aaddaa', { fontSize: '11px' });
      this.logTexts.push(txt);
    }
  }
}