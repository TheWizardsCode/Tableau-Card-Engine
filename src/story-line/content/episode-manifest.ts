/**
 * Episode manifest — the typed shape of the scene beat sheet.
 *
 * An episode manifest is the beat-sheet layer's authored data: acts, scenes,
 * beats, objectives, budgets, outcome rules, routes and loss rules
 * (`docs/design/storyline-game-gdd.md` §2.2). This module owns the
 * machine-readable artefacts of that shape — the canonical JSON schema path,
 * the TypeScript types the editor and the validator share, and the pure
 * manifest validator (GDD §2.4) — and nothing else: no runtime, game or Phaser
 * import belongs here.
 *
 * **Validator contract.** `validateEpisodeManifest` is *pure* (the document it
 * inspects is never mutated) and *total* (any value, including a malformed
 * manifest, is reported rather than thrown on), and it is *deterministic*: it
 * reads no clock, RNG or ambient state, findings are sorted by `path` then
 * `code`, and two runs over the same input produce byte-identical text and
 * JSON reports. Later §2.4 rule families add predicates over
 * `walkEpisodeManifest`'s one traversal; they never add a second traversal,
 * a second finding shape or a new ordering rule.
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
 * start outside its bounds) is the validator's job — and it is read through the
 * pure {@link ../resources} read-throughs (`readManifestStartBag`,
 * `readManifestBounds`), which fail closed instead of substituting a default.
 * The declared set itself always arrives as the caller's `declaredResources`
 * argument: this module never reads the engine's `coins` / `reputation`
 * projection, a game module or a game constant, so a resource rule can never be
 * satisfied by data the manifest did not declare.
 *
 * **Scope of the resource rules.** Only the *structural* agreement between
 * `declared`, `start` and `bounds` is checked here. Gate reachability from the
 * start bag belongs to the scene-space guard (`CG-0MWR0BG9H007AFNU`) and
 * runtime clamping to the bounds belongs to the economy ledger
 * (`CG-0MWR0BGVG004UE7X`); neither is arithmetic this validator does.
 *
 * @module
 */

import {
  normaliseResourceKeys,
  readManifestBounds,
  readManifestStartBag,
} from '../resources';
import { compileContentOptions, optionSuccessorIds } from './csv';
import { baseIdOf, type ContentAdapter, type ContentCard } from './types';

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

// ── Validator surface (GDD §2.4) ────────────────────────────

/**
 * Every rule code in the GDD §2.4 rule table, in table order.
 *
 * Declared in full here — including the families later children implement — so
 * a new rule family adds a predicate, never a new code, and a caller can key
 * its own handling off a closed set. `clock-cost-mismatch` is the
 * migration-only rule: it compares a beat's `clockCost` with the legacy CSV
 * cell and is retired by G10 (CG-0MWR0BJXI007UINE) along with that column.
 */
export const EPISODE_MANIFEST_ISSUE_CODES = [
  'duplicate-act',
  'duplicate-scene',
  'duplicate-beat',
  'unknown-card',
  'unknown-scene',
  'unknown-act',
  'unassigned-card',
  'dangling-chain',
  'non-total-routes',
  'non-total-outcome-rules',
  'objective-invalid',
  'loss-not-irreversible',
  'numeric-invalid',
  'resource-set-mismatch',
  'clock-cost-mismatch',
  'ending-successor',
] as const;

/** A GDD §2.4 rule code. */
export type EpisodeManifestIssueCode = (typeof EPISODE_MANIFEST_ISSUE_CODES)[number];

/**
 * A rule the validator ran, named by the code it reports.
 *
 * The result carries the implemented list so a caller (and a test) can tell a
 * clean manifest apart from an unimplemented rule: declaring the whole §2.4
 * code union up front must never make an unimplemented rule look satisfied.
 */
export type EpisodeManifestRule = EpisodeManifestIssueCode;

/** One rule violation, addressed by its JSON path inside the manifest. */
export interface EpisodeManifestFinding {
  /** The §2.4 rule code that fired. */
  readonly code: EpisodeManifestIssueCode;
  /** Dotted JSON path of the offending field, e.g. `acts[1].scenes[0].beats[2].cardId`. */
  readonly path: string;
  /** Reviewer-facing explanation, naming the conflicting declaration by path. */
  readonly message: string;
  /**
   * Stable reason code for a rule that reports several distinct defects under
   * one §2.4 code (`missing-start-entry`, `bounds-inverted`,
   * `start-outside-bounds`, …), so a tool can match the fault without parsing
   * the message — the same `reason` field `content/validate.ts` carries.
   *
   * Absent when the code alone names the defect.
   */
  readonly reason?: string;
  /** The manifest the finding belongs to (`''` when the document declares no string id). */
  readonly manifestId: string;
}

/** What the validator traversed — provenance for the reports. */
export interface EpisodeManifestCounts {
  /** Number of `acts[]` elements traversed. */
  readonly acts: number;
  /** Number of `acts[].scenes[]` elements traversed. */
  readonly scenes: number;
  /** Number of `acts[].scenes[].beats[]` elements traversed. */
  readonly beats: number;
}

/** The result of validating one episode manifest. */
export interface EpisodeManifestValidationResult {
  /** The manifest's declared id (`''` when absent or not a string). */
  readonly manifestId: string;
  /** Every finding, deduplicated and sorted by `path` then `code`. */
  readonly findings: readonly EpisodeManifestFinding[];
  /** The rules that ran, so an unimplemented rule is never mistaken for a pass. */
  readonly rules: readonly EpisodeManifestRule[];
  /** The traversal's element counts. */
  readonly counts: EpisodeManifestCounts;
  /** True when the implemented rules reported nothing. */
  readonly valid: boolean;
}

// ── The one traversal ───────────────────────────────────────

/** A manifest node with the dotted JSON path that addresses it. */
export interface ManifestLeafNode {
  /** Dotted JSON path of the node itself (not of a member). */
  readonly path: string;
  /** The raw node value — never trusted, and read through total accessors only. */
  readonly value: unknown;
}

