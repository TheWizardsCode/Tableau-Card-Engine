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
 * The declared set may also name a **never-restored subset**: a resource key
 * that can be spent but must never be granted back (the Long Erasure's `hull`).
 * That declaration travels on the projection as
 * {@link StorylineResourceProjection.irreversible}, in declaration order and
 * empty by default, so a resolution guard can refuse a grant without a second
 * seam and a game that declares nothing is unchanged.
 *
 * The declared set may also carry **inclusive per-key bounds**
 * (`createResourceProjection(fields, { bounds })`), the range the GDD states for
 * each key. A bounded key's delta is clamped to `[min, max]` at apply time: a
 * gain at the cap spills (the excess is reported, never banked) and a loss at
 * the floor clamps (the unapplied magnitude is reported, never applied). Every
 * call returns a {@link ResourceRemainderReport} — one entry per declared key
 * in declaration order — and an optional `onRemainder` hook reports the same
 * report once per call, only when something spilled or clamped. Bounds are the
 * caller's data: the engine hard-codes no key and no range, and a projection
 * built without bounds behaves exactly as it did before.
 *
 * Nothing here depends on Phaser or imports a game module.
 *
 * The module is also the **read-through for the episode manifest's resource
 * block**: {@link readManifestStartBag} and {@link readManifestBounds} read
 * `resources.start` / `resources.bounds` for the declared keys and fail closed
 * (reporting per-key issues) rather than substituting a default, so a validator
 * or a guard can prove its claims from declared data instead of from a game-side
 * start-bag constant.
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

/**
 * Trims, drops blank/duplicate keys, preserving declaration order.
 *
 * Where {@link parseResourceKeys} normalises a comma-separated declaration
 * text, this normalises an already-split key collection (the manifest's
 * `declared` array, an adapter's declared keys) with the same rule, so both
 * forms of declaration compare equal after normalisation.
 *
 * @param keys Raw resource keys (any order, possibly blank or repeated).
 * @returns The keys in declaration order, trimmed and de-duplicated.
 */
export function normaliseResourceKeys(
  keys: Iterable<StorylineResourceKey>,
): readonly StorylineResourceKey[] {
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
 * Parses a comma-separated resource-key declaration (`"coins, hull, morale"`).
 *
 * Used for the story-line content model's declared-resource column: keys are
 * trimmed, blank entries dropped and duplicates collapsed, preserving
 * declaration order. An empty / blank text declares no keys (`[]`).
 *
 * @param text Raw comma-separated resource-key text.
 * @returns The declared keys, in declaration order.
 */
export function parseResourceKeys(
  text: string,
): readonly StorylineResourceKey[] {
  return normaliseResourceKeys(text.split(','));
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
  const keys = normaliseResourceKeys(declared);
  return keys.length > 0 ? keys : DEFAULT_RESOURCE_KEYS;
}

// ── Manifest start bag and bounds (read-through, no defaults) ─

/**
 * Inclusive per-key design bounds, the shape of one `resources.bounds` entry
 * (`{ min, max }`).
 */
export interface ManifestResourceBounds {
  /** Inclusive lower bound. */
  readonly min: number;
  /** Inclusive upper bound. */
  readonly max: number;
}

/**
 * Why a manifest resource block could not be read.
 *
 * The reason is stable and machine-readable (the validator forwards it onto its
 * finding), so tooling can match the defect without parsing a message.
 */
export type ManifestResourceReadReason =
  | 'missing-start-entry'
  | 'missing-bounds-entry'
  | 'bounds-inverted';

/** One declared key the manifest resource block does not supply a value for. */
export interface ManifestResourceReadIssue {
  /** Stable reason code (see {@link ManifestResourceReadReason}). */
  readonly reason: ManifestResourceReadReason;
  /** The declared resource key the issue concerns. */
  readonly key: StorylineResourceKey;
}

/**
 * The outcome of reading the run's starting bag out of manifest data.
 *
 * A **failure is total**: when any declared key is missing the read yields no
 * bag at all, so a caller cannot accidentally proceed with a partial bag —
 * there is no default fill, and the engine's `coins` / `reputation` projection
 * is never substituted for data the manifest was supposed to declare.
 */
export type ManifestStartBagRead =
  | { readonly ok: true; readonly bag: StorylineResources }
  | { readonly ok: false; readonly issues: readonly ManifestResourceReadIssue[] };

/**
 * The outcome of reading the per-key design bounds out of manifest data.
 *
 * Fails closed exactly like {@link ManifestStartBagRead}: no bounds are
 * invented, and an inverted range (`min > max`) is reported rather than
 * normalised.
 */
export type ManifestBoundsRead =
  | {
      readonly ok: true;
      readonly bounds: Readonly<Record<StorylineResourceKey, ManifestResourceBounds>>;
    }
  | { readonly ok: false; readonly issues: readonly ManifestResourceReadIssue[] };

/** Reads `value` as a finite number, or `undefined` for any other value. */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Reads `value` as a plain object, or `undefined` for any other shape. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Reads the run's starting bag (`resources.start`) for the declared keys.
 *
 * This is the read-through the manifest validator and the scene-space guard
 * share: the declared key set is the caller's (manifest `resources.declared`),
 * and every declared key must carry a finite value. A missing or non-numeric
 * entry is an issue (`missing-start-entry`) and the read as a whole fails — the
 * values that *were* readable are never returned in a partial bag, so no code
 * path can run a game from an under-declared start.
 *
 * @param declared The declared resource keys, in declaration order.
 * @param start    The raw `resources.start` value (any shape).
 * @returns The complete bag, or the per-key issues that made it unreadable.
 */
export function readManifestStartBag(
  declared: readonly StorylineResourceKey[],
  start: unknown,
): ManifestStartBagRead {
  const source = recordOf(start);
  const bag: Record<StorylineResourceKey, number> = {};
  const issues: ManifestResourceReadIssue[] = [];
  for (const key of declared) {
    const value = finiteNumber(source?.[key]);
    if (value === undefined) {
      issues.push({ reason: 'missing-start-entry', key });
      continue;
    }
    bag[key] = value;
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, bag };
}

/**
 * Reads the per-key design bounds (`resources.bounds`) for the declared keys.
 *
 * Every declared key must carry a `{ min, max }` entry with finite members
 * (`missing-bounds-entry` otherwise), and the range must not be inverted
 * (`bounds-inverted`). A key that fails either check is reported and the read
 * as a whole fails, so a caller never receives a partly-bounded model.
 *
 * @param declared The declared resource keys, in declaration order.
 * @param bounds   The raw `resources.bounds` value (any shape).
 * @returns The complete bounds map, or the per-key issues that made it unreadable.
 */
export function readManifestBounds(
  declared: readonly StorylineResourceKey[],
  bounds: unknown,
): ManifestBoundsRead {
  const source = recordOf(bounds);
  const read: Record<StorylineResourceKey, ManifestResourceBounds> = {};
  const issues: ManifestResourceReadIssue[] = [];
  for (const key of declared) {
    const entry = recordOf(source?.[key]);
    const min = finiteNumber(entry?.min);
    const max = finiteNumber(entry?.max);
    if (min === undefined || max === undefined) {
      issues.push({ reason: 'missing-bounds-entry', key });
      continue;
    }
    if (min > max) {
      issues.push({ reason: 'bounds-inverted', key });
      continue;
    }
    read[key] = { min, max };
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, bounds: read };
}

/** Options controlling {@link selectDeclaredDelta}. */
export interface SelectDeclaredDeltaOptions {
  /**
   * The declared never-restored keys. A positive delta (a grant) on one of
   * them is moved into `refused` and never applied; a negative delta (a cost)
   * still passes, because an irreversible key may be **spent**. Omitted means
   * "declares none", so every existing caller keeps today's behaviour and
   * gets an empty `refused` bucket.
   */
  readonly irreversible?: Iterable<StorylineResourceKey>;
}

/** How {@link selectDeclaredDelta} split an authored delta. */
export interface DeclaredDeltaSelection {
  /** Declared, non-zero keys to apply, already signed. */
  readonly delta: Record<StorylineResourceKey, number>;
  /** Declared keys a grant would have applied but was refused (never applied). */
  readonly refused: StorylineResourceKey[];
  /** Undeclared keys carrying a non-zero value (never applied). */
  readonly ignored: StorylineResourceKey[];
}

/**
 * Builds a signed delta containing only declared, non-zero keys.
 *
 * Undeclared keys are reported separately (`ignored`, never applied) so the
 * caller can surface an actionable warning instead of silently inventing a
 * resource. A **grant** (sign `1`) on a key declared irreversible is reported
 * separately again (`refused`, never applied): an irreversible key may be
 * spent as a cost, never granted back.
 *
 * @param source   Authored delta (cost or extra effect).
 * @param sign     `1` to grant, `-1` to deduct.
 * @param declared The declared resource keys.
 * @param options  Optional never-restored key declaration.
 */
export function selectDeclaredDelta(
  source: StorylineResourcesDelta | undefined,
  sign: 1 | -1,
  declared: readonly StorylineResourceKey[],
  options: SelectDeclaredDeltaOptions = {},
): DeclaredDeltaSelection {
  const delta: Record<StorylineResourceKey, number> = {};
  const refused: StorylineResourceKey[] = [];
  const ignored: StorylineResourceKey[] = [];
  if (!source) return { delta, ignored, refused };

  const declaredSet = new Set(declared);
  // Only a grant can be refused, so a deduction never pays for the set.
  const irreversibleSet =
    sign === 1
      ? new Set(normaliseResourceKeys(options.irreversible ?? []))
      : undefined;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
      continue;
    }
    if (!declaredSet.has(key)) {
      ignored.push(key);
      continue;
    }
    if (irreversibleSet?.has(key)) {
      refused.push(key);
      continue;
    }
    delta[key] = sign * value;
  }
  return { delta, ignored, refused };
}

