/**
 * Main Street: Graffiti Art good-incident card (CG-0MSRC9UR9006FBXC)
 *
 * Validates the new good-polarity incident card — a positive counterpart to
 * the existing Graffiti incident, with its bad effects reversed to good:
 *
 * - Template contract in card-data.csv (AC1): family `event`, trigger
 *   `Incident`, cost 0, tier 1, `coinDelta +1`, `reputationDelta +1`,
 *   target `All` (exact mirror of Graffiti's -1/-1).
 * - Deck integration (AC2): event templates grow 55 -> 56, incidents
 *   34 -> 35; the card is drawn with `target: 'All'` and no duration.
 * - System polarity (AC1): the net-delta formula classifies Graffiti Art as
 *   `good` (reverse of Graffiti's `bad`), and resolution grants +1 coins and
 *   +1 reputation while Graffiti costs -1/-1 (mirror relation).
 * - Balance guardrails (AC3): card IDs stay unique and the balance validator
 *   accepts the extended CSV.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  getCsvRows,
  createEventDeck,
  CARD_TIER_MAP,
  CARD_TEMPLATE_NAMES,
  incidentPolarity,
  isDurationEventCard,
} from '../../example-games/main-street/MainStreetCards';
import { validateCsvRows } from '../../src/balance-cards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { resolveEvent } from '../../example-games/main-street/MainStreetEngine';
import { createSeededRng } from '../../src/core-engine';

// ── Design contract ───────────────────────────────────────────────────

const GRAFFITI_ART_CONTRACT = {
  id: 'evt-graffiti-art',
  name: 'Graffiti Art',
  family: 'event',
  trigger: 'Incident',
  cost: '0',
  tier: '1',
  coinDelta: '1',
  reputationDelta: '1',
  target: 'All',
};

const GRAFFITI_ID = 'evt-graffiti';

// ── AC1: CSV template contract ────────────────────────────────────────

describe('Graffiti Art: CSV template contract (AC1)', () => {
  it('exists in card-data.csv with the exact contract fields', () => {
    const row = getCsvRows().find(r => r.id === GRAFFITI_ART_CONTRACT.id);
    expect(row, `${GRAFFITI_ART_CONTRACT.id} missing from card-data.csv`).toBeDefined();
    expect(row!.family).toBe(GRAFFITI_ART_CONTRACT.family);
    expect(row!.name).toBe(GRAFFITI_ART_CONTRACT.name);
    expect(row!.trigger).toBe(GRAFFITI_ART_CONTRACT.trigger);
    expect(row!.cost).toBe(GRAFFITI_ART_CONTRACT.cost);
    expect(row!.tier).toBe(GRAFFITI_ART_CONTRACT.tier);
    expect(row!.coinDelta).toBe(GRAFFITI_ART_CONTRACT.coinDelta);
    expect(row!.reputationDelta).toBe(GRAFFITI_ART_CONTRACT.reputationDelta);
    expect(row!.target).toBe(GRAFFITI_ART_CONTRACT.target);
    expect(row!.description.length).toBeGreaterThan(0);
  });

  it('is the exact reverse of Graffiti (bad effects -> good)', () => {
    const graffiti = getCsvRows().find(r => r.id === GRAFFITI_ID)!;
    const art = getCsvRows().find(r => r.id === GRAFFITI_ART_CONTRACT.id)!;
    expect(graffiti.family).toBe('event');
    expect(graffiti.trigger).toBe('Incident');
    expect(Number(art.coinDelta)).toBe(-Number(graffiti.coinDelta));
    expect(Number(art.reputationDelta)).toBe(-Number(graffiti.reputationDelta));
    expect(art.target).toBe(graffiti.target);
    expect(art.tier).toBe(graffiti.tier);
  });
});

// ── AC2: Deck integration ─────────────────────────────────────────────

describe('Graffiti Art: deck integration (AC2)', () => {
  const deck = createEventDeck(1, undefined, createSeededRng(42), 1);

  it('grows event templates from 55 to exactly 56', () => {
    expect(deck).toHaveLength(56);
  });

  it('grows incident templates from 34 to exactly 35', () => {
    expect(deck.filter(c => c.trigger === 'Incident')).toHaveLength(35);
  });

  it('appears in the deck with the contracted shape', () => {
    const card = deck.find(c => c.id.startsWith(GRAFFITI_ART_CONTRACT.id));
    expect(card, `${GRAFFITI_ART_CONTRACT.id} absent from event deck`).toBeDefined();
    expect(card!.name).toBe(GRAFFITI_ART_CONTRACT.name);
    expect(card!.trigger).toBe('Incident');
    expect(card!.target).toBe('All');
    expect(card!.coinDelta).toBe(1);
    expect(card!.reputationDelta).toBe(1);
    expect(isDurationEventCard(card!)).toBe(false);
  });

  it('registers the card in tier/name maps', () => {
    expect(CARD_TIER_MAP.get(GRAFFITI_ART_CONTRACT.id)).toBe(GRAFFITI_ART_CONTRACT.tier);
    expect(CARD_TEMPLATE_NAMES.get(GRAFFITI_ART_CONTRACT.id)).toBe(GRAFFITI_ART_CONTRACT.name);
  });
});

// ── AC1: System polarity & resolution ─────────────────────────────────

describe('Graffiti Art: polarity & resolution (AC1)', () => {
  const deck = createEventDeck(1, undefined, createSeededRng(7), 1);
  const art = deck.find(c => c.id.startsWith(GRAFFITI_ART_CONTRACT.id))!;
  const graffiti = deck.find(c => c.id.startsWith(GRAFFITI_ID))!;

  it('classifies as good under the net-delta formula (reverse of bad)', () => {
    expect(incidentPolarity(art)).toBe('good');
    expect(incidentPolarity(graffiti)).toBe('bad');
  });

  it('grants +1 coin and +1 reputation when resolved', () => {
    const state = setupMainStreetGame({ seed: 'graffiti-art-resolve' });
    // Pin reputation to 0 so the reputation coin multiplier is exactly 1.0
    // (the seed's default preset would scale positive deltas otherwise).
    state.resourceBank.reputation = 0;
    const coinsBefore = state.resourceBank.coins;
    const repBefore = state.resourceBank.reputation;

    resolveEvent(state, art);

    expect(state.resourceBank.coins).toBe(coinsBefore + 1);
    expect(state.resourceBank.reputation).toBe(repBefore + 1);
  });

  it('mirrors Graffiti exactly (Graffiti costs -1/-1)', () => {
    const state = setupMainStreetGame({ seed: 'graffiti-resolve' });
    state.resourceBank.reputation = 0;
    const coinsBefore = state.resourceBank.coins;
    const repBefore = state.resourceBank.reputation;

    resolveEvent(state, graffiti);

    expect(state.resourceBank.coins).toBe(coinsBefore - 1);
    expect(state.resourceBank.reputation).toBe(repBefore - 1);
  });
});

// ── AC3: Balance guardrails ───────────────────────────────────────────

describe('Graffiti Art: balance guardrails (AC3)', () => {
  it('keeps every card ID in the CSV unique', () => {
    const ids = getCsvRows().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('validates cleanly through the balance tool CSV validator', () => {
    const rows = getCsvRows().map(r => ({ ...r }));
    expect(() => validateCsvRows(rows as never)).not.toThrow();
  });

  it('keeps the 25% positive-incident floor satisfied', () => {
    const incidents = createEventDeck(1, undefined, createSeededRng(42), 1)
      .filter(c => c.trigger === 'Incident');
    const effectful = incidents.filter(i => i.coinDelta !== 0 || i.reputationDelta !== 0);
    const positive = effectful.filter(i => i.coinDelta > 0 || i.reputationDelta > 0);
    expect(positive.length / effectful.length).toBeGreaterThanOrEqual(0.25);
  });
});
