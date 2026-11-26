/**
 * GymLongErasureGame — the Phaser-free brain of *The Long Erasure*.
 *
 * `GymLongErasureScene` is deliberately a renderer: every rule that decides
 * what happens on the next beat lives here, so the whole narrative is
 * unit-testable headlessly and deterministically. Nothing in this module
 * imports `phaser` (or a scene); the only dependencies are the generic
 * `@story-line` engine and its content toolchain.
 *
 * ## The run
 *
 * A run is driven by two inputs only: the authored content
 * ({@link LongErasureContent}, loaded from
 * `example-games/gym/content/long-erasure.csv`) and a numeric seed. Drawing
 * a card (`beat`), presenting its options, resolving a choice and closing the
 * run are all **pure** transitions — state in, plain data out:
 *
 * - {@link createLongErasureRun} — start a run at the content's entry card.
 * - {@link availableOptions} — the options the player may currently pick
 *   (the state-gated branch is filtered out until its resource gate is met).
 * - {@link chooseOption} — resolve a choice and enter its successor.
 * - {@link advanceClock} — the pressure-clock primitive (one beat).
 * - {@link isComplete} — whether the run has ended.
 * - {@link scoreRun} / {@link buildEpilogue} — the journal-derived epilogue.
 *
 * Mutating the returned state is never necessary and never done internally:
 * every transition clones, works on the clone and returns it, so a scene can
 * hold a state, render it and keep it as an undo history.
 *
 * ## Pressure clock (soft / hard failure)
 *
 * Every beat costs the entered card's `clockCost`. The clock is **soft at the
 * boundary and hard beyond it**:
 *
 * - A beat whose cost **exactly equals** the remaining clock is payable — the
 *   run continues with `0` remaining ("the last tick").
 * - A beat whose cost **exceeds** the remaining clock is unpayable. The run
 *   expires immediately: the beat is **not** played (no clock is deducted, no
 *   act/beat bookkeeping is applied and no options are offered), and the run
 *   ends terminally with `status: 'complete'`, `outcome: 'expired'`. Expiry is
 *   terminal — there is no recovery path.
 *
 * The default clock ({@link DEFAULT_CLOCK_MAX}) is deliberately tighter than
 * the slowest authored route, so the clock is a real constraint rather than
 * decoration: the longest paths run out of time and only the faster ones
 * reach the Loom's core. Tests can override it via
 * {@link LongErasureRunOptions.clockMax}.
 *
 * ## Acts
 *
 * Acts are gated, not merely implied by the graph: a run records each act in
 * which it has played at least one choice ({@link LongErasureState.completedActs}),
 * and entering a card from an earlier act than the current one is rejected. The
 * cycle in the content (`le-end-reset` → `le-i-open`) is the authored expression
 * of the **reset ending**, not a loop the module follows: entering an `Ending`
 * card closes the run, so the reset edge is never traversed.
 *
 * Arc credit follows the acts **played**, not the ending entered: an act is
 * credited when the journey records a choice made in it, and the `Ending` act is
 * never credited. Entering an ending card therefore cannot complete the arc, so
 * the deliberately terminal `Abandon the voyage` — reachable from Act II — earns
 * Acts I–II (35 points), not the full 60, while a run that finishes from Act III
 * still earns Act III because the finishing choice is played there
 * (CG-0MWNSR376002QBY9).
 *
 * ## Resource bounds (spill and clamp)
 *
 * The run's resource projection is **bounded** by the committed episode
 * manifest's `resources.bounds` (hull 0–5, morale 0–8, stores 0–6, goodwill
 * 0–5, charge 0–4), read through the engine's default-free
 * `readManifestBounds` and carried on {@link LongErasureContent.bounds}. The
 * engine therefore enforces the GDD's ranges instead of leaving them to
 * authoring discipline (GDD §2.8, gap G4):
 *
 * - A gain that would pass a key's maximum is applied only up to the maximum;
 *   the excess **spills** and one activity-log line records it
 *   (`Surplus spilled: 1 morale past the 8 cap.`), so a full hold is a real
 *   waste rather than a free bank.
 * - A loss that would pass a key's minimum is applied only down to the
 *   minimum; the unapplied magnitude **clamps** and is logged
 *   (`Loss clamped: 1 morale below the 2 floor.`), so a scene designed to cost
 *   a key cannot silently cost nothing.
 * - A key with no declared bounds stays unbounded, so content loaded without a
 *   manifest (a fixture, an alternate authored file) behaves exactly as it did
 *   before bounds existed.
 *
 * ## The reset ending
 *
 * The run has no `won` / `lost` flag. {@link LongErasureOutcome} says how
 * history was left instead: `'reset'` when the timeline is reset (recognised
 * by the ending card's authored successor back to the entry card),
 * `'expired'` when the clock ran out, and `'closed'` for any other ending
 * (including the deliberate "abandon the voyage"). For a reset run the score
 * and the journal are the only surviving output — see {@link buildEpilogue}.
 *
 * ## Determinism
 *
 * The single source of randomness is the seeded LCG carried in
 * {@link LongErasureState.rngSeed}. The generic engine draws **once** when an
 * option's successor is chosen from a candidate set (`successorIds`) — a
 * single-candidate CSV option consumes one draw too — and consumes **no** draw
 * for a terminal option or when a `#when` rule (`conditionalSuccessors`)
 * matches. A fixed seed therefore reproduces the same drawn cards and chosen
 * successors; a different seed varies only the choices where the content
 * offers alternatives. Replay with the same seed and the same choices always
 * yields the same run and the same score.
 *
 * @module example-games/gym/GymLongErasureGame
 */

