/**
 * GolfAiController -- handles AI turn execution for 9-Card Golf.
 */

import type { Card } from '../../../src/card-system/Card';
import type { GolfAction, TurnResult } from '../GolfGame';
import {
  executeTurn,
  createAiVisibleSharedState,
  createAiVisiblePlayerState,
} from '../GolfGame';
import type { AiPlayer } from '../AiStrategy';
import { countVisibleRanks } from '../AiStrategy';
import type { TranscriptRecorder } from '../GameTranscript';
import type { GameEventEmitter } from '../../../src/core-engine';
import type { TurnPhase } from './GolfConstants';
import type { PhaseManager } from '../../../src/ui';
import type { GolfSession } from '../GolfGame';
import { AI_DELAY, AI_SHOW_DRAW_DELAY, SWAP_ANIM_DURATION } from './GolfConstants';

export class GolfAiController {
  /**
   * When true, add extra delay to compensate for skipped animations
   * so the AI's turn remains perceptible as thoughtful/measured.
   */
  reducedMotion = false;

  constructor(
    private scene: Phaser.Scene,
    private session: GolfSession,
    private recorder: TranscriptRecorder,
    private aiPlayer: AiPlayer,
    private phaseManager: PhaseManager<TurnPhase>,
    private gameEvents: GameEventEmitter,
  ) {}

  /**
   * Run an AI turn using a fair two-phase decision process:
   *
   * Phase 1: AI chooses draw source using only visible information
   *          (filtered state projection — no stock peek, no face-down peek).
   * Phase 2: Scene performs the actual draw, then AI evaluates moves
   *          using the now-known drawn card and fair AI-visible scoring.
   */
  runAiTurn(
    instructionText: Phaser.GameObjects.Text,
    showDrawnCard: (card: Card, source: 'stock' | 'discard') => void,
    refreshPiles: () => void,
    animateTurn: (
      result: TurnResult,
      onAnimationComplete: () => void,
    ) => void,
    onTurnComplete: (result: TurnResult) => void,
  ): void {
    this.phaseManager.set('ai-thinking');

    const initialDelay = this.reducedMotion ? AI_DELAY + SWAP_ANIM_DURATION : AI_DELAY;
    this.scene.time.delayedCall(initialDelay, () => {
      // If the game ended while this callback was pending, bail out early.
      if (this.session.gameState.phase === 'ended') return;
      const idx = this.session.gameState.currentPlayerIndex;
      const ps = this.session.gameState.playerStates[idx];

      // Create AI-visible state projections (information boundary)
      const aiShared = createAiVisibleSharedState(this.session.shared);
      const aiPlayer = createAiVisiblePlayerState(ps);

      // Phase 1: AI chooses draw source without peeking at stock
      const drawSource = this.aiPlayer.chooseDrawSource(aiPlayer, aiShared);

      // Scene performs the actual draw from raw game state
      let drawnCard: Card;
      if (drawSource === 'stock') {
        drawnCard = this.session.shared.stockPile.pop()!;
      } else {
        drawnCard = this.session.shared.discardPile.popOrThrow();
      }

      // Record the drawn card in the AI's memory tracker (only for discard
      // draws, since the discard top is visible information the AI should
      // remember across turns). Stock draws are hidden information and not
      // recorded.
      if (drawSource === 'discard') {
        this.aiPlayer.recordCard(drawnCard);
        // Refresh the pile display to show the new top card (or empty
        // placeholder). The card has already been popped, so we use
        // refreshPiles() — updateDiscardPileAfterDraw() is designed for
        // the human peek-not-pop path and would incorrectly compute the
        // display when the card is already removed from the pile.
        refreshPiles();
      }

      // Show the drawn card to the player
      showDrawnCard(drawnCard, drawSource);
      const sourceLabel = drawSource === 'stock' ? 'Stock pile' : 'Discard pile';
      instructionText.setText(`AI drew from ${sourceLabel}`);

      // Emit card-drawn event for AI
      this.gameEvents.emit('card-drawn', {
        source: drawSource,
        playerIndex: idx,
      });

      // Phase 2: AI sees the drawn card and chooses the best move
      const aiGridForMove = aiPlayer.grid;
      // Compute visible rank counts for column-feasibility weighting,
      // consistent with Phase 1's chooseDrawSource reasoning.
      const visibleRanks = countVisibleRanks(aiPlayer, aiShared);
      const move = this.aiPlayer.chooseMoveForCard(
        aiGridForMove, drawnCard, visibleRanks,
      );

      const action: GolfAction = { drawSource, move };

      // Pause so the player can see the drawn card, then execute the move
      this.scene.time.delayedCall(AI_SHOW_DRAW_DELAY, () => {
        // Guard against the game ending while waiting for the AI-show delay.
        if (this.session.gameState.phase === 'ended') return;
        this.phaseManager.set('animating');

        // Put the drawn card back for executeTurn to draw it again
        // (executeTurn expects to do the draw itself)
        if (drawSource === 'stock') {
          this.session.shared.stockPile.push(drawnCard);
        } else {
          this.session.shared.discardPile.push(drawnCard);
        }

        // After restoring the drawn card to the pile, ensure the discard
        // pile visual is in sync with the underlying state.
        refreshPiles();

        const result = executeTurn(this.session, action);
        this.recorder.recordTurn(result, action.drawSource);

        // Emit card-level events based on the AI's move type
        if (action.move.kind === 'swap') {
          this.gameEvents.emit('card-swapped', {
            position: action.move.row * 3 + action.move.col,
            drawnFrom: action.drawSource,
            playerIndex: idx,
          });
        } else {
          this.gameEvents.emit('card-discarded', { playerIndex: idx });
          this.gameEvents.emit('card-flipped', {
            position: action.move.row * 3 + action.move.col,
            playerIndex: idx,
          });
        }

        this.emitTurnCompleted(result);

        animateTurn(result, () => {
          onTurnComplete(result);
        });
      });
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
