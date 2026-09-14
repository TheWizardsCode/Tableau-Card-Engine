/**
 * Content: Event Chain Cards & Retrofits (CG-0MTT7FC7A000AA58 / parent
 * CG-0MTSHG8RP008E128)
 *
 * Validates the shipped card-data.csv story chains (hasChoices wiring,
 * accept/reject next-card links resolve to real templates, chain endpoints,
 * and polarities). Chains follow the parent design tables:
 *
 *  - Tax: Error in Tax Return →(reject) Tax Audit →(reject) Inquiry
 *    Commission →(accept) Error in Tax Return (3-step cycle, resets).
 *  - Labor: Strike →(reject) General Strike →(accept) Strike (retrofit).
 *  - Restaurant: Popular Menu Item →(reject) Farm-to-Table Feature (positive).
 *  - Downturn: Economic Recession →(reject) Depression (duration).
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import { getEventTemplates } from '../../example-games/main-street/MainStreetCards';
import { incidentPolarity } from '../../example-games/main-street/MainStreetCards';

function byId(id: string) {
  const t = getEventTemplates().find((c) => c.id === id);
  if (!t) throw new Error(`missing template ${id}`);
  return t;
}

describe('Card CSV: tax escalation chain (3-step, resets)', () => {
  it('Error in Tax Return rejects into Tax Audit; accept ends', () => {
    const c = byId('evt-tax-error');
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId ?? null).toBeNull();
    expect(c.rejectNextCardId).toBe('evt-tax');
    expect(c.coinDelta).toBeLessThan(0);
  });

  it('Tax Audit (retrofit) rejects into Inquiry Commission', () => {
    const c = byId('evt-tax');
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId ?? null).toBeNull();
    expect(c.rejectNextCardId).toBe('evt-tax-inquiry');
  });

  it('Inquiry Commission accepts back into Error in Tax Return (reset)', () => {
    const c = byId('evt-tax-inquiry');
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId).toBe('evt-tax-error');
    expect(c.rejectNextCardId ?? null).toBeNull();
  });

  it('all chain links resolve to real templates', () => {
    for (const link of ['evt-tax-error', 'evt-tax', 'evt-tax-inquiry']) {
      const c = byId(link);
      if (c.acceptNextCardId) expect(() => byId(c.acceptNextCardId!)).not.toThrow();
      if (c.rejectNextCardId) expect(() => byId(c.rejectNextCardId!)).not.toThrow();
    }
  });
});

describe('Card CSV: labor unrest chain (Strike retrofit)', () => {
  it('Strike (retrofit) rejects into General Strike', () => {
    const c = byId('evt-strike');
    expect(c.hasChoices).toBe(true);
    expect(c.rejectNextCardId).toBe('evt-general-strike');
  });

  it('General Strike accepts back into Strike (cycle/reset)', () => {
    const c = byId('evt-general-strike');
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId).toBe('evt-strike');
    expect(c.rejectNextCardId ?? null).toBeNull();
  });
});

describe('Card CSV: restaurant opportunity chain (positive)', () => {
  it('Popular Menu Item is a positive choice event', () => {
    const c = byId('evt-popular-menu');
    expect(c.hasChoices).toBe(true);
    expect(incidentPolarity(c)).toBe('good');
    expect(c.rejectNextCardId).toBe('evt-farm-table');
    expect(c.acceptNextCardId ?? null).toBeNull();
  });

  it('Farm-to-Table Feature is the non-choice chain end', () => {
    const c = byId('evt-farm-table');
    expect(c.hasChoices).toBeFalsy();
    expect(incidentPolarity(c)).toBe('good');
    expect(c.acceptNextCardId ?? null).toBeNull();
    expect(c.rejectNextCardId ?? null).toBeNull();
  });
});

describe('Card CSV: economic downturn chain (duration)', () => {
  it('Economic Recession (retrofit, duration) rejects into Depression', () => {
    const c = byId('evt-recession');
    expect(c.hasChoices).toBe(true);
    expect(c.rejectNextCardId).toBe('evt-depression');
    expect(c.acceptNextCardId ?? null).toBeNull();
    expect((c as { duration?: number }).duration).toBe(4);
  });

  it('Depression is a non-choice duration escalation', () => {
    const c = byId('evt-depression');
    expect(c.hasChoices).toBeFalsy();
    expect((c as { duration?: number }).duration).toBe(5);
    expect((c as { multiplier?: number }).multiplier).toBe(0.5);
    expect(c.acceptNextCardId ?? null).toBeNull();
  });
});

describe('Card CSV: unaffected one-off events stay non-choice', () => {
  it('Local Festival / Food Critic / Rainy Day have no choice fields', () => {
    for (const id of ['evt-festival', 'evt-food-critic', 'evt-rainy']) {
      const c = byId(id);
      expect(c.hasChoices).toBeFalsy();
      expect(c.acceptNextCardId ?? null).toBeNull();
      expect(c.rejectNextCardId ?? null).toBeNull();
    }
  });
});
