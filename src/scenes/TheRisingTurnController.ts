/**
 * TheRisingTurnController -- the interactive layer for 1916: The Rising.
 *
 * This module wires the player's pointer interactions to the pure game logic
 * from F2/F3 and paints the result through the F4 renderer/animator:
 *
 *   - **Spirit Row (market) click** (AC1) — checks Memory affordability via
 *     {@link canMeetSpirit}; an affordable meet spends Memory, moves the spirit
 *     to the hand and opens the conversation overlay; an unaffordable meet
 *     triggers container-safe illegal-move feedback.
 *   - **Hand click** (AC2) — selects a met spirit for placement and switches
 *     the UI into placing mode (selection lift via `HandView.setSelectionLift`).
 *   - **Timeline slot click** (AC3) — validates the placement through
 *     {@link canPlaceFromHand}, animates the card onto the timeline, awards
 *     Insight and advances the Rising clock; an illegal slot shakes the card.
 *   - **Market → timeline drag** (AC4) — a drag-and-drop buy-and-place that
 *     runs the identical economy/scoring path as the click flow (never cheaper).
 *   - **Undo/redo** (AC5) — every committed placement is a
 *     {@link PlaceSpiritCommand} on an {@link UndoRedoManager}, so undo returns
 *     the spirit to hand (and rewinds the clock/Insight) and redo reinstates it.
 *
 * The controller is deliberately decoupled from the concrete scene: it takes a
 * `Phaser.Scene`, the renderer, the animator, and state accessors, so a browser
 * test can drive it against the real scene while the pure rules stay testable.
 *
 * @module src/scenes/TheRisingTurnController
 */

import Phaser from 'phaser';
import { type Command, UndoRedoManager } from '@core-engine';
import { illegalAction, legalAction, type LegalityResult } from '@rule-engine';
import { createDragDropManager, type DragDropManager } from '@ui';
import {
  showConversationOverlay,
  type ConversationOverlayHandle,
} from './TheRisingOverlayContent';
import {
  applyPlacement,
  canPlaceFromHand,
  isSlotLegal,
} from '../TheRisingRules';
import { transition, type RisingState } from '../TheRisingState';
import {
  canMeetSpirit,
  chooseTestimony,
  conversationOptions,
  meetSpirit,
} from '../TheRisingEconomy';
import { completeTurn } from '../TheRisingClock';
import { ROSTER, type Spirit, type Testimony } from '../TheRisingContent';
import { RISING_CARD_H, RISING_CARD_W, TheRisingRenderer } from './TheRisingRenderer';
import type { TheRisingAnimator } from './TheRisingAnimator';

/** The UI interaction mode (separate from the pure state-machine phase). */
export type RisingUiPhase = 'idle' | 'conversing' | 'placing';

/** Distance (px) a selected hand card is raised out of the hand row. */
export const HAND_SELECTION_LIFT = 20;

// Re-export the overlay depth convention for callers that referenced it here
// before the conversation UI was extracted into TheRisingOverlayContent (F6).
export {
  CONVERSATION_BACKDROP_DEPTH,
  CONVERSATION_BOX_DEPTH,
  CONVERSATION_CONTENT_DEPTH,
} from './TheRisingOverlayContent';

/** Data attached to a draggable Spirit Row card. */
export interface MarketDragData {
  readonly kind: 'market';
  readonly marketIndex: number;
  readonly spiritId: string;
}

/** Data attached to a draggable hand card. */
export interface HandDragData {
  readonly kind: 'hand';
  readonly handIndex: number;
  readonly spiritId: string;
}

/** Any draggable card in the scene. */
export type RisingDragData = MarketDragData | HandDragData;

/** The live conversation overlay session. */
export interface ConversationSession {
  /** The spirit being conversed with. */
  readonly spirit: Spirit;
  /** The state before the meet (used by Cancel to abort and refund Memory). */
  readonly beforeState: RisingState;
  /** The overlay presentation handle (owns the display objects). */
  readonly overlay: ConversationOverlayHandle;
  /** The testimony chosen this conversation, once selected. */
  testimony: Testimony | null;
}

