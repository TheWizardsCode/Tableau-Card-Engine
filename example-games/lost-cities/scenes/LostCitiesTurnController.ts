/**
 * LostCitiesTurnController — turn flow, input handling, and AI execution.
 */
import type { ExpeditionColor } from '../LostCitiesCards';
import { EXPEDITION_COLORS } from '../LostCitiesCards';
import type { LostCitiesSession, PlayerId, RoundScoreResult } from '../LostCitiesGame';
import {
  getVisibleState,
  executeAction,
  isMatchOver,
} from '../LostCitiesGame';
import type { Phase1Action, Phase2Action } from '../LostCitiesRules';
import { checkPhase1Legality } from '../LostCitiesRules';
import { LostCitiesAiPlayer } from '../AiStrategy';
import type { LCTranscriptRecorder } from '../GameTranscript';
import {
  AI_DELAY,
  SFX_KEYS,
  laneX as laneXFn,
  type SceneTurnPhase,
} from './LostCitiesConstants';
import type { LostCitiesAnimator } from './LostCitiesAnimator';
import type { LostCitiesRenderer } from './LostCitiesRenderer';

export interface TurnControllerCallbacks {
  onPhaseChange: (phase: SceneTurnPhase) => void;
  onRefreshAll: () => void;
  onShowRoundSummary: (score: RoundScoreResult) => void;
  onShowMatchSummary: (score: RoundScoreResult) => void;
  onRunAiTurn: () => void;
  onIllegalMove: (sprite: Phaser.GameObjects.Image) => void;
  onPlaySound: (key: string) => void;
}

export class LostCitiesTurnController {
  private session: LostCitiesSession;
  private aiPlayer: LostCitiesAiPlayer;
  private recorder: LCTranscriptRecorder;
  private renderer: LostCitiesRenderer;
  private animator: LostCitiesAnimator;
  private callbacks: TurnControllerCallbacks;
  private turnPhase: SceneTurnPhase = 'waiting-for-card-select';
  private selectedCardIndex: number = -1;

  constructor(
    session: LostCitiesSession,
    aiPlayer: LostCitiesAiPlayer,
    recorder: LCTranscriptRecorder,
    renderer: LostCitiesRenderer,
    animator: LostCitiesAnimator,
    callbacks: TurnControllerCallbacks,
  ) {
    this.session = session;
    this.aiPlayer = aiPlayer;
    this.recorder = recorder;
    this.renderer = renderer;
    this.animator = animator;
    this.callbacks = callbacks;
  }

  get phase(): SceneTurnPhase { return this.turnPhase; }
  get selectedIndex(): number { return this.selectedCardIndex; }

  setPhase(phase: SceneTurnPhase): void {
    this.turnPhase = phase;
    this.callbacks.onPhaseChange(phase);
  }

  onHandCardClick(handIndex: number): void {
    if (this.turnPhase !== 'waiting-for-card-select' && this.turnPhase !== 'waiting-for-target') {
      return;
    }

    if (this.selectedCardIndex === handIndex) {
      this.selectedCardIndex = -1;
      this.renderer.clearSelectionHighlight();
      this.callbacks.onPlaySound(SFX_KEYS.CARD_DESELECT);
      this.setPhase('waiting-for-card-select');
      return;
    }

    this.selectedCardIndex = handIndex;
    this.renderer.showSelectionHighlight(handIndex);
    this.callbacks.onPlaySound(SFX_KEYS.CARD_SELECT);
    this.setPhase('waiting-for-target');
  }

  onExpeditionClick(): void {
    if (this.turnPhase !== 'waiting-for-target') return;
    if (this.selectedCardIndex < 0) return;

    const hand = this.session.players[0].hand;
    const card = hand[this.selectedCardIndex];
    if (!card) return;

    const color = card.color;
    const action: Phase1Action = {
      kind: 'play-to-expedition',
      card,
      color,
    };

    const view = {
      playerExpeditions: this.session.players[0].expeditions,
      discardPiles: this.session.round.discardPiles,
      drawPileSize: this.session.round.drawPile.length,
      justDiscardedColor: this.session.round.justDiscardedColor,
    };
    const legality = checkPhase1Legality(action, hand, view);
    if (!legality.legal) {
      const sprite = this.renderer.handSpriteList[this.selectedCardIndex];
      if (sprite) this.callbacks.onIllegalMove(sprite);
      return;
    }

    this.executePlayerPhase1(action);
  }