import {
  createDefaultStorylineUiAdapter,
  createResourceProjection,
  createStorylineSystem,
  isOptionAffordable,
  readManifestBounds,
  readResource,
  type ManifestResourceBounds,
  type StorylineCard,
  type StorylineEngineAdapter,
  type StorylineJournalEntry,
  type StorylineLogEntry,
  type StorylineOption,
  type StorylineResourceField,
  type StorylineResourceProjection,
  type StorylineSystem,
  type StorylineUiAdapter,
} from '@story-line';

import { LONG_ERASURE_CONTENT_ADAPTER } from '../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../../src/story-line/content/csv';

// ── Public types ────────────────────────────────────────────────

/** The narrative acts, in play order, plus the ending gauge. */
export type LongErasureAct = 'I' | 'II' | 'III' | 'Ending';

/** The three playable acts (the ending is not an act the player completes). */
export const LONG_ERASURE_ACTS: readonly LongErasureAct[] = ['I', 'II', 'III'];

/** The resource keys this game declares to the story-line engine. */
export const LONG_ERASURE_RESOURCES: readonly string[] = [
  'hull',
  'morale',
  'stores',
  'goodwill',
  'charge',
];

/**
 * The resource keys *The Long Erasure* declares **never-restored**.
 *
 * Sourced from the shipped content adapter's `irreversibleResources`
 * declaration, so the authoring vocabulary the CSV validator uses and the
 * run's resource projection cannot be typed twice. The projection carries the
 * declaration into the engine seam, where a positive extra effect on one of
 * these keys is refused (`Extra effect refused: hull is irreversible.`) while a
 * cost on it still pays. The committed episode manifest's
 * `resources.irreversible` is the authoritative copy the adapter is audited
 * against.
 */
export const LONG_ERASURE_IRREVERSIBLE_RESOURCES: readonly string[] =
  LONG_ERASURE_CONTENT_ADAPTER.irreversibleResources ?? [];

/**
 * The starting resource bag of a fresh run.
 *
 * `goodwill` starts at **0** on purpose: the state-gated branch
 * (`Sabotage the Loom`, cost `goodwill:3`) is only reachable by accumulating
 * goodwill from earlier choices. `charge` starts at 2 so the Act I
 * `Transmit the warning` option (cost `charge:1`) is affordable — the first
 * source of goodwill.
 */
export const DEFAULT_RESOURCES: Readonly<Record<string, number>> = {
  hull: 5,
  morale: 5,
  stores: 4,
  goodwill: 0,
  charge: 2,
};

/**
 * The default pressure clock (`clockMax`).
 *
 * The cheapest authored route costs 13 clock and the slowest costs 18; 17
 * keeps every route but the slowest playable, so only the slowest still
 * expires. That is the intended tension: safety and speed trade off.
 */
export const DEFAULT_CLOCK_MAX = 17;

/** How a run ended (a run is never "won" or "lost"). */
export type LongErasureOutcome = 'reset' | 'expired' | 'closed';

/** Lifecycle of a run: it is either playing or complete. */
export type LongErasureStatus = 'playing' | 'complete';

/** A single narrative beat, as authored in the content CSV. */
export interface LongErasureCard extends StorylineCard {
  /** The act the beat belongs to. */
  readonly act: LongErasureAct;
  /** Clock consumed when the beat is entered. */
  readonly clockCost: number;
  /**
   * The beat's situation paragraph — the authored `context` column, verbatim
   * (`null` when the content authors none).
   *
   * This is the prose the narrative panel shows above the option list: the
   * writer's setting for the decision, not a paraphrase of `effect`.
   */
  readonly context: string | null;
  /**
   * The terminal card's closing prose — the authored `epilogue` column,
   * verbatim (`null` when the content authors none).
   *
   * Only meaningful on an ending card; the closing screen reads it through
   * {@link LongErasureEpilogue.epilogueProse}.
   */
  readonly epilogue: string | null;
}

/** The authored content a run is driven from. */
export interface LongErasureContent {
  /** Every authored beat, in file order. */
  readonly cards: readonly LongErasureCard[];
  /** The id of the card a fresh run starts on (the first authored card). */
  readonly entryCardId: string;
  /** The resource keys the content declares. */
  readonly resources: readonly string[];
  /**
   * The declared **inclusive bounds** per resource key (`{ min, max }`).
   *
   * Read from the committed episode manifest's `resources.bounds` through the
   * engine's default-free `readManifestBounds` read-through — never a
   * hand-copied range literal, so the run's bounds and the manifest's design
   * bounds cannot drift. A key with no entry (or content loaded without a
   * manifest) stays unbounded, which is the pre-bounds behaviour exactly.
   */
  readonly bounds: Readonly<Record<string, ManifestResourceBounds>>;
  /**
   * The declared **never-restored** keys ({@link resources} subset).
   *
   * Derived from the shipped content adapter's `irreversibleResources`
   * declaration and filtered to the keys this content actually declares, so
   * the run's projection never names a key it cannot carry. The projection
   * threads the set into the engine seam: a grant on one of these keys is
   * refused at resolution, a cost on it still pays.
   */
  readonly irreversible: readonly string[];
  /** Default pressure clock for runs over this content. */
  readonly clockMax: number;
}

/** One recorded choice, the journey record the epilogue is derived from. */
export interface LongErasureHistoryEntry {
  /** Beat the choice was taken on. */
  readonly beat: number;
  /** Act the chosen beat belongs to. */
  readonly act: LongErasureAct;
  /** Base id of the card the choice was made on. */
  readonly cardId: string;
  /** Display name of the card the choice was made on. */
  readonly cardName: string;
  /** The chosen option label. */
  readonly option: string;
  /**
   * The chosen option's authored outcome prose (its `#says=` attribute),
   * verbatim, or `null` when the option authors none.
   *
   * This is what the choice *caused*, in the writer's words — the scene
   * narrates it instead of paraphrasing the label the player clicked.
   */
  readonly outcomeProse: string | null;
  /** The option's declarative cost (the irreversible loss it paid). */
  readonly cost: Readonly<Record<string, number>>;
  /** The resource bag immediately after the choice resolved. */
  readonly resourcesAfter: Readonly<Record<string, number>>;
}