/** A scene, with its path and its ordered child leaves. */
export interface ManifestSceneNode extends ManifestLeafNode {
  /** `beats[]`, in declaration order. */
  readonly beats: readonly ManifestLeafNode[];
  /** `outcomeRules[]`, in declaration order. */
  readonly outcomeRules: readonly ManifestLeafNode[];
  /** `routes[]`, in declaration order. */
  readonly routes: readonly ManifestLeafNode[];
  /** `losses[]`, in declaration order (empty when absent). */
  readonly losses: readonly ManifestLeafNode[];
}

/** An act, with its path and its scenes. */
export interface ManifestActNode extends ManifestLeafNode {
  /** `scenes[]`, in declaration order. */
  readonly scenes: readonly ManifestSceneNode[];
}

/** The manifest's single ordered act → scene → leaf traversal. */
export interface EpisodeManifestTraversal {
  /** Acts, in declaration order. */
  readonly acts: readonly ManifestActNode[];
  /** Every scene in the episode, flattened in act → scene order. */
  readonly scenes: readonly ManifestSceneNode[];
  /** Every beat in the episode, flattened in act → scene → beat order. */
  readonly beats: readonly ManifestLeafNode[];
}

/**
 * Walks the manifest once, in document order, tolerating any shape.
 *
 * This is the traversal every §2.4 rule family reads: it yields node objects
 * with the dotted JSON path that addresses them, so a rule reports a path
 * without re-deriving one, and a malformed document yields fewer nodes rather
 * than an exception.
 *
 * @param manifest A manifest document of any shape.
 * @returns The acts, the flattened scenes and the flattened beats.
 */
export function walkEpisodeManifest(manifest: unknown): EpisodeManifestTraversal {
  const acts: ManifestActNode[] = [];
  const scenes: ManifestSceneNode[] = [];
  const beats: ManifestLeafNode[] = [];

  arrayOf(recordOf(manifest)?.acts).forEach((act, actIndex) => {
    const actPath = `acts[${actIndex}]`;
    const actScenes = arrayOf(recordOf(act)?.scenes).map((scene, sceneIndex) => {
      const scenePath = `${actPath}.scenes[${sceneIndex}]`;
      const sceneRecord = recordOf(scene);
      const leavesOf = (member: string): ManifestLeafNode[] =>
        arrayOf(sceneRecord?.[member]).map((value, index) => ({
          path: `${scenePath}.${member}[${index}]`,
          value,
        }));
      const node: ManifestSceneNode = {
        path: scenePath,
        value: scene,
        beats: leavesOf('beats'),
        outcomeRules: leavesOf('outcomeRules'),
        routes: leavesOf('routes'),
        losses: leavesOf('losses'),
      };
      scenes.push(node);
      beats.push(...node.beats);
      return node;
    });
    acts.push({ path: actPath, value: act, scenes: actScenes });
  });

  return { acts, scenes, beats };
}

// ── Total accessors ─────────────────────────────────────────

/** Reads `value` as a plain object, or `undefined` for any other shape. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Reads `value` as an array, or `[]` for any other shape. */
function arrayOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Reads a string member, or `undefined` when absent or not a string. */
function stringMember(value: unknown, member: string): string | undefined {
  const memberValue = recordOf(value)?.[member];
  return typeof memberValue === 'string' ? memberValue : undefined;
}

/** Reads a finite numeric member, or `undefined` when absent or not a number. */
function numberMember(value: unknown, member: string): number | undefined {
  const memberValue = recordOf(value)?.[member];
  return typeof memberValue === 'number' && Number.isFinite(memberValue) ? memberValue : undefined;
}

/** Renders an id collection for a message, in document order. */
function listed(ids: Iterable<string>): string {
  const items = [...ids];
  return items.length === 0 ? '(none)' : items.join(', ');
}

/** The declared ids of the given nodes, in document order. */
function idsOf(nodes: readonly ManifestLeafNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    const id = stringMember(node.value, 'id');
    if (id !== undefined) ids.add(id);
  }
  return ids;
}

// ── Outcome coverage and totality (GDD §2.4) ────────────────

/**
 * The three outcomes every scene's door table must be able to serve.
 *
 * Kept in the order the close step classifies them, so a message or a caller
 * that enumerates the outcomes does so deterministically.
 */
export const SCENE_OUTCOMES: readonly SceneOutcome[] = ['success', 'partial', 'failure'];

/**
 * The outcomes an ordered route or outcome-rule table names explicitly.
 *
 * A route names its outcome in `on`, an outcome rule in `outcome`; the helper
 * reads whichever the entry carries, so both totality rules share one coverage
 * definition. An entry that names no known outcome (or is not an object)
 * contributes nothing, which keeps the helper total over an unvalidated
 * document.
 *
 * `on: "*"` is deliberately **not** expanded into the three outcomes: a
 * wildcard is a door for every outcome, and the routes rule must report that
 * distinctly from naming each outcome explicitly.
 *
 * @param entries Route or outcome-rule entries, in table order.
 * @returns The known outcomes the table names, in first-appearance order.
 */
export function coveredOutcomes(entries: readonly unknown[]): SceneOutcome[] {
  const covered: SceneOutcome[] = [];
  for (const entry of entries) {
    const named = stringMember(entry, 'on') ?? stringMember(entry, 'outcome');
    const outcome = SCENE_OUTCOMES.find((candidate) => candidate === named);
    if (outcome !== undefined && !covered.includes(outcome)) covered.push(outcome);
  }
  return covered;
}

/** The outcomes of {@link SCENE_OUTCOMES} a table does not name, in table order. */
function missingOutcomes(covered: readonly SceneOutcome[]): SceneOutcome[] {
  return SCENE_OUTCOMES.filter((outcome) => !covered.includes(outcome));
}