/** How to read and mutate one declared resource on a game's state. */
export interface StorylineResourceField<TState> {
  /** Current value of the resource; `undefined` reads as `0`. */
  readonly read: (state: TState) => number | undefined;
  /** Apply a signed delta to the resource in place. */
  readonly apply: (state: TState, delta: number) => void;
}

/**
 * What one declared key's delta actually did, once its bounds were enforced.
 *
 * The three amounts are always reported together, so a caller never has to
 * infer the outcome from the key's value:
 *
 * - `applied` — the signed amount handed to the field's `apply` (`0` when the
 *   whole delta was wasted, in which case `apply` was not called at all).
 * - `spilled` — the **positive** excess of a gain past the key's `max`. It is
 *   never banked and never transferred to another key.
 * - `clamped` — the **positive** magnitude of a loss the key's `min` refused.
 *   It is never applied and never stored as a negative remainder.
 */
export interface ResourceRemainderEntry {
  /** The declared resource key this entry reports. */
  readonly key: StorylineResourceKey;
  /** The signed amount applied to the key (derived from the value read back). */
  readonly applied: number;
  /** The unbounded excess of a gain past `max` (`0` when none was wasted). */
  readonly spilled: number;
  /** The unapplied magnitude of a loss below `min` (`0` when nothing clamped). */
  readonly clamped: number;
}

