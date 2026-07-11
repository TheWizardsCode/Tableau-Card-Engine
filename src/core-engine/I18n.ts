/**
 * Minimal internationalisation (i18n) module.
 *
 * Provides a lightweight key→string lookup system so that UI-facing strings
 * are not hardcoded in English throughout the codebase.  Locale bundles can
 * be registered at startup; every call to `t()` returns the string for the
 * current locale, falling back to the `en` default when a key is missing.
 *
 * Also provides currency-symbol support.  The default currency symbol is
 * `€` (Euro).  Individual locales can override it by including the key
 * `CURRENCY_SYMBOL_KEY` in their bundle.  Use `getCurrencySymbol()` to
 * retrieve the symbol for the current locale.
 *
 * ## Usage
 *
 * ```ts
 * import { t, registerLocale, setLocale, getCurrencySymbol } from '@core-engine/I18n';
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

// ── Constants ───────────────────────────────────────────────

/**
 * I18n key for the currency symbol.
 *
 * Locale bundles can include this key to override the currency symbol
 * per locale (e.g. `en-US` → `$`, `de-DE` → `€`, `ja-JP` → `¥`).
 * The default (fallback) is `€` (Euro).
 */
export const CURRENCY_SYMBOL_KEY = 'currency.symbol';

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
 * Get the currency symbol for the current locale.
 *
 * Looks up `CURRENCY_SYMBOL_KEY` ('currency.symbol') in the current locale
 * bundle.  If not found, falls back to the `en` bundle, and finally to `€`.
 *
 * Locale authors can override the symbol by including the key in their
 * locale bundle:
 *
 * ```ts
 * registerLocale('en-US', { 'currency.symbol': '$' });
 * registerLocale('de-DE', { 'currency.symbol': '€' });
 * ```
 *
 * Games that do not explicitly register a currency symbol default to Euro.
 *
 * @returns The currency symbol string (e.g. `€`, `$`, `¥`).
 */
export function getCurrencySymbol(): string {
  const symbol = t(CURRENCY_SYMBOL_KEY);
  // If the key itself was returned (not found in any bundle), use Euro
  return symbol === CURRENCY_SYMBOL_KEY ? '€' : symbol;
}

/**
 * Format a monetary value with the current locale's currency symbol.
 *
 * @param amount  The numeric amount to format.
 * @returns       A string like `"€5"` or `"$12"`.
 */
export function formatCurrency(amount: number): string {
  return `${getCurrencySymbol()}${amount}`;
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