/** True when a route or rule entry declares a `when` gate (anything but absent). */
function isGated(node: ManifestLeafNode): boolean {
  return recordOf(node.value)?.when !== undefined;
}

/**
 * Reads an ordered table (`routes` / `outcomeRules`) that is a well-formed
 * table: an array whose every entry is an object.
 *
 * A member that is absent or not an array, or an array holding a non-object, is
 * the schema's finding rather than the totality rules': returning `undefined`
 * here is what keeps a structurally malformed manifest silent instead of noisy.
 * An **empty** array is still a table — it simply has no door or no rule — so
 * it is reported rather than skipped; the schema's `minItems: 1` is a separate
 * check the validator never relies on.
 */
function tableOf(
  scene: ManifestSceneNode,
  member: 'routes' | 'outcomeRules',
): readonly ManifestLeafNode[] | undefined {
  const entries = recordOf(scene.value)?.[member];
  if (!Array.isArray(entries)) return undefined;
  if (entries.some((entry) => recordOf(entry) === undefined)) return undefined;
  return member === 'routes' ? scene.routes : scene.outcomeRules;
}

/** The scene id a totality message names, falling back to the scene path. */
function sceneName(scene: ManifestSceneNode): string {
  return stringMember(scene.value, 'id') ?? scene.path;
}

/** The id a totality message names for a route/rule entry, falling back to its path. */
function entryName(node: ManifestLeafNode): string {
  return stringMember(node.value, 'id') ?? node.path;
}

/**
 * `non-total-outcome-rules`: every scene close classifies.
 *
 * A rule table is total when its **last** rule is unconditional (it is then the
 * catch-all: its declared `outcome` classifies every close the earlier rules
 * did not match) or when all three outcomes are named explicitly. The rule
 * therefore fires when coverage is incomplete **and** the last rule is gated by
 * a `when`, because that is the shape in which a close matching no rule
 * classifies as nothing. That is the structural reading of GDD §2.4 — totality
 * of *this tuning's* table, not a reachability proof (the scene-space guard,
 * `CG-0MWR0BG9H007AFNU`, owns reachability).
 *
 * An empty table has no catch-all at all and is always reported.
 */
function nonTotalOutcomeRuleFindings(traversal: EpisodeManifestTraversal): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const scene of traversal.scenes) {
    const rules = tableOf(scene, 'outcomeRules');
    if (rules === undefined) continue;
    const last = rules[rules.length - 1];
    if (last === undefined) {
      findings.push({
        code: 'non-total-outcome-rules',
        path: `${scene.path}.outcomeRules`,
        message: `Scene "${sceneName(scene)}" declares no outcome rules, so a scene close cannot be classified.`,
      });
      continue;
    }
    const covered = coveredOutcomes(rules.map((rule) => rule.value));
    const missing = missingOutcomes(covered);
    if (missing.length === 0 || !isGated(last)) continue;
    findings.push({
      code: 'non-total-outcome-rules',
      path: last.path,
      message:
        `Scene "${sceneName(scene)}" has no unconditional catch-all outcome rule: its table does not name ` +
        `${listed(missing)}, and the last rule "${entryName(last)}" is gated by a "when" condition, so a ` +
        'close that matches no rule classifies as nothing.',
    });
  }
  return findings;
}

/**
 * `non-total-routes`: every scene close has a door.
 *
 * A route table answers every close when it names all three outcomes or when
 * some route uses `on: "*"`. Independently of coverage, the **last** route must
 * be unconditional: a gated tail means a close that matched no earlier route
 * leaves the scene with no door. That is why the Appendix A `s-i-answer`
 * "safety net" (a gated wildcard followed by an unconditional `on: "*"`)
 * stays clean while a gated tail is refused.
 *
 * At most one finding is reported per scene — pointing at the gated tail when
 * that is the only defect, otherwise at the table — and the message names every
 * outcome the table does not serve. Totality here is structural (GDD §2.4),
 * not a reachability proof.
 */
function nonTotalRouteFindings(traversal: EpisodeManifestTraversal): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const scene of traversal.scenes) {
    const routes = tableOf(scene, 'routes');
    if (routes === undefined) continue;
    const covered = coveredOutcomes(routes.map((route) => route.value));
    const missing = missingOutcomes(covered);
    const hasWildcard = routes.some((route) => stringMember(route.value, 'on') === '*');
    const coverageGap = missing.length > 0 && !hasWildcard;
    const last = routes[routes.length - 1];
    const gatedTail = last !== undefined && isGated(last) ? last : undefined;
    if (!coverageGap && gatedTail === undefined) continue;
    const defects: string[] = [];
    if (coverageGap) {
      defects.push(`its routes do not name ${listed(missing)} and none answers on: "*"`);
    }
    if (gatedTail !== undefined) {
      defects.push(`the last route "${entryName(gatedTail)}" is gated by a "when" condition`);
    }
    findings.push({
      code: 'non-total-routes',
      path: coverageGap || gatedTail === undefined ? `${scene.path}.routes` : gatedTail.path,
      message:
        `Scene "${sceneName(scene)}" has no total route table: ${defects.join(', and ')}, so a close ` +
        'that matches no route leaves the scene with no door.',
    });
  }
  return findings;
}

// ── Rule predicates over the traversal ──────────────────────

/** A finding before its `manifestId` is attached and its order is settled. */
interface FindingDraft {
  readonly code: EpisodeManifestIssueCode;
  readonly path: string;
  readonly message: string;
  /** Stable reason code, forwarded onto {@link EpisodeManifestFinding.reason}. */
  readonly reason?: string;
}

/** A node's candidate key plus the path that addresses the key. */
interface KeyedCandidate<Key> {
  readonly path: string;
  readonly key: Key;
}

/** Reads a string member as a duplicate candidate. */
function keyedString(node: ManifestLeafNode, member: string): KeyedCandidate<string> | undefined {
  const key = stringMember(node.value, member);
  return key === undefined ? undefined : { path: `${node.path}.${member}`, key };
}

