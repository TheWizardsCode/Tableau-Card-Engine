/**
 * FeudalismReplayController — replay mode state injection.
 */
import type { DevelopmentCard, PatronTile, ResourceTokens, Tier } from '../FeudalismCards';
import type { FeudalismSession, FeudalismPhase } from '../FeudalismGame';
import type { MarketSnapshot, PlayerSnapshot } from '../GameTranscript';

export class FeudalismReplayController {
  loadBoardState(
    sessionRef: { session: FeudalismSession | null; replayStepIndex: number },
    state: {
      playerStates: PlayerSnapshot[];
      market: MarketSnapshot;
      tokenSupply: ResourceTokens;
      patrons: PatronTile[];
      phase: FeudalismPhase;
      currentPlayerIndex: number;
      stepIndex?: number;
    },
  ): void {
    const market = {} as Record<Tier, { visible: (DevelopmentCard | null)[]; deck: DevelopmentCard[] }>;
    for (const tierSnap of state.market) {
      market[tierSnap.tier] = {
        visible: tierSnap.visible,
        deck: new Array(tierSnap.deckCount).fill(null),
      };
    }

    const players = state.playerStates.map((ps) => ({
      name: ps.name,
      isAI: ps.isAI,
      tokens: { ...ps.tokens },
      purchasedCards: [...ps.purchasedCards],
      reservedCards: [...ps.reservedCards],
      patrons: [...ps.patrons],
    }));

    sessionRef.session = {
      players,
      market,
      tokenSupply: { ...state.tokenSupply },
      patrons: [...state.patrons],
      phase: state.phase,
      currentPlayerIndex: state.currentPlayerIndex,
      startingPlayerIndex: 0,
      triggerPlayerIndex: -1,
      rng: Math.random,
    } as FeudalismSession;

    if (state.stepIndex !== undefined) {
      sessionRef.replayStepIndex = state.stepIndex;
    }
  }
}
