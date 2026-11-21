/**
 * Teeth tests for the *Long Erasure* playtest harness's reporting extension
 * (CG-0MWPY24IX00719NH).
 *
 * The evaluation note `docs/design/storyline-playtest-evaluation.md` quotes the
 * numbers these helpers produce, so the helpers are pinned here against a hand
 * walk of the real authored content. The extension is **read-only reporting**:
 * it observes the beats a run entered and never changes what the game does, so
 * the determinism test at the bottom is the guard that proves it — two
 * identical replays must agree beat for beat, resource for resource.
 *
 * Covered:
 *
 *   (a) `observeBeat` captures the post-entry clock and resource bag;
 *   (b) `actBoundariesFrom` records exactly one snapshot per act crossed, at the
 *       beat that opened the act, and is derived identically by a hand walk;
 *   (c) a run that never reaches Act III (the abandon terminal) records
 *       `II → Ending` and skips III rather than inventing it;
 *   (d) `pacingFrom` counts beats and offered decisions per act, computes
 *       decision density and prose volume, and leaves terminal beats out;
 *   (e) dead beats are split by cause — an authored single-option transit beat
 *       versus a decision the affordability gate collapsed to one option;
 *   (f) the documented gated route's boundary snapshot is the "one spare tick"
 *       the observation log quotes (`CLOCK LEFT = 1` entering Act III);
 *   (g) replaying a route twice produces identical measurements (the extension
 *       is observable, not invasive);
 *   (h) `summarise` surfaces the pacing aggregates and keeps the existing
 *       slideshow counters.
 *
 * @module tests/scripts/long-erasure-playtest
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  actBoundariesFrom,
  observeBeat,
  pacingFrom,
  playRoute,
  playRun,
  summarise,
  type BeatObservation,
} from '../../scripts/long-erasure-playtest';
import {
  chooseOption,
  createLongErasureRun,
  isComplete,
  longErasureContentFromCsv,
  type LongErasureContent,
  type LongErasureState,
} from '../../example-games/gym/GymLongErasureGame';

/** Repository root, resolved from this file rather than `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The authored content, loaded once through the module's own loader. */
const CONTENT: LongErasureContent = longErasureContentFromCsv(
  readFileSync(join(REPO_ROOT, 'example-games/gym/content/long-erasure.csv'), 'utf-8'),
);

/** The cheapest complete route to the reset ending (the log's `reset-cheap`). */
const RESET_CHEAP = [
  'Log the erasure',
  'Stay silent',
  'Shelter in the dead zone',
  'Ration the stores',
  'Refuse him',
  'Side with the captain',
  'Finish the weave',
] as const;

/** The goodwill-gated route, now completable (the log's `gated-sabotage-core`). */
const GATED_SABOTAGE_CORE = [
  'Log the erasure',
  'Transmit the warning',
  'Shelter in the dead zone',
  'Strip the derelict',
  'Share the berth',
  'Bargain in bad faith',
  'Sabotage the Loom',
  'Break for the core',
  'Hit the core now',
] as const;

/** The deliberately terminal abandon route. */
const ABANDON = [
  'Log the erasure',
  'Stay silent',
  'Shelter in the dead zone',
  'Ration the stores',
  'Abandon the voyage',
] as const;

/** Plays a set of option labels and collects the observations the harness uses. */
function handWalk(labels: readonly string[]): BeatObservation[] {
  let state = createLongErasureRun(1, CONTENT);
  const observations: BeatObservation[] = [observeBeat(state)];
  for (const label of labels) {
    if (isComplete(state)) break;
    const beatBefore = state.beat;
    state = chooseOption(state, label);
    if (state.beat > beatBefore) observations.push(observeBeat(state));
  }
  return observations;
}

