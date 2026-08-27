/**
 * Main Street: Staff peek skill tests (CG-0MSXOW6GN008ZSMN)
 *
 * Validates the new staff "peek" ability:
 * - AC1: a new StaffCard template (CSV row) provides a peekOncePerTurn ability.
 * - AC2: the peek action reveals the top card briefly and returns it face-down
 *   without resolving it (engine-level: returns the top card, deck unchanged).
 * - AC3: the once-per-turn gate is enforced — exactly one peek per player turn.
 * - AC4: the peek action is unit-tested (this file).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  processEndOfTurn,
  executeAction,
  peekIncidentDeck,
} from '../../example-games/main-street/MainStreetEngine';
import { createStaffDeck, getCsvRows } from '../../example-games/main-street/MainStreetCards';
import { enumerateLegalActions } from '../../example-games/main-street/MainStreetAiStrategy';
import { peekIncidentDeckCommand } from '../../example-games/main-street/MainStreetCommands';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Builds a state in the MarketPhase with a peek-capable staff member employed.
 */
function createPeekState(seed: string = 'peek-test'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  const peekStaff = createStaffDeck(1).find(c => c.peekOncePerTurn);
  expect(peekStaff, 'a peek staff template must exist for this helper').toBeDefined();
  state.staffCards.push({ ...peekStaff! });
  return state;
}

/** Builds a MarketPhase state with no staff employed. */
function createNoStaffState(seed: string = 'peek-no-staff'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  return state;
}

// ── AC1: CSV template with peekOncePerTurn ──────────────────

describe('AC1: peekOncePerTurn staff template', () => {
  it('provides a new staff card row in card-data.csv with peekOncePerTurn', () => {
    const staffRows = getCsvRows().filter(r => r.family === 'staff');
    const peekRow = staffRows.find(r => Number(r.peekOncePerTurn) > 0);
    expect(peekRow, 'staff row with peekOncePerTurn=1 missing from CSV').toBeDefined();
    // CSV conventions: cost, ongoing cost, and at least 1 hand slot.
    expect(Number(peekRow!.cost)).toBeGreaterThan(0);
    expect(Number(peekRow!.ongoingCost)).toBeGreaterThan(0);
    expect(Number(peekRow!.handSlotsAdded)).toBeGreaterThanOrEqual(1);
    expect(peekRow!.description.length).toBeGreaterThan(0);
  });

  it('parses peekOncePerTurn into the StaffCard template', () => {
    const peek = createStaffDeck(1).find(c => c.peekOncePerTurn);
    expect(peek, 'parsed StaffCard with peekOncePerTurn missing').toBeDefined();
    expect(peek!.family).toBe('staff');
    expect(peek!.peekOncePerTurn).toBe(true);
  });

  it('exactly one staff template carries the peek ability', () => {
    const peekers = createStaffDeck(1).filter(c => c.peekOncePerTurn);
    expect(peekers).toHaveLength(1);
  });

  it('existing staff cards carry no peek ability (no regression)', () => {
    for (const c of createStaffDeck(1)) {
      if (c.id === createStaffDeck(1).find(x => x.peekOncePerTurn)?.id) continue;
      expect(c.peekOncePerTurn).toBeUndefined();
    }
  });
});

// ── AC2: peek reveals the top card without resolving ────────