/** Reads a numeric member as a duplicate candidate. */
function keyedNumber(node: ManifestLeafNode, member: string): KeyedCandidate<number> | undefined {
  const key = numberMember(node.value, member);
  return key === undefined ? undefined : { path: `${node.path}.${member}`, key };
}

/** Reports every repetition of a key, naming the first declaration by path. */
function duplicateFindings<Key>(
  nodes: readonly ManifestLeafNode[],
  code: EpisodeManifestIssueCode,
  read: (node: ManifestLeafNode) => KeyedCandidate<Key> | undefined,
  describe: (key: Key, firstPath: string) => string,
): FindingDraft[] {
  const firstPaths = new Map<Key, string>();
  const findings: FindingDraft[] = [];
  for (const node of nodes) {
    const candidate = read(node);
    if (candidate === undefined) continue;
    const firstPath = firstPaths.get(candidate.key);
    if (firstPath === undefined) {
      firstPaths.set(candidate.key, candidate.path);
      continue;
    }
    findings.push({
      code,
      path: candidate.path,
      message: describe(candidate.key, firstPath),
    });
  }
  return findings;
}

/** `duplicate-act`: act ids, and act order, unique across the manifest. */
function duplicateActFindings(traversal: EpisodeManifestTraversal): FindingDraft[] {
  return [
    ...duplicateFindings(
      traversal.acts,
      'duplicate-act',
      (node) => keyedString(node, 'id'),
      (id, firstPath) => `Duplicate act id "${id}" (already declared at ${firstPath}).`,
    ),
    ...duplicateFindings(
      traversal.acts,
      'duplicate-act',
      (node) => keyedNumber(node, 'order'),
      (order, firstPath) =>
        `Duplicate act order ${order} (already used by ${firstPath}); act order is the only ordering authority.`,
    ),
  ];
}

/** `duplicate-scene`: scene ids unique across the episode, not just the act. */
function duplicateSceneFindings(traversal: EpisodeManifestTraversal): FindingDraft[] {
  return duplicateFindings(
    traversal.scenes,
    'duplicate-scene',
    (node) => keyedString(node, 'id'),
    (id, firstPath) =>
      `Duplicate scene id "${id}" (already declared at ${firstPath}); scene ids are unique across the episode.`,
  );
}

/** `duplicate-beat`: beat identity is the card id, unique across the episode. */
function duplicateBeatFindings(traversal: EpisodeManifestTraversal): FindingDraft[] {
  return duplicateFindings(
    traversal.beats,
    'duplicate-beat',
    (node) => keyedString(node, 'cardId'),
    (cardId, firstPath) =>
      `Duplicate beat card id "${cardId}" (already declared at ${firstPath}); a beat is identified by its card id.`,
  );
}

/**
 * `unknown-act` / `unknown-scene`: every act and scene reference resolves.
 *
 * A route target names its act and its scene explicitly, so each is checked
 * for existence on its own. `act.entryScene` names no act, so its act is
 * *implied* by where the scene lives: a scene that resolves into another act
 * means the act named by the entry point is wrong (`unknown-act`), while a
 * scene that resolves nowhere is `unknown-scene`.
 */
function unknownReferenceFindings(
  manifest: unknown,
  traversal: EpisodeManifestTraversal,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const actIds = idsOf(traversal.acts);
  const scenesById = new Map<string, ManifestSceneNode>();
  for (const scene of traversal.scenes) {
    const id = stringMember(scene.value, 'id');
    if (id !== undefined && !scenesById.has(id)) scenesById.set(id, scene);
  }

  const start = recordOf(manifest)?.start;
  const startAct = stringMember(start, 'act');
  if (startAct !== undefined && !actIds.has(startAct)) {
    findings.push({
      code: 'unknown-act',
      path: 'start.act',
      message: `start.act "${startAct}" does not name an act of this manifest (acts: ${listed(actIds)}).`,
    });
  }
  const startScene = stringMember(start, 'scene');
  if (startScene !== undefined && !scenesById.has(startScene)) {
    findings.push({
      code: 'unknown-scene',
      path: 'start.scene',
      message: `start.scene "${startScene}" does not name a scene of this manifest (scenes: ${listed(scenesById.keys())}).`,
    });
  }

  for (const act of traversal.acts) {
    const entryScene = stringMember(act.value, 'entryScene');
    if (entryScene === undefined) continue;
    if (act.scenes.some((scene) => stringMember(scene.value, 'id') === entryScene)) continue;
    const owner = scenesById.get(entryScene);
    findings.push(
      owner === undefined
        ? {
            code: 'unknown-scene',
            path: `${act.path}.entryScene`,
            message: `act.entryScene "${entryScene}" does not name a scene of this manifest (scenes: ${listed(scenesById.keys())}).`,
          }
        : {
            code: 'unknown-act',
            path: `${act.path}.entryScene`,
            message: `act.entryScene "${entryScene}" is a scene of ${owner.path}, not of ${act.path}.`,
          },
    );
  }

  for (const scene of traversal.scenes) {
    for (const route of scene.routes) {
      const to = recordOf(recordOf(route.value)?.to);
      if (stringMember(to, 'kind') !== 'beat') continue;
      const actId = stringMember(to, 'act');
      if (actId !== undefined && !actIds.has(actId)) {
        findings.push({
          code: 'unknown-act',
          path: `${route.path}.to.act`,
          message: `Route target act "${actId}" does not name an act of this manifest (acts: ${listed(actIds)}).`,
        });
      }
      const sceneId = stringMember(to, 'scene');
      if (sceneId !== undefined && !scenesById.has(sceneId)) {
        findings.push({
          code: 'unknown-scene',
          path: `${route.path}.to.scene`,
          message: `Route target scene "${sceneId}" does not name a scene of this manifest (scenes: ${listed(scenesById.keys())}).`,
        });
      }
    }
  }

  return findings;
}

