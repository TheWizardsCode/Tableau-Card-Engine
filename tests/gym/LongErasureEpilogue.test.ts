/**
 * LongErasureEpilogue — the journal-derived journey score of *The Long
 * Erasure* (CG-0MWNHZA1A007BRVT).
 *
 * The epilogue is the spike's third engine decision: the run ends with the
 * timeline reset, and the closing screen scores the journey the player
 * actually took against the arc — act completion, choices made, resources
 * left and irreversible losses. These tests pin the documented scoring table
 * with a **best**, a **worst** and a **mid-range** run over the real authored
 * content, plus the band boundaries and the documented clamp.
 *
 * They also pin the **arc rule** adopted after the spike
 * (`CG-0MWNSR376002QBY9`, GDD §2.10.5): an act is credited when the journal
 * records at least one choice made in that act, and the `Ending` act is never
 * credited. Entering an ending card therefore no longer completes the arc, so
 * abandoning the voyage in Act II cannot reach the top band.
 *
 * Everything goes through the module's public API, so a change to a weight, a
 * cap or a band label fails here instead of silently changing what the player
 * is told their voyage was worth.
 *
 * @module tests/gym/LongErasureEpilogue
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CLOCK_MAX,
  DEFAULT_RESOURCES,
  JOURNEY_BANDS,
  JOURNEY_SCORE_TABLE,
  LONG_ERASURE_ACTS,
  LONG_ERASURE_RESOURCES,
  bandForScore,
  buildEpilogue,
  chooseOption,
  createLongErasureRun,
  longErasureContentFromCsv,
  scoreRun,
  type LongErasureAct,
  type LongErasureContent,
  type LongErasureState,
} from '../../example-games/gym/GymLongErasureGame';

/** Repository root, resolved from this file rather than `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The authored content, loaded once through the module's own loader. */
const CONTENT: LongErasureContent = longErasureContentFromCsv(
  readFileSync(
    join(REPO_ROOT, 'example-games/gym/content/long-erasure.csv'),
    'utf-8',
  ),
  {
    episode: JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'example-games/gym/content/long-erasure-episode.json'),
        'utf-8',
      ),
    ) as {
      acts: {
        order: number;
        scenes: { beats: { cardId: string; clockCost: number }[] }[];
      }[];
      endings: string[];
    },
  },
);

/** The cheapest full route to the reset ending (17 clock — exactly the default). */
const BEST_PATH = [
  'Rally the survey crew',
  'Hold the survey line',
  'Push deeper',
  'Leave it be',
  'Bargain in bad faith',
  'Keep the bargain',
  'Follow the thread',
  'Finish the weave',
] as const;

/** The same route cut short by the clock on its final beat (mid-range run). */
const MID_PATH = BEST_PATH.slice(0, -1);

/**
 * The deliberately terminal abandon route: five choices, all in Acts I–II.
 *
 * `Abandon the voyage` is reachable from `le-ii-offer` (a deliberate Act II
 * exit hatch), so under the played-acts rule this run credits only Acts I–II.
 */
const ABANDON_PATH = [
  'Log the erasure',
  'Stay silent',
  'Shelter in the dead zone',
  'Ration the stores',
  'Abandon the voyage',
] as const;

/** The same prefix as {@link ABANDON_PATH}, but it stays to finish the arc. */
const SAME_PREFIX_FINISH_PATH = [
  'Log the erasure',
  'Stay silent',
  'Shelter in the dead zone',
  'Ration the stores',
  'Bargain in bad faith',
  'Keep the bargain',
  'Follow the thread',
  'Finish the weave',
] as const;

/** The 8-beat Act II expiry at the Act III door (GDD §2.10.5 correction). */
const ACT_II_EXPIRY_PATH = [
  'Log the erasure',
  'Transmit the warning',
  'Shelter in the dead zone',
  'Strip the derelict',
  "Take the ally's berth",
  'Bargain in bad faith',
  'Keep the bargain',
  'Follow the thread',
] as const;

/** A route that accumulates the gated resource and pays every authored cost. */
const COSTLY_PATH = [
  'Log the erasure',
  'Transmit the warning',
  'Push deeper',
  'Strip the locker',
  'Share the berth',
  'Bargain in bad faith',
  'Sabotage the Loom',
] as const;

/** Starts a run and applies each label. */
function play(
  labels: readonly string[],
  options: Parameters<typeof createLongErasureRun>[2] = {},
): LongErasureState {
  let state = createLongErasureRun(0, CONTENT, options);
  for (const label of labels) state = chooseOption(state, label);
  return state;
}