describe('AC2: peek reveals top card and returns it face-down', () => {
  it('returns the top card of the incident deck', () => {
    const state = createPeekState('peek-ac2-top');
    const card = peekIncidentDeck(state);
    expect(card).not.toBeNull();
    expect(card!.id).toBe(state.incidentDeck[0].id);
    expect(card!.name).toBe(state.incidentDeck[0].name);
  });

  it('does not remove the peeked card from the deck (face-down return)', () => {
    const state = createPeekState('peek-ac2-return');
    const deckBefore = state.incidentDeck.map(c => c.id);
    const card = peekIncidentDeck(state);
    expect(card).not.toBeNull();
    expect(state.incidentDeck.map(c => c.id)).toEqual(deckBefore);
    expect(state.incidentDeck[0].id).toBe(card!.id);
  });

  it('does not resolve the peeked incident (no resources, history, or Incident log)', () => {
    const state = createPeekState('peek-ac2-noresolve');
    const coinsBefore = state.resourceBank.coins;
    const repBefore = state.resourceBank.reputation;
    const historyBefore = state.incidentBalance.recentNames.length;
    const incidentLogsBefore = state.activityLog.filter(l => l.text.startsWith('Incident:')).length;
    const deckBefore = state.incidentDeck.map(c => c.id);

    peekIncidentDeck(state);

    expect(state.resourceBank.coins).toBe(coinsBefore);
    expect(state.resourceBank.reputation).toBe(repBefore);
    expect(state.incidentBalance.recentNames.length).toBe(historyBefore);
    expect(state.activityLog.filter(l => l.text.startsWith('Incident:')).length).toBe(incidentLogsBefore);
    expect(state.incidentDeck.map(c => c.id)).toEqual(deckBefore);
  });

  it('logs the peek as an explicit player action', () => {
    const state = createPeekState('peek-ac2-log');
    peekIncidentDeck(state);
    expect(state.activityLog.some(l => l.text.includes('Peeked at the top card of the incident deck'))).toBe(true);
  });

  it('returns null and consumes nothing when the deck is empty', () => {
    const state = createPeekState('peek-ac2-empty');
    state.incidentDeck = [];
    const actionsBefore = state.actionsRemaining;
    expect(peekIncidentDeck(state)).toBeNull();
    expect(state.actionsRemaining).toBe(actionsBefore);
    expect(state.peekUsedThisTurn).toBe(false);
  });
});

// ── AC3: once-per-turn gate ─────────────────────────────────

describe('AC3: once-per-turn gate', () => {
  it('requires an employed staff member with peekOncePerTurn', () => {
    const state = createNoStaffState('peek-ac3-nostaff');
    expect(() => peekIncidentDeck(state)).toThrow(/peek/i);
  });

  it('allows exactly one peek per turn', () => {
    const state = createPeekState('peek-ac3-one');
    expect(() => peekIncidentDeck(state)).not.toThrow();
    expect(state.peekUsedThisTurn).toBe(true);
  });

  it('blocks a second peek attempt in the same turn', () => {
    const state = createPeekState('peek-ac3-second');
    peekIncidentDeck(state);
    expect(() => peekIncidentDeck(state)).toThrow(/already peeked/i);
  });

  it('resets at the start of the next turn', () => {
    const state = createPeekState('peek-ac3-reset');
    peekIncidentDeck(state);
    expect(state.peekUsedThisTurn).toBe(true);

    // Finish the day (IncidentPhase → EndCheck wraps to DayStart) and start
    // the next turn; the gate must be cleared.
    processEndOfTurn(state);
    expect(state.phase).toBe('DayStart');
    executeDayStart(state);

    expect(state.peekUsedThisTurn).toBe(false);
    expect(() => peekIncidentDeck(state)).not.toThrow();
  });

  it('consumes one daily action', () => {
    const state = createPeekState('peek-ac3-action');
    const before = state.actionsRemaining;
    peekIncidentDeck(state);
    expect(state.actionsRemaining).toBe(before - 1);
  });

  it('rejects the peek when no actions remain', () => {
    const state = createPeekState('peek-ac3-noaction');
    state.actionsRemaining = 0;
    expect(() => peekIncidentDeck(state)).toThrow(/No actions remaining/);
  });

  it('rejects the peek outside the MarketPhase', () => {
    const state = createPeekState('peek-ac3-phase');
    state.phase = 'IncomePhase';
    expect(() => peekIncidentDeck(state)).toThrow(/MarketPhase/);
  });

  it('rejects the peek after the game is over', () => {
    const state = createPeekState('peek-ac3-over');
    state.gameResult = 'loss';
    expect(() => peekIncidentDeck(state)).toThrow(/Game is over/);
  });
});

// ── AC4: action wiring, AI enumeration, and persistence ─────