/** The manifest-only rule families implemented at this commit; later children append here. */
const IMPLEMENTED_RULES: readonly EpisodeManifestRule[] = [
  'duplicate-act',
  'duplicate-scene',
  'duplicate-beat',
  'unknown-act',
  'unknown-scene',
  'non-total-routes',
  'non-total-outcome-rules',
];

/**
 * The resource-block rules, which need the content file's declared set bound.
 *
 * They are reported as run only when `declaredResources` is bound: without it
 * there is nothing to compare the manifest's declared set against, and a caller
 * must be able to tell a pass apart from a rule that could not run. The
 * structural half (start/bounds agreement) reads only manifest data, but it
 * shares this one activation seam so a resource finding is never emitted by a
 * validation that never claimed to check resources.
 */
const RESOURCE_RULES: readonly EpisodeManifestRule[] = ['resource-set-mismatch'];

/**
 * The declared resource keys a manifest declares, in declaration order.
 *
 * Reads the raw document through total accessors (string members only, trimmed,
 * blank/de-duplicated via the shared key normalisation), so an unvalidated
 * manifest yields fewer keys rather than an exception.
 */
function declaredResourceKeys(manifest: unknown): readonly string[] {
  const declared = recordOf(recordOf(manifest)?.resources)?.declared;
  return normaliseResourceKeys(
    arrayOf(declared).filter((key): key is string => typeof key === 'string'),
  );
}

/**
 * `resource-set-mismatch`: the manifest's resource block is internally
 * consistent and agrees with the content file's declared set.
 *
 * Six defects share the §2.4 code, each with its own `reason` so tooling (and
 * a reviewer) can tell them apart without parsing the message:
 *
 * | reason | meaning |
 * |---|---|
 * | `declared-set-mismatch` | `resources.declared` ≠ the content file's declared set |
 * | `irreversible-not-declared` | `resources.irreversible` names a key outside `declared` |
 * | `missing-start-entry` | a declared key has no finite `resources.start` value |
 * | `missing-bounds-entry` | a declared key has no finite `{ min, max }` bounds entry |
 * | `bounds-inverted` | a declared key's `bounds.min > bounds.max` |
 * | `start-outside-bounds` | a declared key's start value lies outside its own bounds |
 *
 * The set comparison is order-insensitive (both sides are normalised) and names
 * the keys missing from the manifest and the keys the manifest adds. The
 * structural checks read the manifest's own declarations through the shared
 * `readManifestStartBag` / `readManifestBounds` read-throughs, which fail closed:
 * a partly-readable block reports its issues rather than being defaulted.
 *
 * Reachability from the start bag is deliberately **not** checked here (the
 * scene-space guard owns it), and neither is clamping (the economy ledger owns
 * it); this rule only proves the declared resource block agrees with itself and
 * with the content file.
 *
 * @param manifest          The (possibly unvalidated) manifest document.
 * @param declaredResources The content file's declared key set.
 */
