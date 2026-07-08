/**
 * SushiGoReplayController -- handles replay mode state injection for Sushi Go!
 */

import type { SushiGoCard } from '../SushiGoCards';
import type { SushiGoSession } from '../SushiGoGame';
import type { PlayerSnapshot } from '../GameTranscript';

export class SushiGoReplayController {
  replayStepIndex = -1;

  constructor(
    private scene: Phaser.Scene,
    private replayMode: { value: boolean },
  ) {}

  loadBoardState(
    state: {
      players: PlayerSnapshot[];
      currentRound: number;
      currentTurn: number;
      cardsPerPlayer: number;
      stepIndex?: number;
    },
  ): SushiGoSession {
    if (!this.replayMode.value) {
      throw new Error(
        'loadBoardState() is only available in replay mode (?mode=replay)',
      );
    }

    const playerStates = state.players.map((p) => ({
      name: p.name,
      isAI: p.isAI,
      hand: p.hand.map((c) => this.rehydrateCard(c)),
      tableau: p.tableau.map((c) => this.rehydrateCard(c)),
      puddingCount: p.puddingCount,
      roundScores: [...p.roundScores],
      totalScore: p.totalScore,
    }));

    const session: SushiGoSession = {
      players: playerStates,
      phase: 'picking',
      currentRound: state.currentRound,
      currentTurn: state.currentTurn,
      cardsPerPlayer: state.cardsPerPlayer,
      totalRounds: 3,
      rng: Math.random,
    } as SushiGoSession;

    if (state.stepIndex !== undefined) {
      this.replayStepIndex = state.stepIndex;
    }

    (this.scene as any).emitStateSettled(this.replayStepIndex, 'playing');

    return session;
  }

  private rehydrateCard(snap: { id: number; type: string; icons?: number; variant?: string }): SushiGoCard {
    const base = { id: snap.id, type: snap.type };
    if (snap.type === 'maki' && snap.icons !== undefined) {
      return { ...base, type: 'maki', icons: snap.icons } as SushiGoCard;
    }
    if (snap.type === 'nigiri' && snap.variant !== undefined) {
      return { ...base, type: 'nigiri', variant: snap.variant } as unknown as SushiGoCard;
    }
    return base as SushiGoCard;
  }
}