/** Options accepted by {@link TheRisingTurnController}. */
export interface RisingTurnControllerOptions {
  /** The Phaser scene that owns the board. */
  readonly scene: Phaser.Scene;
  /** The board renderer (market/hand/timeline views). */
  readonly renderer: TheRisingRenderer;
  /** The card animator (deal/place/reject). */
  readonly animator: TheRisingAnimator;
  /** Read the current game state. */
  readonly getState: () => RisingState;
  /** Write a new game state (the scene's `risingState`). */
  readonly setState: (state: RisingState) => void;
  /** HUD container used to parent overlay objects (optional). */
  readonly panel?: Phaser.GameObjects.Container | null;
  /** Called whenever the board reaches a settled state. */
  readonly onStateSettled?: (turn: number, phase: string) => void;
  /** Optional shared undo/redo manager (a fresh one is created by default). */
  readonly undoRedo?: UndoRedoManager;
}

/**
 * A reversible placement command.
 *
 * Swaps the whole {@link RisingState} before/after the move. `execute()` also
 * replays the place animation from the captured source position, so both the
 * original placement and a redo animate identically.
 */
export class PlaceSpiritCommand implements Command {
  readonly description: string;

  constructor(
    private readonly controller: TheRisingTurnController,
    private readonly before: RisingState,
    private readonly after: RisingState,
    private readonly spiritId: string,
    private readonly source: { x: number; y: number } | undefined,
  ) {
    this.description = `Place ${spiritId} on the timeline`;
  }

  execute(): void {
    this.controller.applyState(this.after);
    this.controller.animatePlacement(this.spiritId, this.source);
  }

  undo(): void {
    this.controller.applyState(this.before);
  }
}

/**
 * Drives every interactive action in 1916: The Rising.
 *
 * Construct once per scene; call {@link attach} to install the input wiring,
 * then the scene's update path (or a test) calls the public `handle*` methods.
 */
export class TheRisingTurnController {
  /** The shared undo/redo history for placements. */
  public readonly undoRedo: UndoRedoManager;

  /** The currently selected hand index, or `null`. */
  public selectedHandIndex: number | null = null;

  /** The current UI interaction mode. */
  public uiPhase: RisingUiPhase = 'idle';

  /** The open conversation overlay, or `null`. */
  public conversation: ConversationSession | null = null;

  private readonly scene: Phaser.Scene;
  private readonly renderer: TheRisingRenderer;
  private readonly animator: TheRisingAnimator;
  private readonly getState: () => RisingState;
  private readonly setState: (state: RisingState) => void;
  private readonly panel: Phaser.GameObjects.Container | null;
  private readonly onStateSettled?: (turn: number, phase: string) => void;
  private readonly rosterById: ReadonlyMap<string, Spirit>;

  private dragManager: DragDropManager | null = null;
  private registeredDraggables: Phaser.GameObjects.Container[] = [];
  private timelineSlots: Phaser.GameObjects.Zone[] = [];
  private gestureDragged = false;
  private attached = false;

  constructor(options: RisingTurnControllerOptions) {
    this.scene = options.scene;
    this.renderer = options.renderer;
    this.animator = options.animator;
    this.getState = options.getState;
    this.setState = options.setState;
    this.panel = options.panel ?? null;
    this.onStateSettled = options.onStateSettled;
    this.undoRedo = options.undoRedo ?? new UndoRedoManager();
    this.rosterById = new Map(ROSTER.spirits.map((spirit) => [spirit.id, spirit]));
  }

  // ── Lifecycle ───────────────────────────────────────────

  /**
   * Install the input wiring: selection lift, drag-and-drop manager, card
   * pointer handlers and the timeline drop/click slots.
   *
   * Idempotent — a second call is a no-op.
   */
  attach(): void {
    if (this.attached) return;
    this.attached = true;

    this.renderer.handView.setSelectionLift(HAND_SELECTION_LIFT);

    this.dragManager = createDragDropManager({
      scene: this.scene,
      dragDistanceThreshold: 5,
      onDragStart: () => {
        this.gestureDragged = true;
      },
      onIllegal: (payload) => {
        const data = payload.data as RisingDragData | undefined;
        if (data?.spiritId) {
          this.rejectSpirit(data.spiritId);
        }
      },
    });

    this.refresh();
  }

  /** Remove all input wiring and overlay objects. Never throws. */
  destroy(): void {
    this.closeConversation(false);
    this.unregisterDraggables();
    this.clearTimelineSlots();
    this.dragManager?.destroy();
    this.dragManager = null;
    this.attached = false;
  }

