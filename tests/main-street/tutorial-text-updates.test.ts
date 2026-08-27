/**
 * Tutorial Text Updates Tests
 *
 * Validates the 23-step two-turn tutorial text (CG-0MT53NXGZ004H5AE):
 * 1. Every resolved title and body is ≤3 sentences and communicates exactly one point.
 * 2. T1 no longer mentions "25 turns" (time-limited play sentence removed).
 * 3. Upcoming Incidents has no "blue" wording and no incident-impact details.
 * 4. Place a Business has no matching-card mention.
 * 5. Card facts (name, cost, income) are resolved from live card data via
 *    {cardName}/{cost}/{bonus}/{synergyCardName} placeholders — never hardcoded.
 * 6. Every purchase is a two-turn plan-ahead flow: move to hand today (one
 *    action), End Turn, place tomorrow at LISTED cost. No copy promises
 *    same-turn placement at listed cost (that path now costs a +50% premium).
 *
 * Text is resolved through the i18n system from `TUTORIAL_EN_BUNDLE`, with
 * card-data placeholders interpolated via `resolveTutorialStepText()`.
 *
 * @module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UNIFIED_TUTORIAL_STEPS, resolveTutorialStepText } from '../../example-games/main-street/TutorialFlow';
import { TUTORIAL_EN_BUNDLE } from '../../example-games/main-street/i18n/tutorial-en';
import { resetI18n, registerLocale, t, formatCurrency } from '../../src/core-engine/I18n';
import {
  getCsvRows,
  getBaseTypeId,
  loadTemplatesFromCsv,
  resetTemplatesToDefault,
} from '../../example-games/main-street/MainStreetCards';
import cardDataRaw from '../../example-games/main-street/card-data.csv?raw';

/**
 * Count sentences in a string by splitting on sentence-ending punctuation
 * (period, exclamation, question mark) followed by whitespace or end-of-string.
 * Does not count decimal points (e.g. "0.25") as sentence ends.
 */
function countSentences(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return 0;
  const parts = normalized.split(/[.!?]+(?:\s+|$)/).filter(p => p.trim().length > 0);
  // If the text ends with punctuation, the final empty part is filtered out.
  return parts.length;
}

