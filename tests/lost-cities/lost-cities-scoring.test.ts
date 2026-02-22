import { describe, it, expect } from 'vitest';
import type {
  InvestmentCard,
  NumberedCard,
  LostCitiesCard,
  ExpeditionColor,
} from '../../example-games/lost-cities/LostCitiesCards';
import {
  scoreExpedition,
  scoreExpeditionDetailed,
  scoreRound,
  scoreRoundDetailed,
  matchScore,
  EXPEDITION_BASE_COST,
  EXPEDITION_BONUS,
  EXPEDITION_BONUS_THRESHOLD,
} from '../../example-games/lost-cities/LostCitiesScoring';

// ── Test helpers ───────────────────────────────────────────

function makeInvestment(
  color: ExpeditionColor,
  idx: 1 | 2 | 3,
): InvestmentCard {
  return {
    id: idx,
    color,
    type: 'investment',
    investmentIndex: idx,
    faceUp: false,
  };
}

function makeNumbered(
  color: ExpeditionColor,
  rank: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
): NumberedCard {
  return { id: rank, color, type: 'numbered', rank, faceUp: false };
}

// ── Constants ──────────────────────────────────────────────

describe('Scoring constants', () => {
  it('expedition base cost is -20', () => {
    expect(EXPEDITION_BASE_COST).toBe(-20);
  });

  it('expedition bonus is +20', () => {
    expect(EXPEDITION_BONUS).toBe(20);
  });

  it('bonus threshold is 8 cards', () => {
    expect(EXPEDITION_BONUS_THRESHOLD).toBe(8);
  });
});

// ── scoreExpedition ────────────────────────────────────────

