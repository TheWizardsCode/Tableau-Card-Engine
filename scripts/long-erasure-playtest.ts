/**
 * Long Erasure playtest harness — observation evidence, not a game feature.
 *
 * Drives `GymLongErasureGame` headlessly over the authored content and reports
 * the measurements the GDD observation log needs:
 *
 * - **Content shape**: beats per act, decision points, and which decisions
 *   actually diverge (options lead to different next beats) versus converge
 *   (every affordable option lands on the same next beat — a cosmetic choice).
 * - **Playable route space**: an exhaustive, affordability-aware depth-first
 *   enumeration of every route a player can actually take from the entry beat
 *   to a terminal state. Unlike a walk of the declared successor graph this
 *   respects resource gates and the pressure clock, so it can answer "is the
 *   state-gated branch reachable *and* survivable?".
 * - **Multi-seed, multi-policy playthroughs** (`first` / `last` / `seeded` /
 *   `greedy-goodwill`): beats, choices, acts, outcome, ending, score, clock
 *   left, and the **slideshow metric** (per decision met: did the options
 *   change what follows?).
 * - **Named routes** (`--route name=A>B>C`), so a route no policy happens to
 *   take (a middle option, the gated branch, the abandon terminal) can be
 *   measured and quoted in the log.
 * - **Act-boundary snapshots** (`actBoundaries`): the clock and resource bag
 *   at the moment the run entered the first beat of each new act, plus the
 *   beat number and card where the boundary fell (read-only reporting).
 * - **Per-run pacing** (`pacing`): beats per act, decisions per act, decision
 *   density, dead beats (a beat entered with at most one affordable option —
 *   no decision to make) and prose volume. Summarised per policy too.
 *
 * Usage:
 *
 * ```bash
 * npx tsx scripts/long-erasure-playtest.ts [--seeds 40] [--json <path>] [--content <csv>] \
 *   [--route "reset-cheap=Log the erasure>Stay silent>..."] [--timings]
 * ```
 *
 * Deterministic: the same arguments always print the same numbers. `--timings`
 * is the one exception — it adds wall-clock `durationMs` to each run and is
 * therefore deliberately opt-in.
 *
 * @module scripts/long-erasure-playtest
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import type { StorylineOption } from '../src/story-line';
import { parseStorylineOptionsEncoding } from '../src/story-line';
import {
  availableOptions,
  bandForScore,
  buildEpilogue,
  chooseOption,
  createLongErasureRun,
  isComplete,
  type LongErasureAct,
  type LongErasureCard,
  type LongErasureContent,
  type LongErasureOutcome,
  type LongErasureState,
  longErasureContentFromCsv,
} from '../example-games/gym/GymLongErasureGame';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_PATH = path.join(REPO_ROOT, 'example-games/gym/content/long-erasure.csv');

/** The option label of the state-gated (goodwill 3) branch. */
const GATED_OPTION = 'Sabotage the Loom';
/** The option label of the deliberately terminal abandon route. */
const ABANDON_OPTION = 'Abandon the voyage';
/** The beat the state-gated branch feeds into. */
const GATED_BEAT = 'le-ii-sabotage';

export type Policy = 'first' | 'last' | 'seeded' | 'greedy-goodwill';

const POLICIES: readonly Policy[] = ['first', 'last', 'seeded', 'greedy-goodwill'];

/** Strips a chain-instance serial (`le-ii-shelter-0` → `le-ii-shelter`). */
function baseTypeId(id: string): string {
  return id.replace(/-\d+$/, '');
}

/** The successor ids an option can resolve to, including `#when` rules. */
function declaredSuccessors(option: StorylineOption<LongErasureState>): string[] {
  const ids: string[] = [];
  for (const rule of option.conditionalSuccessors ?? []) {
    if (rule.successorId) ids.push(baseTypeId(rule.successorId));
  }
  for (const id of option.successorIds ?? []) ids.push(baseTypeId(id));
  if (option.successorId) ids.push(baseTypeId(option.successorId));
  return [...new Set(ids)];
}

