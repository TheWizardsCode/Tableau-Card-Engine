import { describe, it, expect } from 'vitest';

import {
  pickPenaltyStartPositions,
  type PenaltyCardRef,
  type SpritePoint,
} from '../../example-games/the-mind/scenes/penaltyAnimation';

describe('pickPenaltyStartPositions', () => {
  it('uses leftmost hand sprite positions for each player', () => {
    const penaltyCards: PenaltyCardRef[] = [
      { playerId: 0, card: { value: 5 } },
      { playerId: 0, card: { value: 8 } },
      { playerId: 1, card: { value: 12 } },
    ];

    const humanSprites: SpritePoint[] = [
      { x: 100, y: 590 },
      { x: 170, y: 590 },
      { x: 240, y: 590 },
    ];
    const aiSprites: SpritePoint[] = [
      { x: 320, y: 150 },
      { x: 390, y: 150 },
    ];

    const starts = pickPenaltyStartPositions(penaltyCards, humanSprites, aiSprites);

    expect(starts).toEqual([
      { x: 100, y: 590 },
      { x: 170, y: 590 },
      { x: 320, y: 150 },
    ]);
  });

  it('falls back to provided default positions when sprite slots are unavailable', () => {
    const penaltyCards: PenaltyCardRef[] = [
      { playerId: 1, card: { value: 3 } },
      { playerId: 1, card: { value: 4 } },
    ];

    const starts = pickPenaltyStartPositions(
      penaltyCards,
      [],
      [{ x: 350, y: 150 }],
      {
        0: { x: 500, y: 590 },
        1: { x: 500, y: 150 },
      },
    );

    expect(starts).toEqual([
      { x: 350, y: 150 },
      { x: 500, y: 150 },
    ]);
  });
});