/** The complete, plain-data state of a run. */
export interface LongErasureState {
  /**
   * The authored content this run is driven from (plain, immutable data).
   *
   * Carrying it in the state keeps the whole transition surface
   * `state in → plain data out`: the scene never has to thread content through
   * every call, and a snapshot is self-describing.
   */
  readonly content: LongErasureContent;
  /** The seed the run was created with (replay provenance). */
  readonly seed: number;
  /** Current LCG state — the single seeded draw source. */
  readonly rngSeed: number;
  /** Current resource bag, keyed by declared resource key. */
  readonly resources: Readonly<Record<string, number>>;
  /** Remaining pressure clock. */
  readonly clock: number;
  /** The clock the run started with. */
  readonly clockMax: number;
  /** 1-based count of beats entered (the entry card is beat 1). */
  readonly beat: number;
  /** The beat currently presented to the player. */
  readonly currentCard: LongErasureCard;
  /** The act the current beat belongs to (`'Ending'` once it closes). */
  readonly act: LongErasureAct;
  /** Acts the run has played at least one choice in, in narrative order. */
  readonly completedActs: readonly LongErasureAct[];
  /** Append-only activity log the generic journal is built from. */
  readonly activityLog: readonly StorylineLogEntry[];
  /** Chain cards pushed by resolution (the engine's serial-named instances). */
  readonly deck: readonly LongErasureCard[];
  /** Every choice taken, oldest first. */
  readonly history: readonly LongErasureHistoryEntry[];
  /** Lifecycle: playing, or complete (see {@link LongErasureOutcome}). */
  readonly status: LongErasureStatus;
  /** How the run ended (`null` while playing). */
  readonly outcome: LongErasureOutcome | null;
  /** Base id of the ending card that closed the run, when there is one. */
  readonly endingId: string | null;
}

/** Optional overrides for {@link createLongErasureRun}. */
export interface LongErasureRunOptions {
  /** Initial pressure clock (defaults to the content's `clockMax`). */
  readonly clockMax?: number;
  /** Initial resource bag (defaults to {@link DEFAULT_RESOURCES}). */
  readonly resources?: Readonly<Record<string, number>>;
}

/** Stable, machine-readable failure reasons. */
export type LongErasureErrorCode =
  | 'invalid-content'
  | 'complete'
  | 'option-unavailable'
  | 'backward-act';

/** Error raised for an invalid content file or an illegal transition. */
export class LongErasureError extends Error {
  /** Stable machine-readable reason. */
  readonly code: LongErasureErrorCode;

  constructor(message: string, code: LongErasureErrorCode) {
    super(message);
    this.name = 'LongErasureError';
    this.code = code;
  }
}

// ── Content loading ─────────────────────────────────────────────

/** The act ranks, used for gating and act completion. */
const ACT_RANK: Readonly<Record<LongErasureAct, number>> = {
  I: 0,
  II: 1,
  III: 2,
  Ending: 3,
};

/** Narrows raw CSV text to a known act, throwing on an unknown label. */
function parseAct(cardId: string, raw: string | undefined): LongErasureAct {
  const act = (raw ?? '').trim();
  if (act === 'I' || act === 'II' || act === 'III' || act === 'Ending') {
    return act;
  }
  throw new LongErasureError(
    `Long Erasure content: card "${cardId}" declares unknown act "${act}" (expected I, II, III or Ending).`,
    'invalid-content',
  );
}

/** Parses a card's clock cost, throwing on a missing/negative value. */
function parseClockCost(cardId: string, raw: string | undefined): number {
  const text = (raw ?? '').trim();
  const value = Number(text);
  if (text === '' || !Number.isFinite(value) || value < 0) {
    throw new LongErasureError(
      `Long Erasure content: card "${cardId}" declares an invalid clockCost "${text}".`,
      'invalid-content',
    );
  }
  return value;
}

/** Options controlling {@link longErasureContentFromCsv}. */
export interface LongErasureContentOptions {
  /**
   * The raw per-key bounds block to read (`{ hull: { min: 0, max: 5 }, … }`) —
   * normally the committed episode manifest's `resources.bounds`.
   *
   * The block is read through the engine's default-free `readManifestBounds`
   * read-through, so a missing entry or an inverted range is a loud
   * `invalid-content` error rather than an invented range. Omitted means "no
   * bounds declared", which keeps the run's resource seam unbounded exactly as
   * it was before bounds existed.
   */
  readonly bounds?: unknown;
}

/**
 * Loads {@link LongErasureContent} from the authored CSV text.
 *
 * Uses the shipped content adapter (`LONG_ERASURE_CONTENT_ADAPTER`) and the
 * generic CSV projection, so the module reads exactly the content the
 * `storylines:validate` / `storylines:graph` toolchain validates. The declared
 * resource set is the union of every card's `resources` column, preserving
 * declaration order.
 *
 * When `options.bounds` supplies the committed manifest's `resources.bounds`,
 * every declared key must carry a usable `{ min, max }` range; the content then
 * carries those bounds into the run's resource projection, where a gain at the
 * cap spills and a loss at the floor clamps (GDD §2.8).
 *
 * @param csvText Raw content CSV (the `?raw` import in the scene, or
 *                `readFileSync` in tests).
 * @param options Optional per-key bounds to read (see
 *                {@link LongErasureContentOptions.bounds}).
 * @throws LongErasureError (`code: 'invalid-content'`) for empty content, a
 *         duplicate card id, an unknown act, an invalid clock cost, or bounds
 *         that do not cover every declared key.
 */