  /**
   * Repaint the board from the current state and re-install the per-sprite
   * interactivity (sprites are rebuilt on every renderer refresh).
   */
  refresh(): void {
    this.unregisterDraggables();
    this.renderer.setState(this.getState());
    this.renderer.refreshAll();
    this.rebuildTimelineSlots();
    this.wireCardInteractivity();
    this.reapplySelection();
  }

  /**
   * Apply a new state to the board.
   *
   * The renderer rebuilds its sprites, so the drag/drop registrations and the
   * timeline slot zones are re-installed around the repaint.
   */
  applyState(state: RisingState): void {
    this.setState(state);
    this.refresh();
    this.onStateSettled?.(state.turn, state.phase);
  }

  /** Animate a just-placed spirit from `source` to its timeline resting spot. */
  animatePlacement(spiritId: string, source: { x: number; y: number } | undefined): void {
    const sprite = this.renderer.findSpiritSprite('timeline', spiritId);
    if (!sprite) return;
    const destination = { x: sprite.x, y: sprite.y };
    if (source) {
      sprite.x = source.x;
      sprite.y = source.y;
    }
    this.animator.placeOnTimeline({
      target: sprite as unknown as Phaser.GameObjects.Container,
      destination,
    });
  }

  // ── Market interaction (AC1) ────────────────────────────

  /**
   * Handle a click on a Spirit Row card.
   *
   * Affordable → spend Memory, move the spirit to hand, open the conversation
   * overlay. Unaffordable → container-safe illegal-move feedback.
   */
  handleMarketCardClick(marketIndex: number): LegalityResult {
    const state = this.getState();
    const spiritId = state.spiritRow[marketIndex];
    if (!spiritId) {
      return illegalAction(`No spirit at Spirit Row slot ${marketIndex}.`);
    }
    const spirit = this.rosterById.get(spiritId);
    if (!spirit) {
      return illegalAction(`Unknown spirit "${spiritId}".`);
    }
    if (this.uiPhase !== 'idle' || state.phase !== 'idle') {
      return illegalAction('A spirit is already being met.');
    }

    const meet = meetSpirit(state, spirit.id);
    if (!meet.result.legal) {
      this.rejectSpirit(spirit.id);
      return meet.result;
    }
    const talking = transition(meet.state, { type: 'begin-conversation' });
    if (!talking.result.legal) {
      this.rejectSpirit(spirit.id);
      return talking.result;
    }

    this.applyState(talking.state);
    this.openConversation(spirit, state);
    return legalAction();
  }

  // ── Conversation bridge (AC1; the overlay UI lives in F6) ─

  /**
   * Open the conversation overlay for a freshly met spirit.
   *
   * The presentation is delegated to {@link showConversationOverlay} in
   * `TheRisingOverlayContent.ts`: it renders the spirit name, introduction and
   * deterministic questions, parents every object into the HUD container, and
   * owns the depth/overlay-object conventions. This controller remains the
   * single source of truth — question choices are routed back through
   * {@link handleConversationChoice}, and Cancel/Continue route back through
   * {@link cancelConversation}/{@link closeConversation}.
   */
  openConversation(spirit: Spirit, beforeState: RisingState): void {
    this.closeConversation(false);
    this.uiPhase = 'conversing';

    const questions = conversationOptions(this.getState(), spirit.id);
    const overlay = showConversationOverlay({
      scene: this.scene,
      layout: this.renderer.getLayout(),
      spirit,
      questions,
      panel: this.panel,
      reducedMotion: this.animator.reducedMotion,
      onChoose: (optionIndex) => {
        this.handleConversationChoice(optionIndex);
      },
      onCancel: () => {
        this.cancelConversation();
      },
    });

    this.conversation = {
      spirit,
      beforeState,
      overlay,
      testimony: null,
    };
  }

  /**
   * Handle a question choice: award the testimony's Insight through the pure
   * economy module, then reveal the testimony and offer a Continue button.
   */
  handleConversationChoice(optionIndex: number): LegalityResult {
    const session = this.conversation;
    if (!session) {
      return illegalAction('No conversation is open.');
    }
    if (session.testimony) {
      return illegalAction('A testimony has already been chosen.');
    }
    const choice = chooseTestimony(this.getState(), optionIndex);
    if (!choice.result.legal || !choice.testimony) {
      return choice.result;
    }
    session.testimony = choice.testimony;

    // Rebuild the board (Insight changed, phase → placing) but keep the
    // overlay open so the testimony can be revealed.
    this.applyState(choice.state);
    session.overlay.reveal(choice.testimony, choice.insightAwarded, () => {
      this.closeConversation(true);
    });
    return legalAction();
  }