function optionsOf(card: LongErasureCard): StorylineOption<LongErasureState>[] {
  return parseStorylineOptionsEncoding<LongErasureState>(card.options ?? '');
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

// ── Content shape ───────────────────────────────────────────────

export interface DecisionPoint {
  cardId: string;
  cardName: string;
  act: string;
  labels: string[];
  /** True when at least two options lead to different next beats. */
  diverges: boolean;
}

export interface ContentShape {
  beats: number;
  acts: Record<string, number>;
  decisionPoints: DecisionPoint[];
  converging: DecisionPoint[];
  diverging: DecisionPoint[];
  singleOptionOrTerminal: string[];
  gatedOptionCard: string | null;
  abandonCard: string | null;
  /**
   * How soon two branches from the same decision meet again, measured in
   * cards entered after the fork: `nextBeat` = the fork's own successors
   * already share a successor (one flavour card), `oneBeatLater` = they rejoin
   * on the beat after that, and `never` = the two options lead to different
   * terminal regions.
   */
  reconvergence: {
    nextBeat: string[];
    oneBeatLater: string[];
    twoBeatsLater: string[];
    later: string[];
    never: string[];
  };
}

export function contentShape(content: LongErasureContent): ContentShape {
  const acts: Record<string, number> = {};
  const decisionPoints: DecisionPoint[] = [];
  const singleOptionOrTerminal: string[] = [];
  let gatedOptionCard: string | null = null;
  let abandonCard: string | null = null;

  for (const card of content.cards) {
    acts[card.act] = (acts[card.act] ?? 0) + 1;
    const options = optionsOf(card);
    if (options.length <= 1) {
      singleOptionOrTerminal.push(card.id);
      continue;
    }
    const targets = options.map((option) => declaredSuccessors(option).join(','));
    decisionPoints.push({
      cardId: card.id,
      cardName: card.name,
      act: card.act,
      labels: options.map((option) => option.label),
      diverges: new Set(targets).size > 1,
    });
    if (options.some((option) => option.label === GATED_OPTION)) gatedOptionCard = card.id;
    if (options.some((option) => option.label === ABANDON_OPTION)) abandonCard = card.id;
  }

  // Reconvergence: after a diverging decision, how many beats pass before the
  // two branches can meet again? (Declared graph — conditions ignored.)
  const byId = new Map(content.cards.map((card) => [card.id, card]));
  const reachable = (ids: readonly string[], depth: number): Set<string> => {
    let frontier = new Set(ids);
    const all = new Set(ids);
    for (let step = 0; step < depth; step += 1) {
      const next = new Set<string>();
      for (const id of frontier) {
        const card = byId.get(id);
        if (card === undefined) continue;
        for (const option of optionsOf(card)) {
          for (const successor of declaredSuccessors(option)) next.add(successor);
        }
      }
      frontier = next;
      for (const id of next) all.add(id);
    }
    return all;
  };

  const reconvergence: ContentShape['reconvergence'] = {
    nextBeat: [],
    oneBeatLater: [],
    twoBeatsLater: [],
    later: [],
    never: [],
  };
  for (const point of decisionPoints) {
    if (!point.diverges) continue;
    const card = byId.get(point.cardId);
    if (card === undefined) continue;
    const successors = optionsOf(card).map((option) => declaredSuccessors(option));
    let best: number | null = null;
    for (let a = 0; a < successors.length; a += 1) {
      for (let b = a + 1; b < successors.length; b += 1) {
        if (successors[a].join(',') === successors[b].join(',')) continue;
        for (let depth = 0; depth <= 6; depth += 1) {
          const left = reachable(successors[a], depth);
          const right = reachable(successors[b], depth);
          const meets = [...left].some((id) => right.has(id));
          if (meets && (best === null || depth + 1 < best)) {
            best = depth + 1;
            break;
          }
        }
      }
    }
    if (best === null) reconvergence.never.push(point.cardId);
    else if (best === 1) reconvergence.nextBeat.push(point.cardId);
    else if (best === 2) reconvergence.oneBeatLater.push(point.cardId);
    else if (best === 3) reconvergence.twoBeatsLater.push(point.cardId);
    else reconvergence.later.push(point.cardId);
  }

  return {
    beats: content.cards.length,
    acts,
    decisionPoints,
    converging: decisionPoints.filter((point) => !point.diverges),
    diverging: decisionPoints.filter((point) => point.diverges),
    singleOptionOrTerminal,
    gatedOptionCard,
    abandonCard,
    reconvergence,
  };
}

// ── Exhaustive playable route space ─────────────────────────────

export interface TerminalRoute {
  labels: string[];
  path: string[];
  outcome: LongErasureOutcome | null;
  endingId: string | null;
  beats: number;
  choices: number;
  score: number;
  clockLeft: number;
  /** Beat the run expired on (`null` when it reached a beat it could enter). */
  expiredOn: string | null;
  sawGatedBeat: boolean;
  sawAbandon: boolean;
}

export interface PlayableRouteSpace {
  routes: number;
  byOutcome: Record<string, number>;
  byEnding: Record<string, number>;
  expiring: TerminalRoute[];
  beats: { min: number; max: number; mean: number };
  choices: { min: number; max: number; mean: number };
  score: { min: number; max: number; mean: number };
  /** How playable routes distribute across the journey-score bands. */
  scoreBands: Record<string, number>;
  gated: {
    /** Routes that entered the state-gated beat at all. */
    routesThroughGated: number;
    /** Of those, how many reached an ending (reset/closed) instead of expiring. */
    completed: number;
    /** The clock left on entering the gated beat, over every such route. */
    clockOnEntry: { min: number; max: number };
  };
  abandonRoutes: number;
  /** How often an authored option was hidden by the affordability gate. */
  affordability: { states: number; offeredOptions: number; hiddenOptions: number };
  /** Every beat's terminal outcomes, so a branch can be judged as a whole. */
  beatStats: Record<
    string,
    { visited: number; completed: number; expired: number; hiddenOptions: number }
  >;
}

/** Every route a player can actually take, respecting gates and the clock. */
export function enumeratePlayableRoutes(
  content: LongErasureContent,
  maxRoutes = 5000,
): PlayableRouteSpace {
  const routes: TerminalRoute[] = [];
  const beatStats: PlayableRouteSpace['beatStats'] = {};
  const affordability = { states: 0, offeredOptions: 0, hiddenOptions: 0 };
  const seen = new Set<string>();

  const walk = (state: LongErasureState, labels: string[], pathSoFar: string[]): void => {
    if (routes.length >= maxRoutes) return;
    if (isComplete(state)) {
      const epilogue = buildEpilogue(state);
      routes.push({
        labels,
        path: pathSoFar,
        outcome: state.outcome,
        endingId: state.endingId,
        beats: state.beat,
        choices: state.history.length,
        score: epilogue.score.total,
        clockLeft: state.clock,
        expiredOn: state.outcome === 'expired' ? state.currentCard.id : null,
        sawGatedBeat: pathSoFar.some((id) => id === GATED_BEAT),
        sawAbandon: state.endingId === 'le-end-abandon',
      });
      const stats = (beatStats[state.currentCard.id] ??= {
        visited: 0,
        completed: 0,
        expired: 0,
        hiddenOptions: 0,
      });
      if (state.outcome === 'expired') stats.expired += 1;
      else stats.completed += 1;
      return;
    }

    const key = `${state.currentCard.id}|${JSON.stringify(state.resources)}|${state.clock}|${state.beat}`;
    if (seen.has(key)) return;
    seen.add(key);

    const offered = availableOptions(state);
    const declared = optionsOf(state.currentCard).length;
    affordability.states += 1;
    affordability.offeredOptions += offered.length;
    affordability.hiddenOptions += Math.max(0, declared - offered.length);
    const stats = (beatStats[state.currentCard.id] ??= {
      visited: 0,
      completed: 0,
      expired: 0,
      hiddenOptions: 0,
    });
    stats.visited += 1;
    stats.hiddenOptions += Math.max(0, declared - offered.length);

    for (const option of offered) {
      const next = chooseOption(state, option.label);
      walk(next, [...labels, option.label], [...pathSoFar, state.currentCard.id]);
    }
  };

  walk(createLongErasureRun(1, content), [], []);

  const byOutcome: Record<string, number> = {};
  const byEnding: Record<string, number> = {};
  for (const route of routes) {
    const outcome = route.outcome ?? 'playing';
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    const ending = route.endingId ?? 'no-ending-card';
    byEnding[ending] = (byEnding[ending] ?? 0) + 1;
  }

  const gatedRoutes = routes.filter((route) => route.sawGatedBeat);
  const gatedClocks = gatedRoutes.map((route) => route.clockLeft);

  const band = (pick: (route: TerminalRoute) => number): { min: number; max: number; mean: number } => {
    const values = routes.map(pick);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: Math.round(mean(values) * 100) / 100,
    };
  };

  return {
    routes: routes.length,
    byOutcome,
    byEnding,
    expiring: routes
      .filter((route) => route.outcome === 'expired')
      .map((route) => ({ ...route, labels: route.labels })),
    beats: band((route) => route.beats),
    choices: band((route) => route.choices),
    score: band((route) => route.score),
    gated: {
      routesThroughGated: gatedRoutes.length,
      completed: gatedRoutes.filter((route) => route.outcome !== 'expired').length,
      clockOnEntry: {
        min: Math.min(...gatedClocks, Number.POSITIVE_INFINITY),
        max: Math.max(...gatedClocks, Number.NEGATIVE_INFINITY),
      },
    },
    abandonRoutes: routes.filter((route) => route.sawAbandon).length,
    scoreBands: routes.reduce<Record<string, number>>((bands, route) => {
      const label = bandForScore(route.score).label;
      bands[label] = (bands[label] ?? 0) + 1;
      return bands;
    }, {}),
    affordability,
    beatStats,
  };
}

