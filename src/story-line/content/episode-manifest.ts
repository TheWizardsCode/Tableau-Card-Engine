/**
 * Episode manifest — the typed shape of the scene beat sheet.
 *
 * An episode manifest is the beat-sheet layer's authored data: acts, scenes,
 * beats, objectives, budgets, outcome rules, routes and loss rules
 * (`docs/design/storyline-game-gdd.md` §2.2). This module owns the two
 * machine-readable artefacts of that shape — the canonical JSON schema path and
 * the TypeScript types the editor and the validator share — and nothing else:
 * the pure validator lands with its rule families, so no runtime, game or
 * Phaser import belongs here.
 *
 * The types mirror GDD §2.2.9 verbatim, plus the `resources.start` and
 * `resources.bounds` members documented in §2.2.1 and §2.8.2. Every fixed-shape
 * object is closed by `additionalProperties: false` in
 * [`schemas/episode-manifest.schema.json`](../../../schemas/episode-manifest.schema.json),
 * so a future additive field is a manifest-version bump by design — that is the
 * intended contract, not an omission.
 *
 * `resources.start` and `resources.bounds` are keyed by the manifest's own
 * declared resource keys, which the schema cannot enumerate; the schema
 * constrains the key pattern and the value shape only. Cross-checking them
 * against `resources.declared` (a missing entry, `bounds.min > bounds.max`, a
 * start outside its bounds) is the validator's job.
 *
 * @module
 */

/**
 * Canonical repository-relative path of the episode-manifest JSON schema.
 *
 * Shared by the authoring toolchain, the validator and the test harness so a
 * schema move is caught loudly (the derived path stops resolving) instead of
 * silently validating against a stale copy.
 */
export const DEFAULT_EPISODE_MANIFEST_SCHEMA_PATH = 'schemas/episode-manifest.schema.json' as const;

/**
 * The only manifest version this module describes.
 *
 * A mismatched `manifestVersion` is refused by the schema, never coerced.
 */
export const MANIFEST_VERSION = 1 as const;

// ── Episode manifest types (GDD §2.2.9) ─────────────────────

/** The three scene outcomes, in the order the close step classifies them. */
export type SceneOutcome = 'success' | 'partial' | 'failure';

/**
 * A scene condition: the one condition vocabulary shared with `@story-line`.
 *
 * Exactly three forms — the scene objective, scene-budget exhaustion, or a raw
 * declared-resource check. There is deliberately no fourth form and no second
 * condition language.
 */
export type SceneCondition =
  | { objective: 'met' | 'unmet' }
  | { budget: 'exhausted' | 'intact' }
  | { field: string; op: '>=' | '<=' | '>' | '<' | '=='; value: number };

/** A declared-resource check, the same shape `@story-line` evaluates. */
export interface ResourceCheck {
  /** Declared resource key the check reads; an undeclared key is a manifest error. */
  field: string;
  /** Comparison operator. */
  op: '>=' | '<=' | '>' | '<' | '==';
  /** Right-hand side of the comparison. */
  value: number;
}

/** Per-key design bounds for a declared resource (GDD §2.8.2). */
export interface ResourceBounds {
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
}

export interface EpisodeManifest {
  /** Literal schema version; a mismatch is refused, never coerced. */
  manifestVersion: typeof MANIFEST_VERSION;
  /** Stable episode id (`^[a-z0-9][a-z0-9-]*$`), unique in the distribution. */
  id: string;
  /** Player-facing episode title. */
  title: string;
  /** The content adapter id and the repo-relative CSV path the beats resolve in. */
  content: { adapter: string; file: string };
  /**
   * Declared key set (must equal the content file's), the subset the beat sheet
   * never restores, the run's starting bag and the per-key design bounds.
   */
  resources: {
    declared: string[];
    irreversible: string[];
    start: Record<string, number>;
    bounds: Record<string, ResourceBounds>;
  };
  /** Run entry point. */
  start: { act: string; scene: string; beat: string };
  /** Content card ids that finish a run; non-empty and unique. */
  endings: string[];
  /** Non-empty, ordered by `order`. */
  acts: Act[];
  /** Reviewer-facing design notes; ignored at runtime. */
  notes?: string;
}

export interface Act {
  /** Unique act id, same pattern as the episode id. */
  id: string;
  /** Act banner text. */
  title: string;
  /** Integer >= 1 and unique; the only ordering authority (array order is not play order). */
  order: number;
  /** Scene id inside this act that a run enters by default. */
  entryScene: string;
  /** Non-empty. */
  scenes: Scene[];
  /** Reviewer-facing. */
  notes?: string;
}

export interface Scene {
  /** Unique across the episode. */
  id: string;
  /** Scene banner text. */
  title: string;
  /** Exactly one objective, evaluated once at scene close. */
  objective: Objective;
  /** Clock ticks available in this scene; reset per scene entry, never carried. */
  budget: { clock: number };
  /** A `cardId` in `beats`; the default first beat. */
  entryBeat: string;
  /** Non-empty; the scene's beat set, and therefore its boundary. */
  beats: Beat[];
  /** Ordered, first match wins; the last rule must be unconditional. */
  outcomeRules: OutcomeRule[];
  /** Ordered, first match wins; must cover all outcomes or end with `on: "*"`. */
  routes: SceneRoute[];
  /** Additional irreversible losses applied at close, per outcome. */
  losses?: LossRule[];
  /** Reviewer-facing. */
  notes?: string;
}

export interface Beat {
  /** Identity and CSV card id, unique in the episode. */
  cardId: string;
  /** Ticks charged when the beat is entered; integer >= 0. */
  clockCost: number;
  /** Reviewer-facing; ignored at runtime. */
  note?: string;
}

export interface Objective {
  /** Player-facing, imperative, at most 90 characters. */
  statement: string;
  /** Evaluated once, at close, against post-resolution resources. */
  check: ResourceCheck;
}

export interface OutcomeRule {
  /** Unique within the scene; recorded in the transcript. */
  id: string;
  /** Absent only on the final catch-all rule. */
  when?: SceneCondition;
  /** Classification when the rule matches. */
  outcome: SceneOutcome;
}

export type RouteTarget =
  | { kind: 'chain' }
  | { kind: 'beat'; act: string; scene: string; beat?: string }
  | { kind: 'ending'; cardId: string };

export interface SceneRoute {
  /** Unique within the scene; recorded in the transcript. */
  id: string;
  /** Which outcome this route serves. */
  on: SceneOutcome | '*';
  /** Additional gate; evaluated after `on`. */
  when?: SceneCondition;
  /** The door this route opens. */
  to: RouteTarget;
}

export interface LossRule {
  /** Unique within the scene; recorded in the transcript and the ledger. */
  id: string;
  /** The outcome that triggers the loss. */
  on: SceneOutcome;
  /** Must be in `resources.irreversible`. */
  field: string;
  /** Points removed; integer >= 1. */
  amount: number;
  /** Player-facing line for the loss ledger and the journal. */
  statement: string;
}