describe('Tutorial text updates (23-step two-turn restructure)', () => {
  beforeEach(() => {
    resetI18n();
    registerLocale('en', TUTORIAL_EN_BUNDLE);
  });

  describe('sentence-count rule (≤3 sentences per box)', () => {
    it('every title is ≤3 sentences', () => {
      for (const step of UNIFIED_TUTORIAL_STEPS) {
        const title = t(step.titleKey);
        expect(countSentences(title), `title ${step.id} should be ≤3 sentences: "${title}"`).toBeLessThanOrEqual(3);
      }
    });

    it('every resolved body is ≤3 sentences', () => {
      for (const step of UNIFIED_TUTORIAL_STEPS) {
        const body = resolveTutorialStepText(step).body;
        expect(countSentences(body), `body ${step.id} should be ≤3 sentences: "${body}"`).toBeLessThanOrEqual(3);
      }
    });

    it('no text box is empty', () => {
      for (const step of UNIFIED_TUTORIAL_STEPS) {
        const { title, body } = resolveTutorialStepText(step);
        expect(title.trim().length).toBeGreaterThan(0);
        expect(body.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('T1 Welcome (AC: 25-turns sentence removed)', () => {
    it('does not mention 25 turns or a turn limit', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T1')!).body;
      expect(body).not.toMatch(/25\s*turns/i);
      expect(body).not.toMatch(/reach the score target/i);
    });
  });

  describe('T3 Buy the Laundromat (AC: explicit click-to-buy, teaching move-today / place-tomorrow)', () => {
    it('mentions clicking to buy', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!).body;
      expect(body.toLowerCase()).toMatch(/click/);
      expect(body.toLowerCase()).toMatch(/buy/);
    });
    it('teaches move-today / place-tomorrow (one action today, listed cost tomorrow)', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!).body;
      expect(body.toLowerCase()).toMatch(/one action/);
      expect(body.toLowerCase()).toMatch(/tomorrow/);
    });
    it('does not promise same-turn placement at listed cost', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!).body;
      // The stale "placing later this turn is free" claim is forbidden: a
      // same-turn place-after-move now costs the +50% premium.
      expect(body.toLowerCase()).not.toMatch(/placing later this turn is free/i);
      expect(body.toLowerCase()).not.toMatch(/free.*this turn/i);
    });
  });

  describe('T5 Upcoming Incidents (AC: no "blue", no impact details)', () => {
    it('does not describe incident cards as blue', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T5')!).body;
      expect(body.toLowerCase()).not.toMatch(/\bblue\b/i);
    });
    it('does not list specific incident impacts', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T5')!).body;
      expect(body.toLowerCase()).not.toMatch(/cost coins|cost reputation|-1 coin|-1 rep|per food/i);
    });
    it('teaches the face-down incident deck and the peek skill', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T5')!).body;
      expect(body.toLowerCase()).toMatch(/deck/);
      expect(body.toLowerCase()).toMatch(/face-down|face down|hidden/);
      expect(body.toLowerCase()).toMatch(/peek/);
      expect(body.toLowerCase()).not.toMatch(/top happens/);
      expect(body.toLowerCase()).not.toMatch(/below next turn/);
      expect(body.toLowerCase()).not.toMatch(/hover/i);
    });
  });

  describe('T6 End Turn (day 1 → day 2) — first two-turn boundary', () => {
    it('says to end the day and that the taken card waits overnight', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T6')!).body;
      expect(body.toLowerCase()).toMatch(/end/i);
      expect(body.toLowerCase()).toMatch(/overnight|tomorrow|next one/i);
    });
  });

  describe('T7 Place a Business (AC: no matching-card mention, listed cost)', () => {
    it('does not mention matching cards', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T7')!).body;
      expect(body.toLowerCase()).not.toMatch(/match/i);
    });
    it('explicitly says click an empty slot and pay listed cost', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T7')!).body;
      expect(body.toLowerCase()).toMatch(/click/);
      expect(body.toLowerCase()).toMatch(/listed/);
    });
  });

  describe('T11 Move the Bookshop to hand (split 1/2 — teaches plan-ahead)', () => {
    it('mentions culture businesses and move-to-hand', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T11')!).body;
      expect(body.toLowerCase()).toMatch(/culture/);
      expect(body.toLowerCase()).toMatch(/hand/);
    });
    it('teaches place-tomorrow at listed cost instead of same-day premium', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T11')!).body;
      expect(body.toLowerCase()).toMatch(/tomorrow/);
      expect(body.toLowerCase()).toMatch(/listed/);
    });
  });

  describe('T10 End this turn (AC: wait for a more opportune moment)', () => {
    it('says we could play the card now but wait for a more opportune moment', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T10')!).body;
      expect(body).toMatch(/(wait|hold).*(opportune|moment)/i);
    });
    it('resolves {cardName} from card data (no raw placeholder tokens)', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T10')!).body;
      expect(body).not.toMatch(/\{[A-Za-z_]+\}/);
    });
  });

  describe('T12 Costs and Reputation (AC: running cost vs reputation only — no synergy)', () => {
    it('mentions running costs and reputation', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T12')!).body;
      expect(body.toLowerCase()).toMatch(/cost/);
      expect(body.toLowerCase()).toMatch(/reputation/i);
    });
    it('does NOT mention Culture adjacency, the Bookshop, or a bonus (informative split)', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T12')!).body;
      expect(body.toLowerCase()).not.toMatch(/culture/);
      expect(body).not.toContain('Bookshop');
      expect(body.toLowerCase()).not.toMatch(/bonus/);
    });
    it('resolves {cardName} from card data (no raw placeholder tokens)', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T12')!).body;
      expect(body).toContain('Library');
      expect(body).not.toMatch(/\{[A-Za-z_]+\}/);
    });
  });

  describe('T13 Community Favour (AC: teaches the rep→coins exchange)', () => {
    it('mentions Community Favour and the rep→coins exchange', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T13')!).body;
      expect(body.toLowerCase()).toMatch(/community favour/);
      expect(body.toLowerCase()).toMatch(/2r → 3c|reputation/);
    });
    it('does not claim the Library is unaffordable without it (two-turn budget)', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T13')!).body;
      expect(body.toLowerCase()).not.toMatch(/little short on coins/i);
      expect(body.toLowerCase()).not.toMatch(/required/i);
    });
  });

  describe('T19 Build a Library next to the Bookshop (AC: synergy system, Culture adjacency)', () => {
    it('mentions the Culture bonus via synergyCardName placeholder', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T19')!).body;
      expect(body).toContain('Bookshop');
      expect(body.toLowerCase()).toMatch(/culture/);
      expect(body.toLowerCase()).toMatch(/bonus/);
    });
    it('tells the player to select and place the Library next to the Bookshop', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T19')!).body;
      expect(body.toLowerCase()).toMatch(/hand/);
      expect(body.toLowerCase()).toMatch(/place/);
      expect(body.toLowerCase()).toMatch(/next to/);
    });
  });

  describe('T20 Triggering Events (AC: play festival from hand)', () => {
    it('mentions clicking the held festival in hand', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T20')!).body;
      expect(body.toLowerCase()).toMatch(/hand/);
      expect(body.toLowerCase()).toMatch(/click/);
    });
  });

  describe('T21 Success and Failure (AC: scoring bar)', () => {
    it('mentions the scoring bar components', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T21')!).body;
      expect(body.toLowerCase()).toMatch(/coins/);
      expect(body.toLowerCase()).toMatch(/score/);
      expect(body.toLowerCase()).toMatch(/target/);
    });
  });

  describe('T23 button label (AC: "Let\'s play!")', () => {
    it('overlay startFullGame is "Let\'s play!"', () => {
      expect(t('tutorial.overlay.startFullGame')).toBe("Let's play!");
    });
  });

  describe('Action economy + two-turn plan-ahead copy (CG-0MT53NXGZ004H5AE)', () => {
    it('T3 teaches the one-action-per-day rule', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!).body;
      expect(body.toLowerCase()).toMatch(/one action/i);
    });

    it('T11 teaches move-today / place-tomorrow at listed cost', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T11')!).body;
      expect(body.toLowerCase()).toMatch(/one action/i);
      expect(body.toLowerCase()).toMatch(/tomorrow.*listed|listed.*tomorrow/i);
    });

    it('no step copy promises same-turn placement at listed cost', () => {
      for (const step of UNIFIED_TUTORIAL_STEPS) {
        const body = resolveTutorialStepText(step).body.toLowerCase();
        expect(body, `${step.id} must not promise free same-turn placement`).not.toMatch(/placing later this turn is free/i);
        expect(body, `${step.id} must not teach same-day buy-and-place at listed cost`).not.toMatch(/buy-and-place|buy and place.*free/i);
      }
    });
  });
});