// ── Per-act boundaries and pacing ───────────────────────────────

/** The acts in narrative order, so per-act output keys are stable. */
const ACT_ORDER: readonly LongErasureAct[] = ['I', 'II', 'III', 'Ending'];

/**
 * One beat exactly as the run experienced it, captured after entry.
 *
 * This is the only new measurement surface the harness gained: recording what
 * was on screen keeps the report honest about what a player actually saw, and
 * it is read-only — no game or engine module learns about it.
 */
export interface BeatObservation {
  /** Base card id (`le-ii-shelter-0` → `le-ii-shelter`). */
  cardId: string;
  act: LongErasureAct;
  /** Options the affordability gate left on screen (`0` on a terminal beat). */
  offeredOptions: number;
  /** Clock remaining once this beat's cost was paid. */
  clockOnEntry: number;
  /** Resource bag once this beat's entry state settled. */
  resourcesOnEntry: Record<string, number>;
  /** True when the run was already over on entering this beat. */
  terminal: boolean;
}

/** The run's state at the moment it entered the first beat of a new act. */
export interface ActBoundary {
  /** The act the run left. */
  fromAct: LongErasureAct;
  /** The act the run entered. */
  toAct: LongErasureAct;
  /** 1-based beat number at which the new act began. */
  beat: number;
  /** Base id of the first card of the new act. */
  cardId: string;
  /** Clock left after paying for that first beat. */
  clockLeft: number;
  /** Resource bag after that first beat's entry state settled. */
  resources: Record<string, number>;
}

