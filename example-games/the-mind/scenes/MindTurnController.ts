/**
 * MindTurnController -- handles card play logic, level lifecycle, and game over for The Mind.
 */

import type { PlayResult, PlayerId, TheMindSession } from '../TheMindGameState';
import { playCard, isGameOver, getPileTopValue } from '../TheMindGameState';
import { MindTranscriptRecorder } from '../GameTranscript';
import type { GameEventEmitter, SoundManager } from '../../../src/core-engine';
import { SFX_KEYS } from './MindConstants';
import type { MindAiScheduler } from './MindAiScheduler';

export class MindTurnController {
  turnCounter = 0;
  levelStartTime = 0;

  constructor(
    private session: TheMindSession,
    private recorder: MindTranscriptRecorder,
    private gameEvents: GameEventEmitter,
    private soundManager: SoundManager | null,
  ) {}

  performPlay(
    playerId: PlayerId,
    cardValue: number,
    aiScheduler: MindAiScheduler,
    animateCard: (playerId: PlayerId, cardValue: number, onComplete: () => void) => void,
    onPenaltyComplete: (result: PlayResult) => void,
    onNormalComplete: (result: PlayResult) => void,
    onInvalidPlay: (cardValue: number) => void,
  ): void {
    const timestamp = Date.now() - this.levelStartTime;
    const result = playCard(this.session, playerId, cardValue);

    if (!result.success) {
      if (playerId === 0) {
        onInvalidPlay(cardValue);
      }
      return;
    }

    this.turnCounter++;
    this.soundManager?.play(SFX_KEYS.CARD_PLAY);

    this.recorder.recordCardPlay(
      timestamp,
      playerId,
      cardValue,
      getPileTopValue(this.session),
      this.session.pile.size(),
    );

    aiScheduler.removeCardFromAi(cardValue);

    if (result.lifeLost) {
      aiScheduler.cancelAllTimers();
      this.soundManager?.play(SFX_KEYS.LIFE_LOST);

      this.recorder.recordPenalty(
        timestamp,
        this.session.lives,
        result.penaltyCards.map((p) => ({
          playerId: p.playerId,
          cardValue: p.card.value,
        })),
      );

      aiScheduler.removePenaltyCards(result.penaltyCards);

      animateCard(playerId, cardValue, () => {
        onPenaltyComplete(result);
      });
      return;
    }

    animateCard(playerId, cardValue, () => {
      onNormalComplete(result);
    });
  }

  handleLevelComplete(
    result: PlayResult,
    onUiUpdate: () => void,
    onNextLevel: () => void,
    showLevelCompleteText: (completedLevel: number, bonusLifeAwarded: boolean, onComplete: () => void) => void,
  ): void {
    const timestamp = Date.now() - this.levelStartTime;
    const completedLevel = this.session.currentLevel - (result.levelComplete ? 1 : 0);
    const handsDealt: [readonly number[], readonly number[]] | undefined =
      !(isGameOver(this.session) && this.session.outcome === 'win')
        ? [
            this.session.players[0].hand.map((c) => c.value),
            this.session.players[1].hand.map((c) => c.value),
          ]
        : undefined;

    this.recorder.recordLevelComplete(
      timestamp,
      completedLevel,
      result.bonusLifeAwarded,
      this.session.lives,
      handsDealt,
    );

    if (isGameOver(this.session) && this.session.outcome === 'win') {
      return; // Let caller handle game over
    }

    this.soundManager?.play(SFX_KEYS.LEVEL_COMPLETE);
    onUiUpdate();

    showLevelCompleteText(completedLevel, result.bonusLifeAwarded, () => {
      onNextLevel();
    });
  }

  handleGameOver(
    onWin: () => void,
    onLoss: () => void,
  ): 'win' | 'loss' {
    const timestamp = Date.now() - this.levelStartTime;
    const outcome = this.session.outcome as 'win' | 'loss';

    this.recorder.finalize(
      timestamp,
      outcome,
      this.session.currentLevel,
      this.session.lives,
    );

    this.gameEvents.emit('game-ended', {
      finalTurnNumber: this.turnCounter,
      winnerIndex: outcome === 'win' ? 0 : -1,
      reason:
        outcome === 'win'
          ? `Completed all 8 levels!`
          : 'Ran out of lives',
    });

    if (outcome === 'win') {
      onWin();
    } else {
      onLoss();
    }

    return outcome;
  }

  createRecorder(initialState: {
    playerNames: [string, string];
    isAI: [boolean, boolean];
    startingLives: number;
    startingLevel: number;
    hands: [number[], number[]];
  }): MindTranscriptRecorder {
    return new MindTranscriptRecorder(initialState);
  }
}