describe('Long Erasure playtest harness — act boundaries', () => {
  it('captures the post-entry clock and resource bag for one beat', () => {
    const state: LongErasureState = createLongErasureRun(1, CONTENT);
    expect(state.currentCard.id).toBe('le-i-open');
    // Entry beat: clock 17 → 16 after its cost of 1; "Log the erasure" not yet taken.
    expect(observeBeat(state)).toEqual({
      cardId: 'le-i-open',
      act: 'I',
      offeredOptions: 2,
      clockOnEntry: 16,
      resourcesOnEntry: { hull: 5, morale: 5, stores: 4, goodwill: 0, charge: 2 },
      terminal: false,
    });
  });

  it('records one snapshot per act crossed, at the beat that opened the act', () => {
    const { record, error } = playRoute(CONTENT, 1, RESET_CHEAP);
    expect(error).toBeNull();
    expect(record.actBoundaries).toEqual([
      {
        fromAct: 'I',
        toAct: 'II',
        beat: 4,
        cardId: 'le-ii-shelter',
        clockLeft: 11,
        resources: { hull: 5, morale: 4, stores: 3, goodwill: 0, charge: 2 },
      },
      {
        fromAct: 'II',
        toAct: 'III',
        beat: 7,
        cardId: 'le-iii-approach',
        clockLeft: 4,
        resources: { hull: 5, morale: 6, stores: 3, goodwill: 2, charge: 2 },
      },
      {
        fromAct: 'III',
        toAct: 'Ending',
        beat: 8,
        cardId: 'le-end-reset',
        clockLeft: 4,
        resources: { hull: 5, morale: 6, stores: 3, goodwill: 2, charge: 2 },
      },
    ]);
  });

  it('derives the same boundaries from an independent hand walk', () => {
    const walked = actBoundariesFrom(handWalk(RESET_CHEAP));
    const { record } = playRoute(CONTENT, 1, RESET_CHEAP);
    expect(walked).toEqual(record.actBoundaries);
  });

  it('skips an act the run never entered instead of inventing a boundary', () => {
    const { record, error } = playRoute(CONTENT, 1, ABANDON);
    expect(error).toBeNull();
    expect(record.actBoundaries.map((boundary) => boundary.toAct)).toEqual(['II', 'Ending']);
    expect(record.actBoundaries.some((boundary) => boundary.toAct === 'III')).toBe(false);
  });

  it('places an expired beat outside the boundary record (it was never played)', () => {
    // This route expires entering Act III: the beat is unpayable, so no
    // boundary is recorded for Act III and the last snapshot is Act I → II.
    const expiring = [
      'Log the erasure',
      'Transmit the warning',
      'Shelter in the dead zone',
      'Strip the derelict',
      'Share the berth',
      'Bargain in bad faith',
      'Keep the bargain',
      'Follow the thread',
    ] as const;
    const { record } = playRoute(CONTENT, 1, expiring);
    expect(record.outcome).toBe('expired');
    expect(record.actBoundaries.map((boundary) => boundary.toAct)).toEqual(['II']);
    // The unplayed beat is not counted as a beat, a decision or a dead beat.
    expect(record.beats).toBe(8);
  });
});

