/**
 * Authored-content route-space guard.
 *
 * The static validator ([`./validate`](./validate.ts)) proves a content file is
 * *well formed*: ids resolve, options parse, resources are declared, every
 * card is reachable from its story-line entry. It cannot tell a writer whether
 * an authored branch is **playable to an ending** — a cost gate can leave an
 * option reachable but unwinnable, and a cosmetic choice can undo its own
 * consequence one beat later.
 *
 * This module answers that question by enumerating the **playable route space**
 * of a content file: the same affordability-aware depth-first walk the
 * Long Erasure playtest harness (`scripts/long-erasure-playtest.ts`) uses for
 * its route-space measurements, generalised over any {@link ContentAdapter} so
 * it works on authored content rather than one game's state.
 *
 * Three authored-content invariants are asserted:
 *
 * | Invariant | Meaning |
 * |---|---|
 * | `gated-branch-survivable` | Every **state-gated** option (a `#cost` affordability gate, a `#when` successor rule, or both) can be taken on at least one route that reaches an ending. |
 * | `ending-reachable` | Every ending is reachable on the playable route space. |
 * | `consequential-rejoin` | Every choice **marked consequential** stays distinct from its alternatives for at least the minimum rejoin distance (in beats entered after the fork). |
 *
 * ## Marking choices and endings
 *
 * Two annotation columns are read from the card's own extra fields (they are
 * ordinary adapter-agnostic columns; the runtime ignores them and the static
 * validator does not require them):
 *
 * - `consequential` — the option label(s) whose consequences must persist
 *   (`|`, `;` or `,` separated), or `*` for every option on the card.
 * - `ending` — a card that counts as an ending (`1`, `true`, `yes`, `ending`).
 *   When **no** card is marked, endings default to the structural terminals
 *   (cards with no outgoing successor).
 *
 * Both column names are overridable through {@link ContentGuardOptions}.
 *
 * ## Bounds
 *
 * The enumeration is bounded (`maxDepth` beats per route, `maxStates` explored
 * states) because a cycle that also grows a resource has no finite state
 * space. A bound being hit is reported (`exploration.truncated`) and makes the
 * report **invalid**: the guard fails closed rather than claiming an invariant
 * it could not check. Cycles that do not change a declared resource terminate
 * naturally through state revisits, so a reset ending is an ordinary shape.
 *
 * Nothing here imports a game module or Phaser, and nothing here mutates the
 * cards it inspects.
 *
 * @module
 */

import { isOptionAffordable } from '../compile';
import { evaluateCondition } from '../resolve';
import {
  readResource,
  resolveResourceKeys,
  type StorylineResourceKey,
  type StorylineResources,
} from '../resources';
import type { StorylineOption } from '../types';
import { cardsFromCsv, compileContentOptions, optionSuccessorIds, parseCsv } from './csv';
import { baseIdOf, type ContentAdapter, type ContentCard } from './types';

/** Default minimum rejoin distance (beats) for a marked consequential choice. */
export const DEFAULT_MIN_REJOIN_DISTANCE = 2;

/** Default bound on the beats entered along one route. */
export const DEFAULT_GUARD_MAX_DEPTH = 48;

/** Default bound on the number of explored route states. */
export const DEFAULT_GUARD_MAX_STATES = 20_000;

/** Default CSV column naming the option labels whose consequences must persist. */
export const CONSEQUENTIAL_COLUMN = 'consequential';

/** Default CSV column marking a card as an ending. */
export const ENDING_COLUMN = 'ending';

/** The invariant a {@link ContentGuardViolation} belongs to. */
export type ContentGuardInvariant =
  | 'gated-branch-survivable'
  | 'ending-reachable'
  | 'consequential-rejoin';

/** A single invariant violation, carrying the facts a writer needs to fix it. */
export interface ContentGuardViolation {
  /** Which of the three invariants the fault breaks. */
  readonly invariant: ContentGuardInvariant;
  /** The (base) card id the fault is scoped to. */
  readonly cardId: string;
  /** The offending option label, when the fault is option-scoped. */
  readonly option?: string;
  /** The ending that could not be reached, when the fault is ending-scoped. */
  readonly endingId?: string;
  /** The measured rejoin distance, when the fault is a rejoin fault. */
  readonly distance?: number;
  /** The configured minimum rejoin distance, when the fault is a rejoin fault. */
  readonly minimum?: number;
  /** Human-readable explanation naming the offending card/option/ending. */
  readonly message: string;
}

