/**
 * GolfTurnController -- handles human turn execution and turn flow for 9-Card Golf.
 */

import type { Card } from '../../../src/card-system/Card';
import type { GolfMove, DrawSource } from '../GolfRules';
import type { GolfSession, GolfAction, TurnResult } from '../GolfGame';
import { executeTurn } from '../GolfGame';
import type { TranscriptRecorder } from '../GameTranscript';
import type { GameEventEmitter } from '../../../src/core-engine';
import type { TurnPhase } from './GolfConstants';
import type { PhaseManager } from '../../../src/ui';

export class GolfTurnController {
  drawnCard: Card | null = null;
  drawSource: DrawSource | null = null;

  constructor(
    private session: GolfSession,
    private recorder: TranscriptRecorder,
    private phaseManager: PhaseManager<TurnPhase>,
    private gameEvents: GameEventEmitter,
  ) {}

  isHumanTurn(): boolean {
    return this.session.gameState.currentPlayerIndex === 0;
  }

  checkNextTurn(onHumanTurn: () => void, onAiTurn: () => void): void {
    if (this.session.gameState.phase === 'ended') {
      this.phaseManager.set('round-ended');
    } else if (this.isHumanTurn()) {
      onHumanTurn();
    } else {
      onAiTurn();
    }
  }

  humanDraw(
    source: DrawSource,
    onDrawn: (card: Card, source: DrawSource) => void,
  ): void {
    this.drawSource = source;

    // Peek at the card that will be drawn
    if (source === 'stock') {
      const stockArr = this.session.shared.stockPile;
      this.drawnCard = stockArr[stockArr.length - 1];
    } else {
      this.drawnCard = this.session.shared.discardPile.peek() ?? null;
    }

    if (!this.drawnCard) return;

    // Emit card-drawn event
    this.gameEvents.emit('card-drawn', {
      source,
      playerIndex: 0,
    });

    onDrawn(this.drawnCard, source);
    this.phaseManager.set('waiting-for-move');
  }

  humanMove(
    move: GolfMove,
    animateAndProceed: (
      result: TurnResult,
      onAnimationComplete: () => void,
    ) => void,
    onTurnComplete: (result: TurnResult) => void,
  ): void {
    if (!this.drawSource) return;

    const action: GolfAction = { drawSource: this.drawSource, move };
    this.phaseManager.set('animating');

    const result = executeTurn(this.session, action);
    this.recorder.recordTurn(result, action.drawSource);

    // Emit card-level events based on the move type
    if (move.kind === 'swap') {
      this.gameEvents.emit('card-swapped', {
        position: move.row * 3 + move.col,
        drawnFrom: this.drawSource,
        playerIndex: 0,
      });
    } else {
      this.gameEvents.emit('card-discarded', { playerIndex: 0 });
      this.gameEvents.emit('card-flipped', {
        position: move.row * 3 + move.col,
        playerIndex: 0,
      });
    }

    this.emitTurnCompleted(result);

    animateAndProceed(result, () => {
      this.drawnCard = null;
      this.drawSource = null;
      onTurnComplete(result);
    });
  }

  private emitTurnCompleted(result: TurnResult): void {
    this.gameEvents.emit('turn-completed', {
      turnNumber: this.session.gameState.turnNumber,
      playerIndex: result.playerIndex,
      playerName: this.session.gameState.players[result.playerIndex].name,
      phase: this.session.gameState.phase,
    });
  }
}