  /**
   * Close the open conversation.
   *
   * @param toPlacing When true the UI moves into placing mode (a testimony was
   *                  chosen); when false the board simply returns to idle.
   */
  closeConversation(toPlacing: boolean): void {
    if (!this.conversation) {
      if (toPlacing) this.uiPhase = 'placing';
      return;
    }
    this.conversation.overlay.dismiss();
    this.conversation = null;
    this.uiPhase = toPlacing ? 'placing' : 'idle';
  }

  /**
   * Abort the conversation entirely: refund the meet's Memory and return the
   * spirit to the Spirit Row, leaving the board as it was before the click.
   */
  cancelConversation(): void {
    const session = this.conversation;
    if (!session) return;
    session.overlay.dismiss();
    this.conversation = null;
    this.uiPhase = 'idle';
    this.applyState(session.beforeState);
  }

  // ── Hand interaction (AC2) ──────────────────────────────

  /**
   * Select a hand card for placement and switch the UI into placing mode.
   */
  handleHandCardClick(handIndex: number): LegalityResult {
    const state = this.getState();
    if (handIndex < 0 || handIndex >= state.hand.length) {
      return illegalAction(`No card at hand slot ${handIndex}.`);
    }
    this.selectedHandIndex = handIndex;
    this.uiPhase = 'placing';
    this.renderer.handView.setSelectionLift(HAND_SELECTION_LIFT);
    this.renderer.handView.setSelected(handIndex);
    return legalAction();
  }

  // ── Timeline placement (AC3) ────────────────────────────

  /**
   * Place the selected hand card at a timeline slot.
   *
   * Validated through {@link canPlaceFromHand}; a legal placement animates the
   * card, awards Insight and advances the clock; an illegal one shakes the
   * card and leaves the timeline untouched.
   */
  handleTimelineSlotClick(slotIndex: number): LegalityResult {
    const state = this.getState();
    if (this.selectedHandIndex === null) {
      return illegalAction('Select a card in hand before placing.');
    }
    const spiritId = state.hand[this.selectedHandIndex];
    if (!spiritId) {
      return illegalAction('The selected hand card is no longer available.');
    }
    const spirit = this.rosterById.get(spiritId);
    if (!spirit) {
      return illegalAction(`Unknown spirit "${spiritId}".`);
    }
    const source = this.renderer.handView.getBasePosition(this.selectedHandIndex);
    return this.commitPlacement(spirit, slotIndex, source);
  }

  /**
   * Buy-and-place: drag a Spirit Row card directly onto a timeline slot.
   *
   * Runs the identical meet → converse → place → clock path as the click
   * flow, so the drag is priced identically (never cheaper).
   */
  handleMarketDrop(spiritId: string, slotIndex: number): LegalityResult {
    const state = this.getState();
    const spirit = this.rosterById.get(spiritId);
    if (!spirit) {
      return illegalAction(`Unknown spirit "${spiritId}".`);
    }
    const meet = canMeetSpirit(state, spirit);
    if (!meet.legal) {
      this.rejectSpirit(spiritId);
      return meet;
    }
    if (!isSlotLegal(state.timeline, spirit.dateRange.from, slotIndex)) {
      this.rejectSpirit(spiritId);
      return illegalAction(`Slot ${slotIndex} breaks the timeline's chronological order.`);
    }

    const srcSprite = this.renderer.findSpiritSprite('market', spiritId);
    const source = srcSprite ? { x: srcSprite.x, y: srcSprite.y } : undefined;

    const met = meetSpirit(state, spirit.id);
    if (!met.result.legal) {
      this.rejectSpirit(spiritId);
      return met.result;
    }
    const talking = transition(met.state, { type: 'begin-conversation' });
    if (!talking.result.legal) {
      this.rejectSpirit(spiritId);
      return talking.result;
    }
    const choice = chooseTestimony(talking.state, 0);
    if (!choice.result.legal) {
      this.rejectSpirit(spiritId);
      return choice.result;
    }
    const placed = applyPlacement(choice.state, spirit, slotIndex);
    if (!placed.result.legal || !placed.score) {
      this.rejectSpirit(spiritId);
      return placed.result;
    }
    const completed = completeTurn(placed.state);
    const after = completed.result.legal ? completed.state : placed.state;

    this.undoRedo.execute(new PlaceSpiritCommand(this, state, after, spirit.id, source));
    this.selectedHandIndex = null;
    this.uiPhase = 'idle';
    this.onStateSettled?.(after.turn, after.phase);
    return legalAction();
  }