/** The kind of state gate on an option. */
export type ContentGuardGateKind = 'cost' | 'when' | 'both';

/** One state-gated option and whether it pays out. */
export interface ContentGuardGatedBranch {
  /** The card offering the gated option. */
  readonly cardId: string;
  /** The gated option's label. */
  readonly option: string;
  /** Why the option is state-gated. */
  readonly gate: ContentGuardGateKind;
  /** True when at least one route takes the option *and* reaches an ending. */
  readonly survivable: boolean;
  /** The first ending reached after taking the option, when survivable. */
  readonly endingId: string | null;
  /** A representative route (card ids) from the entry to that ending. */
  readonly path: readonly string[];
}

/** One ending and whether a playable route reaches it. */
export interface ContentGuardEnding {
  /** The ending card id. */
  readonly endingId: string;
  /** True when the playable enumeration enters the ending. */
  readonly reachable: boolean;
  /** A representative route (card ids) from an entry to the ending. */
  readonly path: readonly string[];
}

/** One choice marked consequential and its measured rejoin distance. */
export interface ContentGuardConsequentialChoice {
  /** The card offering the marked choice. */
  readonly cardId: string;
  /** The marked option label. */
  readonly option: string;
  /**
   * The shortest rejoin distance against any alternative option, in beats
   * entered after the fork (`1` = every branch shares the very next beat).
   * `null` means the branches never rejoin (the choice keeps its consequence).
   */
  readonly distance: number | null;
  /** True when `distance` is `null` or at least the configured minimum. */
  readonly meetsMinimum: boolean;
}

/** Options for {@link evaluateContentGuard}. */
export interface ContentGuardOptions {
  /**
   * Starting resource bag. Declared keys absent from the bag start at `0`
   * (the engine's own rule); undeclared keys are ignored.
   */
  readonly initialResources?: Readonly<Record<string, number>>;
  /**
   * Explicit entry card ids. Defaults to every **root** — a card that is no
   * other card's successor — falling back to every card when the graph is a
   * pure cycle.
   */
  readonly entryIds?: readonly string[];
  /** Minimum rejoin distance (beats) for a marked choice. Default `2`. */
  readonly minRejoinDistance?: number;
  /** Bound on the beats entered along one route. Default `48`. */
  readonly maxDepth?: number;
  /** Bound on explored route states. Default `20000`. */
  readonly maxStates?: number;
  /** CSV column naming the consequential option labels. Default `consequential`. */
  readonly consequentialColumn?: string;
  /** CSV column marking a card as an ending. Default `ending`. */
  readonly endingColumn?: string;
  /**
   * Explicit ending card ids, when the annotations live outside the content
   * file (e.g. a game that identifies endings by its own act column).
   * Precedence: explicit ids > the `ending` column > structural terminals.
   */
  readonly endings?: readonly string[];
}

/** The full guard result. */
export interface ContentGuardReport {
  /** True when no violation, no content error and no bound was hit. */
  readonly valid: boolean;
  /** The adapter's game id (provenance in JSON reports). */
  readonly gameId: string;
  /** Number of content cards inspected. */
  readonly cardCount: number;
  /** Number of cards presenting at least one option. */
  readonly choiceCardCount: number;
  /** The entry card ids the enumeration started from. */
  readonly entryIds: readonly string[];
  /** Every ending the guard checked. */
  readonly endingIds: readonly string[];
  /** True when at least one card carried an explicit `ending` annotation. */
  readonly endingsAnnotated: boolean;
  /** The effective starting bag, one entry per declared resource key. */
  readonly initialResources: StorylineResources;
  /** The declared resource key set the affordability gate operates over. */
  readonly resourceKeys: readonly StorylineResourceKey[];
  /** The configured minimum rejoin distance. */
  readonly minRejoinDistance: number;
  /** Every state-gated option, in card order. */
  readonly gatedBranches: readonly ContentGuardGatedBranch[];
  /** Every ending, in card order. */
  readonly endings: readonly ContentGuardEnding[];
  /** Every marked consequential choice, in card order. */
  readonly consequentialChoices: readonly ContentGuardConsequentialChoice[];
  /** Every invariant violation. */
  readonly violations: readonly ContentGuardViolation[];
  /** Non-fatal observations (unmarked choices, bound notices, …). */
  readonly warnings: readonly string[];
  /** Content that could not be compiled (the guard cannot inspect it). */
  readonly errors: readonly string[];
  /** Route-space exploration accounting. */
  readonly exploration: {
    /** Distinct `(card, resource bag)` states explored. */
    readonly statesVisited: number;
    /** True when a depth/state bound cut the exploration short. */
    readonly truncated: boolean;
  };
}