export function longErasureContentFromCsv(
  csvText: string,
  options: LongErasureContentOptions = {},
): LongErasureContent {
  const contentCards = cardsFromCsv(
    parseCsv(csvText),
    LONG_ERASURE_CONTENT_ADAPTER,
  );

  if (contentCards.length === 0) {
    throw new LongErasureError(
      'Long Erasure content: the CSV contains no cards.',
      'invalid-content',
    );
  }

  const resources: string[] = [];
  const cards: LongErasureCard[] = [];
  const seen = new Set<string>();

  for (const card of contentCards) {
    if (seen.has(card.id)) {
      throw new LongErasureError(
        `Long Erasure content: duplicate card id "${card.id}".`,
        'invalid-content',
      );
    }
    seen.add(card.id);

    for (const key of card.resourceKeys) {
      if (!resources.includes(key)) resources.push(key);
    }

    cards.push({
      id: card.id,
      name: card.name,
      effect: card.effect,
      options: card.options,
      storylineId: card.storylineId,
      storylineTitle: card.storylineTitle,
      act: parseAct(card.id, card.fields.act),
      clockCost: parseClockCost(card.id, card.fields.clockCost),
      // Authored prose is optional: a blank cell (or an adapter with no prose
      // column) reads as `null`, never `''`, so "no prose" is one shape.
      context: card.context ?? null,
      epilogue: card.epilogue ?? null,
    });
  }

  const declaredResources =
    resources.length > 0 ? resources : LONG_ERASURE_RESOURCES;

  return {
    cards,
    entryCardId: cards[0].id,
    resources: declaredResources,
    bounds: readContentBounds(declaredResources, options.bounds),
    irreversible: LONG_ERASURE_IRREVERSIBLE_RESOURCES.filter((key) =>
      declaredResources.includes(key),
    ),
    clockMax: DEFAULT_CLOCK_MAX,
  };
}

/**
 * Reads the content's per-key bounds from the manifest's raw block.
 *
 * Delegates to {@link readManifestBounds}, which fails closed: every declared
 * key must carry a finite, non-inverted `{ min, max }`. A partial or malformed
 * block therefore throws (naming each offending key) instead of silently
 * leaving some keys unbounded — the content and its manifest must agree.
 *
 * @param declared The keys the content declares.
 * @param raw      The raw bounds block (`undefined` means "declare none").
 */
function readContentBounds(
  declared: readonly string[],
  raw: unknown,
): Readonly<Record<string, ManifestResourceBounds>> {
  if (raw === undefined) return {};
  const read = readManifestBounds(declared, raw);
  if (read.ok) return read.bounds;
  throw new LongErasureError(
    `Long Erasure content: the supplied bounds do not cover the declared resources (${read.issues
      .map((issue) => `${issue.reason}: ${issue.key}`)
      .join(', ')}).`,
    'invalid-content',
  );
}

// ── Score table and bands ───────────────────────────────────────

/**
 * The documented journey-score table.
 *
 * The score is **journal-derived**: it is computed from the recorded journey
 * (the same choices that produce the journal), never from a win/loss flag.
 * Every component is bounded and the total is clamped to
 * `[min, max]` = `[0, 100]`:
 *
 * | Component | Rule | Bound |
 * |---|---|---|
 * | `arc` | act weights for every act in which the journey records at least one choice made (the `Ending` act is never credited) | 0–60 |
 * | `choices` | `perChoice` per recorded choice | 0–`choiceCap` |
 * | `resources` | `perResourceKey` per remaining point of each declared resource, capped per resource | 0–20 |
 * | `losses` | `-perCostPoint` per resource point paid as an option cost (irreversible loss) | −20–0 |
 *
 * The authored content tops out at 92 (60 + 12 + 20) for a finishing route; a
 * route that ends from Act II can top out only at 67 (Acts I–II arc 35 + 12 +
 * 20), below the top band, because the `Ending` act is never credited. The
 * `[0, 100]` clamp is a guard for hand-built snapshots and future content,
 * never an unreachable documented ceiling.
 */
export const JOURNEY_SCORE_TABLE = {
  /** Points per act the run played at least one choice in (Ending is never credited). */
  act: { I: 15, II: 20, III: 25, Ending: 0 } as Readonly<
    Record<LongErasureAct, number>
  >,
  /** Points per recorded choice (before the cap). */
  perChoice: 2,
  /** Maximum points from choices. */
  choiceCap: 12,
  /** Points per remaining point of a declared resource. */
  perResourceKey: 1,
  /** Per-resource cap so an unspent stock cannot dominate the score. */
  resourceCapPerKey: 4,
  /** Penalty per resource point paid as an option cost. */
  perCostPoint: 2,
  /** Maximum total loss penalty. */
  lossCap: 20,
  /** Lowest possible score. */
  min: 0,
  /** Highest possible score. */
  max: 100,
} as const;

/** One score band: a stable lower bound (inclusive) and its label. */
export interface JourneyBand {
  /** Lowest score in the band. */
  readonly min: number;
  /** Stable, player-facing label for the band. */
  readonly label: string;
}

/** The score bands, highest first. Every band label is stable. */
export const JOURNEY_BANDS: readonly JourneyBand[] = [
  { min: 80, label: 'A chart worth keeping' },
  { min: 60, label: 'A voyage that left a mark' },
  { min: 40, label: 'A voyage the erasure nearly kept' },
  { min: 20, label: 'A voyage remembered only as a gap' },
  { min: 0, label: 'A voyage the timeline never noticed' },
];

