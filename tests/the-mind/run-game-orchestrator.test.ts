import { describe, expect, it } from 'vitest';

import { setupTheMindGame } from '../../example-games/the-mind/TheMindGameState';
import {
  buildPlayQueue,
  buildResultSnapshot,
  type SimulationStats,
} from '../../example-games/the-mind/RunGameOrchestrator';
import { PROXIMITY_MIN_DELAY } from '../../example-games/the-mind/AiStrategy';
import { createSeededRng } from '../../src/core-engine/SeededRng';

type DelayEntry = { card: { value: number; faceUp: boolean }; delay: number };

function makeAi(delays: DelayEntry[]) {
  return {
    getCardDelays: () => delays,
  };
}

describe('RunGameOrchestrator.buildPlayQueue', () => {
  it('sorts by fireTime and then by cardValue', () => {
    const p0 = makeAi([
      { card: { value: 40, faceUp: false }, delay: 900 },
      { card: { value: 20, faceUp: false }, delay: 900 },
    ]);
    const p1 = makeAi([
      { card: { value: 10, faceUp: false }, delay: 800 },
    ]);

    const queue = buildPlayQueue([p0, p1] as never, 1000, 0);

    expect(queue.map((entry) => entry.cardValue)).toEqual([10, 20, 40]);
    expect(queue.map((entry) => entry.fireTime)).toEqual([1800, 1900, 1900]);
  });

  it('enforces minimum proximity delay for cards close to pile top', () => {
    const p0 = makeAi([{ card: { value: 15, faceUp: false }, delay: 50 }]);
    const p1 = makeAi([{ card: { value: 90, faceUp: false }, delay: 500 }]);

    const levelStartTime = 200;
    const queue = buildPlayQueue([p0, p1] as never, levelStartTime, 12);

    const closeCard = queue.find((entry) => entry.cardValue === 15);
    expect(closeCard).toBeDefined();
    expect(closeCard?.fireTime).toBe(levelStartTime + PROXIMITY_MIN_DELAY);
  });
});

describe('RunGameOrchestrator.buildResultSnapshot', () => {
  it('aggregates final statistics from simulation and session state', () => {
    const session = setupTheMindGame({ rng: createSeededRng(11) });
    session.currentLevel = 6;
    session.lives = 1;
    session.outcome = 'loss';

    const stats: SimulationStats = {
      totalPlays: 42,
      totalPenalties: 3,
      levelStartTime: 1234,
    };

    const snapshot = buildResultSnapshot(stats, session);

    expect(snapshot).toEqual({
      totalPlays: 42,
      totalPenalties: 3,
      outcome: 'loss',
      finalLevel: 6,
      finalLives: 1,
    });
  });
});