const TRUTHY_ANNOTATION = new Set(['1', 'true', 'yes', 'y', 'ending', 'end']);

/** Reads a truthy annotation cell (`1`, `true`, `yes`, `ending`). */
function isTruthyAnnotation(value: string | undefined): boolean {
  if (value === undefined) return false;
  return TRUTHY_ANNOTATION.has(value.trim().toLowerCase());
}

/** Splits an annotation cell into trimmed, non-empty labels. */
function annotationLabels(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(/[|;,]/)
    .map((label) => label.trim())
    .filter((label) => label !== '');
}

/** One compiled option plus the guard's structural view of it. */
interface OptionModel {
  readonly label: string;
  readonly option: StorylineOption<unknown>;
  /** The cost/when gates that make this option state-dependent. */
  readonly gate: ContentGuardGateKind | null;
  /**
   * Every successor the option can reach **ignoring conditions and
   * affordability** (`#when` targets included), as base ids.
   */
  readonly structuralTargets: readonly string[];
}

/** One content card plus its compiled options. */
interface CardModel {
  readonly card: ContentCard;
  readonly options: readonly OptionModel[];
  /** Union of every option's structural targets. */
  readonly structuralTargets: ReadonlySet<string>;
}

/** The gate kind of an option (`null` when it is not state-gated). */
function gateKindOf(option: StorylineOption<unknown>): ContentGuardGateKind | null {
  const hasCost = Object.values(option.cost ?? {}).some(
    (value) => typeof value === 'number' && Number.isFinite(value) && value !== 0,
  );
  const hasWhen = (option.conditionalSuccessors ?? []).length > 0;
  if (hasCost && hasWhen) return 'both';
  if (hasCost) return 'cost';
  if (hasWhen) return 'when';
  return null;
}

/** Every structural successor of an option, as base ids. */
function structuralTargetsOf(
  option: StorylineOption<unknown>,
  adapter: ContentAdapter,
): string[] {
  const targets = new Set<string>();
  for (const rule of option.conditionalSuccessors ?? []) {
    if (rule.successorId) targets.add(baseIdOf(adapter, rule.successorId));
  }
  for (const id of optionSuccessorIds(option, adapter)) targets.add(id);
  return [...targets];
}

/** Builds the guard's compiled card models, recording unparseable content. */
function buildModels(
  cards: readonly ContentCard[],
  adapter: ContentAdapter,
  errors: string[],
): Map<string, CardModel> {
  const models = new Map<string, CardModel>();
  for (const card of cards) {
    let compiled: StorylineOption<unknown>[];
    try {
      compiled = compileContentOptions(card);
    } catch (error) {
      errors.push(
        `Card "${card.id}" has an unparseable options column: ${(error as Error).message}`,
      );
      compiled = [];
    }
    const options = compiled.map<OptionModel>((option) => ({
      label: option.label,
      option,
      gate: gateKindOf(option),
      structuralTargets: structuralTargetsOf(option, adapter),
    }));
    const structuralTargets = new Set<string>();
    for (const option of options) {
      for (const target of option.structuralTargets) structuralTargets.add(target);
    }
    models.set(card.id, { card, options, structuralTargets });
  }
  return models;
}

/** A deterministic key for a `(card, declared resource bag)` state. */
function stateKey(
  cardId: string,
  bag: StorylineResources,
  declared: readonly StorylineResourceKey[],
): string {
  const values = declared.map((key) => `${key}=${readResource(bag, key)}`);
  return `${cardId}|${values.join(',')}`;
}

/** One playable transition: the resulting bag and its possible successors. */
interface Transition {
  readonly bag: StorylineResources;
  /** Successor base ids; `[]` means the chain ends on the current card. */
  readonly targets: readonly string[];
}