  /**
   * Place a dragged hand card at a timeline slot.
   *
   * The hand card is already met, so only the placement (and the clock) apply
   * — the drag is the same placement the click flow performs, and the same
   * pricing (no extra Memory).
   */
  handleHandDrop(handIndex: number, slotIndex: number): LegalityResult {
    const state = this.getState();
    const spiritId = state.hand[handIndex];
    if (!spiritId) {
      return illegalAction(`No card at hand slot ${handIndex}.`);
    }
    const spirit = this.rosterById.get(spiritId);
    if (!spirit) {
      return illegalAction(`Unknown spirit "${spiritId}".`);
    }
    this.selectedHandIndex = handIndex;
    const source = this.renderer.handView.getBasePosition(handIndex);
    return this.commitPlacement(spirit, slotIndex, source);
  }

  /**
   * Validate and commit a placement, then close the turn (advance the clock).
   *
   * The placement is wrapped in a {@link PlaceSpiritCommand} so it participates
   * in the undo/redo history.
   */
  private commitPlacement(
    spirit: Spirit,
    slotIndex: number,
    source: { x: number; y: number } | undefined,
  ): LegalityResult {
    const state = this.getState();
    const legality = canPlaceFromHand(state, spirit.id, slotIndex);
    if (!legality.legal) {
      this.rejectSpirit(spirit.id);
      return legality;
    }

    const placed = applyPlacement(state, spirit, slotIndex);
    if (!placed.result.legal || !placed.score) {
      this.rejectSpirit(spirit.id);
      return placed.result;
    }
    const completed = completeTurn(placed.state);
    const after = completed.result.legal ? completed.state : placed.state;

    this.undoRedo.execute(new PlaceSpiritCommand(this, state, after, spirit.id, source));
    this.selectedHandIndex = null;
    this.uiPhase = 'idle';
    this.onStateSettled?.(after.turn, after.phase);
    return legalAction();
  }

  // ── Undo / redo (AC5) ───────────────────────────────────

  /** Undo the most recent placement. Returns false when nothing to undo. */
  undo(): boolean {
    if (!this.undoRedo.canUndo()) return false;
    this.undoRedo.undo();
    this.selectedHandIndex = null;
    this.uiPhase = 'idle';
    return true;
  }

  /** Redo the most recently undone placement. Returns false when empty. */
  redo(): boolean {
    if (!this.undoRedo.canRedo()) return false;
    this.undoRedo.redo();
    return true;
  }

  // ── Internals ───────────────────────────────────────────

  /** Wire per-sprite pointer handlers for the market row and the hand. */
  private wireCardInteractivity(): void {
    const state = this.getState();

    this.renderer.marketView.getSprites().forEach((sprite, index) => {
      const gameObject = sprite as Phaser.GameObjects.Container;
      const spiritId = state.spiritRow[index];
      if (!spiritId) return;
      const data: MarketDragData = { kind: 'market', marketIndex: index, spiritId };

      gameObject.on('pointerdown', () => {
        this.gestureDragged = false;
      });
      gameObject.on('pointerup', () => {
        if (this.gestureDragged) {
          this.gestureDragged = false;
          return;
        }
        this.handleMarketCardClick(index);
      });

      if (this.dragManager) {
        this.dragManager.registerDraggable({
          gameObject,
          data,
          canPickUp: (payload) => {
            const dragged = payload.data as MarketDragData | undefined;
            return dragged ? canMeetSpirit(this.getState(), dragged.spiritId).legal : false;
          },
          onDrop: (payload) => {
            const dragged = payload.data as MarketDragData | undefined;
            const slot = payload.zoneData;
            if (dragged && typeof slot === 'number') {
              this.handleMarketDrop(dragged.spiritId, slot);
            }
          },
        });
        this.registeredDraggables.push(gameObject);
      }
    });

    this.renderer.handView.getSprites().forEach((sprite, index) => {
      const gameObject = sprite as Phaser.GameObjects.Container;
      const spiritId = state.hand[index];
      if (!spiritId) return;
      const data: HandDragData = { kind: 'hand', handIndex: index, spiritId };

      gameObject.on('pointerdown', () => {
        this.gestureDragged = false;
      });
      gameObject.on('pointerup', () => {
        if (this.gestureDragged) {
          this.gestureDragged = false;
          return;
        }
        this.handleHandCardClick(index);
      });

      if (this.dragManager) {
        this.dragManager.registerDraggable({
          gameObject,
          data,
          canPickUp: (payload) => {
            const dragged = payload.data as HandDragData | undefined;
            return dragged ? this.getState().hand.includes(dragged.spiritId) : false;
          },
          onDrop: (payload) => {
            const dragged = payload.data as HandDragData | undefined;
            const slot = payload.zoneData;
            if (dragged && typeof slot === 'number') {
              this.handleHandDrop(dragged.handIndex, slot);
            }
          },
        });
        this.registeredDraggables.push(gameObject);
      }
    });
  }

