import { describe, it, expect } from 'vitest';
import type {
  InvestmentCard,
  NumberedCard,
  LostCitiesCard,
  ExpeditionColor,
} from '../../example-games/lost-cities/LostCitiesCards';
import {
  isLegalPlay,
  checkPhase1Legality,
  checkPhase2Legality,
  getLegalPhase1Actions,
  getLegalPhase2Actions,
  getLegalActions,
  isRoundOver,
  type RulesGameView,
  type Phase2Action,
} from '../../example-games/lost-cities/LostCitiesRules';

// ── Test helpers ───────────────────────────────────────────

let nextId = 100;
function makeInv(color: ExpeditionColor, idx: 1 | 2 | 3 = 1): InvestmentCard {
  return { id: nextId++, color, type: 'investment', investmentIndex: idx, faceUp: false };
}

function makeNum(
  color: ExpeditionColor,
  rank: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
): NumberedCard {
  return { id: nextId++, color, type: 'numbered', rank, faceUp: false };
}

function emptyGameView(): RulesGameView {
  return {
    playerExpeditions: new Map([
      ['yellow', []], ['blue', []], ['white', []], ['green', []], ['red', []],
    ]),
    discardPiles: new Map([
      ['yellow', []], ['blue', []], ['white', []], ['green', []], ['red', []],
    ]),
    drawPileSize: 44,
    justDiscardedColor: null,
  };
}

// ── isLegalPlay ────────────────────────────────────────────

describe('isLegalPlay', () => {
  it('allows any card on an empty lane', () => {
    expect(isLegalPlay(makeNum('yellow', 5), [])).toBe(true);
    expect(isLegalPlay(makeInv('blue'), [])).toBe(true);
  });

  it('allows investment after investment', () => {
    const lane = [makeInv('green', 1)];
    expect(isLegalPlay(makeInv('green', 2), lane)).toBe(true);
  });

  it('allows numbered card after investment', () => {
    const lane = [makeInv('red', 1), makeInv('red', 2)];
    expect(isLegalPlay(makeNum('red', 3), lane)).toBe(true);
  });

  it('allows ascending numbered card after numbered card', () => {
    const lane = [makeNum('white', 3)];
    expect(isLegalPlay(makeNum('white', 5), lane)).toBe(true);
    expect(isLegalPlay(makeNum('white', 10), lane)).toBe(true);
  });

  it('rejects investment after numbered card', () => {
    const lane = [makeNum('yellow', 5)];
    expect(isLegalPlay(makeInv('yellow'), lane)).toBe(false);
  });

  it('rejects descending numbered card', () => {
    const lane = [makeNum('blue', 7)];
    expect(isLegalPlay(makeNum('blue', 5), lane)).toBe(false);
  });

  it('rejects equal numbered card', () => {
    const lane = [makeNum('green', 5)];
    expect(isLegalPlay(makeNum('green', 5), lane)).toBe(false);
  });

  it('rejects investment after numbered card deep in lane', () => {
    const lane = [makeInv('red', 1), makeNum('red', 3), makeNum('red', 7)];
    expect(isLegalPlay(makeInv('red', 2), lane)).toBe(false);
  });
});

// ── checkPhase1Legality ────────────────────────────────────

describe('checkPhase1Legality', () => {
  it('rejects card not in hand', () => {
    const card = makeNum('yellow', 5);
    const hand: LostCitiesCard[] = [makeNum('blue', 3)];
    const result = checkPhase1Legality(
      { kind: 'play-to-expedition', card, color: 'yellow' },
      hand,
      emptyGameView(),
    );
    expect(result.legal).toBe(false);
  });

  it('rejects color mismatch for play-to-expedition', () => {
    const card = makeNum('yellow', 5);
    const hand = [card];
    const result = checkPhase1Legality(
      { kind: 'play-to-expedition', card, color: 'blue' },
      hand,
      emptyGameView(),
    );
    expect(result.legal).toBe(false);
  });

  it('rejects illegal ascending play', () => {
    const card = makeNum('red', 3);
    const hand = [card];
    const view = emptyGameView();
    view.playerExpeditions.set('red', [makeNum('red', 7)]);
    const result = checkPhase1Legality(
      { kind: 'play-to-expedition', card, color: 'red' },
      hand,
      view,
    );
    expect(result.legal).toBe(false);
  });

  it('accepts legal play to expedition', () => {
    const card = makeNum('green', 8);
    const hand = [card];
    const view = emptyGameView();
    view.playerExpeditions.set('green', [makeNum('green', 5)]);
    const result = checkPhase1Legality(
      { kind: 'play-to-expedition', card, color: 'green' },
      hand,
      view,
    );
    expect(result.legal).toBe(true);
  });

  it('accepts discard for any card in hand', () => {
    const card = makeNum('blue', 9);
    const hand = [card];
    const result = checkPhase1Legality(
      { kind: 'discard', card, color: 'blue' },
      hand,
      emptyGameView(),
    );
    expect(result.legal).toBe(true);
  });

  it('rejects discard color mismatch', () => {
    const card = makeNum('yellow', 5);
    const hand = [card];
    const result = checkPhase1Legality(
      { kind: 'discard', card, color: 'red' },
      hand,
      emptyGameView(),
    );
    expect(result.legal).toBe(false);
  });
});

// ── checkPhase2Legality ────────────────────────────────────