/**
 * Applies one option to a resource bag, mirroring runtime resolution.
 *
 * Returns `null` when the option is unaffordable (a hidden option). The
 * successor follows the documented precedence: the first matching `#when`
 * rule, then the candidate set / single successor.
 */
function transitionOf(
  option: StorylineOption<unknown>,
  bag: StorylineResources,
  declared: readonly StorylineResourceKey[],
  adapter: ContentAdapter,
): Transition | null {
  if (!isOptionAffordable(option, bag, declared)) return null;

  const next: Record<string, number> = { ...bag };
  for (const key of declared) {
    const cost = option.cost?.[key];
    const extra = option.extraEffect?.[key];
    next[key] =
      readResource(bag, key) -
      (typeof cost === 'number' && Number.isFinite(cost) ? cost : 0) +
      (typeof extra === 'number' && Number.isFinite(extra) ? extra : 0);
  }

  const rules = option.conditionalSuccessors ?? [];
  if (rules.length > 0) {
    const match = rules.find((rule) => evaluateCondition(rule.when, next));
    if (match !== undefined) {
      return {
        bag: next,
        targets: match.successorId ? [baseIdOf(adapter, match.successorId)] : [],
      };
    }
  }
  return { bag: next, targets: optionSuccessorIds(option, adapter) };
}

/** Shared, mutable search accounting for one guard run. */
interface SearchContext {
  readonly models: ReadonlyMap<string, CardModel>;
  readonly endings: ReadonlySet<string>;
  readonly declared: readonly StorylineResourceKey[];
  readonly adapter: ContentAdapter;
  readonly maxDepth: number;
  readonly maxStates: number;
  statesVisited: number;
  truncated: boolean;
}

/** One reachable route state, kept for the gated-branch scan. */
interface ExploredState {
  readonly cardId: string;
  readonly bag: StorylineResources;
  readonly path: readonly string[];
}

/**
 * The outcome of a payoff query.
 *
 * `none` means the query completed and no ending is reachable; `exhausted`
 * means a bound cut the query short, so the invariant is **unproven** (never
 * reported as a violation — `truncated` already fails the report).
 */
type EndingSearch =
  | { readonly status: 'found'; readonly endingId: string; readonly path: string[] }
  | { readonly status: 'none' }
  | { readonly status: 'exhausted' };

/** Counts one explored state for the report (no shared budget). */
function chargeState(ctx: SearchContext): void {
  ctx.statesVisited += 1;
}

/** Key an explored state for the per-query visited set. */
function exploredKey(
  cardId: string,
  bag: StorylineResources,
  declared: readonly StorylineResourceKey[],
): string {
  return stateKey(cardId, bag, declared);
}

/**
 * Finds the first ending reachable from a state, depth- and state-bounded.
 *
 * Each query gets its own state budget so one exhaustive main exploration
 * cannot starve the per-branch payoff checks.
 */
function findEnding(
  ctx: SearchContext,
  startCardId: string,
  startBag: StorylineResources,
): EndingSearch {
  const visited = new Set<string>();
  const stack: { cardId: string; bag: StorylineResources; path: string[] }[] = [
    { cardId: startCardId, bag: startBag, path: [startCardId] },
  ];
  let exhausted = false;

  while (stack.length > 0) {
    if (visited.size >= ctx.maxStates) {
      exhausted = true;
      break;
    }
    const current = stack.pop()!;
    const key = exploredKey(current.cardId, current.bag, ctx.declared);
    if (visited.has(key)) continue;
    visited.add(key);
    chargeState(ctx);

    if (ctx.endings.has(current.cardId)) {
      return { status: 'found', endingId: current.cardId, path: current.path };
    }
    if (current.path.length > ctx.maxDepth) {
      exhausted = true;
      continue;
    }
    const model = ctx.models.get(current.cardId);
    if (model === undefined) continue;

    for (const option of model.options) {
      const transition = transitionOf(option.option, current.bag, ctx.declared, ctx.adapter);
      if (transition === null) continue;
      for (const target of transition.targets) {
        if (!ctx.models.has(target)) continue;
        stack.push({
          cardId: target,
          bag: transition.bag,
          path: [...current.path, target],
        });
      }
    }
  }
  if (exhausted) {
    ctx.truncated = true;
    return { status: 'exhausted' };
  }
  return { status: 'none' };
}