/** The score component breakdown, all values already bounded. */
export interface JourneyScoreComponents {
  /** Act-completion points (0–60). */
  readonly arc: number;
  /** Choice-breadth points (0–12). */
  readonly choices: number;
  /** Remaining-resource points (0–20). */
  readonly resources: number;
  /** Irreversible-loss penalty (−20–0). */
  readonly losses: number;
}

/** The epilogue score of one run. */
export interface JourneyScore {
  /** Clamped total in `[JOURNEY_SCORE_TABLE.min, JOURNEY_SCORE_TABLE.max]`. */
  readonly total: number;
  /** The band the total falls in. */
  readonly band: JourneyBand;
  /** The band's stable label (convenience mirror of `band.label`). */
  readonly label: string;
  /** Bounded component breakdown. */
  readonly components: JourneyScoreComponents;
  /** Acts the run played at least one choice in. */
  readonly actsCompleted: readonly LongErasureAct[];
  /** Number of recorded choices. */
  readonly choiceCount: number;
  /** Resources still held when the run ended. */
  readonly resourcesLeft: Readonly<Record<string, number>>;
  /** Total resource points paid as option costs. */
  readonly costPaid: number;
  /** How the run ended (`null` while playing). */
  readonly outcome: LongErasureOutcome | null;
}

/** The closing-screen view model: score plus the surviving journey record. */
export interface LongErasureEpilogue {
  /** Lifecycle of the scored run. */
  readonly status: LongErasureStatus;
  /** How the run ended. */
  readonly outcome: LongErasureOutcome | null;
  /** True when the timeline was reset (the score/journal are the only record). */
  readonly reset: boolean;
  /** Base id of the ending card, when reached. */
  readonly endingId: string | null;
  /** Display name of the ending card, when reached. */
  readonly endingName: string | null;
  /**
   * The ending card's authored closing prose (its `epilogue` column),
   * verbatim, or `null` when the content authors none.
   *
   * When it is `null` the closing screen falls back to the pre-prose rendering
   * (the outcome framing line), so content without an epilogue is unchanged.
   */
  readonly epilogueProse: string | null;
  /** Acts the run played at least one choice in. */
  readonly actsCompleted: readonly LongErasureAct[];
  /** The journey score. */
  readonly score: JourneyScore;
  /** The journal (most recent choice first) — derived from the activity log. */
  readonly journal: readonly StorylineJournalEntry[];
}

/** Clamps a number into the documented score range. */
function clampScore(value: number): number {
  return Math.min(
    JOURNEY_SCORE_TABLE.max,
    Math.max(JOURNEY_SCORE_TABLE.min, value),
  );
}

/**
 * The band a (possibly unclamped) score belongs to.
 *
 * Bands are inclusive lower bounds, resolved highest-first, so the mapping is
 * total and stable: every score in the same band yields the same label.
 *
 * @param total A score (clamped into `[0, 100]` before lookup).
 */
export function bandForScore(total: number): JourneyBand {
  const clamped = clampScore(total);
  for (const band of JOURNEY_BANDS) {
    if (clamped >= band.min) return band;
  }
  // JOURNEY_BANDS always contains a `min: 0` entry, so this is unreachable.
  return JOURNEY_BANDS[JOURNEY_BANDS.length - 1];
}

// ── Queries ─────────────────────────────────────────────────────

/** True when the run has ended (for any reason). */
export function isComplete(state: LongErasureState): boolean {
  return state.status === 'complete';
}

/** The score the run would record `count` choices for (bounded). */
function choicePoints(count: number): number {
  return Math.min(
    JOURNEY_SCORE_TABLE.choiceCap,
    count * JOURNEY_SCORE_TABLE.perChoice,
  );
}

/** The bounded remaining-resource points for a resource bag. */
function resourcePoints(
  resources: Readonly<Record<string, number>>,
  declared: readonly string[],
): number {
  let points = 0;
  for (const key of declared) {
    const value = Math.max(0, readResource(resources, key));
    points +=
      Math.min(JOURNEY_SCORE_TABLE.resourceCapPerKey, value) *
      JOURNEY_SCORE_TABLE.perResourceKey;
  }
  return points;
}

/** The total resource points paid as option costs across the journey. */
function costPoints(history: readonly LongErasureHistoryEntry[]): {
  paid: number;
  penalty: number;
} {
  let paid = 0;
  for (const entry of history) {
    for (const value of Object.values(entry.cost)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        paid += value;
      }
    }
  }
  return {
    paid,
    penalty: Math.min(JOURNEY_SCORE_TABLE.lossCap, paid * JOURNEY_SCORE_TABLE.perCostPoint),
  };
}

/**
 * The acts a journey actually played, derived from its recorded choices.
 *
 * An act is credited when the journal records at least one choice made in that
 * act (the entry beat's choice counts as Act I); the `Ending` act is a gauge,
 * not a played act, and is never credited. Deriving the set from
 * {@link LongErasureHistoryEntry.act} makes the arc auditable: it cannot
 * disagree with the journal, because the journal is the input.
 */
function playedActs(
  history: readonly LongErasureHistoryEntry[],
): LongErasureAct[] {
  const played = new Set<LongErasureAct>();
  for (const entry of history) played.add(entry.act);
  return LONG_ERASURE_ACTS.filter((act) => played.has(act));
}

/**
 * Scores the journey actually taken.
 *
 * Pure: it reads only `state` (and the declared resource keys) and returns
 * plain data. It is intended for a completed run but is total — a live run is
 * scored on its progress so far, which lets the scene preview the epilogue
 * without owning any scoring rule.
 *
 * @param state The run to score (never mutated).
 */