function resourceSetFindings(
  manifest: unknown,
  declaredResources: readonly string[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const resources = recordOf(recordOf(manifest)?.resources);
  const declared = declaredResourceKeys(manifest);
  const declaredSet = new Set(declared);

  // (1) The manifest's declared set against the content file's declared set.
  const expected = new Set(normaliseResourceKeys(declaredResources));
  const missing = [...expected].filter((key) => !declaredSet.has(key));
  const extra = declared.filter((key) => !expected.has(key));
  if (missing.length > 0 || extra.length > 0) {
    findings.push({
      code: 'resource-set-mismatch',
      path: 'resources.declared',
      reason: 'declared-set-mismatch',
      message:
        `resources.declared [${listed(declared)}] does not match the content file's declared set ` +
        `[${listed(expected)}]: missing ${listed(missing)}, extra ${listed(extra)}.`,
    });
  }

  // (2) The irreversible subset must be part of the declared set.
  arrayOf(resources?.irreversible).forEach((value, index) => {
    if (typeof value !== 'string') return;
    const key = value.trim();
    if (declaredSet.has(key)) return;
    findings.push({
      code: 'resource-set-mismatch',
      path: `resources.irreversible[${index}]`,
      reason: 'irreversible-not-declared',
      message:
        `resources.irreversible[${index}] names "${key}", which is not in ` +
        `resources.declared [${listed(declared)}], so the beat sheet would hold a loss-bearing key ` +
        'it never declared.',
    });
  });

  // (3) The run's starting bag: one finite value per declared key, no defaults.
  const startBag = readManifestStartBag(declared, resources?.start);
  if (!startBag.ok) {
    for (const issue of startBag.issues) {
      findings.push({
        code: 'resource-set-mismatch',
        path: `resources.start.${issue.key}`,
        reason: issue.reason,
        message:
          `Declared resource "${issue.key}" has no finite resources.start value, so the run's ` +
          'starting bag cannot be read from declared data (no default is substituted).',
      });
    }
  }

  // (4) The per-key design bounds: one well-ordered range per declared key.
  const bounds = readManifestBounds(declared, resources?.bounds);
  if (!bounds.ok) {
    for (const issue of bounds.issues) {
      findings.push({
        code: 'resource-set-mismatch',
        path: `resources.bounds.${issue.key}`,
        reason: issue.reason,
        message:
          issue.reason === 'bounds-inverted'
            ? `Declared resource "${issue.key}" has inverted design bounds (min > max), so no ` +
              'value can satisfy the declared range.'
            : `Declared resource "${issue.key}" has no finite { min, max } resources.bounds ` +
              'entry (no default range is substituted).',
      });
    }
  }

  // (5) The start bag must sit inside the bounds it was declared against.
  if (startBag.ok && bounds.ok) {
    for (const key of declared) {
      const value = startBag.bag[key];
      const range = bounds.bounds[key];
      if (value === undefined || range === undefined) continue;
      if (value >= range.min && value <= range.max) continue;
      findings.push({
        code: 'resource-set-mismatch',
        path: `resources.start.${key}`,
        reason: 'start-outside-bounds',
        message:
          `Declared resource "${key}" starts at ${value}, outside its own bounds ` +
          `[${range.min}, ${range.max}], so the run begins in a state the design forbids.`,
      });
    }
  }

  return findings;
}

/**
 * The card-resolution rules, which need the bound content as a second input.
 *
 * They are reported as run only when content is bound: without a card list
 * there is nothing to resolve against, and a caller must be able to tell a
 * pass apart from a rule that could not run.
 */
const CONTENT_RULES: readonly EpisodeManifestRule[] = [
  'unknown-card',
  'unassigned-card',
  'dangling-chain',
  'ending-successor',
];

/**
 * The adapter the validator uses when the caller binds no game adapter.
 *
 * Content files hold templates, so the identity function is the correct
 * base-id rule; a game carrying instance serials passes its own adapter.
 */
const IDENTITY_CONTENT_ADAPTER: ContentAdapter = {
  gameId: '',
  columns: [],
  fields: { id: 'id', name: 'name' },
};

/**
 * Orders findings by `path`, then `code`, then `reason` — the report's stable
 * total order.
 *
 * `reason` breaks the tie between two findings of the same code at the same
 * path (e.g. a missing start entry and an out-of-bounds start are distinct
 * paths, but a structural rule may legitimately report twice at one path), so
 * the order stays total and byte-stable.
 */
function compareFindings(left: EpisodeManifestFinding, right: EpisodeManifestFinding): number {
  if (left.path !== right.path) return left.path < right.path ? -1 : 1;
  if (left.code !== right.code) return left.code < right.code ? -1 : 1;
  const leftReason = left.reason ?? '';
  const rightReason = right.reason ?? '';
  if (leftReason !== rightReason) return leftReason < rightReason ? -1 : 1;
  return 0;
}

/**
 * Deduplicates (by `path` + `code`), attaches the manifest id and sorts.
 *
 * Ordering is a property of this collector rather than of each rule, so a new
 * rule cannot introduce a nondeterministic report.
 */
function collectFindings(
  manifestId: string,
  drafts: readonly FindingDraft[],
): EpisodeManifestFinding[] {
  const seen = new Set<string>();
  const findings: EpisodeManifestFinding[] = [];
  for (const draft of drafts) {
    const key = `${draft.code}\u0000${draft.path}\u0000${draft.reason ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      code: draft.code,
      path: draft.path,
      message: draft.message,
      ...(draft.reason === undefined ? {} : { reason: draft.reason }),
      manifestId,
    });
  }
  return findings.sort(compareFindings);
}

/**
 * The content-derived inputs every card-resolution rule reads.
 *
 * Built once per validation so each rule is a predicate over the same map:
 * `unknown-card` needs the resolvable id set, `unassigned-card` needs the
 * assigned set plus the episode's storylines, and both chaining rules need the
 * compiled successor lists.
 */
interface ContentResolutionIndex {
  /** Content cards by id (templates only; a base-id alias is added when it differs). */
  readonly cardsById: ReadonlyMap<string, ContentCard>;
  /** Successor ids per card id, compiled through the shared option seam. */
  readonly successorsById: ReadonlyMap<string, readonly string[]>;
  /** Every `beats[].cardId`, the episode's assigned beat set. */
  readonly assignedBeatIds: ReadonlySet<string>;
  /** Every `endings[]` entry, the episode's ending set. */
  readonly endingIds: ReadonlySet<string>;
  /** Storyline ids the episode's beats and endings belong to (unassigned-card scope). */
  readonly storylineIds: ReadonlySet<string>;
}

/** Reads a card's id, or `undefined` when the value is not a card-shaped object. */
function cardIdOf(value: unknown): string | undefined {
  const id = recordOf(value)?.id;
  return typeof id === 'string' ? id : undefined;
}

/** Reads a card's raw `options` cell, or `undefined` when not a string. */
function cardOptionsOf(value: unknown): string | undefined {
  const options = recordOf(value)?.options;
  return typeof options === 'string' ? options : undefined;
}

/**
 * Compiles a content card's successors through the shared content seam.
 *
 * Malformed encodings contribute no successors: the content validator reports
 * the malformation, and this validator must stay total.
 */
function compiledSuccessors(
  card: ContentCard,
  adapter: ContentAdapter,
): readonly string[] {
  const options = cardOptionsOf(card);
  if (options === undefined || options.trim() === '') return [];
  try {
    return compileContentOptions(card).flatMap((option) => optionSuccessorIds(option, adapter));
  } catch {
    return [];
  }
}

/** Builds the card-resolution index once per validation. */
function buildContentResolutionIndex(
  manifest: unknown,
  traversal: EpisodeManifestTraversal,
  cards: readonly ContentCard[],
  adapter: ContentAdapter,
): ContentResolutionIndex {
  const cardsById = new Map<string, ContentCard>();
  const successorsById = new Map<string, readonly string[]>();
  for (const card of cards) {
    const id = cardIdOf(card);
    if (id === undefined) continue;
    cardsById.set(id, card);
    const base = baseIdOf(adapter, id);
    if (!cardsById.has(base)) cardsById.set(base, card);
    const successors = compiledSuccessors(card, adapter);
    for (const key of new Set([id, base])) successorsById.set(key, successors);
  }

  const assignedBeatIds = new Set<string>();
  for (const beat of traversal.beats) {
    const id = stringMember(beat.value, 'cardId');
    if (id !== undefined) assignedBeatIds.add(id);
  }
  const endingIds = new Set<string>();
  for (const id of endingIdsOf(manifest)) endingIds.add(id);

  const storylineIds = new Set<string>();
  for (const id of [...assignedBeatIds, ...endingIds]) {
    const storylineId = cardsById.get(id)?.storylineId;
    if (typeof storylineId === 'string') storylineIds.add(storylineId);
  }

  return { cardsById, successorsById, assignedBeatIds, endingIds, storylineIds };
}

/** The `endings[]` string entries, in declaration order. */
function endingIdsOf(manifest: unknown): string[] {
  return arrayOf(recordOf(manifest)?.endings).filter(
    (value): value is string => typeof value === 'string',
  );
}

/** The `endings[]` entries paired with the manifest path that addresses each. */
function endingEntries(manifest: unknown): { path: string; id: string }[] {
  return arrayOf(recordOf(manifest)?.endings).flatMap((value, index) =>
    typeof value === 'string' ? [{ path: `endings[${index}]`, id: value }] : [],
  );
}

/**
 * `unknown-card`: every card reference resolves in the bound content file.
 *
 * Covers `beats[].cardId`, `start.beat`, `endings[]`, `{kind:'ending'}` route
 * `cardId` and `{kind:'beat'}` route `beat` (GDD §2.4). The finding's `path`
 * points at the offending field, so a reviewer edits the manifest reference
 * rather than searching for the id.
 */
function unknownCardFindings(
  manifest: unknown,
  traversal: EpisodeManifestTraversal,
  index: ContentResolutionIndex,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const report = (path: string, cardId: string, where: string): void => {
    findings.push({
      code: 'unknown-card',
      path,
      message: `${where} names card id "${cardId}", which is not in the bound content file.`,
    });
  };

  for (const beat of traversal.beats) {
    const cardId = stringMember(beat.value, 'cardId');
    if (cardId !== undefined && !index.cardsById.has(cardId)) {
      report(`${beat.path}.cardId`, cardId, 'This beat');
    }
  }

  const startBeat = stringMember(recordOf(manifest)?.start, 'beat');
  if (startBeat !== undefined && !index.cardsById.has(startBeat)) {
    report('start.beat', startBeat, 'start.beat');
  }

  for (const entry of endingEntries(manifest)) {
    if (!index.cardsById.has(entry.id)) report(entry.path, entry.id, 'This ending');
  }

  for (const scene of traversal.scenes) {
    for (const route of scene.routes) {
      const to = recordOf(recordOf(route.value)?.to);
      const kind = stringMember(to, 'kind');
      const member = kind === 'ending' ? 'cardId' : kind === 'beat' ? 'beat' : undefined;
      if (member === undefined) continue;
      const cardId = stringMember(to, member);
      if (cardId !== undefined && !index.cardsById.has(cardId)) {
        report(`${route.path}.to.${member}`, cardId, 'This route target');
      }
    }
  }

  return findings;
}

/**
 * `unassigned-card`: no choice card of the episode's storyline is orphaned.
 *
 * The scope is the storyline the episode's beats and endings belong to (the
 * same `storylineId` grouping the guard and `storylineEntryCards` use), so a
 * shared content file carrying another storyline's cards never produces noise.
 * The finding names the orphan card through the manifest's content binding
 * (`content.<cardId>`) because the defect is a missing assignment, not a
 * malformed manifest field.
 */
function unassignedCardFindings(
  cards: readonly ContentCard[],
  index: ContentResolutionIndex,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  if (index.storylineIds.size === 0) return findings;
  for (const card of cards) {
    const id = cardIdOf(card);
    const options = cardOptionsOf(card);
    if (id === undefined || options === undefined || options.trim() === '') continue;
    const storylineId = recordOf(card)?.storylineId;
    if (typeof storylineId !== 'string' || !index.storylineIds.has(storylineId)) continue;
    if (index.assignedBeatIds.has(id) || index.endingIds.has(id)) continue;
    findings.push({
      code: 'unassigned-card',
      path: `content.${id}`,
      message:
        `Choice card "${id}" of storyline "${storylineId}" is neither a beat nor an ending ` +
        'of this episode, so no play path can reach it.',
    });
  }
  return findings;
}

/** True when a successor id resolves to an assigned beat or an ending. */
function isAssignedTarget(target: string, index: ContentResolutionIndex): boolean {
  return index.assignedBeatIds.has(target) || index.endingIds.has(target);
}

/** The distinct successors of a card that resolve to neither a beat nor an ending. */
function danglingSuccessors(
  cardId: string,
  index: ContentResolutionIndex,
): readonly string[] {
  const successors = index.successorsById.get(cardId) ?? [];
  return [...new Set(successors)].filter((target) => !isAssignedTarget(target, index));
}

/**
 * `dangling-chain`: a scene with a chain route has only resolvable successors.
 *
 * Every beat of such a scene is checked, because the chain route continues from
 * whichever beat the scene closes on; a successor that is neither an assigned
 * beat nor an ending would leave the route with nothing to target.
 */
function danglingChainFindings(
  traversal: EpisodeManifestTraversal,
  index: ContentResolutionIndex,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const scene of traversal.scenes) {
    const chainRoute = scene.routes.find(
      (route) => stringMember(recordOf(recordOf(route.value)?.to), 'kind') === 'chain',
    );
    if (chainRoute === undefined) continue;
    const sceneId = stringMember(scene.value, 'id') ?? scene.path;
    for (const beat of scene.beats) {
      const cardId = stringMember(beat.value, 'cardId');
      // An unresolved beat is `unknown-card`'s finding; it has no successors to read.
      if (cardId === undefined || !index.cardsById.has(cardId)) continue;
      const dangling = danglingSuccessors(cardId, index);
      if (dangling.length === 0) continue;
      findings.push({
        code: 'dangling-chain',
        path: `${beat.path}.cardId`,
        message:
          `Scene "${sceneId}" opens a chain route (${chainRoute.path}), but beat "${cardId}" ` +
          `can reach ${listed(dangling)}, which resolves to neither a beat nor an ending of ` +
          'this episode.',
      });
    }
  }
  return findings;
}

/**
 * `ending-successor`: an ending's successors, if any, feed the reset loop.
 *
 * A successor must resolve to an assigned beat (the loop back into the
 * episode) or another ending; an ending with no successors is terminal and
 * silent by design.
 */
function endingSuccessorFindings(
  manifest: unknown,
  index: ContentResolutionIndex,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of endingEntries(manifest)) {
    // An unresolved ending is `unknown-card`'s finding; it has no successors to read.
    if (!index.cardsById.has(entry.id)) continue;
    const dangling = danglingSuccessors(entry.id, index);
    if (dangling.length === 0) continue;
    findings.push({
      code: 'ending-successor',
      path: entry.path,
      message:
        `Ending "${entry.id}" declares successor(s) ${listed(dangling)}, which resolve to ` +
        'neither a beat nor another ending, so the reset loop cannot continue.',
    });
  }
  return findings;
}

/**
 * Validates an episode manifest's identity, scope and card resolution (GDD §2.4).
 *
 * Pure and total: the document is inspected, never mutated, and any value —
 * including a malformed manifest — yields findings rather than an exception.
 * Deterministic: no clock, RNG or ambient state is read, and findings are
 * sorted by `path` then `code`, so the text and JSON reports are byte-identical
 * across runs.
 *
 * The card-resolution rules run only when content is bound (`contentCards` is
 * not `undefined`). An absent binding means "no content to resolve against", so
 * those rules are neither run nor reported; an explicitly empty list is a bound
 * content file with no cards, and every reference is then `unknown-card`.
 *
 * The resource rules follow the same seam: they run only when
 * `declaredResources` is bound. An explicitly **empty** declared set is a bound
 * content file that declares no keys, and it is honoured as-is (every manifest
 * key is then extra) — the engine's `coins` / `reputation` projection is never
 * substituted for it here.
 *
 * @param manifest          The (possibly unvalidated) manifest document.
 * @param contentCards      Bound content cards — the input the card-resolution
 *                          rules read (CG-0MWSJYGEG007WOIU). Omit it to run the
 *                          manifest-only rules.
 * @param declaredResources The content file's declared resource keys — the
 *                          single source of the declared set for the resource
 *                          rules (CG-0MWSJYLZ3005C2V1). Omit it to skip them.
 * @param adapter           The game content adapter (its `baseId` rule); defaults
 *                          to the identity rule, which is right for template-only
 *                          content files.
 * @returns The findings, the rules that ran and the traversal counts.
 */
export function validateEpisodeManifest(
  manifest: unknown,
  contentCards?: readonly ContentCard[],
  declaredResources?: readonly string[],
  adapter: ContentAdapter = IDENTITY_CONTENT_ADAPTER,
): EpisodeManifestValidationResult {
  const traversal = walkEpisodeManifest(manifest);
  const manifestId = stringMember(manifest, 'id') ?? '';
  const contentIndex =
    contentCards === undefined
      ? undefined
      : buildContentResolutionIndex(manifest, traversal, contentCards, adapter);
  const contentRuleFindings =
    contentIndex === undefined
      ? []
      : [
          ...unknownCardFindings(manifest, traversal, contentIndex),
          ...unassignedCardFindings(contentCards ?? [], contentIndex),
          ...danglingChainFindings(traversal, contentIndex),
          ...endingSuccessorFindings(manifest, contentIndex),
        ];
  const findings = collectFindings(manifestId, [
    ...duplicateActFindings(traversal),
    ...duplicateSceneFindings(traversal),
    ...duplicateBeatFindings(traversal),
    ...unknownReferenceFindings(manifest, traversal),
    ...nonTotalRouteFindings(traversal),
    ...nonTotalOutcomeRuleFindings(traversal),
    ...contentRuleFindings,
    ...(declaredResources === undefined ? [] : resourceSetFindings(manifest, declaredResources)),
  ]);

  return {
    manifestId,
    findings,
    rules: [
      ...IMPLEMENTED_RULES,
      ...(contentIndex === undefined ? [] : CONTENT_RULES),
      ...(declaredResources === undefined ? [] : RESOURCE_RULES),
    ],
    counts: {
      acts: traversal.acts.length,
      scenes: traversal.scenes.length,
      beats: traversal.beats.length,
    },
    valid: findings.length === 0,
  };
}

/**
 * Renders the human-readable report, in the shape `content/validate.ts` uses.
 *
 * @param result The validation result.
 * @returns Newline-joined report text (no trailing newline).
 */
export function formatEpisodeManifestReport(result: EpisodeManifestValidationResult): string {
  const lines: string[] = [];
  lines.push('Episode manifest validation report');
  lines.push('===================================');
  lines.push(`Manifest: ${result.manifestId === '' ? '(unnamed)' : result.manifestId}`);
  lines.push(
    `Traversed: ${result.counts.acts} act(s), ${result.counts.scenes} scene(s), ${result.counts.beats} beat(s)`,
  );
  lines.push(
    `Rules (${result.rules.length}): ${result.rules.length === 0 ? '(none)' : result.rules.join(', ')}`,
  );
  lines.push('');
  if (result.findings.length === 0) {
    lines.push('ERRORS (0): none');
  } else {
    lines.push(`ERRORS (${result.findings.length}):`);
    for (const finding of result.findings) {
      const reason = finding.reason === undefined ? '' : ` (${finding.reason})`;
      lines.push(`  ✗ [${finding.code}]${reason} ${finding.path}: ${finding.message}`);
    }
  }
  lines.push('');
  lines.push(result.valid ? 'RESULT: VALID' : 'RESULT: INVALID');
  return lines.join('\n');
}

/**
 * Renders the stable JSON report (for tooling/CI consumption).
 *
 * The `findings` array is the same data the text report renders, so the two
 * reports always agree; the key order is fixed and no timestamp is emitted, so
 * a committed report is byte-comparable.
 *
 * @param result The validation result.
 * @returns Pretty-printed JSON.
 */
export function episodeManifestValidationToJson(result: EpisodeManifestValidationResult): string {
  return JSON.stringify(
    {
      valid: result.valid,
      manifestId: result.manifestId,
      counts: result.counts,
      rules: result.rules,
      findings: result.findings,
    },
    null,
    2,
  );
}
