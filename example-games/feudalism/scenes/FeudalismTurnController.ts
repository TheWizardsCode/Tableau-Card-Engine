/**
 * FeudalismTurnController — turn flow, action execution, and AI scheduling.
 */
import type { PatronTile, ResourceType, DevelopmentCard, Tier } from '../FeudalismCards';
import { resourceAbbrev, resourceDisplayName } from '../FeudalismCards';
import type { FeudalismSession, TurnAction, TurnResult } from '../FeudalismGame';
import { executeTurn, discardTokens, isGameOver } from '../FeudalismGame';
import { FeudalismAiPlayer } from '../AiStrategy';
import type { FeudalismTranscriptRecorder } from '../GameTranscript';
import {
  ANIM_DURATION, AI_PRE_PAUSE, MOVE_DURATION, SFX_KEYS, type TurnPhase,
} from './FeudalismConstants';
import type { FeudalismAnimator } from './FeudalismAnimator';

export interface TurnControllerCallbacks {
  onPhaseChange: (phase: TurnPhase) => void;
  onRefreshAll: () => void;
  onShowToast: (msg: string) => void;
  onShowDiscardDialog: (excess: number) => void;
  onShowGameOver: () => void;
  onPlaySound: (key: string) => void;
  onEmitTurnStarted: () => void;
  onEmitGameEnded: (winnerIdx: number) => void;
  /** Cache a patron to keep it visible in the patron column during animation. */
  onSetPatronAnimationCache: (patron: PatronTile | null, index: number) => void;
  /**
   * Mark market slots that are about to be refilled so they render as
   * empty during the refill animation. Cleared by onClearPendingRefillSlots.
   */
  onSetPendingRefillSlots: (slots: { tier: Tier; col: number }[]) => void;
  /** Clear all pending refill slot flags before a re-render. */
  onClearPendingRefillSlots: () => void;
  /** Callback after each complete turn (human or AI) to save a checkpoint. */
  onSaveCheckpoint?: () => void;
}

export class FeudalismTurnController {
  /**
   * When true, add extra delay to compensate for skipped animations
   * so the AI's turn remains perceptible as thoughtful/measured.
   */
  reducedMotion = false;

  private session: FeudalismSession;
  private aiPlayer: FeudalismAiPlayer;
  private recorder: FeudalismTranscriptRecorder | null = null;
  private animator: FeudalismAnimator;
  private callbacks: TurnControllerCallbacks;
  private turnPhase: TurnPhase = 'player-turn';

  // Pending turn state for recording (deferred across discard step)
  private pendingPlayerIndex: number = -1;
  private pendingAction: TurnAction | null = null;
  private pendingResult: TurnResult | null = null;

  constructor(
    session: FeudalismSession,
    aiPlayer: FeudalismAiPlayer,
    animator: FeudalismAnimator,
    callbacks: TurnControllerCallbacks,
  ) {
    this.session = session;
    this.aiPlayer = aiPlayer;
    this.animator = animator;
    this.callbacks = callbacks;
  }

  get phase(): TurnPhase { return this.turnPhase; }

  setRecorder(recorder: FeudalismTranscriptRecorder | null): void {
    this.recorder = recorder;
  }

  setPhase(phase: TurnPhase): void {
    this.turnPhase = phase;
    this.callbacks.onPhaseChange(phase);
  }

  // ── Token actions ───────────────────────────────────────
  executeTakeDifferent(selectedTokens: ResourceType[]): void {
    const action: TurnAction = { type: 'take-different', colors: [...selectedTokens] };
    this.executeAction(action);
  }

  executeTakeSame(color: ResourceType): void {
    const action: TurnAction = { type: 'take-same', color };
    this.executeAction(action);
  }

  // ── Card actions ────────────────────────────────────────
  executeReserve(cardId: number | null, tier?: Tier): void {
    this.callbacks.onPlaySound(SFX_KEYS.CARD_RESERVE);
    const action: TurnAction = cardId != null ? { type: 'reserve', cardId } : { type: 'reserve', cardId: null, tier };
    this.executeAction(action);
  }