describe('AC4: peek action integration', () => {
  it('executes through executeAction as a peek-incident-deck action', () => {
    const state = createPeekState('peek-ac4-action');
    const deckBefore = state.incidentDeck.map(c => c.id);
    const actionsBefore = state.actionsRemaining;

    const result = executeAction(state, { type: 'peek-incident-deck' });

    expect(result).toBeNull(); // executeAction returns PurchaseResult | null
    expect(state.peekUsedThisTurn).toBe(true);
    expect(state.actionsRemaining).toBe(actionsBefore - 1);
    expect(state.incidentDeck.map(c => c.id)).toEqual(deckBefore);
  });

  it('enumerates the peek action for the AI when legal', () => {
    const state = createPeekState('peek-ac4-enum');
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'peek-incident-deck')).toBe(true);
  });

  it('does not enumerate the peek action without a peek staff member', () => {
    const state = createNoStaffState('peek-ac4-noenum');
    expect(enumerateLegalActions(state).some(a => a.type === 'peek-incident-deck')).toBe(false);
  });

  it('serializes peekUsedThisTurn', () => {
    const state = createPeekState('peek-ac4-serialize');
    peekIncidentDeck(state);
    const serialized = serializeMainStreetState(state);
    expect(serialized.peekUsedThisTurn).toBe(true);
  });

  it('round-trips peekUsedThisTurn through serialize/deserialize', () => {
    const state = createPeekState('peek-ac4-roundtrip');
    peekIncidentDeck(state);
    const restored = deserializeMainStreetState(serializeMainStreetState(state));
    expect(restored.peekUsedThisTurn).toBe(true);

    // A fresh state round-trips with the gate closed (false).
    const fresh = createPeekState('peek-ac4-fresh');
    const freshRestored = deserializeMainStreetState(serializeMainStreetState(fresh));
    expect(freshRestored.peekUsedThisTurn).toBe(false);
  });

  it('defaults peekUsedThisTurn to false for legacy saves', () => {
    const state = createPeekState('peek-ac4-legacy');
    const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;
    delete serialized.peekUsedThisTurn;
    const restored = deserializeMainStreetState(serialized as never);
    expect(restored.peekUsedThisTurn).toBe(false);
  });
});

// ── AC2 (scene contract): revealedPeekedCard state ─────────

describe('AC2: revealedPeekedCard scene contract', () => {
  it('exposes the peeked card via revealedPeekedCard', () => {
    const state = createPeekState('peek-reveal-expose');
    const top = state.incidentDeck[0];
    expect(peekIncidentDeck(state)).toBe(top);
    expect(state.revealedPeekedCard).toBe(top);
  });

  it('leaves revealedPeekedCard null when no peek has occurred', () => {
    const state = createPeekState('peek-reveal-null');
    expect(state.revealedPeekedCard).toBeNull();
  });

  it('clears revealedPeekedCard at DayStart', () => {
    const state = createPeekState('peek-reveal-daystart');
    peekIncidentDeck(state);
    expect(state.revealedPeekedCard).not.toBeNull();

    processEndOfTurn(state);
    executeDayStart(state);
    expect(state.revealedPeekedCard).toBeNull();
    expect(state.peekUsedThisTurn).toBe(false);
  });

  it('round-trips revealedPeekedCard through serialize/deserialize', () => {
    const state = createPeekState('peek-reveal-roundtrip');
    peekIncidentDeck(state);
    const restored = deserializeMainStreetState(serializeMainStreetState(state));
    expect(restored.revealedPeekedCard?.id).toBe(state.incidentDeck[0].id);
  });

  it('defaults revealedPeekedCard to null for legacy saves', () => {
    const state = createPeekState('peek-reveal-legacy');
    const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;
    delete serialized.revealedPeekedCard;
    const restored = deserializeMainStreetState(serialized as never);
    expect(restored.revealedPeekedCard).toBeNull();
  });
});

// ── Undo integration: peek is reversible ────────────────────

describe('AC4: peek undo integration', () => {
  it('undo restores the action, the gate, and the reveal', () => {
    const state = createPeekState('peek-undo');
    const actionsBefore = state.actionsRemaining;

    const cmd = peekIncidentDeckCommand(state);
    cmd.execute();
    expect(state.peekUsedThisTurn).toBe(true);
    expect(state.actionsRemaining).toBe(actionsBefore - 1);
    expect(state.revealedPeekedCard).not.toBeNull();

    cmd.undo();
    expect(state.peekUsedThisTurn).toBe(false);
    expect(state.actionsRemaining).toBe(actionsBefore);
    expect(state.revealedPeekedCard).toBeNull();
  });
});