  /** Rebuild the interactive timeline slot zones for the current timeline. */
  private rebuildTimelineSlots(): void {
    this.clearTimelineSlots();
    const count = this.getState().timeline.length;
    for (let slot = 0; slot <= count; slot += 1) {
      const position = this.renderer.timelineView.getInsertionPosition(slot);
      const zone = this.scene.add.zone(position.x, position.y, RISING_CARD_W, RISING_CARD_H);
      zone.setRectangleDropZone(RISING_CARD_W, RISING_CARD_H);
      zone.setName(`timeline-slot-${slot}`);
      zone.on('pointerdown', () => this.handleTimelineSlotClick(slot));

      this.dragManager?.registerDropZone({
        zone,
        data: slot,
        canAccept: (payload) => {
          const dragged = payload.data as RisingDragData | undefined;
          if (!dragged) return false;
          return dragged.kind === 'market'
            ? this.canAcceptDrop(dragged.spiritId, slot)
            : this.canAcceptHandDrop(dragged.spiritId, slot);
        },
      });
      this.timelineSlots.push(zone);
    }
  }

  /** Whether a dragged Spirit Row card may be dropped at a timeline slot. */
  private canAcceptDrop(spiritId: string, slotIndex: number): boolean {
    const spirit = this.rosterById.get(spiritId);
    if (!spirit) return false;
    const state = this.getState();
    if (!canMeetSpirit(state, spirit).legal) return false;
    return isSlotLegal(state.timeline, spirit.dateRange.from, slotIndex);
  }

  /** Whether a dragged hand card may be dropped at a timeline slot. */
  private canAcceptHandDrop(spiritId: string, slotIndex: number): boolean {
    const state = this.getState();
    if (state.phase !== 'placing' || state.activeSpiritId !== spiritId) return false;
    return canPlaceFromHand(state, spiritId, slotIndex).legal;
  }

  /** Destroy and unregister the current timeline slot zones. */
  private clearTimelineSlots(): void {
    for (const zone of this.timelineSlots) {
      this.dragManager?.unregisterDropZone(zone);
      zone.destroy();
    }
    this.timelineSlots = [];
  }

  /** Unregister every draggable market card (call before a renderer rebuild). */
  private unregisterDraggables(): void {
    if (!this.dragManager) return;
    for (const gameObject of this.registeredDraggables) {
      this.dragManager.unregisterDraggable(gameObject);
    }    this.registeredDraggables = [];
  }

  /** Re-apply the current hand selection (the renderer rebuild cleared it). */
  private reapplySelection(): void {
    if (this.selectedHandIndex === null) return;
    if (this.selectedHandIndex >= this.getState().hand.length) {
      this.selectedHandIndex = null;
      this.uiPhase = 'idle';
      return;
    }
    this.renderer.handView.setSelected(this.selectedHandIndex);
  }

  /** Play container-safe illegal-move feedback on a spirit card. */
  private rejectSpirit(spiritId: string): void {
    const sprite =
      this.renderer.findSpiritSprite('hand', spiritId) ??
      this.renderer.findSpiritSprite('market', spiritId) ??
      this.renderer.findSpiritSprite('timeline', spiritId);
    this.animator.rejectPlacement(sprite as unknown as Phaser.GameObjects.Container);
  }
}
