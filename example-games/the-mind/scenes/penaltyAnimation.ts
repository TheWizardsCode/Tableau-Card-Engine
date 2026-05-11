export type SpritePoint = { x: number; y: number };

export type PenaltyCardRef = {
  playerId: 0 | 1;
  card: { value: number };
};

/**
 * Pick visual start positions for penalty card reveal animations.
 *
 * Lower cards in The Mind are the leftmost cards in a sorted hand, so when
 * penalty cards are removed we animate from the leftmost visible sprites of
 * each player first.
 */
export function pickPenaltyStartPositions(
  penaltyCards: ReadonlyArray<PenaltyCardRef>,
  humanSprites: ReadonlyArray<SpritePoint>,
  aiSprites: ReadonlyArray<SpritePoint>,
  fallbackByPlayer: { 0: SpritePoint; 1: SpritePoint } = {
    0: { x: 0, y: 0 },
    1: { x: 0, y: 0 },
  },
): SpritePoint[] {
  let humanIdx = 0;
  let aiIdx = 0;

  return penaltyCards.map((p) => {
    if (p.playerId === 0) {
      const src = humanSprites[humanIdx];
      humanIdx += 1;
      return src ?? fallbackByPlayer[0];
    }

    const src = aiSprites[aiIdx];
    aiIdx += 1;
    return src ?? fallbackByPlayer[1];
  });
}
