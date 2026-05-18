/**
 * Minimal internationalisation (i18n) module.
 *
 * Provides a lightweight key→string lookup system so that UI-facing strings
 * are not hardcoded in English throughout the codebase.  Locale bundles can
 * be registered at startup; every call to `t()` returns the string for the
 * current locale, falling back to the `en` default when a key is missing.
 *
 * ## Usage
 *
 * ```ts
 * import { t, registerLocale, setLocale } from '@core-engine/I18n';
 *
 * // Register the English (default) bundle
 * registerLocale('en', { 'hud.tooltip.coins.title': 'Income This Turn' });
 *
 * // Register a French bundle (partial override is fine — missing keys fall back to en)
 * registerLocale('fr', { 'hud.tooltip.coins.title': 'Revenus ce tour' });
 *
 * setLocale('fr');
 * t('hud.tooltip.coins.title'); // → "Revenus ce tour"
 * t('unknown.key');             // → "unknown.key" (missing-key fallback)
 * ```
 *
 * @module
 */

/** A locale bundle maps i18n keys to translated strings. */
export type I18nBundle = Record<string, string>;

// ── Internal state ──────────────────────────────────────────

const bundles: Map<string, I18nBundle> = new Map();
let currentLocale = 'en';

// ── Public API ──────────────────────────────────────────────

/**
 * Register (or merge) a locale bundle.
 *
 * If the locale already exists, new keys are merged and existing keys are
 * overwritten by the incoming bundle.  The English (`en`) bundle acts as
 * the authoritative fallback — it **must** contain every key that will ever
 * be looked up.
 */
export function registerLocale(locale: string, bundle: I18nBundle): void {
  const existing = bundles.get(locale) ?? {};
  bundles.set(locale, { ...existing, ...bundle });
}

/**
 * Switch the active locale.
 *
 * @throws Error if the locale has not been registered yet.
 */
export function setLocale(locale: string): void {
  if (!bundles.has(locale)) {
    throw new Error(`I18n: locale "${locale}" has not been registered. Call registerLocale() first.`);
  }
  currentLocale = locale;
}

/**
 * Get the currently active locale identifier.
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Look up a localised string by key.
 *
 * Resolution order:
 * 1. Current locale bundle.
 * 2. English (`en`) fallback bundle.
 * 3. The key itself (so missing keys are still meaningful in the UI).
 */
export function t(key: string): string {
  const current = bundles.get(currentLocale);
  if (current && key in current) return current[key];

  // Fallback to English
  const en = bundles.get('en');
  if (en && key in en) return en[key];

  // Last resort: return the key itself
  return key;
}

/**
 * Reset all registered locales and the current locale to defaults.
 *
 * Useful for test teardown so that state doesn't leak between tests.
 */
export function resetI18n(): void {
  bundles.clear();
  currentLocale = 'en';
}