/**
 * The remainder of one `applyResourceDelta` call: **one entry per declared
 * key**, in declaration order, with zeros for the keys the call did not move.
 *
 * The shape therefore never depends on which keys moved, so a consumer can
 * render or log it without first checking which keys are present.
 */
export type ResourceRemainderReport = readonly ResourceRemainderEntry[];

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
  /**
   * The declared never-restored keys, in declaration order.
   *
   * A key here may still be **spent** (an option cost), but content must never
   * grant it back: the resolution guard refuses a positive extra effect on it.
   * Empty when the projection declares none (the default), so a game with no
   * irreversible key is byte-identical to before.
   */
  readonly irreversible: readonly StorylineResourceKey[];
  /** Current values of every declared resource (absent reads as `0`). */
  getResources(state: TState): StorylineResources;
  /**
   * Applies a signed delta and returns the per-key remainder.
   *
   * Keys outside the projection, non-finite values and zero deltas are ignored
   * — the projection never invents a resource. Each declared key that was
   * bounded had its delta clamped to `[min, max]`: a gain past the cap is
   * applied only up to the cap (`spilled` reports the excess) and a loss past
   * the floor is applied only down to the floor (`clamped` reports the
   * unapplied magnitude). Keys with no bounds entry apply the delta as given.
   *
   * The returned report is legal against the `void`-returning
   * `StorylineEngineAdapter.applyResourceDelta` seam, so an adapter built by
   * spreading this projection needs no signature change.
   */
  applyResourceDelta(
    state: TState,
    delta: StorylineResourcesDelta,
  ): ResourceRemainderReport;
}