describe('Data-driven tutorial text (card facts from card data)', () => {
  const t3Step = UNIFIED_TUTORIAL_STEPS.find(step => step.id === 'T3')!;
  const laundromatBaseId = getBaseTypeId(t3Step.requiredCardId!);
  const laundromatRow = getCsvRows().find(r => r.id === laundromatBaseId)!;

  beforeEach(() => {
    resetI18n();
    registerLocale('en', TUTORIAL_EN_BUNDLE);
    resetTemplatesToDefault();
  });

  it('T3 body shows the Laundromat actual current cost from card data', () => {
    const body = resolveTutorialStepText(t3Step).body;
    const expectedCost = formatCurrency(Number(laundromatRow.cost));
    expect(body).toContain(expectedCost);
  });

  it('same card data produces identical resolved text (deterministic)', () => {
    const a = resolveTutorialStepText(t3Step).body;
    const b = resolveTutorialStepText(t3Step).body;
    expect(a).toBe(b);
  });

  it('changed card cost updates the rendered tutorial text', () => {
    const modifiedCsv = cardDataRaw.replace(
      /(biz-laundromat,Laundromat,)\d+(,)/,
      '$19$2',
    );
    loadTemplatesFromCsv(modifiedCsv);
    try {
      const body = resolveTutorialStepText(t3Step).body;
      expect(body).toContain(formatCurrency(9));
      expect(body).not.toContain(formatCurrency(Number(laundromatRow.cost)));
    } finally {
      resetTemplatesToDefault();
    }
  });

  it('no tutorial step resolves with raw placeholder tokens', () => {
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      const { title, body } = resolveTutorialStepText(step);
      expect(title).not.toMatch(/\{[A-Za-z_]+\}/);
      expect(body).not.toMatch(/\{[A-Za-z_]+\}/);
    }
  });

  it('T3/T9/T11 embed card names/costs via data-driven placeholders', () => {
    const t3 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;
    const t9 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T9')!;
    const t11 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T11')!;

    const laundromatRow = getCsvRows().find(r => r.id === getBaseTypeId(t3.requiredCardId!))!;
    const festivalRow = getCsvRows().find(r => r.id === getBaseTypeId(t9.requiredCardId!))!;
    const bookshopRow = getCsvRows().find(r => r.id === getBaseTypeId(t11.requiredCardId!))!;

    expect(laundromatRow).toBeDefined();
    expect(festivalRow).toBeDefined();
    expect(bookshopRow).toBeDefined();

    const t3Body = resolveTutorialStepText(t3).body;
    const t9Body = resolveTutorialStepText(t9).body;
    const t11Body = resolveTutorialStepText(t11).body;

    expect(t3Body).toContain(laundromatRow.name);
    expect(t9Body).toContain(festivalRow.name);
    expect(t11Body).toContain(bookshopRow.name);
  });

  it('T19 resolves {cardName} (Library) and {synergyCardName} (Bookshop) from card data', () => {
    const t19 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T19')!;
    const libraryRow = getCsvRows().find(r => r.id === getBaseTypeId(t19.referencedCardId!))!;
    const bookshopRow = getCsvRows().find(r => r.id === getBaseTypeId(t19.synergyCardId!))!;
    expect(libraryRow).toBeDefined();
    expect(bookshopRow).toBeDefined();

    const body = resolveTutorialStepText(t19).body;
    expect(body).toContain(libraryRow.name);      // Library
    expect(body).toContain(bookshopRow.name);     // Bookshop
    expect(body).not.toMatch(/\{[A-Za-z_]+\}/);
  });

  it('T13 Community Favour resolves with no unresolved placeholder tokens', () => {
    const t13 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T13')!;
    const body = resolveTutorialStepText(t13).body;
    expect(body).not.toMatch(/\{[A-Za-z_]+\}/);
  });
});