  executePurchase(cardId: number): void {
    this.callbacks.onPlaySound(SFX_KEYS.CARD_PURCHASE);
    const action: TurnAction = { type: 'purchase', cardId };
    this.executeAction(action);
  }

  // ── Main action execution ───────────────────────────────
  executeAction(action: TurnAction): void {
    const playerIndex = this.session.currentPlayerIndex;

    let marketSlot: { tier: Tier; col: number } | null = null;
    let sourcePos: { x: number; y: number } | null = null;
    let card: DevelopmentCard | null = null;

    if (action.type === 'purchase' && action.cardId != null) {
      marketSlot = this.animator.findCardMarketSlot(action.cardId);
      if (marketSlot) {
        sourcePos = this.animator.getMarketCardCenter(marketSlot.tier, marketSlot.col);
        card = this.session.market[marketSlot.tier].visible[marketSlot.col] ?? null;
      } else {
        const reserved = this.session.players[playerIndex].reservedCards;
        card = reserved.find(c => c.id === action.cardId) ?? null;
        if (card) sourcePos = this.animator.getPlayerReserveDest(playerIndex);
      }
    } else if (action.type === 'reserve' && action.cardId != null) {
      marketSlot = this.animator.findCardMarketSlot(action.cardId);
      if (marketSlot) {
        sourcePos = this.animator.getMarketCardCenter(marketSlot.tier, marketSlot.col);
        card = this.session.market[marketSlot.tier].visible[marketSlot.col] ?? null;
      }
    } else if (action.type === 'reserve' && action.cardId == null) {
      const tier = action.tier!;
      sourcePos = this.animator.getDeckCenter(tier);
    }

    const patronsBefore = this.session.patrons.map(n => n.id);

    try {
      const result = executeTurn(this.session, action);

      if (result.tokensOverLimit > 0) {
        this.pendingPlayerIndex = playerIndex;
        this.pendingAction = action;
        this.pendingResult = result;
        this.callbacks.onRefreshAll();
        this.callbacks.onShowDiscardDialog(result.tokensOverLimit);
        return;
      }

      this.recorder?.recordTurn(playerIndex, action, result, null);

      let patronSourceIndex = -1;
      if (result.patronVisit) {
        patronSourceIndex = patronsBefore.indexOf(result.patronVisit.id);
      }

      if (action.type === 'reserve' && action.cardId == null && !card) {
        const reserved = this.session.players[playerIndex].reservedCards;
        card = reserved[reserved.length - 1] ?? null;
      }

      if (sourcePos && card && (action.type === 'purchase' || action.type === 'reserve')) {
        const destPos = action.type === 'purchase'
          ? this.animator.getPlayerCardDest(playerIndex)
          : this.animator.getPlayerReserveDest(playerIndex);

        // Cache the patron so refreshPatrons keeps it visible during animation
        if (result.patronVisit) {
          this.callbacks.onSetPatronAnimationCache(result.patronVisit, patronSourceIndex);
        }

        // Mark the market slot as pending refill so it renders as empty
        // during the deck-back fly-in animation. Cleared in onRefreshMarket.
        if (marketSlot) {
          this.callbacks.onSetPendingRefillSlots([marketSlot]);
        }

        this.setPhase('animating');

        // Defer sound and toast to coincide with animation start
        if (result.patronVisit) {
          this.callbacks.onPlaySound(SFX_KEYS.PATRON_VISIT);
          this.callbacks.onShowToast('Patron visits you! +3 influence');
        }

        this.animator.playCardAnimation(
          sourcePos, destPos, card, marketSlot, result.patronVisit,
          patronSourceIndex, playerIndex,
          () => this.afterTurnComplete(result),
          () => {
            this.callbacks.onClearPendingRefillSlots();
            this.callbacks.onRefreshAll();
          },
          () => {
            // Clear cache before patron fly animation starts so the static
            // patron tile is removed from the Patrons section, leaving only
            // the flying patron visible during its flight.
            this.callbacks.onSetPatronAnimationCache(null, -1);
            this.callbacks.onRefreshAll();
          },
          () => {
            // Patron has flown and been destroyed; do a full refresh to
            // show the patron in the player area and update the Patrons
            // section to reflect remaining available patrons.
            this.callbacks.onRefreshAll();
          },
        );
      } else {
        this.afterTurnComplete(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid action';
      this.callbacks.onShowToast(msg);
      this.setPhase('player-turn');
    }
  }

  executeDiscard(discardSelection: Partial<Record<ResourceType, number>>): void {
    try {
      const tokenDiscard = { tokens: discardSelection as Record<string, number> };
      const result = discardTokens(this.session, tokenDiscard);

      if (this.pendingAction && this.pendingResult) {
        this.recorder?.recordTurn(this.pendingPlayerIndex, this.pendingAction, this.pendingResult, tokenDiscard);
      }
      this.pendingPlayerIndex = -1;
      this.pendingAction = null;
      this.pendingResult = null;

      this.afterTurnComplete(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid discard';
      this.callbacks.onShowToast(msg);
    }
  }

  private afterTurnComplete(result: TurnResult): void {
    this.setPhase('animating');
    this.callbacks.onRefreshAll();

    // Save checkpoint after every completed turn (human or AI)
    this.callbacks.onSaveCheckpoint?.();

    if (result.gameOver) {
      (this.animator as any).scene.time.delayedCall(ANIM_DURATION, () => {
        this.callbacks.onShowGameOver();
      });
      return;
    }

    if (this.session.players[this.session.currentPlayerIndex].isAI) {
      this.setPhase('ai-turn');
      const aiTransitionDelay = ANIM_DURATION + 200 + (this.reducedMotion ? MOVE_DURATION : 0);
      (this.animator as any).scene.time.delayedCall(aiTransitionDelay, () => {
        this.executeAiTurn();
      });
    } else {
      (this.animator as any).scene.time.delayedCall(ANIM_DURATION, () => {
        this.callbacks.onEmitTurnStarted();
        this.setPhase('player-turn');
      });
    }
  }

  // ── AI turn ─────────────────────────────────────────────
  executeAiTurn(): void {
    const aiIndex = this.session.currentPlayerIndex;
    const action = this.aiPlayer.chooseTurn(this.session, aiIndex);
    const toastMsg = this.describeAiAction(action);

    let marketSlot: { tier: Tier; col: number } | null = null;
    let sourcePos: { x: number; y: number } | null = null;
    let card: DevelopmentCard | null = null;

    if (action.type === 'purchase' && action.cardId != null) {
      marketSlot = this.animator.findCardMarketSlot(action.cardId);
      if (marketSlot) {
        sourcePos = this.animator.getMarketCardCenter(marketSlot.tier, marketSlot.col);
        card = this.session.market[marketSlot.tier].visible[marketSlot.col] ?? null;
      } else {
        const reserved = this.session.players[aiIndex].reservedCards;
        card = reserved.find(c => c.id === action.cardId) ?? null;
        if (card) sourcePos = this.animator.getPlayerReserveDest(aiIndex);
      }
    } else if (action.type === 'reserve' && action.cardId != null) {
      marketSlot = this.animator.findCardMarketSlot(action.cardId);
      if (marketSlot) {
        sourcePos = this.animator.getMarketCardCenter(marketSlot.tier, marketSlot.col);
        card = this.session.market[marketSlot.tier].visible[marketSlot.col] ?? null;
      }
    } else if (action.type === 'reserve' && action.cardId == null) {
      const tier = action.tier!;
      sourcePos = this.animator.getDeckCenter(tier);
    }

    const patronsBefore = this.session.patrons.map(n => n.id);

    this.callbacks.onShowToast(toastMsg);

    (this.animator as any).scene.time.delayedCall(AI_PRE_PAUSE, () => {
      try {
        const result = executeTurn(this.session, action);

        let tokenDiscard = null;
        if (result.tokensOverLimit > 0) {
          const discard = this.aiPlayer.chooseDiscard(this.session, aiIndex, result.tokensOverLimit);
          tokenDiscard = discard;
          discardTokens(this.session, discard);
        }

        this.recorder?.recordTurn(aiIndex, action, result, tokenDiscard);

        let patronSourceIndex = -1;
        if (result.patronVisit) {
          patronSourceIndex = patronsBefore.indexOf(result.patronVisit.id);
        }

        if (action.type === 'reserve' && action.cardId == null && !card) {
          const reserved = this.session.players[aiIndex].reservedCards;
          card = reserved[reserved.length - 1] ?? null;
        }

        const afterAnim = () => {
          if (result.gameOver || isGameOver(this.session)) {
            (this.animator as any).scene.time.delayedCall(ANIM_DURATION, () => {
              this.callbacks.onShowGameOver();
            });
            return;
          }

          if (this.session.players[this.session.currentPlayerIndex].isAI) {
            (this.animator as any).scene.time.delayedCall(ANIM_DURATION, () => this.executeAiTurn());
          } else {
            (this.animator as any).scene.time.delayedCall(ANIM_DURATION, () => {
              this.callbacks.onEmitTurnStarted();
              this.setPhase('player-turn');
            });
          }
        };

        if (sourcePos && card && (action.type === 'purchase' || action.type === 'reserve')) {
          const destPos = action.type === 'purchase'
            ? this.animator.getPlayerCardDest(aiIndex)
            : this.animator.getPlayerReserveDest(aiIndex);

          // Cache the patron so refreshPatrons keeps it visible during animation
          if (result.patronVisit) {
            this.callbacks.onSetPatronAnimationCache(result.patronVisit, patronSourceIndex);
          }

          // Mark the market slot as pending refill so it renders as empty
          // during the deck-back fly-in animation. Cleared in onRefreshMarket.
          if (marketSlot) {
            this.callbacks.onSetPendingRefillSlots([marketSlot]);
          }

          // Defer toast to coincide with animation start
          if (result.patronVisit) {
            this.callbacks.onShowToast('AI earns a patron visit! +3 influence');
          }

          this.animator.playCardAnimation(
            sourcePos, destPos, card, marketSlot, result.patronVisit,
            patronSourceIndex, aiIndex, afterAnim,
            () => {
              this.callbacks.onClearPendingRefillSlots();
              this.callbacks.onRefreshAll();
            },
            () => {
              // Clear cache before patron fly animation starts so the static
              // patron tile is removed from the Patrons section, leaving only
              // the flying patron visible during its flight.
              this.callbacks.onSetPatronAnimationCache(null, -1);
              this.callbacks.onRefreshAll();
            },
            () => {
              // Patron has flown and been destroyed; do a full refresh to
              // show the patron in the player area and update the Patrons
              // section to reflect remaining available patrons.
              this.callbacks.onRefreshAll();
            },
          );
        } else {
          this.callbacks.onRefreshAll();
          afterAnim();
        }
      } catch (err) {
        console.error('AI error:', err);
        this.setPhase('player-turn');
      }
    });
  }

  private describeAiAction(action: TurnAction): string {
    switch (action.type) {
      case 'purchase': return 'AI buys a card...';
      case 'reserve': return action.cardId != null ? 'AI reserves a card...' : 'AI reserves from deck...';
      case 'take-different': return `AI takes ${action.colors.map(c => resourceAbbrev(c)).join(', ')} tokens...`;
      case 'take-same': return `AI takes 2 ${resourceDisplayName(action.color)} tokens...`;
      default: return 'AI takes an action...';
    }
  }
}
