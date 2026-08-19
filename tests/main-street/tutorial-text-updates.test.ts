/**
 * Tutorial Text Updates Tests
 *
 * Validates the 17-step tutorial text restructure (CG-0MSKSJ9SS0069ZWT):
 * 1. Every resolved title and body is ≤3 sentences and communicates exactly one point.
 * 2. T1 no longer mentions "25 turns" (time-limited play sentence removed).
 * 3. Upcoming Incidents has no "blue" wording and no incident-impact details.
 * 4. Place a Business has no matching-card mention.
 * 5. Card facts (name, cost, income) are resolved from live card data via
 *    {cardName}/{cost}/{bonus}/{synergyCardName} placeholders — never hardcoded.
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

describe('Tutorial text updates (17-step restructure)', () => {
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

  describe('T3 Buy the Laundromat (AC: explicit click-to-buy, no "place cards" instruction)', () => {
    it('mentions clicking to buy', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!).body;
      expect(body.toLowerCase()).toMatch(/click/);
      expect(body.toLowerCase()).toMatch(/buy/);
    });
    it('does not instruct placing cards in this step', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!).body;
      expect(body.toLowerCase()).not.toMatch(/place cards/i);
    });
  });

  describe('T5 Place a Business (AC: no matching-card mention)', () => {
    it('does not mention matching cards', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T5')!).body;
      expect(body.toLowerCase()).not.toMatch(/match/i);
    });
    it('explicitly says click an empty slot to earn income', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T5')!).body;
      expect(body.toLowerCase()).toMatch(/click/);
      expect(body.toLowerCase()).toMatch(/income/i);
    });
  });

  describe('T6 Upcoming Incidents (AC: no "blue", no impact details)', () => {
    it('does not describe incident cards as blue', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T6')!).body;
      expect(body.toLowerCase()).not.toMatch(/\bblue\b/i);
    });
    it('does not list specific incident impacts', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T6')!).body;
      expect(body.toLowerCase()).not.toMatch(/cost coins|cost reputation|-1 coin|-1 rep|per food/i);
    });
    it('frames events as good/bad with a hover hint', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T6')!).body;
      expect(body.toLowerCase()).toMatch(/help/);
      expect(body.toLowerCase()).toMatch(/hurt/);
      expect(body.toLowerCase()).toMatch(/hover/i);
    });
  });

  describe('T10 Optimizing for Events (AC: drag to place, depends on drag-drop)', () => {
    it('mentions culture businesses and drag-to-place', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T10')!).body;
      expect(body.toLowerCase()).toMatch(/culture/);
      expect(body.toLowerCase()).toMatch(/drag/);
      expect(body.toLowerCase()).toMatch(/street/);
    });
  });

  describe('T11 End this turn (AC: wait for a more opportune moment)', () => {
    it('says we could play the card now but wait for a more opportune moment', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T11')!).body;
      expect(body).toMatch(/(wait|hold).*(opportune|moment)/i);
    });
    it('resolves {cardName} from card data (no raw placeholder tokens)', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T11')!).body;
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

  describe('T13 Build a Library (AC: synergy system, Culture adjacency)', () => {
    it('mentions the Culture bonus via synergyCardName placeholder', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T13')!).body;
      expect(body).toContain('Bookshop');
      expect(body.toLowerCase()).toMatch(/culture/);
      expect(body.toLowerCase()).toMatch(/bonus/);
    });
    it('tells the player to buy and place the Library next to the Bookshop', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T13')!).body;
      expect(body.toLowerCase()).toMatch(/buy/);
      expect(body.toLowerCase()).toMatch(/place/);
      expect(body.toLowerCase()).toMatch(/next to/);
    });
  });

  describe('T14 Triggering Events (AC: play festival from hand)', () => {
    it('mentions clicking the held festival in hand', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T14')!).body;
      expect(body.toLowerCase()).toMatch(/hand/);
      expect(body.toLowerCase()).toMatch(/click/);
    });
  });

  describe('T15 Success and Failure (AC: scoring bar)', () => {
    it('mentions the scoring bar components', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T15')!).body;
      expect(body.toLowerCase()).toMatch(/coins/);
      expect(body.toLowerCase()).toMatch(/score/);
      expect(body.toLowerCase()).toMatch(/target/);
    });
  });

  describe('T16 button label (AC: "Let\'s play!")', () => {
    it('overlay startFullGame is "Let\'s play!"', () => {
      expect(t('tutorial.overlay.startFullGame')).toBe("Let's play!");
    });
  });

  describe('Action economy + buy-and-place premium copy (CG-0MSTOF1N5005PK2R)', () => {
    it('T3 teaches the one-action-per-day rule', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!).body;
      expect(body.toLowerCase()).toMatch(/one action/i);
    });

    it('T3 explains same-turn placement is free', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!).body;
      expect(body.toLowerCase()).toMatch(/placing.*free|free.*placing/i);
    });

    it('T10 teaches the buy-and-place +50% premium', () => {
      const body = resolveTutorialStepText(UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T10')!).body;
      expect(body.toLowerCase()).toMatch(/50% more|50% premium|50%*more/i);
      expect(body.toLowerCase()).toMatch(/buy-and-place|buy and place/i);
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

  it('T3/T9/T10 embed card names/costs via data-driven placeholders', () => {
    const t3 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;
    const t9 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T9')!;
    const t10 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T10')!;

    const laundromatRow = getCsvRows().find(r => r.id === getBaseTypeId(t3.requiredCardId!))!;
    const festivalRow = getCsvRows().find(r => r.id === getBaseTypeId(t9.requiredCardId!))!;
    const bookshopRow = getCsvRows().find(r => r.id === getBaseTypeId(t10.requiredCardId!))!;

    expect(laundromatRow).toBeDefined();
    expect(festivalRow).toBeDefined();
    expect(bookshopRow).toBeDefined();

    const t3Body = resolveTutorialStepText(t3).body;
    const t9Body = resolveTutorialStepText(t9).body;
    const t10Body = resolveTutorialStepText(t10).body;

    expect(t3Body).toContain(laundromatRow.name);
    expect(t9Body).toContain(festivalRow.name);
    expect(t10Body).toContain(bookshopRow.name);
    // T10's copy references the Bookshop by name but does not quote its cost.
  });

  it('T13 resolves {cardName} (Library) and {synergyCardName} (Bookshop) from card data', () => {
    const t13 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T13')!;
    const libraryRow = getCsvRows().find(r => r.id === getBaseTypeId(t13.requiredCardId!))!;
    const bookshopRow = getCsvRows().find(r => r.id === getBaseTypeId(t13.synergyCardId!))!;
    expect(libraryRow).toBeDefined();
    expect(bookshopRow).toBeDefined();

    const body = resolveTutorialStepText(t13).body;
    expect(body).toContain(libraryRow.name);      // Library
    expect(body).toContain(bookshopRow.name);     // Bookshop
    expect(body).not.toMatch(/\{[A-Za-z_]+\}/);
  });
});