/** Per-run pacing: beats and decisions per act, density, dead beats, prose. */
export interface RunPacing {
  /** Beats entered per act, in narrative order. */
  beatsPerAct: Record<string, number>;
  /** Beats that offered more than one affordable option, per act. */
  decisionsPerAct: Record<string, number>;
  /** decisions ÷ beats per act (2 dp; `0` for an act the run never entered). */
  decisionDensity: Record<string, number>;
  /** decisions ÷ beats for the whole run (2 dp). */
  density: number;
  /** Non-terminal beats entered with at most one affordable option. */
  deadBeats: number;
  /** Base ids of those dead beats, in encounter order. */
  deadBeatIds: string[];
  /** Dead beats authored with a single option (a transit beat by design). */
  authoredDeadBeats: number;
  /** Dead beats where the affordability gate hid an authored choice. */
  gateCollapsedBeats: number;
  /** Prose words read: every entered beat's `effect` line. */
  proseWords: number;
}

/** Captures one entered beat. Call only once the beat is actually played. */
export function observeBeat(state: LongErasureState): BeatObservation {
  return {
    cardId: baseTypeId(state.currentCard.id),
    act: state.act,
    offeredOptions: availableOptions(state).length,
    clockOnEntry: state.clock,
    resourcesOnEntry: { ...state.resources },
    terminal: isComplete(state),
  };
}

/**
 * Derives the act-boundary snapshots from a run's played beats.
 *
 * A boundary is recorded where the act a beat belongs to first differs from
 * the previous beat's act. The snapshot is the post-entry state of that first
 * beat of the new act — i.e. its clock cost has been paid and its entry effects
 * applied, which is what the player sees as the act opens.
 */
export function actBoundariesFrom(
  observations: readonly BeatObservation[],
): ActBoundary[] {
  const boundaries: ActBoundary[] = [];
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    if (current.act === previous.act) continue;
    boundaries.push({
      fromAct: previous.act,
      toAct: current.act,
      beat: index + 1,
      cardId: current.cardId,
      clockLeft: current.clockOnEntry,
      resources: { ...current.resourcesOnEntry },
    });
  }
  return boundaries;
}

/**
 * Derives a run's pacing table from its played beats.
 *
 * A **dead beat** is a non-terminal beat entered with at most one affordable
 * option: the run advances without asking the player anything. Terminal beats
 * are excluded — reaching the ending is the run's conclusion, not a turn.
 * Dead beats are split by cause: an **authored** dead beat was written with a
 * single option, while a **gate-collapsed** dead beat was authored with a real
 * choice that the affordability gate hid on this visit.
 */