/** A run that expires before its first beat is played (the worst journey). */
function worstRun(): LongErasureState {
  const zeros: Record<string, number> = {};
  for (const key of CONTENT.resources) zeros[key] = 0;
  return createLongErasureRun(0, CONTENT, { clockMax: 0, resources: zeros });
}

describe('The Long Erasure epilogue: documented table', () => {
  it('documents a bounded table with a total range of 0–100', () => {
    expect(JOURNEY_SCORE_TABLE.act.I).toBeLessThan(JOURNEY_SCORE_TABLE.act.II);
    expect(JOURNEY_SCORE_TABLE.act.II).toBeLessThan(JOURNEY_SCORE_TABLE.act.III);
    expect(JOURNEY_SCORE_TABLE.min).toBe(0);
    expect(JOURNEY_SCORE_TABLE.max).toBe(100);
    for (const value of [
      JOURNEY_SCORE_TABLE.perChoice,
      JOURNEY_SCORE_TABLE.choiceCap,
      JOURNEY_SCORE_TABLE.perResourceKey,
      JOURNEY_SCORE_TABLE.resourceCapPerKey,
      JOURNEY_SCORE_TABLE.perCostPoint,
      JOURNEY_SCORE_TABLE.lossCap,
    ]) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it('maps every band boundary to a stable label', () => {
    const expected: readonly [number, string][] = [
      [-10, 'A voyage the timeline never noticed'],
      [0, 'A voyage the timeline never noticed'],
      [19, 'A voyage the timeline never noticed'],
      [20, 'A voyage remembered only as a gap'],
      [39, 'A voyage remembered only as a gap'],
      [40, 'A voyage the erasure nearly kept'],
      [59, 'A voyage the erasure nearly kept'],
      [60, 'A voyage that left a mark'],
      [79, 'A voyage that left a mark'],
      [80, 'A chart worth keeping'],
      [100, 'A chart worth keeping'],
      [10_000, 'A chart worth keeping'],
    ];
    for (const [score, label] of expected) {
      expect(bandForScore(score).label, `score ${score}`).toBe(label);
    }
    // Only the documented labels are ever emitted, and they are unique.
    const labels = JOURNEY_BANDS.map((band) => band.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain(bandForScore(50).label);
  });
});

describe('The Long Erasure epilogue: best run', () => {
  it('scores a completed reset voyage from its arc, choices and resources', () => {
    const state = play(BEST_PATH);
    const score = scoreRun(state);

    expect(state.outcome).toBe('reset');

    // 60 act + 12 choices (capped) + 15 resources (5/7/6/0/3 capped at 4) − 0
    expect(score.components).toEqual({
      arc: 60,
      choices: 12,
      resources: 15,
      losses: 0,
    });
    expect(score.total).toBe(87);
    expect(score.label).toBe('A chart worth keeping');
    expect(score.actsCompleted).toEqual(['I', 'II', 'III']);
    expect(score.choiceCount).toBe(BEST_PATH.length);
    expect(score.resourcesLeft).toEqual({
      hull: 5,
      morale: 7,
      stores: 6,
      goodwill: 0,
      charge: 3,
    });
    expect(score.costPaid).toBe(0);
    expect(score.outcome).toBe('reset');
    // Journal-derived: the scored journey is exactly the journey journaled.
    expect(score.choiceCount).toBe(buildEpilogue(state).journal.length);
  });

  it('survives the reset as the only narrative output', () => {
    const epilogue = buildEpilogue(play(BEST_PATH));

    expect(epilogue.reset).toBe(true);
    expect(epilogue.outcome).toBe('reset');
    expect(epilogue.endingId).toBe('le-end-reset');
    expect(epilogue.endingName).toBe('The Long Erasure');
    expect(epilogue.journal).toHaveLength(BEST_PATH.length);
    expect(epilogue.score.total).toBe(87);
  });
});

describe('The Long Erasure epilogue: mid-range run', () => {
  it('scores an arc cut short by the clock in the mid band', () => {
    const state = play(MID_PATH, { clockMax: 14 });
    const score = scoreRun(state);

    expect(state.outcome).toBe('expired');
    // Five Act II choices were played before the Act III beat expired, so the
    // played-acts rule credits Act II (GDD §2.10.5: 15 → 35 arc points).
    expect(state.completedActs).toEqual(['I', 'II']);

    // 35 act (Acts I–II played) + 12 choices (capped) + 15 resources − 0.
    expect(score.components).toEqual({
      arc: 35,
      choices: 12,
      resources: 15,
      losses: 0,
    });
    expect(score.total).toBe(62);
    expect(score.total).toBeGreaterThanOrEqual(60);
    expect(score.total).toBeLessThan(80);
    expect(score.label).toBe('A voyage that left a mark');
  });
});

describe('The Long Erasure epilogue: worst run', () => {
  it('scores an immediate expiry at the floor of the documented range', () => {
    const state = worstRun();
    const score = scoreRun(state);

    expect(state.status).toBe('complete');
    expect(state.outcome).toBe('expired');
    expect(state.history).toEqual([]);
    expect(score.components).toEqual({
      arc: 0,
      choices: 0,
      resources: 0,
      losses: 0,
    });
    expect(score.total).toBe(0);
    expect(score.total).toBeGreaterThanOrEqual(JOURNEY_SCORE_TABLE.min);
    expect(score.label).toBe('A voyage the timeline never noticed');
  });
});

describe('The Long Erasure epilogue: irreversible losses', () => {
  it('penalises the resource points the journey paid away', () => {
    const state = play(COSTLY_PATH);
    const score = scoreRun(state);

    // Costs paid: stores:1 + charge:1 + hull:1 + goodwill:3 = 6 points.
    expect(score.costPaid).toBe(6);
    expect(score.components.losses).toBe(-12);
    expect(score.components.losses).toBeLessThan(0);
  });

  it('caps the loss penalty', () => {
    const state = play(COSTLY_PATH);
    const extreme: LongErasureState = {
      ...state,
      history: [
        ...state.history,
        ...state.history.map((entry) => ({
          ...entry,
          cost: { hull: 100 },
        })),
      ],
    };

    expect(scoreRun(extreme).components.losses).toBe(
      -JOURNEY_SCORE_TABLE.lossCap,
    );
  });
});

describe('The Long Erasure epilogue: clamping and purity', () => {
  it('keeps an inflated state inside the documented range', () => {
    // Guard for hand-built / future content states: an inflated resource bag
    // (and a `completedActs` list naming duplicates) must still land inside the
    // documented range. The arc is derived from the journal's distinct acts, so
    // a duplicated act cannot inflate it — the authored maximum is 92 (arc 60 +
    // choices 12 + resources 20).
    const base = play(BEST_PATH);
    const inflated: LongErasureState = {
      ...base,
      completedActs: ['I', 'I', 'II', 'III'],
      resources: {
        hull: 999,
        morale: 999,
        stores: 999,
        goodwill: 999,
        charge: 999,
      },
    };
    const score = scoreRun(inflated);

    expect(score.components.arc).toBe(60);
    expect(score.total).toBe(92);
    expect(score.total).toBeLessThanOrEqual(JOURNEY_SCORE_TABLE.max);
    expect(score.label).toBe('A chart worth keeping');

    // Negative inputs clamp at the floor rather than producing a negative score.
    const floored: LongErasureState = {
      ...base,
      resources: { hull: -50, morale: -50, stores: -50, goodwill: -50, charge: -50 },
    };
    expect(scoreRun(floored).total).toBeGreaterThanOrEqual(JOURNEY_SCORE_TABLE.min);
  });

  it('is deterministic and never mutates the scored run', () => {
    const state = play(BEST_PATH);
    const snapshot = JSON.parse(JSON.stringify(state)) as unknown;

    const first = scoreRun(state);
    const second = scoreRun(state);

    expect(second).toEqual(first);
    expect(state).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});

describe('The Long Erasure epilogue: the arc is the acts played', () => {
  it('credits only the acts played when the voyage is abandoned in Act II', () => {
    const state = play(ABANDON_PATH);
    const score = scoreRun(state);

    expect(state.outcome).toBe('closed');
    expect(state.endingId).toBe('le-end-abandon');
    // The ending card is entered, but the Ending act is never credited and the
    // realm of Act III was never played.
    expect(state.currentCard.act).toBe('Ending');
    expect(state.completedActs).toEqual(['I', 'II']);
    expect(score.actsCompleted).toEqual(['I', 'II']);
    expect(score.components).toEqual({
      arc: 35,
      choices: 10,
      resources: 13,
      losses: -4,
    });
    // 79 at the spike (arc 60 + 10 + 13 − 4) → 54 under the played-acts rule.
    expect(score.total).toBe(54);
    expect(score.label).toBe('A voyage the erasure nearly kept');
    // Two bands below the finishing route, not four points below it.
    expect(score.band.min).toBeLessThan(JOURNEY_BANDS[0].min);
    expect(buildEpilogue(state).actsCompleted).toEqual(['I', 'II']);
  });

  it('makes the top band unreachable from an abandon, even at its ceiling', () => {
    // The theoretical maximum for an Act II abandon: Acts I–II arc, the choice
    // cap, and every resource at its per-key cap. If that ceiling is below the
    // top band's lower bound, no abandon can ever land in the top band.
    const ceiling =
      JOURNEY_SCORE_TABLE.act.I +
      JOURNEY_SCORE_TABLE.act.II +
      JOURNEY_SCORE_TABLE.choiceCap +
      LONG_ERASURE_RESOURCES.length * JOURNEY_SCORE_TABLE.resourceCapPerKey;
    expect(ceiling).toBeLessThan(JOURNEY_BANDS[0].min);

    // And a maximally favourable abandon state is scored below the top band.
    const base = play(ABANDON_PATH);
    const inflated: LongErasureState = {
      ...base,
      resources: {
        hull: 999,
        morale: 999,
        stores: 999,
        goodwill: 999,
        charge: 999,
      },
    };
    const score = scoreRun(inflated);
    expect(score.total).toBeLessThan(JOURNEY_BANDS[0].min);
    expect(score.label).not.toBe(JOURNEY_BANDS[0].label);
  });

  it('still awards a finishing route a clear margin over the same-prefix abandon', () => {
    const abandon = scoreRun(play(ABANDON_PATH));
    const finish = scoreRun(play(SAME_PREFIX_FINISH_PATH));

    expect(abandon.actsCompleted).toEqual(['I', 'II']);
    expect(finish.actsCompleted).toEqual(['I', 'II', 'III']);
    expect(finish.total - abandon.total).toBeGreaterThanOrEqual(15);
    expect(finish.band.min).toBeGreaterThan(abandon.band.min);
  });

  it('credits Act II to an expiry after five Act II choices (GDD §2.10.5)', () => {
    const state = play(ACT_II_EXPIRY_PATH);
    const score = scoreRun(state);

    expect(state.outcome).toBe('expired');
    // The unpayable Act III beat is never entered, but the played Act II beats
    // are credited rather than the run being punished for the clock.
    expect(score.actsCompleted).toEqual(['I', 'II']);
    expect(score.components.arc).toBe(35);
    expect(score.total).toBe(51);
    expect(score.label).toBe('A voyage the erasure nearly kept');
  });

  it('derives the scored act set from the journal, never the ending card', () => {
    for (const path of [BEST_PATH, MID_PATH, ABANDON_PATH, COSTLY_PATH]) {
      const state = play(path, { clockMax: 30 });
      const score = scoreRun(state);
      const actsInJournal = new Set<LongErasureAct>(
        state.history.map((entry) => entry.act),
      );

      // The state's mirror and the score agree with the journal, and the ending
      // gauge is never handed arc credit.
      expect(score.actsCompleted, path.join(' > ')).toEqual(
        LONG_ERASURE_ACTS.filter((act) => actsInJournal.has(act)),
      );
      expect([...state.completedActs], path.join(' > ')).toEqual(
        [...score.actsCompleted],
      );
      expect(score.actsCompleted).not.toContain('Ending');
    }
  });
});

describe('The Long Erasure epilogue: default clock sanity', () => {
  it('leaves the documented default clock tight enough to matter', () => {
    // The cheapest authored route consumes 13 clock; the default clock is the
    // documented 17, so slow routes expire rather than the clock being inert.
    const cheapest = play([
      'Log the erasure',
      'Stay silent',
      'Shelter in the dead zone',
      'Ration the stores',
      'Refuse him',
      'Side with the captain',
      'Finish the weave',
    ]);
    expect(cheapest.outcome).toBe('reset');
    expect(cheapest.clock).toBeGreaterThan(0);
    expect(cheapest.clockMax).toBe(DEFAULT_CLOCK_MAX);

    // A slow route (19 clock) does not fit inside the default clock.
    const slow = play([
      'Log the erasure',
      'Transmit the warning',
      'Shelter in the dead zone',
      'Strip the derelict',
      "Take the ally's berth",
      'Bargain in bad faith',
      'Keep the bargain',
      'Follow the thread',
    ]);
    expect(slow.outcome).toBe('expired');
  });

  it('uses the documented default resources', () => {
    const state = createLongErasureRun(0, CONTENT);
    expect(state.resources).toEqual({ ...DEFAULT_RESOURCES });
  });
});
