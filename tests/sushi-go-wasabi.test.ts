import { describe, it, expect } from 'vitest';
import {
  setupSushiGoGame,
  executeAllPicks,
} from '../example-games/sushi-go/SushiGoGame';
import { scoreTableauBreakdown } from '../example-games/sushi-go/SushiGoScoring';
import type { PickAction } from '../example-games/sushi-go/SushiGoGame';

describe('Sushi Go! - Wasabi pairing & Chopsticks selection order', () => {
  it('pairs wasabi with the next nigiri in play order', () => {
    const session = setupSushiGoGame({ playerCount: 2 });
    const p = session.players[0];

    // Construct a tableau: wasabi, tempura, nigiri(egg)
    p.tableau = [
      { id: 1, type: 'wasabi' },
      { id: 2, type: 'tempura' },
      { id: 3, type: 'nigiri', variant: 'egg' },
    ] as any;

    const breakdown = scoreTableauBreakdown(p.tableau as any);
    // Nigiri egg = 1, wasabi triples it -> 3
    expect(breakdown.nigiri).toBe(3);
  });

  it('preserves selection order when using chopsticks', () => {
    const session = setupSushiGoGame({ playerCount: 2 });
    const p = session.players[0];
    // Set a predictable hand
    p.hand = [
      { id: 10, type: 'tempura' },
      { id: 11, type: 'nigiri', variant: 'salmon' },
      { id: 12, type: 'dumpling' },
    ] as any;

    // Ensure the player has chopsticks in their tableau so chopsticks
    // usage is allowed. Place a chopsticks card before executing picks.
    p.tableau = [{ id: 99, type: 'chopsticks' }] as any;

    // Simulate chopsticks pick: first pick index 0 then index 2
    const action: PickAction = { cardIndex: 0, secondCardIndex: 2 } as any;
    // applyPick is internal; call executeAllPicks to exercise the public flow
    const aiPick: PickAction = { cardIndex: 0 };
    // Give AI a simple hand
    session.players[1].hand = [{ id: 20, type: 'tempura' }] as any;

    executeAllPicks(session, [action, aiPick]);

    // After pick, the first pushed card should be the one at cardIndex 0
    expect(session.players[0].tableau[0].id).toBe(10);
    expect(session.players[0].tableau[1].id).toBe(12);
  });
});