export function pacingFrom(
  observations: readonly BeatObservation[],
  content: LongErasureContent,
): RunPacing {
  const beatsPerAct: Record<string, number> = {};
  const decisionsPerAct: Record<string, number> = {};
  const deadBeatIds: string[] = [];
  let authoredDeadBeats = 0;
  let gateCollapsedBeats = 0;
  let decisions = 0;
  let proseWords = 0;

  for (const observation of observations) {
    beatsPerAct[observation.act] = (beatsPerAct[observation.act] ?? 0) + 1;
    const card = content.cards.find(
      (candidate) => candidate.id === observation.cardId,
    );
    if (observation.offeredOptions > 1) {
      decisionsPerAct[observation.act] =
        (decisionsPerAct[observation.act] ?? 0) + 1;
      decisions += 1;
    } else if (!observation.terminal) {
      deadBeatIds.push(observation.cardId);
      if (card !== undefined && optionsOf(card).length > 1) gateCollapsedBeats += 1;
      else authoredDeadBeats += 1;
    }
    const effect = card?.effect ?? '';
    proseWords += effect.trim() === '' ? 0 : effect.trim().split(/\s+/).length;
  }

  const decisionDensity: Record<string, number> = {};
  for (const act of ACT_ORDER) {
    const beats = beatsPerAct[act] ?? 0;
    decisionDensity[act] =
      beats === 0 ? 0 : Math.round((((decisionsPerAct[act] ?? 0) / beats) * 100)) / 100;
  }

  const beats = observations.length;
  return {
    beatsPerAct,
    decisionsPerAct,
    decisionDensity,
    density: beats === 0 ? 0 : Math.round(((decisions / beats) * 100)) / 100,
    deadBeats: deadBeatIds.length,
    deadBeatIds,
    authoredDeadBeats,
    gateCollapsedBeats,
    proseWords,
  };
}

// ── Playthroughs ────────────────────────────────────────────────

export interface RunRecord {
  seed: number;
  policy: Policy;
  beats: number;
  choices: number;
  actsCompleted: string[];
  outcome: LongErasureOutcome | null;
  endingId: string | null;
  endingName: string | null;
  score: number;
  band: string;
  /** Prose words read: every entered beat's `effect` line. */
  proseWords: number;
  components?: Record<string, number>;
  clockLeft: number;
  resources: Record<string, number>;
  gatedOffered: boolean;
  gatedTaken: boolean;
  abandonTaken: boolean;
  whenRuleFired: boolean;
  /** Decisions met, and how many of them led to a different next beat. */
  decisionsMet: number;
  visibleConsequences: number;
  cosmeticChoices: { cardId: string; chosen: string; beaten: string[] }[];
  path: string[];
  /** Every beat the run actually played, in order (internal; not serialised). */
  observations: BeatObservation[];
  /** Clock + resources at each act boundary the run crossed. */
  actBoundaries: ActBoundary[];
  /** Beats/decisions per act, density, dead beats, prose volume. */
  pacing: RunPacing;
  /** Wall clock for the headless replay; only present with `--timings`. */
  durationMs?: number;
}

