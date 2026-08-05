/**
 * Tutorial Text Updates Tests
 *
 * Validates the tutorial text changes after the Development market row rename
 * and community space card introduction.
 *
 * Acceptance criteria:
 * 1. Tutorial step T3 title no longer says 'Market Business Row'
 * 2. Tutorial step T3 body no longer says 'Click a business card' or refers to community spaces as 'businesses'
 * 3. Tutorial text uses appropriate terminology for community space cards
 * 4. Card facts (name, cost) in tutorial text are resolved from live card data
 *    at render time, not hardcoded in the i18n bundle.
 *
 * Text is resolved through the i18n system from `TUTORIAL_EN_BUNDLE`, with
 * card-data placeholders interpolated via `resolveTutorialStepText()`.
 *
 * @module
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { UNIFIED_TUTORIAL_STEPS, resolveTutorialStepText } from '../../example-games/main-street/TutorialFlow';
import { TUTORIAL_EN_BUNDLE } from '../../example-games/main-street/i18n/tutorial-en';
import { resetI18n, registerLocale, t, formatCurrency } from '../../src/core-engine/I18n';
import {
  getCsvRows,
  getBaseTypeId,
  loadTemplatesFromCsv,
  resetTemplatesToDefault,
} from '../../example-games/main-street/MainStreetCards';
import { tutorialKey } from '../../example-games/main-street/i18n/tutorial-en';
import cardDataRaw from '../../example-games/main-street/card-data.csv?raw';

describe('Tutorial text updates (AC1-3)', () => {
  // Find the T3 step
  const t3Step = UNIFIED_TUTORIAL_STEPS.find(step => step.id === 'T3')!;

  // Live card-data row for the T3 target card (Laundromat).
  const laundromatRow = getCsvRows().find(r => r.id === getBaseTypeId(t3Step.requiredCardId!))!;

  /** Resolve the T3 body with card-data placeholders interpolated. */
  function t3Body(): string {
    return resolveTutorialStepText(t3Step).body;
  }

  beforeAll(() => {
    // Ensure T3 exists and its card data is present in card-data.csv
    expect(t3Step).toBeDefined();
    expect(laundromatRow).toBeDefined();
  });

  beforeEach(() => {
    resetI18n();
    registerLocale('en', TUTORIAL_EN_BUNDLE);
  });

  // ── AC1: T3 title no longer says 'Market Business Row' ───

  describe('T3 title (AC1)', () => {
    it('should not contain "Market Business Row" as title', () => {
      const title = t(t3Step.titleKey);
      expect(title).not.toBe('Market Business Row');
    });

    it('should not contain "Business Row" in the title', () => {
      const title = t(t3Step.titleKey).toLowerCase();
      expect(title).not.toContain('business row');
    });

    it('should have a non-empty title', () => {
      const title = t(t3Step.titleKey);
      expect(title.length).toBeGreaterThan(0);
    });

    it('should use "Development" or "development" in the title', () => {
      const title = t(t3Step.titleKey).toLowerCase();
      expect(title).toContain('development');
    });
  });

  // ── AC2: T3 body no longer says 'Click a business card' ──

  describe('T3 body text (AC2)', () => {
    it('should not contain "business card" in the body', () => {
      const body = t3Body().toLowerCase();
      expect(body).not.toContain('business card');
    });

    it('should not refer to the top row as "business cards"', () => {
      const body = t3Body().toLowerCase();
      // The row might be mentioned as "development" or "Development row"
      expect(body).not.toMatch(/business (cards|row)/i);
    });

    it('should reference the target card by its live card-data name', () => {
      expect(t3Body()).toContain(laundromatRow.name);
    });

    it('should use appropriate terminology for the market row', () => {
      const body = t3Body().toLowerCase();
      // Should use "Development" or "development" to describe the row
      expect(body).toMatch(/development/);
    });

    it('should be a non-empty body', () => {
      expect(t3Body().length).toBeGreaterThan(0);
    });

    it('should mention the actual current cost from card data', () => {
      expect(t3Body()).toContain(formatCurrency(Number(laundromatRow.cost)));
    });
  });

  // ── AC3: Appropriate terminology for community spaces ─────

  describe('Appropriate terminology (AC3)', () => {
    it('should use "card" or "development" terminology for the top row', () => {
      const body = t3Body().toLowerCase();
      // Should refer to cards in the development row (not specifically "business" cards)
      expect(body).not.toMatch(/^click a business card/i);
    });

    it('should still explain that cards go on the street', () => {
      const body = t3Body().toLowerCase();
      expect(body).toContain('street');
    });

    it('should still explain that cards earn income', () => {
      const body = t3Body().toLowerCase();
      expect(body).toContain('income');
    });
  });

  // ── Tutorial i18n key checks ─────────────────────────────

  describe('Tutorial step i18n keys', () => {
    it('should have T3 step in the tutorial flow', () => {
      expect(t3Step).toBeDefined();
    });

    it('should have titleKey and bodyKey set', () => {
      expect(t3Step.titleKey).toBe(tutorialKey('T3', 'title'));
      expect(t3Step.bodyKey).toBe(tutorialKey('T3', 'body'));
    });

    it('should have requiredCardId set', () => {
      expect(t3Step.requiredCardId).toBeDefined();
      expect(typeof t3Step.requiredCardId).toBe('string');
    });

    it('should have requiredAction set to select-business', () => {
      expect(t3Step.requiredAction).toBe('select-business');
    });

    it('should have highlightZone set', () => {
      expect(t3Step.highlightZone).toBeDefined();
    });
  });

  // ── i18n bundle coverage ─────────────────────────────────

  describe('i18n bundle coverage', () => {
    it('all 13 steps have keys in the English bundle', () => {
      for (const step of UNIFIED_TUTORIAL_STEPS) {
        expect(TUTORIAL_EN_BUNDLE).toHaveProperty(step.titleKey);
        expect(TUTORIAL_EN_BUNDLE).toHaveProperty(step.bodyKey);
      }
    });

    it('all 13 steps resolve to non-empty text via resolveTutorialStepText', () => {
      for (const step of UNIFIED_TUTORIAL_STEPS) {
        const { title, body } = resolveTutorialStepText(step);
        expect(title.length).toBeGreaterThan(0);
        expect(body.length).toBeGreaterThan(0);
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
    // The stale hardcoded €6 must never appear
    expect(body).not.toContain('€6');
  });

  it('T3 no longer claims the Laundromat is the cheapest card', () => {
    const body = resolveTutorialStepText(t3Step).body;
    expect(body).not.toContain('cheapest');
  });

  it('same card data produces identical resolved text (deterministic)', () => {
    const a = resolveTutorialStepText(t3Step).body;
    const b = resolveTutorialStepText(t3Step).body;
    expect(a).toBe(b);
  });

  it('changed card cost updates the rendered tutorial text', () => {
    // Rewrite the bundled CSV with a new Laundromat cost (9) and re-resolve.
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

  it('T7/T8/T9 embed card names/costs via data-driven placeholders', () => {
    const t7 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T7')!;
    const t8 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T8')!;
    const t9 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T9')!;

    const festivalRow = getCsvRows().find(r => r.id === getBaseTypeId(t7.referencedCardId!))!;
    const bookshopRow = getCsvRows().find(r => r.id === getBaseTypeId(t8.requiredCardId!))!;

    expect(festivalRow).toBeDefined();
    expect(bookshopRow).toBeDefined();

    const t7Body = resolveTutorialStepText(t7).body;
    const t8Body = resolveTutorialStepText(t8).body;
    const t9Body = resolveTutorialStepText(t9).body;

    // T7 references the Local Festival by its live card-data name and bonus
    expect(t7Body).toContain(festivalRow.name);
    // T8 references the Bookshop name and its live cost
    expect(t8Body).toContain(bookshopRow.name);
    expect(t8Body).toContain(formatCurrency(Number(bookshopRow.cost)));
    // T9 references the Bookshop by name
    expect(t9Body).toContain(bookshopRow.name);
  });
});