describe('checkPhase2Legality', () => {
  it('accepts draw from non-empty draw pile', () => {
    const view = emptyGameView();
    view.drawPileSize = 10;
    const result = checkPhase2Legality(
      { kind: 'draw-from-pile' },
      view,
    );
    expect(result.legal).toBe(true);
  });

  it('rejects draw from empty draw pile', () => {
    const view = emptyGameView();
    view.drawPileSize = 0;
    const result = checkPhase2Legality(
      { kind: 'draw-from-pile' },
      view,
    );
    expect(result.legal).toBe(false);
  });

  it('accepts draw from non-empty discard pile', () => {
    const view = emptyGameView();
    view.discardPiles.set('yellow', [makeNum('yellow', 5)]);
    const result = checkPhase2Legality(
      { kind: 'draw-from-discard', color: 'yellow' },
      view,
    );
    expect(result.legal).toBe(true);
  });

  it('rejects draw from empty discard pile', () => {
    const view = emptyGameView();
    const result = checkPhase2Legality(
      { kind: 'draw-from-discard', color: 'red' },
      view,
    );
    expect(result.legal).toBe(false);
  });

  it('rejects draw from just-discarded color', () => {
    const view = emptyGameView();
    view.discardPiles.set('blue', [makeNum('blue', 3)]);
    view.justDiscardedColor = 'blue';
    const result = checkPhase2Legality(
      { kind: 'draw-from-discard', color: 'blue' },
      view,
    );
    expect(result.legal).toBe(false);
  });

  it('allows draw from other discard pile when one was just discarded to', () => {
    const view = emptyGameView();
    view.discardPiles.set('blue', [makeNum('blue', 3)]);
    view.discardPiles.set('red', [makeNum('red', 7)]);
    view.justDiscardedColor = 'blue';
    const result = checkPhase2Legality(
      { kind: 'draw-from-discard', color: 'red' },
      view,
    );
    expect(result.legal).toBe(true);
  });
});

// ── getLegalPhase1Actions ──────────────────────────────────

describe('getLegalPhase1Actions', () => {
  it('returns play + discard for each card when all lanes empty', () => {
    const hand = [makeNum('yellow', 5), makeNum('blue', 3)];
    const actions = getLegalPhase1Actions(hand, emptyGameView());
    // Each card: 1 play + 1 discard = 2 actions per card = 4 total
    expect(actions).toHaveLength(4);
  });

  it('omits play action when ascending play is violated', () => {
    const card = makeNum('red', 3);
    const hand = [card];
    const view = emptyGameView();
    view.playerExpeditions.set('red', [makeNum('red', 7)]);
    const actions = getLegalPhase1Actions(hand, view);
    // Only discard is legal
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('discard');
  });

  it('includes play action when ascending play is valid', () => {
    const card = makeNum('green', 9);
    const hand = [card];
    const view = emptyGameView();
    view.playerExpeditions.set('green', [makeNum('green', 5)]);
    const actions = getLegalPhase1Actions(hand, view);
    // Play + discard = 2
    expect(actions).toHaveLength(2);
    expect(actions.some((a) => a.kind === 'play-to-expedition')).toBe(true);
    expect(actions.some((a) => a.kind === 'discard')).toBe(true);
  });
});

// ── getLegalPhase2Actions ──────────────────────────────────

describe('getLegalPhase2Actions', () => {
  it('includes draw-from-pile when draw pile is non-empty', () => {
    const view = emptyGameView();
    view.drawPileSize = 20;
    const actions = getLegalPhase2Actions(view);
    expect(actions.some((a) => a.kind === 'draw-from-pile')).toBe(true);
  });

  it('excludes draw-from-pile when draw pile is empty', () => {
    const view = emptyGameView();
    view.drawPileSize = 0;
    const actions = getLegalPhase2Actions(view);
    expect(actions.some((a) => a.kind === 'draw-from-pile')).toBe(false);
  });

  it('includes draw from non-empty discard piles', () => {
    const view = emptyGameView();
    view.discardPiles.set('yellow', [makeNum('yellow', 5)]);
    view.discardPiles.set('red', [makeNum('red', 3)]);
    const actions = getLegalPhase2Actions(view);
    const discardActions = actions.filter((a) => a.kind === 'draw-from-discard');
    expect(discardActions).toHaveLength(2);
  });

  it('excludes just-discarded color from discard draw options', () => {
    const view = emptyGameView();
    view.discardPiles.set('blue', [makeNum('blue', 3)]);
    view.discardPiles.set('green', [makeNum('green', 7)]);
    view.justDiscardedColor = 'blue';
    const actions = getLegalPhase2Actions(view);
    const discardActions = actions.filter(
      (a) => a.kind === 'draw-from-discard',
    ) as Phase2Action[];
    expect(discardActions).toHaveLength(1);
    expect(
      (discardActions[0] as { kind: 'draw-from-discard'; color: ExpeditionColor }).color,
    ).toBe('green');
  });
});

// ── getLegalActions ─────────────────────────────────────────

describe('getLegalActions', () => {
  it('returns Phase 1 actions for PlayOrDiscard phase', () => {
    const hand = [makeNum('yellow', 5)];
    const actions = getLegalActions(hand, emptyGameView(), 'PlayOrDiscard');
    // All should be Phase 1 actions
    for (const action of actions) {
      expect(['play-to-expedition', 'discard']).toContain(action.kind);
    }
  });

  it('returns Phase 2 actions for Draw phase', () => {
    const view = emptyGameView();
    view.drawPileSize = 10;
    const actions = getLegalActions([], view, 'Draw');
    for (const action of actions) {
      expect(['draw-from-pile', 'draw-from-discard']).toContain(action.kind);
    }
  });
});

// ── isRoundOver ────────────────────────────────────────────

describe('isRoundOver', () => {
  it('returns false when draw pile has cards', () => {
    expect(isRoundOver(44)).toBe(false);
    expect(isRoundOver(1)).toBe(false);
  });

  it('returns true when draw pile is empty', () => {
    expect(isRoundOver(0)).toBe(true);
  });

  it('returns true when draw pile is negative (edge case)', () => {
    expect(isRoundOver(-1)).toBe(true);
  });
});