/** Deterministic choice RNG independent of the game's own successor draw. */
function choiceRandom(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickOption(
  options: StorylineOption<LongErasureState>[],
  policy: Policy,
  random: () => number,
): StorylineOption<LongErasureState> {
  switch (policy) {
    case 'first':
      return options[0];
    case 'last':
      return options[options.length - 1];
    case 'greedy-goodwill': {
      const gain = (option: StorylineOption<LongErasureState>): number =>
        (option.extraEffect?.goodwill ?? 0) - (option.cost?.goodwill ?? 0);
      return options.reduce(
        (winner, option) => (gain(option) > gain(winner) ? option : winner),
        options[0],
      );
    }
    case 'seeded':
      return options[Math.floor(random() * options.length)];
  }
}

function emptyRecord(seed: number): RunRecord {
  return {
    seed,
    policy: 'first',
    beats: 0,
    choices: 0,
    actsCompleted: [],
    outcome: null,
    endingId: null,
    endingName: null,
    score: 0,
    band: '',
    proseWords: 0,
    clockLeft: 0,
    resources: {},
    gatedOffered: false,
    gatedTaken: false,
    abandonTaken: false,
    whenRuleFired: false,
    decisionsMet: 0,
    visibleConsequences: 0,
    cosmeticChoices: [],
    path: [],
    observations: [],
    actBoundaries: [],
    pacing: {
      beatsPerAct: {},
      decisionsPerAct: {},
      decisionDensity: {},
      density: 0,
      deadBeats: 0,
      deadBeatIds: [],
      authoredDeadBeats: 0,
      gateCollapsedBeats: 0,
      proseWords: 0,
    },
  };
}

/** Applies the measured fields of a finished run onto a record. */
function finalise(state: LongErasureState, record: RunRecord): void {
  const epilogue = buildEpilogue(state);
  record.beats = state.beat;
  record.choices = state.history.length;
  record.actsCompleted = [...state.completedActs];
  record.outcome = state.outcome;
  record.endingId = state.endingId;
  record.endingName = epilogue.endingName;
  record.score = epilogue.score.total;
  record.band = epilogue.score.label;
  record.components = { ...epilogue.score.components };
  record.clockLeft = state.clock;
  record.resources = { ...state.resources };
  record.actBoundaries = actBoundariesFrom(record.observations);
  record.pacing = pacingFrom(record.observations, state.content);
  record.proseWords = record.pacing.proseWords;
}

export function playRun(content: LongErasureContent, seed: number, policy: Policy): RunRecord {
  const startedAt = performance.now();
  const random = choiceRandom(seed);
  let state = createLongErasureRun(seed, content);
  const record = emptyRecord(seed);
  record.policy = policy;
  record.path = [state.currentCard.id];
  record.observations.push(observeBeat(state));

  for (let step = 0; step < 60 && !isComplete(state); step += 1) {
    const options = availableOptions(state);
    if (options.length === 0) break;
    if (options.some((option) => option.label === GATED_OPTION)) record.gatedOffered = true;

    const chosen = pickOption(options, policy, random);

    if (options.length > 1) {
      record.decisionsMet += 1;
      const chosenTargets = declaredSuccessors(chosen).join(',');
      const others = options.filter((option) => option.label !== chosen.label);
      const differing = others.filter(
        (option) => declaredSuccessors(option).join(',') !== chosenTargets,
      );
      if (differing.length > 0) {
        record.visibleConsequences += 1;
      } else {
        record.cosmeticChoices.push({
          cardId: state.currentCard.id,
          chosen: chosen.label,
          beaten: others.map((option) => option.label),
        });
      }
    }

    if (chosen.label === GATED_OPTION) record.gatedTaken = true;
    if (chosen.label === ABANDON_OPTION) record.abandonTaken = true;

    const cardId = state.currentCard.id;
    const beatBefore = state.beat;
    state = chooseOption(state, chosen.label);
    record.path.push(`${cardId}:${chosen.label}→${state.currentCard.id}`);
    // `beat` only advances for a beat that was actually played, so an expired
    // run does not record a boundary or a dead beat for the beat it never saw.
    if (state.beat > beatBefore) record.observations.push(observeBeat(state));

    // Did an authored `#when` rule decide this successor (rather than the draw)?
    const rules = chosen.conditionalSuccessors ?? [];
    if (rules.length > 0 && state.currentCard.id === baseTypeId(rules[0].successorId ?? '')) {
      record.whenRuleFired = true;
    }
  }

  finalise(state, record);
  record.durationMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
  return record;
}

/** Plays one explicitly named route (labels separated by `>`). */
export function playRoute(
  content: LongErasureContent,
  seed: number,
  labels: readonly string[],
): { record: RunRecord; journal: string[]; error: string | null } {
  const startedAt = performance.now();
  let state = createLongErasureRun(seed, content);
  const record = emptyRecord(seed);
  record.path = [state.currentCard.id];
  record.observations.push(observeBeat(state));
  let error: string | null = null;

  for (const label of labels) {
    if (isComplete(state)) break;
    const offered = availableOptions(state);
    if (!offered.some((option) => option.label === label)) {
      error = `"${label}" not offered at ${state.currentCard.id} (offered: ${offered
        .map((option) => option.label)
        .join(' | ')})`;
      break;
    }
    const chosen = offered.find((option) => option.label === label)!;
    if (offered.some((option) => option.label === GATED_OPTION)) record.gatedOffered = true;
    if (label === GATED_OPTION) record.gatedTaken = true;
    if (label === ABANDON_OPTION) record.abandonTaken = true;

    const rules = chosen.conditionalSuccessors ?? [];
    const cardId = state.currentCard.id;
    const beatBefore = state.beat;
    state = chooseOption(state, label);
    record.path.push(`${cardId}:${label}→${state.currentCard.id}`);
    if (state.beat > beatBefore) record.observations.push(observeBeat(state));
    if (rules.length > 0 && state.currentCard.id === baseTypeId(rules[0].successorId ?? '')) {
      record.whenRuleFired = true;
    }
  }

  finalise(state, record);
  record.durationMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
  return {
    record,
    journal: buildEpilogue(state).journal.map((entry) => entry.outcome),
    error,
  };
}

// ── Reporting ───────────────────────────────────────────────────

export function summarise(records: readonly RunRecord[]): Record<string, unknown> {
  const count = (pick: (record: RunRecord) => string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const record of records) {
      const key = pick(record);
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  };

  const numbers = (pick: (record: RunRecord) => number): Record<string, number> => {
    const values = records.map(pick);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: Math.round(mean(values) * 100) / 100,
    };
  };

  const decisionsMet = records.reduce((total, record) => total + record.decisionsMet, 0);
  const visible = records.reduce((total, record) => total + record.visibleConsequences, 0);

  // Pacing aggregates: mean beats/decisions per act, mean density, and the
  // dead-beat count over the whole sample (a beat that asked nothing).
  const perActMean = (
    pick: (record: RunRecord) => Record<string, number> | undefined,
  ): Record<string, number> =>
    Object.fromEntries(
      ACT_ORDER.map((act) => [
        act,
        Math.round(mean(records.map((record) => pick(record)?.[act] ?? 0)) * 100) / 100,
      ]),
    );

  return {
    runs: records.length,
    byOutcome: count((record) => record.outcome ?? 'playing'),
    byEnding: count((record) => record.endingId ?? 'no-ending-card'),
    byBand: count((record) => record.band),
    beats: numbers((record) => record.beats),
    choices: numbers((record) => record.choices),
    score: numbers((record) => record.score),
    proseWords: numbers((record) => record.proseWords),
    clockLeft: numbers((record) => record.clockLeft),
    decisionsMet,
    visibleConsequences: visible,
    cosmeticDecisions: decisionsMet - visible,
    cosmeticWhere: [
      ...new Set(
        records.flatMap((record) =>
          record.cosmeticChoices.map((choice) => `${choice.cardId}(${choice.chosen})`),
        ),
      ),
    ],
    gatedOffered: records.filter((record) => record.gatedOffered).length,
    gatedTaken: records.filter((record) => record.gatedTaken).length,
    abandonTaken: records.filter((record) => record.abandonTaken).length,
    whenRuleFired: records.filter((record) => record.whenRuleFired).length,
    distinctEndings: [...new Set(records.map((record) => record.endingId))],
    pacing: {
      beatsPerAct: perActMean((record) => record.pacing.beatsPerAct),
      decisionsPerAct: perActMean((record) => record.pacing.decisionsPerAct),
      decisionDensity: perActMean((record) => record.pacing.decisionDensity),
      density: Math.round(mean(records.map((record) => record.pacing.density)) * 100) / 100,
      deadBeatsPerRun:
        Math.round(mean(records.map((record) => record.pacing.deadBeats)) * 100) / 100,
      runsWithDeadBeats: records.filter((record) => record.pacing.deadBeats > 0).length,
      deadBeatIds: [
        ...new Set(records.flatMap((record) => record.pacing.deadBeatIds)),
      ],
      authoredDeadBeats: records.reduce(
        (total, record) => total + record.pacing.authoredDeadBeats,
        0,
      ),
      gateCollapsedBeats: records.reduce(
        (total, record) => total + record.pacing.gateCollapsedBeats,
        0,
      ),
    },
  };
}