/**
 * Enumerates the playable route space from the entry cards.
 *
 * Records every ending reached, and every reachable `(card, bag)` state so a
 * gated option's payoff can be audited from each state that offers it.
 */
function exploreRoutes(
  ctx: SearchContext,
  entryIds: readonly string[],
  initialBag: StorylineResources,
): { endings: Map<string, string[]>; states: ExploredState[] } {
  const visited = new Set<string>();
  const endings = new Map<string, string[]>();
  const states: ExploredState[] = [];
  const stack: ExploredState[] = entryIds.map((cardId) => ({
    cardId,
    bag: initialBag,
    path: [cardId],
  }));

  while (stack.length > 0) {
    if (visited.size >= ctx.maxStates) {
      ctx.truncated = true;
      break;
    }
    const current = stack.pop()!;
    const key = exploredKey(current.cardId, current.bag, ctx.declared);
    if (visited.has(key)) continue;
    visited.add(key);
    chargeState(ctx);
    states.push(current);

    if (ctx.endings.has(current.cardId)) {
      if (!endings.has(current.cardId)) endings.set(current.cardId, [...current.path]);
      continue;
    }
    const model = ctx.models.get(current.cardId);
    if (model === undefined) continue;
    if (current.path.length > ctx.maxDepth) {
      ctx.truncated = true;
      continue;
    }

    for (const option of model.options) {
      const transition = transitionOf(option.option, current.bag, ctx.declared, ctx.adapter);
      if (transition === null) continue;
      for (const target of transition.targets) {
        if (!ctx.models.has(target)) continue;
        stack.push({
          cardId: target,
          bag: transition.bag,
          path: [...current.path, target],
        });
      }
    }
  }
  return { endings, states };
}

/** The structural BFS levels of a set of starting cards (gates ignored). */
function closureLevels(
  startIds: readonly string[],
  models: ReadonlyMap<string, CardModel>,
): string[][] {
  const seen = new Set<string>(startIds);
  const levels: string[][] = [startIds.filter((id) => models.has(id))];
  let frontier = [...levels[0]];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      const model = models.get(id);
      if (model === undefined) continue;
      for (const target of model.structuralTargets) {
        if (!models.has(target) || seen.has(target)) continue;
        seen.add(target);
        next.push(target);
      }
    }
    if (next.length === 0) break;
    levels.push(next);
    frontier = next;
  }
  return levels;
}

/**
 * The shortest rejoin distance between two option target sets, in beats
 * entered after the fork (`1` = the branches share the very next beat).
 *
 * `null` means the closures never meet (the branches never rejoin).
 */
function rejoinDistance(
  left: readonly string[],
  right: readonly string[],
  models: ReadonlyMap<string, CardModel>,
): number | null {
  const leftLevels = closureLevels(left, models);
  const rightLevels = closureLevels(right, models);
  const depth = Math.max(leftLevels.length, rightLevels.length);
  const leftSeen = new Set<string>();
  const rightSeen = new Set<string>();

  for (let level = 0; level < depth; level += 1) {
    for (const id of leftLevels[level] ?? []) leftSeen.add(id);
    for (const id of rightLevels[level] ?? []) rightSeen.add(id);
    for (const id of leftSeen) {
      if (rightSeen.has(id)) return level + 1;
    }
  }
  return null;
}

/**
 * Evaluates the three authored-content invariants over compiled content cards.
 *
 * Pure: never mutates the cards, never throws. A card whose options cannot be
 * compiled is reported in {@link ContentGuardReport.errors} and makes the
 * report invalid (the guard cannot inspect it).
 *
 * @param cards   The content cards (through any {@link ContentAdapter}).
 * @param adapter The adapter they were read through (its `baseId` rule is used).
 * @param options Optional guard configuration.
 * @returns The full report.
 */