export function scoreRun(state: LongErasureState): JourneyScore {
  // The arc is the acts played, derived from the journal (CG-0MWNSR376002QBY9).
  const actsCompleted = playedActs(state.history);
  const arc = actsCompleted.reduce(
    (total, act) => total + JOURNEY_SCORE_TABLE.act[act],
    0,
  );
  const choices = choicePoints(state.history.length);
  const resources = resourcePoints(state.resources, state.content.resources);
  const { paid, penalty } = costPoints(state.history);
  const losses = penalty === 0 ? 0 : -penalty;

  const total = clampScore(arc + choices + resources + losses);
  const band = bandForScore(total);

  return {
    total,
    band,
    label: band.label,
    components: { arc, choices, resources, losses },
    actsCompleted,
    choiceCount: state.history.length,
    resourcesLeft: { ...state.resources },
    costPaid: paid,
    outcome: state.outcome,
  };
}

// ── The run engine adapter ──────────────────────────────────────

/** Long Erasure's story-line presentation overlay. */
const LONG_ERASURE_UI: StorylineUiAdapter<LongErasureCard> = {
  ...createDefaultStorylineUiAdapter<LongErasureCard>(),
  storyUpdateLine: (card, option, _coinChange, _repChange, outcomeProse) => {
    const title = card.storylineTitle ?? card.storylineId ?? 'The Long Erasure';
    // Must keep the shared `Story update — ` prefix: the journal derives its
    // rows from these lines (`parseStoryUpdate`). Authored outcome prose is the
    // row's outcome verbatim (the journal truncates it for display via the
    // shared `truncateOutcome` helper); authored-less content keeps the
    // pre-prose wording exactly.
    if (typeof outcomeProse === 'string' && outcomeProse.trim().length > 0) {
      return `Story update — ${title}: ${outcomeProse}`;
    }
    return `Story update — ${title}: "${card.name}" → ${option}.`;
  },
};

/** Strips a chain-instance serial (`le-ii-shelter-0` → `le-ii-shelter`). */
function baseTypeId(id: string): string {
  return id.replace(/-\d+$/, '');
}

/** Deterministic LCG step: returns `[value, nextSeed]`. */
function nextRandom(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next / 0x100000000, next];
}

/** The mutable view of a working copy (the public state is read-only). */
type WorkingState = {
  -readonly [K in keyof LongErasureState]: LongErasureState[K] extends
    readonly (infer T)[]
    ? T[]
    : LongErasureState[K] extends Readonly<Record<string, number>>
      ? Record<string, number>
      : LongErasureState[K];
};

/** Deep-copies a state into a mutable working copy (plain data only). */
function cloneState(state: LongErasureState): WorkingState {
  return {
    content: state.content,
    seed: state.seed,
    rngSeed: state.rngSeed,
    resources: { ...state.resources },
    clock: state.clock,
    clockMax: state.clockMax,
    beat: state.beat,
    currentCard: state.currentCard,
    act: state.act,
    completedActs: [...state.completedActs],
    activityLog: state.activityLog.map((entry) => ({ ...entry })),
    deck: [...state.deck],
    history: state.history.map((entry) => ({
      ...entry,
      cost: { ...entry.cost },
      resourcesAfter: { ...entry.resourcesAfter },
    })),
    status: state.status,
    outcome: state.outcome,
    endingId: state.endingId,
  };
}

/** The public (read-only) view of a working copy. */
function readOnly(working: WorkingState): LongErasureState {
  return working;
}

/**
 * Builds the run's resource seam from the content's declarations.
 *
 * The projection **is** the declaration: its field keys are the content's
 * declared resource set, its `irreversible` option carries the never-restored
 * keys and its `bounds` option carries the manifest's per-key design bounds, so
 * none of the three can drift apart. Spreading it into the engine adapter is
 * what makes the resolution guard see `hull` — and what makes a gain at a full
 * key spill (GDD §2.8) instead of banking past its cap.
 *
 * The `onRemainder` hook is the game's record of what the bounds wasted: one
 * activity-log line per spilled / clamped key, so a full hold is a visible
 * cost rather than a silent one. Wording is this game's; the engine only
 * reports the numbers.
 */
function createRunResources(
  content: LongErasureContent,
): StorylineResourceProjection<LongErasureState> {
  const fields: Record<string, StorylineResourceField<LongErasureState>> = {};
  for (const key of content.resources) {
    fields[key] = {
      read: (state) => state.resources[key] ?? 0,
      apply: (state, delta) => {
        const working = state as WorkingState;
        working.resources[key] = readResource(working.resources, key) + delta;
      },
    };
  }
  return createResourceProjection(fields, {
    irreversible: content.irreversible,
    bounds: content.bounds,
    onRemainder: (report, state) => {
      const working = state as WorkingState;
      for (const entry of report) {
        const bounds = content.bounds[entry.key];
        if (bounds === undefined) continue;
        if (entry.spilled > 0) {
          working.activityLog.push({
            turn: working.beat,
            text: `Surplus spilled: ${entry.spilled} ${entry.key} past the ${bounds.max} cap.`,
          });
        }
        if (entry.clamped > 0) {
          working.activityLog.push({
            turn: working.beat,
            text: `Loss clamped: ${entry.clamped} ${entry.key} below the ${bounds.min} floor.`,
          });
        }
      }
    },
  });
}

