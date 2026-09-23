/**
 * Main Street: Proportional Tax Audit (CG-0MTQ7W0ZX0059R3J)
 *
 * Unit tests for the Tax Audit incident's move from a flat 300-coin penalty
 * to a proportional collection of the player's banked coins:
 *
 *  1. `evt-tax` collects 45% of `state.resourceBank.coins` at resolution
 *     time on the Accept path.
 *  2. Employing the Accountant (`staff-accountant`, `taxAuditRate: 0.25`)
 *     reduces the rate to 25%.
 *  3. The loss is clamped so the balance never drops below 0.
 *  4. Flat-delta events (the rest of the Tax Escalation chain included) keep
 *     applying their `coinDelta` exactly as before.
 *  5. `projectEventCoinDelta()` (AI affordability / accept-reject) returns the
 *     same percentage-based magnitude as the live resolution path.
 *  6. The activity log shows the actual coins lost.
 *
 * The tests use the shipped `card-data.csv` so they exercise the real card
 * data (the percentage lives on the card, not in the engine).
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  createCompetitiveState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  type EventCard,
  type StaffCard,
  getEventTemplates,
  getStaffCardTemplates,
} from '../../example-games/main-street/MainStreetCards';
import {
  applyCompetitiveEventEffects,
  computeEventDeltas,
  projectEventCoinDelta,
  resolveEvent,
  resolveEventChoice,
} from '../../example-games/main-street/MainStreetEngine';
import {
  TAX_AUDIT_BASE_RATE,
  TAX_AUDIT_ACCOUNTANT_RATE,
  computeTaxAuditRate,
} from '../../example-games/main-street/MainStreetStaffBuffs';

// ── Fixtures & helpers ──────────────────────────────────────

function makeState(seed = 'tax-audit-suite'): MainStreetState {
  const state = setupMainStreetGame({ seed, difficulty: 'Medium' });
  state.phase = 'MarketPhase';
  return state;
}

/** The shipped Tax Audit incident template. */
function taxAudit(): EventCard {
  const t = getEventTemplates().find((c) => c.id === 'evt-tax');
  if (!t) throw new Error('evt-tax missing from card-data.csv');
  return t;
}

/** The shipped Accountant staff template. */
function accountant(): StaffCard {
  const t = getStaffCardTemplates().find((c) => c.id === 'staff-accountant');
  if (!t) throw new Error('staff-accountant missing from card-data.csv');
  return t;
}

/** Sets an explicit balance without touching the ledger (resolve syncs it). */
function setCoins(state: MainStreetState, coins: number): void {
  state.resourceBank.coins = coins;
}

/** Stages the event as a pending Accept/Reject choice and accepts it. */
function acceptPending(state: MainStreetState, event: EventCard) {
  state.pendingEventChoice = { event, chosenOption: null, resolved: false };
  return resolveEventChoice(state, 'accept');
}

/** A flat (non-percentage) incident for regression checks. */
function flatIncident(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event',
    id: 'evt-flat-test',
    name: 'Flat Test',
    trigger: 'Incident',
    cost: 0,
    effect: 'flat',
    target: 'All',
    coinDelta: -200,
    reputationDelta: 0,
    ...overrides,
  };
}

// ── AC1: percentage collection ──────────────────────────────

describe('AC1 — Tax Audit collects 45% of banked coins on Accept', () => {
  it('card data carries the 45% rate and the Accountant carries 25%', () => {
    expect(taxAudit().coinPercentDelta).toBe(-TAX_AUDIT_BASE_RATE);
    expect(accountant().taxAuditRate).toBe(TAX_AUDIT_ACCOUNTANT_RATE);
  });

  it('accepting evt-tax removes exactly 45% of the balance', () => {
    const state = makeState();
    setCoins(state, 1000);
    acceptPending(state, taxAudit());
    expect(state.resourceBank.coins).toBe(550); // 1000 - round(1000 * 0.45)
  });

  it('rounds the fractional loss to the nearest integer', () => {
    const state = makeState();
    setCoins(state, 101); // 45.45 -> 45
    acceptPending(state, taxAudit());
    expect(state.resourceBank.coins).toBe(56);
  });

  it('computes the percentage from the pre-effect balance (not the post-effect one)', () => {
    const state = makeState();
    setCoins(state, 800);
    acceptPending(state, taxAudit());
    // 800 - 360, not 800 - 0.45 * (800 - 360).
    expect(state.resourceBank.coins).toBe(440);
  });
});

// ── AC2: Accountant mitigation ──────────────────────────────

describe('AC2 — the Accountant reduces the Tax Audit rate to 25%', () => {
  it('an employed Accountant sets the effective rate to 25%', () => {
    const rate = computeTaxAuditRate([accountant()], TAX_AUDIT_BASE_RATE);
    expect(rate).toBe(TAX_AUDIT_ACCOUNTANT_RATE);
  });

  it('accepting evt-tax with the Accountant employed loses only 25%', () => {
    const state = makeState();
    state.staffCards.push(accountant());
    setCoins(state, 1000);
    acceptPending(state, taxAudit());
    expect(state.resourceBank.coins).toBe(750);
  });

  it('the most player-favourable override wins when several are present', () => {
    const generous: StaffCard = { ...accountant(), id: 'staff-generous', taxAuditRate: 0.1 };
    const rate = computeTaxAuditRate([accountant(), generous], TAX_AUDIT_BASE_RATE);
    expect(rate).toBe(0.1);
  });
});