export function evaluateContentGuard(
  cards: readonly ContentCard[],
  adapter: ContentAdapter,
  options: ContentGuardOptions = {},
): ContentGuardReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const models = buildModels(cards, adapter, errors);

  const declaredKeys = cards.flatMap((card) => card.resourceKeys);
  const declared = resolveResourceKeys(declaredKeys.length > 0 ? declaredKeys : undefined);
  const minRejoinDistance = options.minRejoinDistance ?? DEFAULT_MIN_REJOIN_DISTANCE;
  const maxDepth = options.maxDepth ?? DEFAULT_GUARD_MAX_DEPTH;
  const maxStates = options.maxStates ?? DEFAULT_GUARD_MAX_STATES;

  const initialBag: Record<string, number> = {};
  for (const key of declared) initialBag[key] = readResource(options.initialResources ?? {}, key);

  // ── Endings ──────────────────────────────────────────────────
  const endingColumn = options.endingColumn ?? ENDING_COLUMN;
  const annotatedEndings = cards.filter((card) =>
    isTruthyAnnotation(card.fields[endingColumn]),
  );
  const explicitEndings = options.endings ?? [];
  const endingsAnnotated = explicitEndings.length > 0 || annotatedEndings.length > 0;
  let endingIds: readonly string[];
  if (explicitEndings.length > 0) {
    endingIds = [...explicitEndings];
    for (const id of endingIds) {
      if (!models.has(id)) errors.push(`Ending card "${id}" does not exist in the content.`);
    }
  } else if (annotatedEndings.length > 0) {
    endingIds = annotatedEndings.map((card) => card.id);
  } else {
    endingIds = cards
      .filter((card) => (models.get(card.id)?.structuralTargets.size ?? 0) === 0)
      .map((card) => card.id);
    warnings.push(
      `No card is marked with the "${endingColumn}" column; endings default to the ${endingIds.length} structural terminal card(s).`,
    );
  }
  const endings = new Set(endingIds);

  // ── Entries ──────────────────────────────────────────────────
  // A root is a card no **non-ending** card links to: an ending that loops
  // back (a reset ending) restarts the story, so it must not hide the root.
  const referenced = new Set<string>();
  for (const model of models.values()) {
    if (endings.has(model.card.id)) continue;
    for (const target of model.structuralTargets) referenced.add(target);
  }
  let entryIds: readonly string[];
  if (options.entryIds !== undefined && options.entryIds.length > 0) {
    entryIds = [...options.entryIds];
    for (const id of entryIds) {
      if (!models.has(id)) {
        errors.push(`Entry card "${id}" does not exist in the content.`);
      }
    }
  } else {
    entryIds = cards.filter((card) => !referenced.has(card.id)).map((card) => card.id);
    if (entryIds.length === 0) {
      // Pure cycle: fall back to each story-line's first card, which is the
      // authored entry for a content set whose endings loop back.
      const firstByStoryline = new Map<string, string>();
      for (const card of cards) {
        const key = card.storylineId ?? '';
        if (!firstByStoryline.has(key)) firstByStoryline.set(key, card.id);
      }
      entryIds = [...firstByStoryline.values()];
      warnings.push(
        'Every card is some other card\'s successor (the graph is a pure cycle); the guard started from each story-line\'s first card.',
      );
    }
  }

  // ── Route-space enumeration ──────────────────────────────────
  const ctx: SearchContext = {
    models,
    endings,
    declared,
    adapter,
    maxDepth,
    maxStates,
    statesVisited: 0,
    truncated: false,
  };
  const exploration = exploreRoutes(ctx, entryIds, initialBag);
  if (ctx.truncated) {
    warnings.push(
      `Route-space exploration hit its bound (maxDepth=${maxDepth}, maxStates=${maxStates}); the guard cannot prove the invariants. Raise the bound or remove unbounded resource growth inside a cycle.`,
    );
  }

  const violations: ContentGuardViolation[] = [];

  // ── Invariant 1: every state-gated branch has a surviving route ──
  // Collected from every reachable state first (deterministic input), then
  // reported in content order so the output is stable across runs.
  const offered = new Set<string>();
  const payoffs = new Map<
    string,
    { survivable: boolean; endingId: string | null; path: string[] }
  >();
  for (const state of exploration.states) {
    const model = models.get(state.cardId);
    if (model === undefined) continue;
    for (const option of model.options) {
      if (option.gate === null) continue;
      const key = `${state.cardId}|${option.label}`;
      const transition = transitionOf(option.option, state.bag, declared, adapter);
      if (transition === null) continue; // unaffordable from this state
      offered.add(key);
      if (payoffs.get(key)?.survivable === true) continue;

      let payoff: { endingId: string; path: string[] } | null = null;
      let inconclusive = false;
      if (transition.targets.length === 0) {
        // The option ends the chain on the current card; that pays out only
        // when the current card is itself an ending.
        if (endings.has(state.cardId)) {
          payoff = { endingId: state.cardId, path: [...state.path] };
        }
      } else {
        for (const target of transition.targets) {
          if (!models.has(target)) continue;
          const search = findEnding(ctx, target, transition.bag);
          if (search.status === 'found') {
            payoff = {
              endingId: search.endingId,
              path: [...state.path, ...search.path],
            };
            break;
          }
          if (search.status === 'exhausted') inconclusive = true;
        }
      }
      if (payoff === null && inconclusive) {
        // The bound cut the query short: the invariant is unproven, not
        // violated. `truncated` already makes the report invalid.
        continue;
      }
      payoffs.set(key, {
        survivable: payoff !== null,
        endingId: payoff?.endingId ?? null,
        path: payoff?.path ?? [],
      });
    }
  }

  const gatedBranches: ContentGuardGatedBranch[] = [];
  for (const model of models.values()) {
    for (const option of model.options) {
      if (option.gate === null) continue;
      const key = `${model.card.id}|${option.label}`;
      const payoff = payoffs.get(key);
      const survivable = payoff?.survivable === true;
      gatedBranches.push({
        cardId: model.card.id,
        option: option.label,
        gate: option.gate,
        survivable,
        endingId: payoff?.endingId ?? null,
        path: payoff?.path ?? [],
      });
      if (survivable) continue;
      // A state-gated option whose payoff query the bound cut short is
      // unproven, never a violation: `truncated` already fails the report.
      if (payoff === undefined && ctx.truncated) continue;
      violations.push({
        invariant: 'gated-branch-survivable',
        cardId: model.card.id,
        option: option.label,
        message: offered.has(key)
          ? `"${option.label}" on "${model.card.id}" is state-gated (${option.gate}) but no route that takes it reaches an ending.`
          : `"${option.label}" on "${model.card.id}" is state-gated (${option.gate}) but is never offered on any playable route, so it cannot reach an ending.`,
      });
    }
  }

  // ── Invariant 2: every ending is reachable ──────────────────
  const endingReports: ContentGuardEnding[] = [];
  for (const endingId of endingIds) {
    const path = exploration.endings.get(endingId) ?? [];
    const reachable = path.length > 0;
    endingReports.push({ endingId, reachable, path });
    // An unreached ending may still be reachable beyond the search bound.
    if (!reachable && !ctx.truncated) {
      violations.push({
        invariant: 'ending-reachable',
        cardId: endingId,
        endingId,
        message: `Ending "${endingId}" is not reachable on any playable route.`,
      });
    }
  }

  // ── Invariant 3: marked choices meet the rejoin distance ────
  const consequentialColumn = options.consequentialColumn ?? CONSEQUENTIAL_COLUMN;
  const consequentialChoices: ContentGuardConsequentialChoice[] = [];
  for (const card of cards) {
    const model = models.get(card.id);
    if (model === undefined || model.options.length === 0) continue;
    const marks = annotationLabels(card.fields[consequentialColumn]);
    if (marks.length === 0) continue;
    const marked =
      marks.includes('*') ? model.options.map((option) => option.label) : marks;
    for (const label of marked) {
      const markedOption = model.options.find((option) => option.label === label);
      if (markedOption === undefined) {
        violations.push({
          invariant: 'consequential-rejoin',
          cardId: card.id,
          option: label,
          message: `Card "${card.id}" marks "${label}" as consequential, but it offers no such option.`,
        });
        continue;
      }
      const alternatives = model.options.filter((option) => option.label !== label);
      if (alternatives.length === 0) {
        warnings.push(
          `Card "${card.id}" marks "${label}" as consequential but offers no alternative to diverge from.`,
        );
        continue;
      }
      let distance: number | null = null;
      for (const alternative of alternatives) {
        const measured = rejoinDistance(
          markedOption.structuralTargets,
          alternative.structuralTargets,
          models,
        );
        if (measured !== null && (distance === null || measured < distance)) {
          distance = measured;
        }
      }
      const meetsMinimum = distance === null || distance >= minRejoinDistance;
      consequentialChoices.push({
        cardId: card.id,
        option: label,
        distance,
        meetsMinimum,
      });
      if (!meetsMinimum) {
        violations.push({
          invariant: 'consequential-rejoin',
          cardId: card.id,
          option: label,
          distance: distance ?? undefined,
          minimum: minRejoinDistance,
          message: `"${label}" on "${card.id}" is marked consequential but its branches rejoin after ${distance} beat(s); the minimum is ${minRejoinDistance}.`,
        });
      }
    }
  }

  return {
    valid: violations.length === 0 && errors.length === 0 && !ctx.truncated,
    gameId: adapter.gameId,
    cardCount: cards.length,
    choiceCardCount: cards.filter((card) => (models.get(card.id)?.options.length ?? 0) > 0)
      .length,
    entryIds,
    endingIds,
    endingsAnnotated,
    initialResources: initialBag,
    resourceKeys: declared,
    minRejoinDistance,
    gatedBranches,
    endings: endingReports,
    consequentialChoices,
    violations,
    warnings,
    errors,
    exploration: { statesVisited: ctx.statesVisited, truncated: ctx.truncated },
  };
}

