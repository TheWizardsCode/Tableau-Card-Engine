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
import {
  DROP_REJECT_DELAY_MS,
  HAND_BUTTON_ROW_1_Y,
  HAND_BUTTON_ROW_2_Y,
  HAND_INFO_Y,
  HAND_DRAG_LABEL_X,
  HAND_DISCARD_MODE_LABEL_X,
  HAND_FACE_UP_LABEL_X,
  HAND_LAYOUT_LABEL_X,
  HAND_EVENT_LOG_HEADER_Y,
  HAND_LABEL_FONT_SIZE,
  HAND_LAYOUT_LABEL_FONT_SIZE,
  ARC_SLIDER_MAX,
  ROTATION_SLIDER_MAX,
  SPACING_SLIDER_RATIO,
  VALID_HIGHLIGHT_COLOR,
  VALID_HIGHLIGHT_ALPHA,
  VALID_HIGHLIGHT_LIFETIME,
  ILLEGAL_TINT_COLOR,
  ILLEGAL_OVERLAY_ALPHA,
  FALLBACK_CARD_WIDTH,
  FALLBACK_CARD_HEIGHT,
  ILLEGAL_TINT_DURATION_MS,
  ILLEGAL_SHAKE_DISTANCE,
  ILLEGAL_SHAKE_DURATION_MS,
  ILLEGAL_SHAKE_REPEAT,
  DROP_ZONE_PAD,
  DROP_ZONE_RADIUS,
  DROP_ZONE_STROKE_WIDTH,
  DROP_ZONE_STROKE_COLOR,
  DROP_ZONE_STROKE_ALPHA,
  DROP_ZONE_FILL_COLOR,
  DROP_ZONE_FILL_ALPHA,
  DISCARD_CLICK_ALPHA,
  DISCARD_CLICK_STROKE_WIDTH,
  DROP_HIT_TEST_X_PAD,
  DROP_HIT_TEST_Y_PAD,
  DROP_HIGHLIGHT_PAD,
  DROP_ACCEPT_DELAY_MS,
  HAND_LOG_MAX_LINES,
  HAND_LOG_BASE_Y,
  HAND_LOG_LINE_HEIGHT,
  HAND_LOG_X,
  HAND_DEAL_DURATION_MS,
  HAND_DISCARD_ANIMATE_DURATION_MS,
  HAND_DISCARD_SHRINK_OFFSET_Y,
  HAND_DISCARD_SHRINK_DURATION_MS,
  HAND_RECALL_DURATION_MS,
  HAND_FLIP_DURATION_MS,
  HAND_MOVE_DEST_X_OFFSET,
  HAND_MOVE_DEST_Y,
  HAND_MOVE_DURATION_MS,
  HAND_CANCEL_MOVE_DURATION_MS,
} from './GymConstants';

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
  // Selection-raise slider bounds — raise defaults to 60px (max 180px)
  private readonly RAISE_DEFAULT = 60;
  private readonly RAISE_MAX = 180;
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
  private raiseSlider!: Slider;

  // Discard animation mode
  private discardMode: 'shrink' | 'animate' = 'animate';
  private discardModeLabel!: Phaser.GameObjects.Text;

  // Discard pile face-up display state
  private faceUpLabel!: Phaser.GameObjects.Text;

  // Drag-and-drop demo state — enabled by default so the primary
  // interaction (drag to discard) is available immediately.
  private dragEnabled: boolean = true;
  private dragLabel!: Phaser.GameObjects.Text;
  private dragButton!: Phaser.GameObjects.Text;
  private outlinesButton!: Phaser.GameObjects.Text;
  private outlinesEnabled: boolean = true;

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
      showPositionOutlines: true,
      maxSlots: HAND_SIZE + 2,
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
        this.time.delayedCall(DROP_REJECT_DELAY_MS, () => {
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
        body: 'Demonstrates HandView and PileView reusable UI components for card movement, selection, and animation. These components provide draggable hands, arc layouts, pile management, and a rich set of card animations (deal, discard, flip, move tween, illegal-move shake). Ghost position outlines (stroke-only rectangles, depth index−0.5) render behind every card and empty slot so players always see hand capacity, even in an empty hand when maxSlots is set. In a real game like Golf or Lost Cities, HandView renders the player hand and PileView shows draw/discard piles with click-to-interact support.'
      },
      {
        heading: 'Controls',
        body: '[ Draw ]: Deal a card from the deck to the hand with an arc animation. Demonstrates animateAddCard().\n[ Discard ]: Discard the selected card to the discard pile (animates based on mode).\n[ Recall ]: Move the top card of the discard pile back to the hand.\n[ Flip ]: Flip the selected card (two-phase scale animation).\n[ Move ]: Tween the selected card to a display area. Demonstrates moveGameObject().\n[ Cancel Move ]: Cancel an active move tween and return the card to the hand.\n[ Show Valid ]: Highlight deck and discard zones as valid drop targets using HighlightManager.\n[ Show Illegal ]: Trigger an illegal-move shake animation on the selected card.\n[ Select Next ]: Cycle forward through cards in the hand.\n[ Sort Hand ]: Sort hand by suit then rank.\n[ Shuffle Hand ]: Randomly shuffle the hand.\n[ Reset ]: Shuffle a fresh deck and deal a new starting hand.\n[ Disable Drag ] / [ Enable Drag ]: Toggle drag-and-drop mode (ON by default). When enabled, drag a card from hand to the discard pile. When disabled, click a card to select it, then click the discard pile to discard it.\n[ Toggle Discard Mode ]: Switch between animate (move+flip to discard pile, default) and shrink (fade+shrink in place).\n[ Toggle Face Up ]: Toggle the discard pile between face-up and face-down display. The order of cards is preserved — only the visible face changes.\n[ Outlines ON/OFF ]: Toggle the ghost card-position outlines. When ON, semi-transparent stroke-only outlines render behind every card and empty slot (maxSlots=HAND_SIZE+2). Press again to hide.\nArc slider: Adjust hand curvature live (0 = straight, 200 = maximum arc).\nSpacing slider: Adjust gap between cards in the hand.\nRotation slider: Adjust maximum rotation angle for cards at the edges of an arc layout.\nRaise slider: Adjust how far the selected card lifts out of the hand (default 60px, max 180px; 0 = off). The raise follows the card rotation in arc layout (straight up at 0°); in vertical cascade the selected card shifts right by the slider amount.\n[ Toggle Layout ]: Switch between horizontal row and vertical cascade layout.'
      },
      {
        heading: 'Usage Example',
        body: 'In a game of Golf, the player needs to draw from a deck, discard unwanted cards, and flip face-down cards. The animated draw and discard demonstrated here show how cards arc-visually move between piles, while the flip animation reveals hidden cards. The illegal-move shake provides instant feedback when the player tries an invalid action like drawing from an empty pile. Ghost position outlines show every slot in the tableau even before cards are dealt, so the player can always see hand capacity.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ Draw ] → card animates from deck to hand, event log confirms\n2. Press [ Select Next ] twice → second card selected, log shows selection\n3. Press [ Discard ] → selected card animates to discard pile (animate mode by default)\n4. Press [ Recall ] → card returns from discard to hand\n5. Press [ Flip ] → selected card flips face-down then face-up\n6. Press [ Show Valid ] → green highlights appear on deck and discard zones\n7. Press [ Show Illegal ] → selected card shakes if one is selected\n8. Press [ Toggle Discard Mode ] → switches to shrink mode\n9. Press [ Discard ] → card fades+shrinks in place (shrink mode)\n10. Press [ Toggle Discard Mode ] → switches back to animate mode\n11. Verify drag is ON by default → drag a card from hand to discard pile, verify log shows acceptance\n12. Press [ Disable Drag ] → drag off; click a card then the discard pile to discard it\n13. Adjust Arc slider → hand curvature changes live\n14. Press [ Toggle Layout ] → layout switches between horizontal and vertical cascade\n15. Press [ Toggle Face Up ] → discard pile shows face-down; press again → face-up\n16. Adjust Raise slider → selected card lifts out of the hand (horizontal: straight up at 0° rotation); select an edge card and verify the raise follows the rotation; switch to vertical cascade and verify the selected card shifts right\n17. Press [ Reset ] → new hand dealt, all state cleared, raise resets to the 60px default, face-up state resets to face-up\n18. Verify outlines ON by default → semi-transparent 2px outlines render behind every card slot (5 cards + 2 empty slots)\n19. Press [ Outlines OFF ] → outlines disappear; drag label shows Outlines: OFF\n20. Press [ Outlines ON ] → outlines re-appear at current layout positions\n21. Toggle layout to vertical cascade → outlines cascade vertically and reposition correctly'
      }
    ]);

    const cx = GAME_W / 2;

    // Controls row 1 — 12 action buttons spread across left/center/right
    // zones so they all fit on a single row (no vertical wrapping).
    this.initButtonBar(HAND_BUTTON_ROW_1_Y);
    this.buttonBar!.addButton('[ Draw ]', () => this.drawToHand(), { zone: 'left' });
    this.buttonBar!.addButton('[ Discard ]', () => this.discardSelected(), { zone: 'left' });
    this.buttonBar!.addButton('[ Recall ]', () => this.recallFromDiscard(), { zone: 'left' });
    this.buttonBar!.addButton('[ Flip ]', () => this.flipSelected(), { zone: 'left' });
    this.buttonBar!.addButton('[ Move ]', () => this.moveSelectedCard(), { zone: 'center' });
    this.buttonBar!.addButton('[ Cancel Move ]', () => this.cancelMove(), { zone: 'center' });
    this.buttonBar!.addButton('[ Show Valid ]', () => this.showValidMoves(), { zone: 'center' });
    this.buttonBar!.addButton('[ Show Illegal ]', () => this.showIllegalMove(), { zone: 'center' });
    this.buttonBar!.addButton('[ Select Next ]', () => this.selectNext(), { zone: 'right' });
    this.buttonBar!.addButton('[ Sort Hand ]', () => this.sortHand(), { zone: 'right' });
    this.buttonBar!.addButton('[ Shuffle Hand ]', () => this.shuffleHand(), { zone: 'right' });
    this.buttonBar!.addButton('[ Reset ]', () => this.reset(), { zone: 'right' });

    // Controls row 2 — mode toggles spread across zones on a single row.
    const row2Y = HAND_BUTTON_ROW_2_Y;
    this.initButtonBar(row2Y);
    this.dragButton = this.buttonBar!.addButton('[ Disable Drag ]', () => this.toggleDrag(), { zone: 'left' });
    this.buttonBar!.addButton('[ Toggle Discard Mode ]', () => this.toggleDiscardMode(), { zone: 'center' });
    this.buttonBar!.addButton('[ Toggle Face Up ]', () => this.toggleDiscardFaceUp(), { zone: 'right' });
    this.buttonBar!.addButton('[ Toggle Layout ]', () => this.toggleLayoutDirection(), { zone: 'right' });
    this.outlinesButton = this.buttonBar!.addButton('[ Outlines ON ]', () => this.toggleOutlines(), { zone: 'right' });

    // Status/info line below the buttons — never overlaps the buttons.
    const infoY = HAND_INFO_Y;
    this.dragLabel = createHudText(this, HAND_DRAG_LABEL_X, infoY, 'Drag: ON  (drag card to the discard pile)  |  Outlines: ON', '#88ff88', { fontSize: HAND_LABEL_FONT_SIZE }).setOrigin(0, 0.5);
    this.discardModeLabel = createHudText(this, HAND_DISCARD_MODE_LABEL_X, infoY, 'Discard: animate', '#88ff88', { fontSize: HAND_LABEL_FONT_SIZE }).setOrigin(0, 0.5);
    this.faceUpLabel = createHudText(this, HAND_FACE_UP_LABEL_X, infoY, 'Face: up', '#88ff88', { fontSize: HAND_LABEL_FONT_SIZE }).setOrigin(0, 0.5);
    this.layoutLabel = createHudText(this, HAND_LAYOUT_LABEL_X, infoY, 'Layout: horizontal', '#88ff88', { fontSize: HAND_LAYOUT_LABEL_FONT_SIZE }).setOrigin(0, 0.5);

    // Apply the default drag state (ON) so HandView is configured before use
    this.applyDragState();

    createHudText(this, cx, HAND_EVENT_LOG_HEADER_Y, '── Event Log ──', '#669966', { fontSize: HAND_LAYOUT_LABEL_FONT_SIZE }).setOrigin(0.5);

    // Create sliders using the shared utility
    const sliderY = this.SLIDER_Y;
    const sliderWidth = this.ARC_SLIDER_WIDTH;
    const sliderHorizGap = this.SLIDER_HORIZ_GAP;
    const startX = this.SLIDER_START_X;

    const arcSliderX = startX;
    const spacingSliderX = startX + sliderWidth + sliderHorizGap;
    const rotationSliderX = startX + 2 * (sliderWidth + sliderHorizGap);
    const raiseSliderX = startX + 3 * (sliderWidth + sliderHorizGap);

    this.arcSlider = new Slider(this, arcSliderX, sliderY, {
      initialValue: this.ARC_RADIUS_DEFAULT,
      minValue: 0,
      maxValue: ARC_SLIDER_MAX,
      label: 'Arc',
      width: sliderWidth,
      textColor: '#88ff88',
    });
    this.arcSlider.onValueChange = (value: number) => {
      this.arcRadius = value;
      this.handView.setArcRadius(value);
    };

    const minSpacing = Math.round(CARD_W * (1 - SPACING_SLIDER_RATIO));
    const maxSpacing = Math.round(CARD_W * (1 + SPACING_SLIDER_RATIO));
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
      maxValue: ROTATION_SLIDER_MAX,
      label: 'Rotation',
      width: sliderWidth,
      textColor: '#88ff88',
    });
    this.rotationSlider.onValueChange = (value: number) => {
      this.handView.setMaxRotationDegrees(value);
    };

    // Selection-raise slider — lifts the selected card out of the hand
    // along its rotation. Stays visible in both layouts (vertical mode
    // shifts the selected card right by the same amount).
    this.raiseSlider = new Slider(this, raiseSliderX, sliderY, {
      initialValue: this.RAISE_DEFAULT,
      minValue: 0,
      maxValue: this.RAISE_MAX,
      label: 'Raise',
      width: sliderWidth,
      textColor: '#88ff88',
    });
    this.raiseSlider.onValueChange = (value: number) => {
      this.handView.setSelectionLift(value);
    };

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
      duration: HAND_DEAL_DURATION_MS,
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
          duration: HAND_DISCARD_ANIMATE_DURATION_MS,
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
          offsetY: HAND_DISCARD_SHRINK_OFFSET_Y,
          duration: HAND_DISCARD_SHRINK_DURATION_MS,
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
      duration: HAND_RECALL_DURATION_MS,
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
        duration: HAND_FLIP_DURATION_MS,
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

    // Store original position and index so Cancel Move can return the card.
    // Use the hand's base (un-raised) position: the sprite's current x/y
    // includes the selection-raise offset, which would return the card to
    // a raised position instead of its true resting spot in the hand.
    this.movedCardIndex = this.selectedIdx;
    const basePos = this.handView.getBasePosition(this.selectedIdx);
    this.movedCardOrigX = basePos ? basePos.x : (sprite as any).x;
    this.movedCardOrigY = basePos ? basePos.y : (sprite as any).y;
    this.cardMoved = true;

    const destX = GAME_W / 2 + HAND_MOVE_DEST_X_OFFSET;
    const destY = HAND_MOVE_DEST_Y;

    if (this.reducedMotion) {
      (sprite as any).setPosition(destX, destY);
      this.logEvent(`Moved card (instant, reduced-motion)`);
    } else {
      this.activeMoveTween = moveGameObject({
        scene: this,
        target: sprite as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
        destX,
        destY,
        duration: HAND_MOVE_DURATION_MS,
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
      // Clear the selection first: applySelectionRaise() kills any
      // in-flight selection-raise tween and returns the card to its base
      // position. Clearing selection also prevents the raise offset from
      // being re-applied on top of the return tween, so the card ends up
      // exactly at its original hand position.
      this.selectedIdx = -1;
      this.handView.setSelected(null);

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
            duration: HAND_CANCEL_MOVE_DURATION_MS,
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

    const highlightW = CARD_W + DROP_HIGHLIGHT_PAD;
    const highlightH = CARD_H + DROP_HIGHLIGHT_PAD;

    // Deck zone: centred on the deck pile sprite
    const deckZoneX = this.DECK_X - highlightW / 2;
    const deckZoneY = this.PILE_Y - highlightH / 2;

    // Discard zone: centred on the discard pile sprite
    const discardZoneX = this.DISCARD_X - highlightW / 2;
    const discardZoneY = this.PILE_Y - highlightH / 2;

    this.highlightManager.addZone('deck-valid', {
      x: deckZoneX, y: deckZoneY, w: highlightW, h: highlightH,
      style: 'fill', color: VALID_HIGHLIGHT_COLOR, alpha: VALID_HIGHLIGHT_ALPHA,
      lifetime: VALID_HIGHLIGHT_LIFETIME,
    });
    this.highlightManager.addZone('discard-valid', {
      x: discardZoneX, y: discardZoneY, w: highlightW, h: highlightH,
      style: 'fill', color: VALID_HIGHLIGHT_COLOR, alpha: VALID_HIGHLIGHT_ALPHA,
      lifetime: VALID_HIGHLIGHT_LIFETIME,
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
        // Use both setTint (WebGL) and overlay (Canvas) for renderer compatibility
        (target as any).setTint(ILLEGAL_TINT_COLOR);
        const tgt = target as any;
        const overlayW = tgt.displayWidth ?? tgt.width ?? FALLBACK_CARD_WIDTH;
        const overlayH = tgt.displayHeight ?? tgt.height ?? FALLBACK_CARD_HEIGHT;
        const tintOverlay = this.add.rectangle(
          tgt.x, tgt.y,
          overlayW, overlayH,
          ILLEGAL_TINT_COLOR,
        )
          .setAlpha(ILLEGAL_OVERLAY_ALPHA)
          .setOrigin(tgt.originX ?? 0.5, tgt.originY ?? 0.5)
          .setRotation(tgt.rotation ?? 0)
          .setDepth((tgt.depth ?? 0) + 0.1);
        this.time?.delayedCall(ILLEGAL_TINT_DURATION_MS, () => {
          try { (target as any).clearTint(); } catch (_) { /* ignore */ }
          tintOverlay.destroy();
        });
        this.logEvent('Illegal move (brief tint, reduced-motion)');
      } else {
        shakeIllegalMove({
          scene: this,
          target: target as unknown as Phaser.GameObjects.Image,
          tint: ILLEGAL_TINT_COLOR,
          shakeDistance: ILLEGAL_SHAKE_DISTANCE,
          duration: ILLEGAL_SHAKE_DURATION_MS,
          repeat: ILLEGAL_SHAKE_REPEAT,
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

    // Reset selection-raise slider to default (raise off)
    this.raiseSlider.setValue(this.RAISE_DEFAULT);
    this.handView.setSelectionLift(this.RAISE_DEFAULT);

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
    const zoneW = CARD_W + DROP_ZONE_PAD;
    const zoneH = CARD_H + DROP_ZONE_PAD;
    const zoneX = this.DISCARD_X - zoneW / 2;
    const zoneY = this.PILE_Y - zoneH / 2;

    // Default subtle outline (shown when no card is selected)
    this.discardZoneGraphics.lineStyle(DROP_ZONE_STROKE_WIDTH, DROP_ZONE_STROKE_COLOR, DROP_ZONE_STROKE_ALPHA);
    this.discardZoneGraphics.fillStyle(DROP_ZONE_FILL_COLOR, DROP_ZONE_FILL_ALPHA);
    this.discardZoneGraphics.fillRoundedRect(zoneX, zoneY, zoneW, zoneH, DROP_ZONE_RADIUS);
    this.discardZoneGraphics.strokeRoundedRect(zoneX, zoneY, zoneW, zoneH, DROP_ZONE_RADIUS);

    // Move the discard pile sprite in front of the zone
    this.discardView.getSprite().setDepth(1);
    this.discardView.getCountText().setDepth(1);
  }

  /**
   * Show a green highlight on the discard drop zone when a card
   * is selected, indicating it can be clicked to discard.
   */
  private showDiscardZoneHighlight(): void {
    const highlightW = CARD_W + DROP_ZONE_PAD;
    const highlightH = CARD_H + DROP_ZONE_PAD;
    const zoneX = this.DISCARD_X - highlightW / 2;
    const zoneY = this.PILE_Y - highlightH / 2;

    this.highlightManager.addZone('discard-click-target', {
      x: zoneX,
      y: zoneY,
      w: highlightW,
      h: highlightH,
      style: 'fill',
      color: VALID_HIGHLIGHT_COLOR,
      alpha: DISCARD_CLICK_ALPHA,
      strokeColor: VALID_HIGHLIGHT_COLOR,
      strokeWidth: DISCARD_CLICK_STROKE_WIDTH,
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
    this.applyDragState();
  }

  private toggleOutlines(): void {
    this.outlinesEnabled = !this.outlinesEnabled;
    this.handView.setShowPositionOutlines(this.outlinesEnabled);
    this.outlinesButton.setText(this.outlinesEnabled ? '[ Outlines ON ]' : '[ Outlines OFF ]');
    this.dragLabel.setText(
      `Drag: ${this.dragEnabled ? 'ON  (drag card to the discard pile)' : 'off  (click card, then click discard pile)'}  |  Outlines: ${this.outlinesEnabled ? 'ON' : 'OFF'}`,
    );
    this.dragLabel.setColor(this.outlinesEnabled ? '#88ff88' : '#777777');
    this.logEvent(`Position outlines ${this.outlinesEnabled ? 'ON' : 'OFF'}`);
  }

  /**
   * Apply the current dragEnabled state to HandView and the demo UI.
   *
   * When enabled, cards are draggable to the discard pile. When disabled,
   * the scene restores click-to-select + click-discard-pile behaviour.
   */
  private applyDragState(): void {
    this.handView.setDragEnabled(this.dragEnabled);

    if (this.dragEnabled) {
      this.dragButton.setText('[ Disable Drag ]');
      this.dragLabel.setText(`Drag: ON  (drag card to the discard pile)  |  Outlines: ${this.outlinesEnabled ? 'ON' : 'OFF'}`);
      this.dragLabel.setColor(this.outlinesEnabled ? '#88ff88' : '#777777');
      // Validator always returns true — the scene decides what to do in dragend
      this.handView.setDragValidator(() => true);
      this.logEvent('Drag mode ON — cards are draggable to the discard pile');
    } else {
      this.dragButton.setText('[ Enable Drag ]');
      this.dragLabel.setText(`Drag: off  (click card, then click discard pile)  |  Outlines: ${this.outlinesEnabled ? 'ON' : 'OFF'}`);
      this.dragLabel.setColor(this.outlinesEnabled ? '#88ff88' : '#777777');
      this.handView.setDragValidator(null);
      this.handView.setSelected(null);
      this.clearHighlights();
      this.logEvent('Drag mode OFF — click a card, then click the discard pile to discard');
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
    const halfW = CARD_W + DROP_HIT_TEST_X_PAD;  // ~136px half-width for generous grab zone
    const halfH = CARD_H / 2 + DROP_HIT_TEST_Y_PAD; // ~125px vertical tolerance

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
    const highlightW = CARD_W + DROP_HIGHLIGHT_PAD;
    const highlightH = CARD_H + DROP_HIGHLIGHT_PAD;

    const discardX = this.DISCARD_X - highlightW / 2;
    const discardY = this.PILE_Y - highlightH / 2;

    this.highlightManager.addZone('discard-drop', {
      x: discardX, y: discardY, w: highlightW, h: highlightH,
      style: 'fill', color: VALID_HIGHLIGHT_COLOR, alpha: VALID_HIGHLIGHT_ALPHA,
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
    this.time.delayedCall(DROP_ACCEPT_DELAY_MS, () => {
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
    try { this.raiseSlider?.destroy(); } catch (_) { /* ignore */ }

    // Destroy UI view components (HandView and PileView both have
    // destroy() that cleans up sprites, labels, and event listeners)
    try { this.handView?.destroy(); } catch (_) { /* ignore */ }
    try { this.deckView?.destroy(); } catch (_) { /* ignore */ }
    try { this.discardView?.destroy(); } catch (_) { /* ignore */ }

    // Destroy layout, drag, and discard mode UI text labels
    try { this.layoutLabel?.destroy(); } catch (_) { /* ignore */ }
    try { this.dragLabel?.destroy(); } catch (_) { /* ignore */ }
    try { this.dragButton?.destroy(); } catch (_) { /* ignore */ }
    try { this.outlinesButton?.destroy(); } catch (_) { /* ignore */ }
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
    if (this.eventLog.length > HAND_LOG_MAX_LINES) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const baseY = HAND_LOG_BASE_Y;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = createHudText(this, HAND_LOG_X, baseY + i * HAND_LOG_LINE_HEIGHT, this.eventLog[i], '#aaddaa', { fontSize: HAND_LABEL_FONT_SIZE });
      this.logTexts.push(txt);
    }
  }
}