// ── AC3: no negative balance ────────────────────────────────

describe('AC3 — the tax loss is clamped so coins never go below 0', () => {
  it('a rate that would exceed the balance leaves exactly 0 coins', () => {
    const state = makeState();
    setCoins(state, 100);
    acceptPending(state, { ...flatIncident(), coinPercentDelta: -1.5 });
    expect(state.resourceBank.coins).toBe(0);
  });

  it('a near-zero balance is not driven negative', () => {
    const state = makeState();
    setCoins(state, 1); // round(1 * 0.45) = 0
    acceptPending(state, taxAudit());
    expect(state.resourceBank.coins).toBe(1);
  });
});

// ── AC4: flat-delta events unchanged ────────────────────────

describe('AC4 — flat-delta events keep their exact coinDelta', () => {
  it('the rest of the Tax Escalation chain has no percentage field', () => {
    const error = getEventTemplates().find((c) => c.id === 'evt-tax-error')!;
    const inquiry = getEventTemplates().find((c) => c.id === 'evt-tax-inquiry')!;
    expect(error.coinPercentDelta).toBeUndefined();
    expect(inquiry.coinPercentDelta).toBeUndefined();
    expect(error.coinDelta).toBe(-200);
    expect(inquiry.coinDelta).toBe(-600);
  });

  it('a flat incident still applies its coinDelta unchanged', () => {
    const state = makeState();
    setCoins(state, 1000);
    resolveEvent(state, flatIncident({ coinDelta: -200 }));
    expect(state.resourceBank.coins).toBe(800);
  });

  it('evt-tax-error still applies its flat -200 through the Accept path', () => {
    const state = makeState();
    const error = getEventTemplates().find((c) => c.id === 'evt-tax-error')!;
    setCoins(state, 1000);
    acceptPending(state, error);
    expect(state.resourceBank.coins).toBe(800);
  });
});

// ── AC5: AI projection parity ───────────────────────────────

describe('AC5 — projectEventCoinDelta mirrors the live percentage resolution', () => {
  it('projects the same magnitude the engine applies (no staff)', () => {
    const state = makeState();
    setCoins(state, 1000);
    const projected = projectEventCoinDelta(state, taxAudit());
    expect(projected).toBe(-450);

    resolveEvent(state, taxAudit());
    expect(state.resourceBank.coins).toBe(1000 + projected);
  });

  it('projects the Accountant-mitigated magnitude too', () => {
    const state = makeState();
    state.staffCards.push(accountant());
    setCoins(state, 1000);
    const projected = projectEventCoinDelta(state, taxAudit());
    expect(projected).toBe(-250);

    resolveEvent(state, taxAudit());
    expect(state.resourceBank.coins).toBe(1000 + projected);
  });

  it('the deferred computeEventDeltas path returns the same magnitude', () => {
    const state = makeState();
    setCoins(state, 1000);
    const deltas = computeEventDeltas(state, taxAudit());
    expect(deltas.coinDelta).toBe(-450);
    // Non-mutating: the balance is untouched.
    expect(state.resourceBank.coins).toBe(1000);
  });

  it('a flat event projects its flat delta (regression)', () => {
    const state = makeState();
    setCoins(state, 1000);
    expect(projectEventCoinDelta(state, flatIncident({ coinDelta: -200 }))).toBe(-200);
  });
});

// ── AC6: activity-log formatting ────────────────────────────

describe('AC6 — the activity log shows the actual coins lost', () => {
  it('logs the real percentage amount when the Tax Audit is accepted', () => {
    const state = makeState();
    setCoins(state, 1000);
    const logBefore = state.activityLog.length;
    acceptPending(state, taxAudit());

    const entry = state.activityLog
      .slice(logBefore)
      .find((l) => l.text.includes('Tax Audit'));
    expect(entry).toBeDefined();
    expect(entry!.text).toContain('Tax Audit (-450 coins)');
  });

  it('logs the mitigated amount when the Accountant is employed', () => {
    const state = makeState();
    state.staffCards.push(accountant());
    setCoins(state, 1000);
    const logBefore = state.activityLog.length;
    acceptPending(state, taxAudit());

    const entry = state.activityLog
      .slice(logBefore)
      .find((l) => l.text.includes('Tax Audit'));
    expect(entry).toBeDefined();
    expect(entry!.text).toContain('Tax Audit (-250 coins)');
  });
});

// ── Competitive per-owner routing ───────────────────────────

describe('Competitive mode taxes each owner on their own balance', () => {
  it('routes the percentage per owner, honouring only their own Accountant', () => {
    const state = createCompetitiveState({ seed: 'tax-audit-comp', playerCount: 2 });
    // Pad the shared host wallet so host loss checks never fire.
    state.resourceBank.coins = 100000;
    for (const p of state.players!) {
      p.coins = 1000;
      p.reputation = 0;
    }
    state.players![0].staffCards = [];
    state.players![1].staffCards = [accountant()];

    applyCompetitiveEventEffects(state, taxAudit());

    expect(state.players![0].coins).toBe(550); // 45%
    expect(state.players![1].coins).toBe(750); // 25% (Accountant)
  });
});
