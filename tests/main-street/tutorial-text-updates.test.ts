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
 *
 * Text is resolved through the i18n system from `TUTORIAL_EN_BUNDLE`.
 *
 * @module
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { UNIFIED_TUTORIAL_STEPS, resolveTutorialStepText } from '../../example-games/main-street/TutorialFlow';
import { TUTORIAL_EN_BUNDLE } from '../../example-games/main-street/i18n/tutorial-en';
import { resetI18n, registerLocale, t } from '../../src/core-engine/I18n';
import { tutorialKey } from '../../example-games/main-street/i18n/tutorial-en';

describe('Tutorial text updates (AC1-3)', () => {
  // Find the T3 step
  const t3Step = UNIFIED_TUTORIAL_STEPS.find(step => step.id === 'T3')!;

  beforeAll(() => {
    // Ensure T3 exists
    expect(t3Step).toBeDefined();
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
      const body = t(t3Step.bodyKey).toLowerCase();
      expect(body).not.toContain('business card');
    });

    it('should not refer to the top row as "business cards"', () => {
      const body = t(t3Step.bodyKey).toLowerCase();
      // The row might be mentioned as "development" or "Development row"
      expect(body).not.toMatch(/business (cards|row)/i);
    });

    it('should still reference the Laundromat as an affordable card', () => {
      // The Laundromat is still a business card; the tutorial should reference it
      expect(t(t3Step.bodyKey)).toContain('Laundromat');
    });

    it('should use appropriate terminology for the market row', () => {
      const body = t(t3Step.bodyKey).toLowerCase();
      // Should use "Development" or "development" to describe the row
      expect(body).toMatch(/development/);
    });

    it('should be a non-empty body', () => {
      expect(t(t3Step.bodyKey).length).toBeGreaterThan(0);
    });

    it('should mention the cost of the card to buy', () => {
      expect(t(t3Step.bodyKey)).toContain('$6');
    });
  });

  // ── AC3: Appropriate terminology for community spaces ─────

  describe('Appropriate terminology (AC3)', () => {
    it('should use "card" or "development" terminology for the top row', () => {
      const body = t(t3Step.bodyKey).toLowerCase();
      // Should refer to cards in the development row (not specifically "business" cards)
      expect(body).not.toMatch(/^click a business card/i);
    });

    it('should still explain that cards go on the street', () => {
      const body = t(t3Step.bodyKey).toLowerCase();
      expect(body).toContain('street');
    });

    it('should still explain that cards earn income', () => {
      const body = t(t3Step.bodyKey).toLowerCase();
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
