/**
 * MindAiScheduler -- handles AI turn scheduling and auto-play spectator mode for The Mind.
 */

import { MindAiPlayer, computeEffectiveDelay } from '../AiStrategy';
import { getPileTopValue } from '../TheMindGameState';
import type { TheMindSession } from '../TheMindGameState';
export class MindAiScheduler {
  private aiTimer: Phaser.Time.TimerEvent | null = null;
  private humanAiTimer: Phaser.Time.TimerEvent | null = null;
  private aiLevelStartTime = 0;

  aiPlayer: MindAiPlayer;
  humanAiPlayer: MindAiPlayer;
  autoPlayEnabled = false;

  constructor(
    private scene: Phaser.Scene,
    private session: TheMindSession,
  ) {
    this.aiPlayer = new MindAiPlayer();
    this.humanAiPlayer = new MindAiPlayer();
  }

  startLevel(): void {
    this.aiLevelStartTime = Date.now();
    this.aiPlayer.commitLevel(this.session.players[1].hand);
    if (this.autoPlayEnabled) {
      this.humanAiPlayer.commitLevel(this.session.players[0].hand);
    }
  }

  scheduleAiPlay(phase: string, onPlay: (cardValue: number) => void): void {
    this.cancelAiTimer();

    const nextCard = this.aiPlayer.getNextCard();
    if (!nextCard) return;

    const elapsed = Date.now() - this.aiLevelStartTime;
    const delay = computeEffectiveDelay(
      nextCard.delay,
      elapsed,
      this.session.players[1].hand.length,
      this.session.players[0].hand.length,
      nextCard.card.value,
      getPileTopValue(this.session),
    );

    this.aiTimer = this.scene.time.delayedCall(delay, () => {
      if (phase !== 'playing') return;
      onPlay(nextCard.card.value);
    });
  }

  scheduleHumanAiPlay(phase: string, onPlay: (cardValue: number) => void): void {
    this.cancelHumanAiTimer();
    if (!this.autoPlayEnabled) return;

    const nextCard = this.humanAiPlayer.getNextCard();
    if (!nextCard) return;

    const elapsed = Date.now() - this.aiLevelStartTime;
    const delay = computeEffectiveDelay(
      nextCard.delay,
      elapsed,
      this.session.players[0].hand.length,
      this.session.players[1].hand.length,
      nextCard.card.value,
      getPileTopValue(this.session),
    );

    this.humanAiTimer = this.scene.time.delayedCall(delay, () => {
      if (phase !== 'playing') return;
      onPlay(nextCard.card.value);
    });
  }

  rescheduleAiIfNeeded(phase: string, onPlay: (cardValue: number) => void): void {
    if (this.aiPlayer.hasCards() && phase === 'playing') {
      this.scheduleAiPlay(phase, onPlay);
    }
  }

  rescheduleHumanAiIfNeeded(phase: string, onPlay: (cardValue: number) => void): void {
    if (this.autoPlayEnabled && this.humanAiPlayer.hasCards() && phase === 'playing') {
      this.scheduleHumanAiPlay(phase, onPlay);
    }
  }

  cancelAiTimer(): void {
    if (this.aiTimer) {
      this.aiTimer.destroy();
      this.aiTimer = null;
    }
  }

  cancelHumanAiTimer(): void {
    if (this.humanAiTimer) {
      this.humanAiTimer.destroy();
      this.humanAiTimer = null;
    }
  }

  cancelAllTimers(): void {
    this.cancelAiTimer();
    this.cancelHumanAiTimer();
  }

  removeCardFromAi(cardValue: number): void {
    this.aiPlayer.removeCard(cardValue);
    if (this.autoPlayEnabled) {
      this.humanAiPlayer.removeCard(cardValue);
    }
  }

  removePenaltyCards(penaltyCards: ReadonlyArray<{ card: { value: number } }>): void {
    for (const pc of penaltyCards) {
      this.aiPlayer.removeCard(pc.card.value);
      if (this.autoPlayEnabled) {
        this.humanAiPlayer.removeCard(pc.card.value);
      }
    }
  }

  toggleAutoPlay(
    currentEnabled: boolean,
    onToggle: (enabled: boolean) => void,
  ): boolean {
    const newEnabled = !currentEnabled;
    this.autoPlayEnabled = newEnabled;

    if (newEnabled) {
      this.humanAiPlayer.commitLevel(this.session.players[0].hand);
    } else {
      this.cancelHumanAiTimer();
    }

    onToggle(newEnabled);
    return newEnabled;
  }

  destroy(): void {
    this.cancelAllTimers();
  }
}