describe('Long Erasure playtest harness — pacing', () => {
  it('counts beats and offered decisions per act with density and prose volume', () => {
    const { record } = playRoute(CONTENT, 1, RESET_CHEAP);
    expect(record.pacing).toEqual({
      beatsPerAct: { I: 3, II: 3, III: 1, Ending: 1 },
      decisionsPerAct: { I: 3, II: 3, III: 1 },
      decisionDensity: { I: 1, II: 1, III: 1, Ending: 0 },
      density: 0.88,
      deadBeats: 0,
      deadBeatIds: [],
      authoredDeadBeats: 0,
      gateCollapsedBeats: 0,
      proseWords: 106,
    });
  });

  it('matches a hand walk of the same route', () => {
    const walked = handWalk(GATED_SABOTAGE_CORE);
    expect(pacingFrom(walked, CONTENT)).toEqual(
      playRoute(CONTENT, 1, GATED_SABOTAGE_CORE).record.pacing,
    );
  });

  it('counts an authored single-option transit beat as an authored dead beat', () => {
    // "Keep the bargain" leads to `le-ii-keep`, which is authored with one option.
    const keeping = [
      'Log the erasure',
      'Transmit the warning',
      'Shelter in the dead zone',
      'Strip the derelict',
      'Share the berth',
      'Bargain in bad faith',
      'Keep the bargain',
    ] as const;
    const { record } = playRoute(CONTENT, 1, keeping);
    expect(record.pacing.deadBeatIds).toContain('le-ii-keep');
    expect(record.pacing.authoredDeadBeats).toBe(1);
    expect(record.pacing.gateCollapsedBeats).toBe(0);
  });

  it('counts a decision the affordability gate hid as a gate-collapsed dead beat', () => {
    // `le-ii-salvage` offers "Take the ally's berth" only at goodwill ≥ 3; this
    // route arrives with less, so a two-option decision reaches the screen as
    // a single button.
    const poor = [
      'Log the erasure',
      'Stay silent',
      'Shelter in the dead zone',
      'Strip the derelict',
    ] as const;
    const observations = handWalk(poor);
    const salvage = observations.find((beat) => beat.cardId === 'le-ii-salvage');
    expect(salvage).toBeDefined();
    expect(salvage?.offeredOptions).toBe(1);
    expect(pacingFrom(observations.slice(0, 5), CONTENT).gateCollapsedBeats).toBe(1);
  });

  it('keeps terminal beats out of both decisions and dead beats', () => {
    const observations = handWalk(RESET_CHEAP);
    const terminal = observations[observations.length - 1];
    expect(terminal.terminal).toBe(true);
    expect(terminal.cardId).toBe('le-end-reset');
    // The ending card offers "begin again", but it is the conclusion, not a
    // turn: it is neither a decision nor a dead beat.
    expect(terminal.offeredOptions).toBe(0);
    expect(pacingFrom(observations, CONTENT).deadBeats).toBe(0);
    expect(pacingFrom(observations, CONTENT).decisionsPerAct.Ending).toBeUndefined();
  });

  it('records the documented gated route with one spare tick entering Act III', () => {
    const { record, error } = playRoute(CONTENT, 1, GATED_SABOTAGE_CORE);
    expect(error).toBeNull();
    expect(record.outcome).toBe('closed');
    expect(record.endingId).toBe('le-end-ram');
    const actIII = record.actBoundaries.find((boundary) => boundary.toAct === 'III');
    expect(actIII).toMatchObject({
      fromAct: 'II',
      toAct: 'III',
      beat: 9,
      cardId: 'le-iii-ahead',
      clockLeft: 1,
    });
    expect(record.pacing.beatsPerAct).toEqual({ I: 3, II: 5, III: 1, Ending: 1 });
    expect(record.pacing.deadBeats).toBe(0);
    expect(record.pacing.proseWords).toBe(126);
  });
});

describe('Long Erasure playtest harness — read-only contract', () => {
  it('replays a route with identical measurements', () => {
    const first = playRoute(CONTENT, 1, GATED_SABOTAGE_CORE);
    const second = playRoute(CONTENT, 1, GATED_SABOTAGE_CORE);
    const strip = ({ durationMs: _duration, ...rest }: typeof first.record) => rest;
    expect(strip(second.record)).toEqual(strip(first.record));
    expect(second.journal).toEqual(first.journal);
  });

  it('summarises pacing without disturbing the slideshow counters', () => {
    const records = [1, 2].flatMap((seed) => [
      playRun(CONTENT, seed, 'first'),
      playRun(CONTENT, seed, 'last'),
    ]);
    const summary = summarise(records) as {
      runs: number;
      decisionsMet: number;
      visibleConsequences: number;
      pacing: {
        beatsPerAct: Record<string, number>;
        deadBeatsPerRun: number;
        authoredDeadBeats: number;
        gateCollapsedBeats: number;
      };
    };
    expect(summary.runs).toBe(4);
    expect(summary.decisionsMet).toBeGreaterThan(0);
    expect(summary.visibleConsequences).toBeGreaterThan(0);
    expect(summary.pacing.beatsPerAct).toHaveProperty('I');
    // Every dead beat is attributed to exactly one cause, and the per-run mean
    // divides that total back out over the sample.
    const totalDeadBeats = records.reduce(
      (total, record) => total + record.pacing.deadBeats,
      0,
    );
    expect(
      summary.pacing.authoredDeadBeats + summary.pacing.gateCollapsedBeats,
    ).toBe(totalDeadBeats);
    expect(summary.pacing.deadBeatsPerRun).toBe(totalDeadBeats / records.length);
  });
});
