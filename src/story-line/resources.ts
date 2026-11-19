/**
 * Game-declared story-line resources.
 *
 * The story-line engine was originally hard-coded to a `coins` / `reputation`
 * pair. A resource key is now **declared data**: a game advertises the keys it
 * threads through conditions, option costs and option extra effects, and the
 * engine operates over that set. `coins` / `reputation` remain the *default
 * projection* ({@link DEFAULT_RESOURCE_KEYS}), so a game that declares nothing
 * keeps exactly the behaviour it had before.
 *
 * Three rules keep the declared set honest:
 *
 * - **An absent key reads as `0`** ({@link readResource}) — a declared key the
 *   game's state does not currently carry is zero, never `undefined`/`NaN`.
 * - **An underspecified delta leaves the resource alone** — a cost or extra
 *   effect only names the keys it touches; every other declared key is
 *   unconstrained.
 * - **No resource is invented** — the engine only ever forwards keys from the
 *   declared set to the adapter's mutation seam, so a typo cannot create a
 *   phantom resource at runtime (validation reports it at authoring time
 *   instead).
 *
 * Nothing here depends on Phaser or imports a game module.
 *
 * @module
 */

/** A resource key declared by a game (`'coins'`, `'hull'`, `'morale'`, …). */
export type StorylineResourceKey = string;

/**
 * A bag of current resource values, keyed by declared resource key.
 *
 * A game may omit keys whose value is zero (an absent key reads as `0`) and
 * may carry extra game-specific entries; the engine reads only declared keys.
 */
export type StorylineResources = Readonly<Record<StorylineResourceKey, number>>;

/**
 * A signed, sparse resource delta: only the named keys change.
 *
 * `-5` deducts, `5` grants, an absent key leaves that resource untouched.
 */
export type StorylineResourcesDelta = Readonly<
  Partial<Record<StorylineResourceKey, number>>
>;

/**
 * The resource keys the engine uses when a game declares none: the shipped
 * `coins` / `reputation` projection, in that order.
 */
export const DEFAULT_RESOURCE_KEYS: readonly StorylineResourceKey[] = [
  'coins',
  'reputation',
];

/** The resource key projected into {@link StorylineResolution.coinChange}. */
export const COIN_PROJECTION_KEY: StorylineResourceKey = 'coins';

/** The resource key projected into {@link StorylineResolution.repChange}. */
export const REPUTATION_PROJECTION_KEY: StorylineResourceKey = 'reputation';

/**
 * Reads one resource from a bag, treating an absent (or non-finite) value as
 * `0`.
 *
 * @param resources Current resource bag (may omit zero-valued keys).
 * @param key       The declared resource key to read.
 */
export function readResource(
  resources: StorylineResources,
  key: StorylineResourceKey,
): number {
  const value = resources[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Trims, drops blank/duplicate keys, preserving declaration order. */
function normaliseKeys(
  keys: Iterable<StorylineResourceKey>,
): StorylineResourceKey[] {
  const seen = new Set<StorylineResourceKey>();
  const normalised: StorylineResourceKey[] = [];
  for (const key of keys) {
    const trimmed = key.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalised.push(trimmed);
  }
  return normalised;
}

/**
 * Normalises a game's resource declaration.
 *
 * A missing (or blank/empty) declaration means "no declaration": the engine
 * falls back to {@link DEFAULT_RESOURCE_KEYS}, so `coins` / `reputation` can
 * never disappear by accident. Keys are trimmed and de-duplicated, and
 * declaration order is preserved (it is the order deltas are applied in).
 *
 * @param declared The adapter's declared keys, when it declares any.
 */
export function resolveResourceKeys(
  declared?: Iterable<StorylineResourceKey> | undefined,
): readonly StorylineResourceKey[] {
  if (declared === undefined) return DEFAULT_RESOURCE_KEYS;
  const keys = normaliseKeys(declared);
  return keys.length > 0 ? keys : DEFAULT_RESOURCE_KEYS;
}

/**
 * Builds a signed delta containing only declared, non-zero keys.
 *
 * Undeclared keys are reported separately (never applied) so the caller can
 * surface an actionable warning instead of silently inventing a resource.
 *
 * @param source   Authored delta (cost or extra effect).
 * @param sign     `1` to grant, `-1` to deduct.
 * @param declared The declared resource keys.
 */
export function selectDeclaredDelta(
  source: StorylineResourcesDelta | undefined,
  sign: 1 | -1,
  declared: readonly StorylineResourceKey[],
): { delta: Record<StorylineResourceKey, number>; ignored: StorylineResourceKey[] } {
  const delta: Record<StorylineResourceKey, number> = {};
  const ignored: StorylineResourceKey[] = [];
  if (!source) return { delta, ignored };

  const declaredSet = new Set(declared);
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
      continue;
    }
    if (!declaredSet.has(key)) {
      ignored.push(key);
      continue;
    }
    delta[key] = sign * value;
  }
  return { delta, ignored };
}

/** How to read and mutate one declared resource on a game's state. */
export interface StorylineResourceField<TState> {
  /** Current value of the resource; `undefined` reads as `0`. */
  readonly read: (state: TState) => number | undefined;
  /** Apply a signed delta to the resource in place. */
  readonly apply: (state: TState, delta: number) => void;
}

/**
 * The resource half of a {@link StorylineEngineAdapter}, built declaratively.
 *
 * Structurally assignable to the adapter's `resources`, `getResources` and
 * `applyResourceDelta` members, so a game can spread it into its adapter:
 *
 * ```ts
 * const resources = createResourceProjection<VoyageState>({
 *   hull: { read: (s) => s.hull, apply: (s, d) => { s.hull += d; } },
 *   morale: { read: (s) => s.morale, apply: (s, d) => { s.morale += d; } },
 * });
 *
 * const engine = { ...resources, rng, applyEffect, appendLog, /* … *\/ };
 * ```
 */
export interface StorylineResourceProjection<TState> {
  /** The declared keys, in declaration order. */
  readonly resources: readonly StorylineResourceKey[];
  /** Current values of every declared resource (absent reads as `0`). */
  getResources(state: TState): StorylineResources;
  /**
   * Applies a signed delta. Keys outside the projection, non-finite values and
   * zero deltas are ignored — the projection never invents a resource.
   */
  applyResourceDelta(state: TState, delta: StorylineResourcesDelta): void;
}

/**
 * Builds the resource seam of a {@link StorylineEngineAdapter} from a
 * declarative projection of a game's own state fields.
 *
 * The projection **is** the declaration: the field map's keys are the declared
 * resource set, so the two can never drift apart. Every declared key is
 * reported by {@link StorylineResourceProjection.getResources} (an absent
 * field reads as `0`) in declaration order.
 *
 * @param fields One accessor pair per declared resource key.
 */
export function createResourceProjection<TState>(
  fields: Readonly<Record<StorylineResourceKey, StorylineResourceField<TState>>>,
): StorylineResourceProjection<TState> {
  const resources = normaliseKeys(Object.keys(fields));

  return {
    resources,
    getResources(state: TState): StorylineResources {
      const bag: Record<StorylineResourceKey, number> = {};
      for (const key of resources) {
        bag[key] = fields[key]?.read(state) ?? 0;
      }
      return bag;
    },
    applyResourceDelta(state: TState, delta: StorylineResourcesDelta): void {
      for (const key of resources) {
        const value = delta[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
          continue;
        }
        fields[key]?.apply(state, value);
      }
    },
  };
}
