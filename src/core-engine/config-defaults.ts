/**
 * config-defaults -- generic typed-defaults resolution for option objects.
 *
 * Replaces the repetitive `options?.field ?? default` pattern with a single
 * pure helper. Its result type marks every key supplied in `defaults` as
 * non-optional (non-`undefined`) while keeping the declared value type from
 * `T`, so downstream code no longer needs nullish coalescing. Required keys of
 * the options type are preserved, so omitting a required option stays a
 * compile error at the call site.
 *
 * @module core-engine/config-defaults
 */

/**
 * A typed set of default values for (a subset of) the optional keys of `T`.
 *
 * Annotate (or `satisfies`) a defaults literal with this type to have typos
 * and wrong value types reported at the definition site. Each listed value
 * must be non-`undefined` — a default of `undefined` would be a no-op and is
 * rejected. Keys are optional, so a defaults object may cover only the keys
 * you actually want to default.
 *
 * @example
 * ```ts
 * interface PlayOptions { duration?: number; ease?: string; }
 * const DEFAULTS = { duration: 350, ease: 'Back.easeOut' } satisfies OptionDefaults<PlayOptions>;
 * ```
 */
export type OptionDefaults<T> = {
  readonly [K in keyof T]?: Exclude<T[K], undefined>;
};

/**
 * The resolved shape produced by {@link applyDefaults}.
 *
 * Keys not present in `defaults` keep their declared optionality from `T`.
 * Keys present in `defaults` become required, with `undefined` removed from
 * their declared value type (the default guarantees a value). This avoids the
 * over-narrowing that a plain `T & D` intersection would produce for a
 * `null` default.
 */
export type WithDefaults<T, D> = Omit<T, keyof D> & {
  [K in keyof D]-?: K extends keyof T ? Exclude<T[K], undefined> : D[K];
};

/**
 * Resolve `options` over `defaults`.
 *
 * An explicitly `undefined` option is treated exactly like an absent one
 * (matching `options?.field ?? default`). The helper is pure: neither argument
 * is mutated and a fresh object is returned. Caller keys that have no default
 * are carried through unchanged.
 *
 * Pass an options value typed as the option interface (as production call
 * sites do) so the compiler can relate `defaults` keys back to that interface.
 *
 * @param options - Caller-supplied options (may be `undefined`).
 * @param defaults - Typed defaults for a subset of the optional keys.
 * @returns A new object where every defaulted key is guaranteed non-`undefined`.
 *
 * @example
 * ```ts
 * const { duration, ease } = applyDefaults(opts, {
 *   duration: DEFAULT_PLACE_DURATION,
 *   ease: 'Back.easeOut',
 * });
 * ```
 */
export function applyDefaults<T extends object, D extends OptionDefaults<T>>(
  options: T | undefined,
  defaults: D,
): WithDefaults<T, D> {
  const result: Record<string, unknown> = { ...defaults };
  if (options !== undefined && options !== null) {
    for (const key of Object.keys(options)) {
      const value = (options as Record<string, unknown>)[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }
  return result as WithDefaults<T, D>;
}

/**
 * Default interval (ms) between repeated move SFX during a card animation.
 *
 * Shared by {@link placeCard} and {@link dealCard} so the pacing stays
 * consistent and the magic number lives in one place.
 */
export const DEFAULT_MOVE_SFX_INTERVAL_MS = 120;