/** Options controlling {@link createResourceProjection}. */
export interface ResourceProjectionOptions<TState = unknown> {
  /**
   * The declared never-restored keys, in declaration order (a run's
   * `resources.irreversible`, for example). Normalised like every other key
   * declaration (trimmed, blanks and duplicates dropped); omitted means
   * "declares none", leaving {@link StorylineResourceProjection.irreversible}
   * empty and every existing behaviour unchanged.
   */
  readonly irreversible?: Iterable<StorylineResourceKey>;
  /**
   * Inclusive per-key bounds, keyed by declared resource (`{ min, max }` — the
   * shape the episode manifest's `resources.bounds` already carries, so a game
   * can pass its manifest's read-through straight in).
   *
   * Only the keys named here are bounded. Omitting the option — or a key's
   * entry — keeps the pre-bounds behaviour exactly: the delta is applied as
   * given, nothing spills, nothing clamps and nothing is reported.
   *
   * Bounds are expected to be validated data (`readManifestBounds` refuses a
   * missing entry and an inverted range). A malformed entry that still arrives
   * (an inverted range, a non-finite member) is ignored — the key stays
   * unbounded rather than making the key unspendable or over-applying.
   */
  readonly bounds?: Readonly<Record<StorylineResourceKey, ManifestResourceBounds>>;
  /**
   * Called at most once per `applyResourceDelta` call, and only when at least
   * one key spilled or clamped.
   *
   * It receives the **same** {@link ResourceRemainderReport} the call returns
   * (one entry per declared key, declaration order) and the state the delta was
   * applied to, so a game can record the remainder — an activity-log line per
   * spilled / clamped key, for example. Wording is the game's; the engine only
   * reports the numbers.
   *
   * Omitted means "reports nothing", leaving every existing caller unchanged.
   */
  readonly onRemainder?: (
    report: ResourceRemainderReport,
    state: TState,
  ) => void;
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
 * The optional `irreversible` declaration names the keys that may be spent but
 * never granted back. It is carried verbatim on the projection (normalised,
 * order preserved) and defaults to `[]`, so a caller that declares none keeps
 * the pre-existing contract exactly.
 *
 * The optional `bounds` declaration names the inclusive `{ min, max }` range of
 * the keys the caller bounded. Omitting it (or a key's entry) keeps the
 * unbounded behaviour exactly; supplying it turns each bounded key's delta into
 * a clamped, reported one (see {@link StorylineResourceProjection.applyResourceDelta}).
 * The optional `onRemainder` hook receives that report once per call, together
 * with the state, so a game can record what its bounds wasted.
 *
 * @param fields  One accessor pair per declared resource key.
 * @param options Optional never-restored key declaration, per-key bounds and
 *                the remainder hook.
 */
export function createResourceProjection<TState>(
  fields: Readonly<Record<StorylineResourceKey, StorylineResourceField<TState>>>,
  options: ResourceProjectionOptions<TState> = {},
): StorylineResourceProjection<TState> {
  const resources = normaliseResourceKeys(Object.keys(fields));
  const irreversible = normaliseResourceKeys(options.irreversible ?? []);
  const bounds = options.bounds;
  const onRemainder = options.onRemainder;

  return {
    resources,
    irreversible,
    getResources(state: TState): StorylineResources {
      const bag: Record<StorylineResourceKey, number> = {};
      for (const key of resources) {
        bag[key] = fields[key]?.read(state) ?? 0;
      }
      return bag;
    },
    applyResourceDelta(
      state: TState,
      delta: StorylineResourcesDelta,
    ): ResourceRemainderReport {
      const report: ResourceRemainderEntry[] = [];
      let remainder = false;

      for (const key of resources) {
        const value = delta[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
          report.push({ key, applied: 0, spilled: 0, clamped: 0 });
          continue;
        }

        const range = validBounds(bounds?.[key]);
        if (range === undefined) {
          fields[key]?.apply(state, value);
          report.push({ key, applied: value, spilled: 0, clamped: 0 });
          continue;
        }

        // Read-mutate-read: the applied amount is derived from the value the
        // projection read, never from the authored delta, so a field that also
        // clamps internally cannot make the report drift.
        const read = fields[key]?.read(state);
        const current =
          typeof read === 'number' && Number.isFinite(read) ? read : 0;
        const target = current + value;
        const applied = clamp(target, range.min, range.max) - current;
        const spilled = Math.max(0, target - range.max);
        const clamped = Math.max(0, range.min - target);

        // A fully wasted delta mutates nothing: the key is already at the bound
        // it was pushed past.
        if (applied !== 0) fields[key]?.apply(state, applied);
        report.push({ key, applied, spilled, clamped });
        if (spilled > 0 || clamped > 0) remainder = true;
      }

      if (remainder) onRemainder?.(report, state);
      return report;
    },
  };
}

/** A usable inclusive range, or `undefined` when the entry is unusable. */
function validBounds(
  entry: ManifestResourceBounds | undefined,
): ManifestResourceBounds | undefined {
  if (entry === undefined) return undefined;
  const { min, max } = entry;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    return undefined;
  }
  return entry;
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