describe('scoreExpedition', () => {
  it('scores an empty expedition as 0', () => {
    expect(scoreExpedition([])).toBe(0);
  });

  it('scores a basic expedition (no investments)', () => {
    // Cards: 5, 7, 9 -> sum = 21
    // Score: (-20 + 21) * 1 = 1
    const cards: LostCitiesCard[] = [
      makeNumbered('yellow', 5),
      makeNumbered('yellow', 7),
      makeNumbered('yellow', 9),
    ];
    expect(scoreExpedition(cards)).toBe(1);
  });

  it('scores a single-card expedition', () => {
    // Card: 3 -> sum = 3
    // Score: (-20 + 3) * 1 = -17
    const cards: LostCitiesCard[] = [makeNumbered('blue', 3)];
    expect(scoreExpedition(cards)).toBe(-17);
  });

  it('scores an expedition with 1 investment (x2 multiplier)', () => {
    // Inv + 5 + 8 -> sum = 0 + 5 + 8 = 13
    // Score: (-20 + 13) * 2 = -14
    const cards: LostCitiesCard[] = [
      makeInvestment('green', 1),
      makeNumbered('green', 5),
      makeNumbered('green', 8),
    ];
    expect(scoreExpedition(cards)).toBe(-14);
  });

  it('scores an expedition with 2 investments (x3 multiplier)', () => {
    // Inv, Inv + 4, 6, 8, 10 -> sum = 0+0+4+6+8+10 = 28
    // Score: (-20 + 28) * 3 = 24
    const cards: LostCitiesCard[] = [
      makeInvestment('red', 1),
      makeInvestment('red', 2),
      makeNumbered('red', 4),
      makeNumbered('red', 6),
      makeNumbered('red', 8),
      makeNumbered('red', 10),
    ];
    expect(scoreExpedition(cards)).toBe(24);
  });

  it('scores an expedition with 3 investments (x4 multiplier)', () => {
    // 3 Inv + 2, 5, 7 -> sum = 0+0+0+2+5+7 = 14
    // Score: (-20 + 14) * 4 = -24 (6 cards, no bonus)
    const cards: LostCitiesCard[] = [
      makeInvestment('white', 1),
      makeInvestment('white', 2),
      makeInvestment('white', 3),
      makeNumbered('white', 2),
      makeNumbered('white', 5),
      makeNumbered('white', 7),
    ];
    expect(scoreExpedition(cards)).toBe(-24);
  });

  it('applies 8-card bonus (+20) for 8+ cards', () => {
    // 3 Inv + 2,3,5,7,10 = 8 cards
    // sum = 0+0+0+2+3+5+7+10 = 27
    // Score: (-20 + 27) * 4 + 20 = 28 + 20 = 48
    const cards: LostCitiesCard[] = [
      makeInvestment('blue', 1),
      makeInvestment('blue', 2),
      makeInvestment('blue', 3),
      makeNumbered('blue', 2),
      makeNumbered('blue', 3),
      makeNumbered('blue', 5),
      makeNumbered('blue', 7),
      makeNumbered('blue', 10),
    ];
    expect(cards).toHaveLength(8);
    expect(scoreExpedition(cards)).toBe(48);
  });

  it('applies 8-card bonus for more than 8 cards', () => {
    // 3 Inv + 2,3,4,5,6,7 = 9 cards
    // sum = 0+0+0+2+3+4+5+6+7 = 27
    // Score: (-20 + 27) * 4 + 20 = 28 + 20 = 48
    const cards: LostCitiesCard[] = [
      makeInvestment('green', 1),
      makeInvestment('green', 2),
      makeInvestment('green', 3),
      makeNumbered('green', 2),
      makeNumbered('green', 3),
      makeNumbered('green', 4),
      makeNumbered('green', 5),
      makeNumbered('green', 6),
      makeNumbered('green', 7),
    ];
    expect(cards).toHaveLength(9);
    expect(scoreExpedition(cards)).toBe(48);
  });

  it('does NOT apply 8-card bonus for 7 cards', () => {
    // 3 Inv + 2,3,5,7 = 7 cards
    // sum = 0+0+0+2+3+5+7 = 17
    // Score: (-20 + 17) * 4 = -12 (no bonus)
    const cards: LostCitiesCard[] = [
      makeInvestment('yellow', 1),
      makeInvestment('yellow', 2),
      makeInvestment('yellow', 3),
      makeNumbered('yellow', 2),
      makeNumbered('yellow', 3),
      makeNumbered('yellow', 5),
      makeNumbered('yellow', 7),
    ];
    expect(cards).toHaveLength(7);
    expect(scoreExpedition(cards)).toBe(-12);
  });

  it('scores expedition with only investment cards (negative)', () => {
    // 1 Inv -> sum = 0
    // Score: (-20 + 0) * 2 = -40
    const cards1: LostCitiesCard[] = [makeInvestment('red', 1)];
    expect(scoreExpedition(cards1)).toBe(-40);

    // 2 Inv -> sum = 0
    // Score: (-20 + 0) * 3 = -60
    const cards2: LostCitiesCard[] = [
      makeInvestment('red', 1),
      makeInvestment('red', 2),
    ];
    expect(scoreExpedition(cards2)).toBe(-60);

    // 3 Inv -> sum = 0
    // Score: (-20 + 0) * 4 = -80
    const cards3: LostCitiesCard[] = [
      makeInvestment('red', 1),
      makeInvestment('red', 2),
      makeInvestment('red', 3),
    ];
    expect(scoreExpedition(cards3)).toBe(-80);
  });

  it('scores a high-value expedition correctly', () => {
    // No investments: 6, 7, 8, 9, 10 -> sum = 40
    // Score: (-20 + 40) * 1 = 20
    const cards: LostCitiesCard[] = [
      makeNumbered('white', 6),
      makeNumbered('white', 7),
      makeNumbered('white', 8),
      makeNumbered('white', 9),
      makeNumbered('white', 10),
    ];
    expect(scoreExpedition(cards)).toBe(20);
  });

  it('scores a break-even expedition at exactly 20 value sum', () => {
    // No investments: 2, 8, 10 -> sum = 20
    // Score: (-20 + 20) * 1 = 0
    const cards: LostCitiesCard[] = [
      makeNumbered('yellow', 2),
      makeNumbered('yellow', 8),
      makeNumbered('yellow', 10),
    ];
    expect(scoreExpedition(cards)).toBe(0);
  });
});

// ── scoreExpeditionDetailed ────────────────────────────────

