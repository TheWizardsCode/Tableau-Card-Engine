/**
 * Tutorial i18n Tests
 *
 * Verifies that tutorial step text resolves correctly through the i18n system:
 * - All step keys exist in the English locale bundle
 * - Resolved text matches expected English defaults
 * - A non-English locale can override specific keys
 * - Fallback to key itself works when no locale is registered
 *
 * @module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UNIFIED_TUTORIAL_STEPS,
  resolveTutorialStepText,
  tutorialKey,
} from '../../example-games/main-street/TutorialFlow';
import {
  TUTORIAL_EN_BUNDLE,
  TUTORIAL_I18N_KEY_PREFIX,
} from '../../example-games/main-street/i18n/tutorial-en';
import { resetI18n, registerLocale, setLocale, t, getLocale } from '../../src/core-engine/I18n';

describe('Tutorial i18n: English bundle registration', () => {
  beforeEach(() => {
    resetI18n();
    registerLocale('en', TUTORIAL_EN_BUNDLE);
  });

  // ── AC1: All step keys resolve ──────────────────────────────

  it('every UNIFIED_TUTORIAL_STEP has titleKey and bodyKey', () => {
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      expect(typeof step.titleKey).toBe('string');
      expect(step.titleKey.length).toBeGreaterThan(0);
      expect(typeof step.bodyKey).toBe('string');
      expect(step.bodyKey.length).toBeGreaterThan(0);
    }
  });

  it('every step key exists in the English bundle', () => {
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      expect(TUTORIAL_EN_BUNDLE).toHaveProperty(step.titleKey);
      expect(TUTORIAL_EN_BUNDLE).toHaveProperty(step.bodyKey);
    }
  });

  it('every step resolves to non-empty text', () => {
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      const { title, body } = resolveTutorialStepText(step);
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
    }
  });

  // ── AC2: English defaults match expected content ────────────

  it('T1 title resolves to "Welcome to Main Street"', () => {
    const step = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T1')!;
    expect(t(step.titleKey)).toBe('Welcome to Main Street');
  });

  it('T1 body contains "Build the best Main Street"', () => {
    const step = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T1')!;
    expect(t(step.bodyKey)).toContain('Build the best Main Street');
  });

  it('T3 title resolves to "Development Row"', () => {
    const step = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;
    expect(t(step.titleKey)).toBe('Development Row');
  });

  it('T3 body contains "Laundromat" and "€6"', () => {
    const step = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;
    const body = t(step.bodyKey);
    expect(body).toContain('Laundromat');
    expect(body).toContain('€6');
  });

  it('T14 title resolves to "Tutorial Complete"', () => {
    const step = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T14')!;
    expect(t(step.titleKey)).toBe('Tutorial Complete');
  });

  // ── AC3: i18n key naming convention ────────────────────────

  it('i18n keys follow the convention tutorial.<stepId>.(title|body)', () => {
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      expect(step.titleKey).toBe(`${TUTORIAL_I18N_KEY_PREFIX}.${step.id}.title`);
      expect(step.bodyKey).toBe(`${TUTORIAL_I18N_KEY_PREFIX}.${step.id}.body`);
    }
  });

  it('tutorialKey() produces the correct key', () => {
    expect(tutorialKey('T1', 'title')).toBe('tutorial.T1.title');
    expect(tutorialKey('T3', 'body')).toBe('tutorial.T3.body');
    expect(tutorialKey('T13', 'title')).toBe('tutorial.T13.title');
  });
});

describe('Tutorial i18n: locale switching', () => {
  beforeEach(() => {
    resetI18n();
    registerLocale('en', TUTORIAL_EN_BUNDLE);
  });

  it('switches to a custom locale and falls back to en for missing keys', () => {
    registerLocale('de', {
      [tutorialKey('T1', 'title')]: 'Willkommen in der Main Street',
    });
    setLocale('de');

    // Overridden key returns German
    const t1 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T1')!;
    expect(t(t1.titleKey)).toBe('Willkommen in der Main Street');

    // Non-overridden key falls back to English
    expect(t(t1.bodyKey)).toContain('Build the best Main Street');
  });

  it('returns the key itself when no locale is registered', () => {
    resetI18n(); // Clear everything
    const step = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T1')!;

    // With no bundles registered, t() falls back to the key itself
    expect(t(step.titleKey)).toBe(step.titleKey);
    expect(t(step.bodyKey)).toBe(step.bodyKey);
  });

  it('getLocale returns "en" by default', () => {
    expect(getLocale()).toBe('en');
  });
});

describe('Tutorial i18n: resolveTutorialStepText', () => {
  beforeEach(() => {
    resetI18n();
    registerLocale('en', TUTORIAL_EN_BUNDLE);
  });

  it('returns resolved title and body for a step', () => {
    const step = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;
    const { title, body } = resolveTutorialStepText(step);

    expect(title).toBe('Development Row');
    expect(body).toContain('Laundromat');
  });

  it('works for all 14 steps', () => {
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      const { title, body } = resolveTutorialStepText(step);
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
    }
  });

  it('reflects locale changes', () => {
    registerLocale('de', {
      [tutorialKey('T13', 'title')]: 'Tutorial abgeschlossen',
    });
    setLocale('de');

    const step = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T13')!;
    const { title } = resolveTutorialStepText(step);
    expect(title).toBe('Tutorial abgeschlossen');
  });
});