  onDiscardRowClick(clickX: number): void {
    if (this.turnPhase === 'waiting-for-target') {
      if (this.selectedCardIndex < 0) return;

      const hand = this.session.players[0].hand;
      const card = hand[this.selectedCardIndex];
      if (!card) return;

      const action: Phase1Action = {
        kind: 'discard',
        card,
        color: card.color,
      };

      this.executePlayerPhase1(action);
      return;
    }

    if (this.turnPhase === 'waiting-for-draw') {
      let bestColor: ExpeditionColor | null = null;
      let bestDist = Infinity;

      for (let i = 0; i < 5; i++) {
        const color = EXPEDITION_COLORS[i];
        const pile = this.session.round.discardPiles.get(color) ?? [];
        if (pile.length === 0) continue;
        if (this.session.round.justDiscardedColor === color) continue;
        const dist = Math.abs(clickX - this.laneX(i));
        if (dist < bestDist) {
          bestDist = dist;
          bestColor = color;
        }
      }

      if (!bestColor) {
        this.callbacks.onPlaySound(SFX_KEYS.ILLEGAL_MOVE);
        return;
      }

      const action: Phase2Action = {
        kind: 'draw-from-discard',
        color: bestColor,
      };

      this.executePlayerPhase2(action);
    }
  }

  private laneX(index: number): number {
    return laneXFn(index);
  }

  onDrawPileClick(): void {
    if (this.turnPhase !== 'waiting-for-draw') return;
    if (this.session.round.drawPile.length === 0) return;

    const action: Phase2Action = { kind: 'draw-from-pile' };
    this.executePlayerPhase2(action);
  }

  private executePlayerPhase1(action: Phase1Action): void {
    this.setPhase('animating');
    this.renderer.clearSelectionHighlight();
    this.selectedCardIndex = -1;

    if (action.kind === 'play-to-expedition') {
      this.callbacks.onPlaySound(SFX_KEYS.CARD_PLAY);
    } else {
      this.callbacks.onPlaySound(SFX_KEYS.CARD_DISCARD);
    }

    const phase = this.session.round.turnPhase;
    const result = executeAction(this.session, action);
    this.recorder.recordAction(this.session, result, action, phase);

    this.animator.animatePhase1(action, () => {
      this.callbacks.onRefreshAll();
      this.setPhase('waiting-for-draw');
    });
  }

  private executePlayerPhase2(action: Phase2Action): void {
    this.setPhase('animating');
    this.callbacks.onPlaySound(SFX_KEYS.CARD_DRAW);

    if (action.kind === 'draw-from-discard') {
      this.aiPlayer.recordOpponentDiscardDraw(action.color);
    }

    const phase = this.session.round.turnPhase;
    const result = executeAction(this.session, action);
    this.recorder.recordAction(this.session, result, action, phase);

    this.animator.animatePhase2(action, () => {
      this.callbacks.onRefreshAll();

      if (result.roundEnded) {
        if (result.matchEnded) {
          this.callbacks.onShowMatchSummary(result.roundScore!);
        } else {
          this.callbacks.onShowRoundSummary(result.roundScore!);
        }
      } else {
        this.callbacks.onRunAiTurn();
      }
    });
  }

  runAiTurn(): void {
    this.setPhase('ai-thinking');
    this.callbacks.onPlaySound(SFX_KEYS.TURN_CHANGE);

    (this.renderer.getScene() as Phaser.Scene).time.delayedCall(AI_DELAY, () => {
      if (this.session.matchPhase !== 'playing') return;

      const aiId: PlayerId = 1;
      const state = getVisibleState(this.session, aiId);

      const phase1Action = this.aiPlayer.choosePhase1(state);
      const phase1Phase = this.session.round.turnPhase;
      const phase1Result = executeAction(this.session, phase1Action);
      this.recorder.recordAction(this.session, phase1Result, phase1Action, phase1Phase);

      // Don't refresh expeditions before animation — that would create a
      // destination sprite with card back before the animated card arrives.
      // Instead, the card hand sprite is animated to the destination via
      // flipCard, then refreshAll after phase 2 creates the correct state.
      this.renderer.refreshDiscardPiles();
      this.renderer.refreshScores();
      this.renderer.refreshDrawPile();

      this.animator.animateAiPhase1(phase1Action, () => {
        if (this.session.matchPhase !== 'playing') return;

        const state2 = getVisibleState(this.session, aiId);
        const phase2Action = this.aiPlayer.choosePhase2(state2);

        const phase2Phase = this.session.round.turnPhase;
        const phase2Result = executeAction(this.session, phase2Action);
        this.recorder.recordAction(this.session, phase2Result, phase2Action, phase2Phase);

        this.renderer.refreshDiscardPiles();
        this.renderer.refreshDrawPile();

        this.animator.animateAiPhase2(phase2Action, () => {
          this.callbacks.onRefreshAll();

          if (phase2Result.roundEnded) {
            if (phase2Result.matchEnded) {
              this.callbacks.onShowMatchSummary(phase2Result.roundScore!);
            } else {
              this.callbacks.onShowRoundSummary(phase2Result.roundScore!);
            }
          } else {
            this.callbacks.onPlaySound(SFX_KEYS.TURN_CHANGE);
            this.setPhase('waiting-for-card-select');
          }
        });
      });
    });
  }

  checkNextTurn(): void {
    if (isMatchOver(this.session)) {
      this.setPhase('match-over');
      return;
    }

    const current = this.session.round.currentPlayer;
    if (this.session.players[current].isAI) {
      this.callbacks.onRunAiTurn();
    } else {
      this.setPhase('waiting-for-card-select');
    }
  }
}