/** Builds the engine adapter mapping the generic seams onto a run state. */
function createRunEngine(
  content: LongErasureContent,
): StorylineEngineAdapter<LongErasureState, LongErasureCard> {
  const byBaseId = new Map(content.cards.map((card) => [card.id, card]));

  return {
    ...createRunResources(content),
    rng: (state) => {
      const working = state as WorkingState;
      const [value, seed] = nextRandom(working.rngSeed);
      working.rngSeed = seed;
      return value;
    },
    applyEffect: () => {
      // The Long Erasure's beats carry no intrinsic resource effect: every
      // mechanic is an authored option cost or extra effect. Applying a card's
      // effect is therefore deliberately a no-op.
    },
    appendLog: (state, text) => {
      const working = state as WorkingState;
      working.activityLog.push({ turn: working.beat, text });
    },
    getActivityLog: (state) => state.activityLog,
    getTemplate: (id) => byBaseId.get(baseTypeId(id)) ?? null,
    getBaseTypeId: (id) => baseTypeId(id),
    getChainScanCards: (state) => state.deck,
    pushChainCard: (state, card) => {
      const working = state as WorkingState;
      working.deck.push(card);
    },
  };
}

/** Builds a story-line system bound to a content file. */
function createRunSystem(
  content: LongErasureContent,
): StorylineSystem<LongErasureState, LongErasureCard> {
  return createStorylineSystem({
    engine: createRunEngine(content),
    ui: LONG_ERASURE_UI,
  });
}

/** The successor base ids an option can reach, in declaration order. */
function successorIdsOf(option: StorylineOption<LongErasureState>): string[] {
  if (option.successorIds !== undefined && option.successorIds.length > 0) {
    return option.successorIds.map((id) => baseTypeId(id));
  }
  if (option.successorId) return [baseTypeId(option.successorId)];
  return [];
}

// ── Transitions ─────────────────────────────────────────────────

/**
 * Presents the options the player may pick right now.
 *
 * The compiled options are filtered by the generic affordability gate against
 * the run's **current** resources, which is what makes the state-gated branch
 * (the `goodwill:3` "Sabotage the Loom" option) appear only once the gating
 * resource has accumulated. A completed run — including an expired one —
 * offers nothing.
 *
 * @param state The run to inspect (never mutated).
 */
export function availableOptions(
  state: LongErasureState,
): StorylineOption<LongErasureState>[] {
  if (state.status === 'complete') return [];

  const declared = state.content.resources;
  return createRunSystem(state.content)
    .getStorylineOptions(state.currentCard)
    .filter((option) => isOptionAffordable(option, state.resources, declared));
}

/**
 * Advances the pressure clock by one beat.
 *
 * This is the single clock primitive `enterCard` uses; a scene never needs to
 * call it (entering a card already pays its beat). It is exported because the
 * clock contract is part of the module's surface and easy to test directly.
 *
 * Soft at the boundary, hard beyond it: a cost equal to the remaining clock is
 * paid down to `0` and the run continues; a cost greater than the remaining
 * clock expires the run terminally (`outcome: 'expired'`) without deducting
 * anything. A completed run is returned unchanged.
 *
 * @param state The run to tick (never mutated).
 * @param cost  Beat cost (defaults to the current card's `clockCost`).
 */
export function advanceClock(
  state: LongErasureState,
  cost: number = state.currentCard.clockCost,
): LongErasureState {
  if (state.status === 'complete') return state;

  const working = cloneState(state);
  payClock(working, cost);
  return readOnly(working);
}

/** Applies one beat's clock cost to a working copy (see {@link advanceClock}). */
function payClock(working: WorkingState, cost: number): void {
  if (cost > working.clock) {
    // Hard failure: the beat is not played, nothing is deducted, the run ends.
    working.status = 'complete';
    working.outcome = 'expired';
    working.endingId = null;
    return;
  }
  working.clock -= cost;
}

/** True when an ending card's authored options link back to the entry card. */
function isResetEnding(
  card: LongErasureCard,
  content: LongErasureContent,
): boolean {
  const system = createRunSystem(content);
  return system
    .getStorylineOptions(card)
    .some((option) => successorIdsOf(option).includes(content.entryCardId));
}

/** Adds an act to the played-act mirror once a choice is recorded in it. */
function recordActPlayed(working: WorkingState, act: LongErasureAct): void {
  if (act === 'Ending') return;
  if (!working.completedActs.includes(act)) working.completedActs.push(act);
}

/**
 * Enters a beat: act bookkeeping, clock payment, then completion/options.
 *
 * The beat is atomic. When the clock cannot pay for it, nothing about the beat
 * is applied (no act advance, no beat increment); the card is still recorded
 * as `currentCard` so the closing screen can name the beat that was out of
 * reach, and the run ends with `outcome: 'expired'`.
 */
function enterCard(
  working: WorkingState,
  content: LongErasureContent,
  card: LongErasureCard,
): void {
  if (ACT_RANK[card.act] < ACT_RANK[working.act]) {
    throw new LongErasureError(
      `Long Erasure run: cannot enter "${card.id}" (act ${card.act}) from act ${working.act}; acts may only move forward.`,
      'backward-act',
    );
  }

  working.currentCard = card;
  if (card.clockCost > working.clock) {
    payClock(working, card.clockCost);
    return;
  }

  // The beat is payable: apply its bookkeeping.
  payClock(working, card.clockCost);
  working.act = card.act;
  working.beat += 1;

  if (card.act === 'Ending') {
    // Entering the ending closes the run. It does NOT complete the arc: act
    // credit is earned by playing choices in an act, so a terminal reached from
    // Act II keeps only Acts I–II (CG-0MWNSR376002QBY9).
    working.status = 'complete';
    working.outcome = isResetEnding(card, content) ? 'reset' : 'closed';
    working.endingId = card.id;
    return;
  }

  // A non-ending beat with no options is a dead end: close the run rather than
  // offering an empty choice list.
  const options = createRunSystem(content).getStorylineOptions(card);
  if (options.length === 0) {
    working.status = 'complete';
    working.outcome = 'closed';
    working.endingId = card.id;
  }
}