/**
 * Parses a content CSV through an adapter and evaluates the guard.
 *
 * @param csv     Raw content CSV text.
 * @param adapter The game content adapter.
 * @param options Optional guard configuration.
 */
export function evaluateContentGuardCsv(
  csv: string,
  adapter: ContentAdapter,
  options: ContentGuardOptions = {},
): ContentGuardReport {
  return evaluateContentGuard(cardsFromCsv(parseCsv(csv), adapter), adapter, options);
}

/** The machine-readable guard report (JSON-safe; no functions or sets). */
export function contentGuardToJson(report: ContentGuardReport): string {
  return JSON.stringify(report, null, 2);
}

/** Renders a short summary of one resource bag (`coins=3, reputation=1`). */
function formatBag(bag: StorylineResources, keys: readonly StorylineResourceKey[]): string {
  return keys.map((key) => `${key}=${readResource(bag, key)}`).join(', ');
}

/**
 * Renders the human-readable guard report.
 *
 * One line per invariant (with a `✓`/`✗` marker), then every violation and
 * warning, then the PASS/FAIL verdict.
 *
 * @param report The guard report.
 * @param csvPath Optional content path, printed as a heading.
 */
export function formatContentGuardReport(
  report: ContentGuardReport,
  csvPath?: string,
): string {
  const lines: string[] = [];
  lines.push(
    `Content guard${csvPath ? `: ${csvPath}` : ''} (adapter ${report.gameId})`,
  );
  lines.push(
    `cards=${report.cardCount} choice cards=${report.choiceCardCount} entries=${report.entryIds.join(',')} endings=${report.endingIds.join(',') || '(none)'}`,
  );
  lines.push(
    `resources=${report.resourceKeys.join(',')} initial=${formatBag(report.initialResources, report.resourceKeys)} minRejoin=${report.minRejoinDistance}`,
  );

  const gatedFailures = report.violations.filter(
    (violation) => violation.invariant === 'gated-branch-survivable',
  );
  lines.push(
    `${gatedFailures.length === 0 ? '✓' : '✗'} gated-branch-survivable: ${report.gatedBranches.length} checked, ${report.gatedBranches.filter((branch) => branch.survivable).length} survivable`,
  );
  const endingFailures = report.violations.filter(
    (violation) => violation.invariant === 'ending-reachable',
  );
  lines.push(
    `${endingFailures.length === 0 ? '✓' : '✗'} ending-reachable: ${report.endings.length} checked, ${report.endings.filter((ending) => ending.reachable).length} reachable`,
  );
  const rejoinFailures = report.violations.filter(
    (violation) => violation.invariant === 'consequential-rejoin',
  );
  lines.push(
    `${rejoinFailures.length === 0 ? '✓' : '✗'} consequential-rejoin: ${report.consequentialChoices.length} checked, ${report.consequentialChoices.filter((choice) => choice.meetsMinimum).length} meet the minimum of ${report.minRejoinDistance}`,
  );

  for (const violation of report.violations) {
    lines.push(`✗ [${violation.invariant}] ${violation.message}`);
  }
  for (const error of report.errors) lines.push(`✗ [content] ${error}`);
  for (const warning of report.warnings) lines.push(`! ${warning}`);
  lines.push(`states=${report.exploration.statesVisited}${report.exploration.truncated ? ' (truncated)' : ''}`);
  lines.push(report.valid ? 'PASS' : 'FAIL');
  return lines.join('\n');
}