function parseArgs(argv: readonly string[]): {
  seeds: number;
  json: string | null;
  content: string;
  routes: { name: string; labels: string[] }[];
  timings: boolean;
} {
  let seeds = 40;
  let json: string | null = null;
  let content = CONTENT_PATH;
  let timings = false;
  const routes: { name: string; labels: string[] }[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--seeds') seeds = Number(argv[index + 1] ?? seeds);
    if (arg === '--json') json = argv[index + 1] ?? null;
    if (arg === '--content') content = path.resolve(argv[index + 1] ?? content);
    if (arg === '--timings') timings = true;
    if (arg === '--route') {
      const spec = argv[index + 1] ?? '';
      const separator = spec.indexOf('=');
      routes.push({
        name: spec.slice(0, separator),
        labels: spec
          .slice(separator + 1)
          .split('>')
          .map((label) => label.trim())
          .filter(Boolean),
      });
    }
  }
  return { seeds, json, content, routes, timings };
}

function main(): void {
  const { seeds, json, content: contentPath, routes: routeSpecs, timings } = parseArgs(
    process.argv.slice(2),
  );
  const content = longErasureContentFromCsv(readFileSync(contentPath, 'utf8'));
  const shape = contentShape(content);
  const space = enumeratePlayableRoutes(content);

  const records: RunRecord[] = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    for (const policy of POLICIES) records.push(playRun(content, seed, policy));
  }

  const routes = routeSpecs.map((spec) => {
    const { record, journal, error } = playRoute(content, 1, spec.labels);
    const { observations: _observations, durationMs, ...measured } = record;
    return {
      name: spec.name,
      error,
      journal,
      ...measured,
      ...(timings ? { durationMs } : {}),
    };
  });

  const report = {
    content: {
      path: path.relative(REPO_ROOT, contentPath),
      clockMax: content.clockMax,
      resources: [...content.resources],
      ...shape,
    },
    playableRoutes: space,
    playtest: {
      seeds: `1..${seeds}`,
      policies: POLICIES,
      overall: summarise(records),
      byPolicy: Object.fromEntries(
        POLICIES.map((policy) => [policy, summarise(records.filter((r) => r.policy === policy))]),
      ),
    },
    routes,
    runs: records.map(
      ({ path: runPath, observations: _observations, durationMs, ...rest }) => ({
        ...rest,
        ...(timings ? { durationMs } : {}),
        path: runPath.join(' | '),
      }),
    ),
  };

  if (json) {
    writeFileSync(path.resolve(REPO_ROOT, json), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`wrote ${json}\n`);
  }

  process.stdout.write(
    [
      'seed\tpolicy\tbeats\tchoices\tacts\toutcome\tending\tscore\tclock\tdecisions\tvisible\twords\tdead\tdensity\tobserved',
      ...records.map((record) =>
        [
          record.seed,
          record.policy,
          record.beats,
          record.choices,
          record.actsCompleted.join(''),
          record.outcome,
          record.endingId ?? '-',
          record.score,
          record.clockLeft,
          record.decisionsMet,
          record.visibleConsequences,
          record.proseWords,
          record.pacing.deadBeats,
          record.pacing.density,
          [
            record.gatedOffered ? 'gated-offered' : '',
            record.gatedTaken ? 'GATED-TAKEN' : '',
            record.abandonTaken ? 'ABANDON' : '',
            record.whenRuleFired ? 'WHEN-RULE' : '',
          ]
            .filter(Boolean)
            .join(','),
        ].join('\t'),
      ),
      '',
      `content beats=${shape.beats} acts=${JSON.stringify(shape.acts)} clockMax=${content.clockMax} resources=${content.resources.join(',')}`,
      `decision points=${shape.decisionPoints.length} diverging=${shape.diverging.length} converging=${shape.converging.length}`,
      `converging=${shape.converging.map((p) => `${p.cardId}: [${p.labels.join(' | ')}]`).join('; ')}`,
      `single-option/terminal=${shape.singleOptionOrTerminal.join(',')}`,
      `gated option on=${shape.gatedOptionCard} abandon on=${shape.abandonCard}`,
      `reconvergence=${JSON.stringify(shape.reconvergence)}`,
      `playable routes=${space.routes} outcome=${JSON.stringify(space.byOutcome)} endings=${JSON.stringify(space.byEnding)}`,
      `playable beats=${JSON.stringify(space.beats)} choices=${JSON.stringify(space.choices)} score=${JSON.stringify(space.score)} scoreBands=${JSON.stringify(space.scoreBands)}`,
      `gated beat: routes=${space.gated.routesThroughGated} completed=${space.gated.completed} clockLeftOnEntry=${JSON.stringify(space.gated.clockOnEntry)}`,
      `expired routes (${space.expiring.length})=${space.expiring.map((r) => `${r.expiredOn}[${r.labels.join('>')}]`).join(' ;; ')}`,
      `abandon routes=${space.abandonRoutes}`,
      `affordability: ${JSON.stringify(space.affordability)}`,
      `beat stats: ${JSON.stringify(space.beatStats)}`,
      `overall=${JSON.stringify(summarise(records))}`,
      ...routes.map(
        (route) =>
          `route ${route.name}: ${route.error ?? 'ok'} outcome=${route.outcome} ending=${route.endingId} score=${route.score}(${JSON.stringify(route.components)}) band=${route.band} beats=${route.beats} choices=${route.choices} proseWords=${route.proseWords} clockLeft=${route.clockLeft} deadBeats=${JSON.stringify(route.pacing.deadBeatIds)} density=${route.pacing.density} gatedOffered=${route.gatedOffered} gatedTaken=${route.gatedTaken} whenRuleFired=${route.whenRuleFired} journal=${JSON.stringify(route.journal)}`,
      ),
      ...routes.map(
        (route) =>
          `route ${route.name} act boundaries=${JSON.stringify(route.actBoundaries)} pacing=${JSON.stringify(route.pacing)}`,
      ),
      '',
    ].join('\n'),
  );
}

// Entry-point guard: only run the CLI when executed as a script, so the
// reporting helpers (and `playRoute` / `playRun`) can be imported by tests
// without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