describe('scoreExpeditionDetailed', () => {
  it('returns correct breakdown for empty expedition', () => {
    const result = scoreExpeditionDetailed('yellow', []);
    expect(result.color).toBe('yellow');
    expect(result.cardCount).toBe(0);
    expect(result.investmentCount).toBe(0);
    expect(result.valueSum).toBe(0);
    expect(result.multiplier).toBe(0);
    expect(result.bonusEarned).toBe(false);
    expect(result.score).toBe(0);
  });

  it('returns correct breakdown for started expedition', () => {
    const cards: LostCitiesCard[] = [
      makeInvestment('blue', 1),
      makeNumbered('blue', 3),
      makeNumbered('blue', 7),
    ];
    const result = scoreExpeditionDetailed('blue', cards);
    expect(result.color).toBe('blue');
    expect(result.cardCount).toBe(3);
    expect(result.investmentCount).toBe(1);
    expect(result.valueSum).toBe(10);
    expect(result.multiplier).toBe(2);
    expect(result.bonusEarned).toBe(false);
    expect(result.score).toBe(-20); // (-20 + 10) * 2 = -20
  });

  it('returns bonusEarned = true for 8+ cards', () => {
    const cards: LostCitiesCard[] = [
      makeInvestment('green', 1),
      makeInvestment('green', 2),
      makeInvestment('green', 3),
      makeNumbered('green', 2),
      makeNumbered('green', 3),
      makeNumbered('green', 4),
      makeNumbered('green', 5),
      makeNumbered('green', 6),
    ];
    const result = scoreExpeditionDetailed('green', cards);
    expect(result.bonusEarned).toBe(true);
    expect(result.cardCount).toBe(8);
  });
});

// ── scoreRound ─────────────────────────────────────────────

describe('scoreRound', () => {
  it('scores a round with all empty expeditions as 0', () => {
    const expeditions = new Map<ExpeditionColor, LostCitiesCard[]>([
      ['yellow', []],
      ['blue', []],
      ['white', []],
      ['green', []],
      ['red', []],
    ]);
    expect(scoreRound(expeditions)).toBe(0);
  });

  it('aggregates scores across multiple expeditions', () => {
    const expeditions = new Map<ExpeditionColor, LostCitiesCard[]>([
      ['yellow', [makeNumbered('yellow', 5), makeNumbered('yellow', 7), makeNumbered('yellow', 9)]],
      ['blue', []],
      ['white', [makeNumbered('white', 3)]],
      ['green', []],
      ['red', []],
    ]);
    // Yellow: (-20 + 21) * 1 = 1
    // White: (-20 + 3) * 1 = -17
    // Total: 1 + (-17) = -16
    expect(scoreRound(expeditions)).toBe(-16);
  });

  it('handles a round with all expeditions started', () => {
    const expeditions = new Map<ExpeditionColor, LostCitiesCard[]>([
      ['yellow', [makeNumbered('yellow', 10)]],
      ['blue', [makeNumbered('blue', 10)]],
      ['white', [makeNumbered('white', 10)]],
      ['green', [makeNumbered('green', 10)]],
      ['red', [makeNumbered('red', 10)]],
    ]);
    // Each: (-20 + 10) * 1 = -10
    // Total: -10 * 5 = -50
    expect(scoreRound(expeditions)).toBe(-50);
  });
});

// ── scoreRoundDetailed ─────────────────────────────────────

describe('scoreRoundDetailed', () => {
  it('returns breakdowns for each color and a total', () => {
    const expeditions = new Map<ExpeditionColor, LostCitiesCard[]>([
      ['yellow', [makeNumbered('yellow', 5), makeNumbered('yellow', 7)]],
      ['blue', []],
      ['white', []],
      ['green', []],
      ['red', [makeInvestment('red', 1), makeNumbered('red', 10)]],
    ]);
    const result = scoreRoundDetailed(expeditions);
    expect(result.breakdowns).toHaveLength(5);
    expect(result.total).toBe(
      scoreExpedition([makeNumbered('yellow', 5), makeNumbered('yellow', 7)]) +
      scoreExpedition([makeInvestment('red', 1), makeNumbered('red', 10)]),
    );
  });
});

// ── matchScore ─────────────────────────────────────────────

describe('matchScore', () => {
  it('returns 0 for no rounds', () => {
    expect(matchScore([])).toBe(0);
  });

  it('sums round scores cumulatively', () => {
    expect(matchScore([10, -20, 35])).toBe(25);
  });

  it('handles all negative round scores', () => {
    expect(matchScore([-15, -30, -10])).toBe(-55);
  });

  it('handles a single round', () => {
    expect(matchScore([42])).toBe(42);
  });
});
