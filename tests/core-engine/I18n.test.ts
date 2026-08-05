/**
 * Core Engine: I18n module tests
 *
 * Verifies the minimal internationalisation lookup system used by
 * HUD tooltips and ARIA labels.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  t,
  registerLocale,
  setLocale,
  getLocale,
  resetI18n,
} from '../../src/core-engine/I18n';

// ── Pure unit tests (reset I18n between each test) ──────────────

describe('I18n (pure)', () => {
  beforeEach(() => {
    resetI18n();
  });

  describe('registerLocale + t()', () => {
    it('returns the English string when en bundle is registered', () => {
      registerLocale('en', { 'greeting': 'Hello' });
      expect(t('greeting')).toBe('Hello');
    });

    it('falls back to the key itself when key is missing in all bundles', () => {
      registerLocale('en', {});
      expect(t('missing.key')).toBe('missing.key');
    });

    it('falls back to English when the current locale is missing a key', () => {
      registerLocale('en', { 'greeting': 'Hello', 'farewell': 'Goodbye' });
      registerLocale('fr', { 'greeting': 'Bonjour' });
      setLocale('fr');

      // Key present in fr
      expect(t('greeting')).toBe('Bonjour');
      // Key missing in fr — falls back to en
      expect(t('farewell')).toBe('Goodbye');
    });

    it('falls back to the key when neither current locale nor en has it', () => {
      registerLocale('en', {});
      registerLocale('fr', {});
      setLocale('fr');

      expect(t('unknown')).toBe('unknown');
    });
  });

  describe('setLocale / getLocale', () => {
    it('defaults to "en" locale', () => {
      registerLocale('en', {});
      expect(getLocale()).toBe('en');
    });

    it('switches to a registered locale', () => {
      registerLocale('en', {});
      registerLocale('de', {});
      setLocale('de');
      expect(getLocale()).toBe('de');
    });

    it('throws when setting an unregistered locale', () => {
      expect(() => setLocale('ja')).toThrow(/not been registered/);
    });
  });

  describe('registerLocale merge', () => {
    it('merges new keys into an existing bundle', () => {
      registerLocale('en', { 'a': 'A', 'b': 'B' });
      registerLocale('en', { 'b': 'B-updated', 'c': 'C' });

      expect(t('a')).toBe('A');    // original key preserved
      expect(t('b')).toBe('B-updated'); // overwritten
      expect(t('c')).toBe('C');    // new key added
    });
  });

  describe('resetI18n', () => {
    it('clears all bundles and resets locale to en', () => {
      registerLocale('en', { 'hello': 'Hello' });
      registerLocale('fr', { 'hello': 'Bonjour' });
      setLocale('fr');
      expect(t('hello')).toBe('Bonjour');

      resetI18n();
      // After reset, en bundle is empty → key fallback
      expect(getLocale()).toBe('en');
      expect(t('hello')).toBe('hello');
    });
  });

  describe('interpolation — t(key, params)', () => {
    it('replaces {token} placeholders with provided values', () => {
      registerLocale('en', { 'greet': 'Hello, {name}!' });
      expect(t('greet', { name: 'Ada' })).toBe('Hello, Ada!');
    });

    it('replaces multiple distinct tokens', () => {
      registerLocale('en', { 'intro': '{greeting} {name}. You have {coins} coins.' });
      expect(t('intro', { greeting: 'Hi', name: 'Bob', coins: 42 })).toBe('Hi Bob. You have 42 coins.');
    });

    it('accepts number values and converts them to strings', () => {
      registerLocale('en', { 'cost': 'Cost: {price}' });
      expect(t('cost', { price: 5 })).toBe('Cost: 5');
    });

    it('returns the string unchanged when called without params (no tokens in string)', () => {
      registerLocale('en', { 'simple': 'Just a string' });
      expect(t('simple')).toBe('Just a string');
    });

    it('returns the string unchanged when called without params (string has no tokens)', () => {
      registerLocale('en', { 'simple': 'Just a string' });
      expect(t('simple', {})).toBe('Just a string');
    });

    it('throws when a placeholder key is missing from params', () => {
      registerLocale('en', { 'greet': 'Hello, {name}!' });
      expect(() => t('greet', {})).toThrow(/missing.*name/);
    });

    it('throws when any required placeholder is omitted from params', () => {
      registerLocale('en', { 'intro': '{a} and {b}' });
      expect(() => t('intro', { a: 'x' })).toThrow(/missing.*b/);
    });

    it('ignores extra params not referenced by the string', () => {
      registerLocale('en', { 'greet': 'Hello!' });
      expect(t('greet', { name: 'Ada', extra: 'ignored' })).toBe('Hello!');
    });

    it('missing-key fallback (key not in any bundle) returns the key itself', () => {
      registerLocale('en', {});
      expect(t('completely.unknown.key')).toBe('completely.unknown.key');
    });

    it('interpolation works with locale switching', () => {
      registerLocale('en', { 'greet': 'Hello, {name}!' });
      registerLocale('de', { 'greet': 'Hallo, {name}!' });

      setLocale('en');
      expect(t('greet', { name: 'Ada' })).toBe('Hello, Ada!');

      setLocale('de');
      expect(t('greet', { name: 'Ada' })).toBe('Hallo, Ada!');

      setLocale('en');
    });

    it('interpolation uses fallback locale when current locale is missing the key', () => {
      registerLocale('en', { 'greet': 'Hello, {name}!' });
      registerLocale('fr', {});
      setLocale('fr');
      // Key missing in fr — falls back to en, which has tokens
      expect(t('greet', { name: 'Pierre' })).toBe('Hello, Pierre!');
    });
  });
});

// ── Integration tests with HUD tooltip module ────────────────────
// These tests verify that the MainStreetHudTooltips module correctly
// registers its English locale bundle and that the i18n lookup works.

describe('I18n (HUD tooltip integration)', () => {
  // Ensure a clean state but re-register after reset
  let HUD_TOOLTIP_I18N_KEYS: Record<string, string>;
  let HUD_ARIA_I18N_KEYS: Record<string, string>;
  let HUD_TOOLTIP_STRINGS: Record<string, string>;
  let HUD_ARIA_STRINGS: Record<string, string>;

  beforeEach(async () => {
    resetI18n();
    // Dynamic import triggers registerLocale('en', enBundle) side-effect
    const mod = await import('../../example-games/main-street/scenes/MainStreetHudTooltips');
    HUD_TOOLTIP_I18N_KEYS = mod.HUD_TOOLTIP_I18N_KEYS as Record<string, string>;
    HUD_ARIA_I18N_KEYS = mod.HUD_ARIA_I18N_KEYS as Record<string, string>;
    HUD_TOOLTIP_STRINGS = mod.HUD_TOOLTIP_STRINGS as Record<string, string>;
    HUD_ARIA_STRINGS = mod.HUD_ARIA_STRINGS as Record<string, string>;

    // After resetI18n, the module-level side-effect from the initial import
    // may have been wiped. Re-register manually by reconstructing the bundle
    // from the exported constants (these are deterministic).
    const enBundle: Record<string, string> = {};
    for (const [k, v] of Object.entries(HUD_TOOLTIP_STRINGS)) {
      enBundle[HUD_TOOLTIP_I18N_KEYS[k]] = v;
    }
    for (const [k, v] of Object.entries(HUD_ARIA_STRINGS)) {
      enBundle[HUD_ARIA_I18N_KEYS[k]] = v;
    }
    registerLocale('en', enBundle);
  });

  it('provides English defaults for all tooltip keys', () => {
    for (const [key, i18nKey] of Object.entries(HUD_TOOLTIP_I18N_KEYS)) {
      const expected = HUD_TOOLTIP_STRINGS[key];
      expect(t(i18nKey)).toBe(expected);
    }
  });

  it('provides English defaults for all ARIA label keys', () => {
    for (const [key, i18nKey] of Object.entries(HUD_ARIA_I18N_KEYS)) {
      const expected = HUD_ARIA_STRINGS[key];
      expect(t(i18nKey)).toBe(expected);
    }
  });

  it('allows overriding tooltip strings via a new locale', () => {
    registerLocale('de', {
      [HUD_TOOLTIP_I18N_KEYS['coinsTitle']]: 'Einkommen Diese Runde',
    });
    setLocale('de');

    expect(t(HUD_TOOLTIP_I18N_KEYS['coinsTitle'])).toBe('Einkommen Diese Runde');
    // Non-overridden keys fall back to en
    expect(t(HUD_TOOLTIP_I18N_KEYS['coinsCalcNote'])).toBe('Sum of business incomes + synergy bonuses');
  });

  it('HUD_ARIA_LABELS resolves through i18n', async () => {
    const { HUD_ARIA_LABELS } = await import('../../example-games/main-street/scenes/MainStreetHudTooltips');
    expect(HUD_ARIA_LABELS.coins).toBe('Coins status — hover for expected income breakdown');
    expect(HUD_ARIA_LABELS.rep).toBe('Reputation status — hover for multiplier details');
    expect(HUD_ARIA_LABELS.score).toBe('Score status — hover for next tier threshold');
  });

  it('HUD_ARIA_LABELS reflects locale changes', async () => {
    registerLocale('de', {
      [HUD_ARIA_I18N_KEYS['coins']]: 'Münzen — für Einkommensaufschlüsselung bewegen',
    });
    setLocale('de');

    // HUD_ARIA_LABELS uses getters, so they resolve dynamically via t()
    const { HUD_ARIA_LABELS } = await import('../../example-games/main-street/scenes/MainStreetHudTooltips');
    expect(HUD_ARIA_LABELS.coins).toBe('Münzen — für Einkommensaufschlüsselung bewegen');
    // Non-overridden keys fall back to en
    expect(HUD_ARIA_LABELS.rep).toBe('Reputation status — hover for multiplier details');
  });
});