/**
 * LostCitiesReplayController — replay mode state injection.
 */
import type { ExpeditionColor, LostCitiesCard } from '../LostCitiesCards';
import { EXPEDITION_COLORS } from '../LostCitiesCards';
import type { LostCitiesSession } from '../LostCitiesGame';

export class LostCitiesReplayController {
  private session: LostCitiesSession;

  constructor(session: LostCitiesSession) {
    this.session = session;
  }

  loadBoardState(
    boardStates: [
      { hand: Array<{ id: number; color: string; type: string; rank: number; faceUp: boolean }>;
        expeditions: Record<string, Array<{ id: number; color: string; type: string; rank: number; faceUp: boolean }>> },
      { hand: Array<{ id: number; color: string; type: string; rank: number; faceUp: boolean }>;
        expeditions: Record<string, Array<{ id: number; color: string; type: string; rank: number; faceUp: boolean }>> },
    ],
    tableState: {
      discardTops: Record<string, { id: number; color: string; type: string; rank: number; faceUp: boolean } | null>;
      drawPileSize: number;
    },
  ): void {
    for (let p = 0; p < 2; p++) {
      const snapshot = boardStates[p];

      this.session.players[p as 0 | 1].hand = snapshot.hand.map(
        (cs) => this.snapshotToCard(cs),
      );

      const expeditions = this.session.players[p as 0 | 1].expeditions;
      for (const color of EXPEDITION_COLORS) {
        const cards = (snapshot.expeditions[color] ?? []).map(
          (cs) => this.snapshotToCard(cs),
        );
        expeditions.set(color, cards);
      }
    }

    for (const color of EXPEDITION_COLORS) {
      const topSnap = tableState.discardTops[color];
      if (topSnap) {
        const card = this.snapshotToCard(topSnap);
        card.faceUp = true;
        this.session.round.discardPiles.set(color, [card]);
      } else {
        this.session.round.discardPiles.set(color, []);
      }
    }

    this.session.round.drawPile.length = 0;
    for (let i = 0; i < tableState.drawPileSize; i++) {
      this.session.round.drawPile.push({
        id: -1,
        color: 'yellow' as ExpeditionColor,
        type: 'numbered',
        rank: 2 as 2,
        faceUp: false,
      });
    }
  }

  private snapshotToCard(
    cs: { id: number; color: string; type: string; rank: number; faceUp: boolean },
  ): LostCitiesCard {
    if (cs.type === 'investment') {
      return {
        id: cs.id,
        color: cs.color as ExpeditionColor,
        type: 'investment',
        investmentIndex: cs.rank as 1 | 2 | 3,
        faceUp: cs.faceUp,
      };
    }
    return {
      id: cs.id,
      color: cs.color as ExpeditionColor,
      type: 'numbered',
      rank: cs.rank as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
      faceUp: cs.faceUp,
    };
  }
}