/**
 * Resolves the chosen option and enters its successor.
 *
 * Pure: the input state is never mutated. The generic engine applies the
 * option's cost and extra effect, draws the successor (one seeded `rng()` call
 * when the option declares several candidates, none when a `#when` rule
 * matches), pushes the chain card and appends the activity-log lines; this
 * function then journals the narrative line, records the choice in the
 * journey history and enters the successor's template.
 *
 * @param state  The run to advance (never mutated).
 * @param label  The exact option label to choose — one of
 *               {@link availableOptions}.
 * @throws LongErasureError (`'complete'`) when the run has ended, or
 *         (`'option-unavailable'`) when the label is not currently offered.
 */
export function chooseOption(
  state: LongErasureState,
  label: string,
): LongErasureState {
  if (state.status === 'complete') {
    throw new LongErasureError(
      'Long Erasure run: the run has ended; no further choice can be made.',
      'complete',
    );
  }

  const resolvedContent = state.content;
  const system = createRunSystem(resolvedContent);
  const option = system
    .getStorylineOptions(state.currentCard)
    .filter((candidate) =>
      isOptionAffordable(candidate, state.resources, resolvedContent.resources),
    )
    .find((candidate) => candidate.label === label);

  if (option === undefined) {
    throw new LongErasureError(
      `Long Erasure run: option "${label}" is not offered by "${state.currentCard.id}" (it may be unaffordable).`,
      'option-unavailable',
    );
  }

  const working = cloneState(state);
  const card = working.currentCard;
  const result = system.resolveStorylineOption(working, card, option);

  const storyUpdate = system.ui.storyUpdateLine(
    card,
    option.label,
    result.coinChange,
    result.repChange,
    result.outcomeProse ?? null,
  );
  if (storyUpdate) system.engine.appendLog(working, storyUpdate);

  const cost: Record<string, number> = {};
  for (const [key, value] of Object.entries(option.cost ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
      cost[key] = value;
    }
  }

  working.history.push({
    beat: working.beat,
    act: card.act,
    cardId: card.id,
    cardName: card.name,
    option: option.label,
    // The consequence as authored (`#says=`), not a paraphrase of the label.
    outcomeProse: result.outcomeProse ?? null,
    cost,
    resourcesAfter: { ...working.resources },
  });
  // Mirror the played-act set onto the state, keeping it consistent with the
  // journal the score is derived from.
  recordActPlayed(working, card.act);

  if (result.pushedCard == null) {
    // A terminal option: the chain ends without a successor beat.
    working.status = 'complete';
    working.outcome = 'closed';
    working.endingId = null;
    return readOnly(working);
  }

  const nextTemplate = resolvedContent.cards.find(
    (candidate) => candidate.id === baseTypeId(result.pushedCard?.id ?? ''),
  );
  if (nextTemplate === undefined) {
    throw new LongErasureError(
      `Long Erasure content: successor "${result.pushedCard.id}" has no template.`,
      'invalid-content',
    );
  }

  enterCard(working, resolvedContent, nextTemplate);
  return readOnly(working);
}

/**
 * Starts a fresh run at the content's entry card.
 *
 * Pure and deterministic: the same content + seed + options always produce
 * deep-equal states. The entry beat is entered immediately (its clock cost is
 * paid and its options are offered), so a fresh run is ready to render.
 *
 * @param seed    Deterministic seed for the single candidate draw.
 * @param content Authored content (see {@link longErasureContentFromCsv}).
 * @param options Optional clock / resource overrides.
 * @throws LongErasureError (`'invalid-content'`) when the entry card is missing.
 */
export function createLongErasureRun(
  seed: number,
  content: LongErasureContent,
  options: LongErasureRunOptions = {},
): LongErasureState {
  const entry = content.cards.find((card) => card.id === content.entryCardId);
  if (entry === undefined) {
    throw new LongErasureError(
      `Long Erasure content: entry card "${content.entryCardId}" is missing.`,
      'invalid-content',
    );
  }

  const resources: Record<string, number> = {};
  for (const key of content.resources) {
    resources[key] = readResource(options.resources ?? DEFAULT_RESOURCES, key);
  }

  const clockMax = options.clockMax ?? content.clockMax;

  const working: WorkingState = {
    content,
    seed,
    rngSeed: seed >>> 0,
    resources,
    clock: clockMax,
    clockMax,
    beat: 0,
    currentCard: entry,
    act: 'I',
    completedActs: [],
    activityLog: [],
    deck: [],
    history: [],
    status: 'playing',
    outcome: null,
    endingId: null,
  };

  enterCard(working, content, entry);
  return readOnly(working);
}

/**
 * Rebuilds the journal (most recent choice first) from the run's activity log.
 *
 * The journal is the same record the epilogue score is derived from: one row
 * per recorded choice.
 *
 * @param state The run to read (never mutated).
 */
export function runJournal(
  state: LongErasureState,
): readonly StorylineJournalEntry[] {
  return createRunSystem(state.content).buildJournal(state);
}

/**
 * Builds the closing-screen view model.
 *
 * For a reset run (`outcome: 'reset'`) the score and the journal are the only
 * surviving output: the timeline is gone, and this is what remains of the
 * voyage. The epilogue is pure and total — it can be built for a live run too
 * (the scene uses that for a preview), with `reset: false`.
 *
 * @param state The run to close (never mutated).
 */
export function buildEpilogue(
  state: LongErasureState,
): LongErasureEpilogue {
  const ending = state.endingId
    ? state.content.cards.find((card) => card.id === state.endingId) ?? null
    : null;
  const score = scoreRun(state);

  return {
    status: state.status,
    outcome: state.outcome,
    reset: state.outcome === 'reset',
    endingId: state.endingId,
    endingName: ending?.name ?? null,
    epilogueProse: ending?.epilogue ?? null,
    actsCompleted: [...score.actsCompleted],
    score,
    journal: runJournal(state),
  };
}
