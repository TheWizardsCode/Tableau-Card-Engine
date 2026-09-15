/**
 * Content: Story-chain card wiring in the shipped CSV (CG-0MTT7FC7A000AA58 /
 * parent CG-0MTSHG8RP008E128)
 *
 * Verifies the chain-card content the producer approved 2026-09-09:
 *   Chain 1 Tax Escalation (3-step cycle):  evt-tax-error -> evt-tax -> evt-tax-inquiry (accept resets to evt-tax-error)
 *   Chain 2 Labor Unrest (2-step no reset): evt-strike-service -> evt-general-strike (terminal)
 *   Chain 3 Restaurant Opportunity (2-step):evt-popular-menu -> evt-farm-table (terminal)
 *   Chain 4 Economic Downturn (2-step):     evt-recession -> evt-depression (terminal)
 *   Health escalation (AC5 example):        evt-flu-outbreak -> evt-pandemic (terminal)
 *
 * Semantics per AC: accept = apply effect + add acceptNextCardId; reject =
 * skip effect + add rejectNextCardId. Terminal cards are plain (non-choice)
 * incidents that resolve normally when drawn — the chain ends by processing.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  type EventCard,
  isDurationEventCard,
  getEventTemplates,
} from '../../example-games/main-street/MainStreetCards';

type Card = EventCard & { id: string };

function template(id: string): Card {
  const t = getEventTemplates().find((c) => c.id === id) as Card | undefined;
  if (!t) throw new Error(`Template ${id} missing from shipped CSV`);
  return t;
}

function allIdsResolve(links: Array<string | null | undefined>): void {
  const ids = new Set(getEventTemplates().map((c) => c.id));
  for (const link of links) {
    if (link) expect(ids.has(link), `chain link ${link} not in CSV`).toBe(true);
  }
}

describe('Chain 1: Tax Escalation (3-step cycle, resets)', () => {
  it('Error in Tax Return: accept ends, reject -> Tax Audit', () => {
    const c = template('evt-tax-error');
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId).toBeUndefined();
    expect(c.rejectNextCardId).toBe('evt-tax');
    expect(c.coinDelta).toBeLessThan(0); // negative event
  });

  it('Tax Audit (retrofitted): accept ends, reject -> Inquiry Commission', () => {
    const c = template('evt-tax');
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId).toBeUndefined();
    expect(c.rejectNextCardId).toBe('evt-tax-inquiry');
  });

  it('Inquiry Commission: accept -> Error in Tax Return (cycle), reject ends', () => {
    const c = template('evt-tax-inquiry');
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId).toBe('evt-tax-error');
    expect(c.rejectNextCardId).toBeUndefined();
    expect(c.coinDelta).toBeLessThan(0);
    expect(c.reputationDelta).toBeLessThan(0);
  });

  it('severity escalates along the chain (2 -> 3 -> 6 coins)', () => {
    expect(template('evt-tax-error').coinDelta).toBeGreaterThan(template('evt-tax').coinDelta);
    expect(template('evt-tax').coinDelta).toBeGreaterThan(template('evt-tax-inquiry').coinDelta);
  });
});

describe('Chain 2: Labor Unrest (2-step, no reset)', () => {
  it('Service Workers Strike: accept ends, reject -> General Strike', () => {
    const c = template('evt-strike-service');
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId).toBeUndefined();
    expect(c.rejectNextCardId).toBe('evt-general-strike');
    expect(c.coinDelta).toBeLessThan(0);
  });

  it('General Strike is a terminal plain incident (chain ends when drawn)', () => {
    const c = template('evt-general-strike');
    expect(Boolean(c.hasChoices)).toBe(false);
    expect(c.acceptNextCardId).toBeUndefined();
    expect(c.rejectNextCardId).toBeUndefined();
    expect(c.coinDelta).toBeLessThan(0);
  });
});

describe('Chain 3: Restaurant Opportunity (2-step, no reset, positive)', () => {
  it('Popular Menu Item: accept ends, reject -> Farm-to-Table Feature', () => {
    const c = template('evt-popular-menu');
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId).toBeUndefined();
    expect(c.rejectNextCardId).toBe('evt-farm-table');
    expect(c.coinDelta).toBeGreaterThan(0); // positive event
  });

  it('Farm-to-Table Feature is a terminal plain positive incident (better card)', () => {
    const c = template('evt-farm-table');
    expect(Boolean(c.hasChoices)).toBe(false);
    expect(c.coinDelta).toBeGreaterThan(0);
    expect(c.reputationDelta).toBeGreaterThan(0);
    // The rejected escalation is strictly better than the original.
    expect(c.coinDelta + c.reputationDelta).toBeGreaterThan(
      template('evt-popular-menu').coinDelta + template('evt-popular-menu').reputationDelta,
    );
  });
});

describe('Chain 4: Economic Downturn (2-step, no reset, duration)', () => {
  it('Economic Recession (retrofitted duration): accept ends, reject -> Depression', () => {
    const c = template('evt-recession');
    expect(isDurationEventCard(c)).toBe(true);
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId).toBeUndefined();
    expect(c.rejectNextCardId).toBe('evt-depression');
  });

  it('Depression is a terminal duration card, strictly worse than the recession', () => {
    const c = template('evt-depression');
    expect(isDurationEventCard(c)).toBe(true);
    expect(Boolean(c.hasChoices)).toBe(false);
    const recession = template('evt-recession');
    // Lower income multiplier + longer duration = worse for the player.
    expect((c as unknown as { multiplier: number }).multiplier).toBeLessThan(
      (recession as unknown as { multiplier: number }).multiplier,
    );
    expect((c as unknown as { duration: number }).duration).toBeGreaterThan(
      (recession as unknown as { duration: number }).duration,
    );
  });
});

describe('Health escalation (AC5 example: Flu Outbreak -> Pandemic)', () => {
  it('Flu Outbreak (retrofitted duration): accept ends, reject -> Pandemic', () => {
    const c = template('evt-flu-outbreak');
    expect(isDurationEventCard(c)).toBe(true);
    expect(c.hasChoices).toBe(true);
    expect(c.acceptNextCardId).toBeUndefined();
    expect(c.rejectNextCardId).toBe('evt-pandemic');
  });

  it('Pandemic is a terminal duration card, worse than the flu', () => {
    const c = template('evt-pandemic');
    expect(isDurationEventCard(c)).toBe(true);
    expect(Boolean(c.hasChoices)).toBe(false);
    const flu = template('evt-flu-outbreak');
    expect((c as unknown as { multiplier: number }).multiplier).toBeLessThan(
      (flu as unknown as { multiplier: number }).multiplier,
    );
  });
});

describe('Cross-chain integrity (AC4 data model / AC6 non-chain unchanged)', () => {
  it('every chain link id resolves to a shipped template', () => {
    allIdsResolve([
      template('evt-tax-error').rejectNextCardId,
      template('evt-tax').rejectNextCardId,
      template('evt-tax-inquiry').acceptNextCardId,
      template('evt-strike-service').rejectNextCardId,
      template('evt-popular-menu').rejectNextCardId,
      template('evt-recession').rejectNextCardId,
      template('evt-flu-outbreak').rejectNextCardId,
    ]);
  });

  it('non-chain one-off incidents were not retrofitted (AC6)', () => {
    for (const id of [
      'evt-festival', 'evt-rainy', 'evt-award', 'evt-food-critic', 'evt-construction',
      'evt-viral-review', 'evt-vandalism', 'evt-strike', 'evt-heatwave', 'evt-protest',
    ]) {
      const c = template(id);
      expect(Boolean(c.hasChoices), `${id} must stay a plain incident`).toBe(false);
    }
  });

  it('all newly shipped choice cards are exactly the designed set', () => {
    const choiceIds = getEventTemplates()
      .filter((c) => c.family === 'event' && Boolean(c.hasChoices))
      .map((c) => c.id)
      .sort();
    expect(choiceIds).toEqual(
      [
        'evt-tax', 'evt-tax-error', 'evt-tax-inquiry',
        'evt-strike-service',
        'evt-popular-menu',
        'evt-recession',
        'evt-flu-outbreak',
      ].sort(),
    );
  });
});
