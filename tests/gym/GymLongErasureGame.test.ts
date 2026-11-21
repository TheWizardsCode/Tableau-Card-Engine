/**
 * GymLongErasureGame — headless tests for *The Long Erasure*'s narrative brain
 * (CG-0MWNHZA1A007BRVT).
 *
 * The module under test is the Phaser-free seam the Gym scene renders: a run
 * is created from the authored content + a seed and every transition is a
 * pure `state in → plain data out` function. These tests therefore drive the
 * **real authored CSV** end to end, headlessly:
 *
 * - determinism (same seed ⇒ same run, including the single seeded candidate
 *   draw, and a different seed where the content offers alternatives);
 * - act gating (acts only advance, and a backward successor is rejected);
 * - the pressure clock (per-beat cost, the soft zero boundary, hard expiry);
 * - the state-gated branch (`goodwill:3`) on both sides of its threshold;
 * - the terminals (reset ending, deliberate abandon) and the journal.
 *
 * The import-boundary guard at the top is the executable form of the module's
 * "no Phaser" contract: a throwing `vi.mock('phaser')` means any transitive
 * Phaser evaluation fails this file, with a negative control so a guard that
 * cannot fire is itself a failure.
 *
 * @module tests/gym/GymLongErasureGame
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

/** Marker so the negative control can attribute a rejection to Phaser. */
const PHASER_EVALUATED = 'phaser evaluated at import time under the Long Erasure guard';

/** How many times the throwing mock factory actually ran. */
const phaserMock = vi.hoisted(() => ({ calls: 0 }));

vi.mock('phaser', () => {
  phaserMock.calls += 1;
  throw new Error(PHASER_EVALUATED);
});

import {
  DEFAULT_CLOCK_MAX,
  DEFAULT_RESOURCES,
  LONG_ERASURE_RESOURCES,
  LongErasureError,
  advanceClock,
  availableOptions,
  buildEpilogue,
  chooseOption,
  createLongErasureRun,
  isComplete,
  longErasureContentFromCsv,
  runJournal,
  scoreRun,
  type LongErasureContent,
  type LongErasureState,
} from '../../example-games/gym/GymLongErasureGame';
import { DEFAULT_OUTCOME_MAX_LENGTH } from '../../src/story-line/journal';

/** Repository root, resolved from this file rather than `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Repository-relative path of the authored content. */
const CONTENT_PATH = 'example-games/gym/content/long-erasure.csv';

/** Repository-relative path of the Phaser-free module under test. */
const MODULE_PATH = 'example-games/gym/GymLongErasureGame.ts';

/** Reads a repository-relative UTF-8 file. */
function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf-8');
}

/** The authored content, loaded once through the module's own loader. */
const CONTENT: LongErasureContent = longErasureContentFromCsv(
  readRepoFile(CONTENT_PATH),
);

/** Options passed to {@link play}. */
interface PlayOptions {
  readonly seed?: number;
  readonly clockMax?: number;
  readonly resources?: Readonly<Record<string, number>>;
}

/** Starts a run and applies `labels` in order. */
function play(labels: readonly string[], options: PlayOptions = {}): LongErasureState {
  const runOptions: { clockMax?: number; resources?: Readonly<Record<string, number>> } = {};
  if (options.clockMax !== undefined) runOptions.clockMax = options.clockMax;
  if (options.resources !== undefined) runOptions.resources = options.resources;

  let state = createLongErasureRun(
    options.seed ?? 0,
    CONTENT,
    runOptions,
  );
  for (const label of labels) state = chooseOption(state, label);
  return state;
}

/** The option labels currently offered. */
function labelsOf(state: LongErasureState): string[] {
  return availableOptions(state).map((option) => option.label);
}

/** Runs `fn`, returning the thrown {@link LongErasureError} (if any). */
function caughtError(fn: () => unknown): LongErasureError | null {
  try {
    fn();
  } catch (error) {
    if (error instanceof LongErasureError) return error;
    throw error;
  }
  return null;
}

/** Deeply freezes a value so an accidental mutation throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/** The scripted route through Act I into Act II (`le-ii-shelter`). */
const ACT_II_PATH = [
  'Rally the survey crew',
  'Hold the survey line',
  'Shelter in the dead zone',
] as const;

/**
 * The cheap keep-the-bargain route to the reset ending, priced at 16 clock
 * after the survivability nudge (17 before it). The default clock (17) now
 * leaves one tick spare on it, so the soft zero-clock boundary is exercised
 * with an explicit `clockMax` instead.
 */
const RESET_PATH = [
  'Rally the survey crew',
  'Hold the survey line',
  'Push deeper',
  'Leave it be',
  'Bargain in bad faith',
  'Keep the bargain',
  'Follow the thread',
  'Finish the weave',
] as const;

/**
 * A slow route (18 clock) that runs out of time on its final beat: the clock
 * is hard-terminal, so the run expires instead of entering the act III beat.
 */
const EXPIRY_PATH = [
  'Log the erasure',
  'Transmit the warning',
  'Shelter in the dead zone',
  'Strip the derelict',
  'Take the ally\'s berth',
  'Bargain in bad faith',
  'Keep the bargain',
  'Follow the thread',
] as const;

/** Route to `le-ii-bargain` that accumulates only 2 goodwill (gate closed). */
const GOODWILL_TWO_PATH = [
  'Log the erasure',
  'Transmit the warning',
  'Push deeper',
  'Leave it be',
  'Bargain in bad faith',
] as const;

/** Route to `le-ii-bargain` that accumulates 3 goodwill (gate open). */
const GOODWILL_THREE_PATH = [
  'Log the erasure',
  'Transmit the warning',
  'Push deeper',
  'Strip the locker',
  'Share the berth',
  'Bargain in bad faith',
] as const;

/**
 * The documented gated sabotage route, walked end to end: it accumulates the
 * full three goodwill (`Share the berth`), pays `Sabotage the Loom` in full and
 * takes the charge-gated short-cut (`Break for the core` → `le-iii-ahead`) to
 * ram the core.
 *
 * CG-0MWPVYTSU0065BXC — this is the survivability guard for the goodwill-gated
 * branch. On the pre-fix content the route expired on `le-iii-ahead` with 2
 * clock left (`scripts/long-erasure-playtest.ts --seeds 40` reported
 * `gated beat: routes=4 completed=0`); after the content-only nudge
 * (`le-ii-bargain` clockCost 3 → 2 and `le-ii-sabotage` 2 → 1) it closes on
 * `le-end-ram` with 1 clock unspent (`gated beat: routes=10 completed=8`).
 */
const GATED_SURVIVAL_PATH = [
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

/** Route to the Act II negotiation beat, from which the run can be abandoned. */
const ABANDON_PATH = [
  'Rally the survey crew',
  'Turn for the muster',
  'Push deeper',
  'Leave it be',
  'Abandon the voyage',
] as const;

describe('The Long Erasure: content loading', () => {
  it('loads the authored content through the shipped adapter', () => {
    expect(CONTENT.entryCardId).toBe('le-i-open');
    expect(CONTENT.cards).toHaveLength(19);
    expect(CONTENT.cards[0].id).toBe('le-i-open');
    expect([...CONTENT.resources]).toEqual([...LONG_ERASURE_RESOURCES]);
    expect(CONTENT.clockMax).toBe(DEFAULT_CLOCK_MAX);
    // Cards carry the narrative columns the run needs.
    for (const card of CONTENT.cards) {
      expect(['I', 'II', 'III', 'Ending']).toContain(card.act);
      expect(Number.isFinite(card.clockCost)).toBe(true);
    }
  });

  it('rejects malformed content with a machine-readable reason', () => {
    const csv = readRepoFile(CONTENT_PATH);
    const duplicate = csv.replace(
      'le-i-rally,The Missing Berth',
      'le-i-log,The Missing Berth',
    );
    expect(duplicate).not.toBe(csv);
    expect(caughtError(() => longErasureContentFromCsv(duplicate))).toMatchObject({
      code: 'invalid-content',
    });

    const badAct = csv.replace(',I,1', ',IV,1');
    expect(badAct).not.toBe(csv);
    expect(caughtError(() => longErasureContentFromCsv(badAct))).toMatchObject({
      code: 'invalid-content',
    });

    expect(caughtError(() => longErasureContentFromCsv(''))).toMatchObject({
      code: 'invalid-content',
    });
  });
});

describe('The Long Erasure: headless run', () => {
  it('starts at the entry card with the entry beat already played', () => {
    const state = createLongErasureRun(0, CONTENT);

    expect(state.status).toBe('playing');
    expect(isComplete(state)).toBe(false);
    expect(state.act).toBe('I');
    expect(state.beat).toBe(1);
    expect(state.currentCard.id).toBe('le-i-open');
    expect(state.clock).toBe(DEFAULT_CLOCK_MAX - state.currentCard.clockCost);
    expect(state.clockMax).toBe(DEFAULT_CLOCK_MAX);
    expect(state.resources).toEqual({
      ...DEFAULT_RESOURCES,
    });
    expect(state.history).toEqual([]);
    expect(state.completedActs).toEqual([]);
    expect(labelsOf(state)).toEqual(['Log the erasure', 'Rally the survey crew']);
  });

  it('plays Act I → Act II → Act III → a scored epilogue', () => {
    const state = play(RESET_PATH);

    expect(isComplete(state)).toBe(true);
    expect(state.outcome).toBe('reset');
    expect(state.endingId).toBe('le-end-reset');
    expect(state.completedActs).toEqual(['I', 'II', 'III']);
    expect(state.currentCard.act).toBe('Ending');
    expect(state.history).toHaveLength(RESET_PATH.length);

    const epilogue = buildEpilogue(state);
    expect(epilogue.reset).toBe(true);
    expect(epilogue.endingName).toBe('The Long Erasure');
    expect(epilogue.journal).toHaveLength(RESET_PATH.length);
    expect(epilogue.score.total).toBeGreaterThan(0);
  });
});

describe('The Long Erasure: determinism', () => {
  it('replays an identical run from the same seed and choices', () => {
    const first = play(RESET_PATH, { seed: 42 });
    const second = play(RESET_PATH, { seed: 42 });

    expect(second).toEqual(first);
    expect(runJournal(second)).toEqual(runJournal(first));
    expect(scoreRun(second)).toEqual(scoreRun(first));
  });

  it('draws the single seeded successor differently for a different seed', () => {
    // The `Break for the core` option offers two candidates and its
    // `#when=charge>=2` rule does not match here (charge is 1), so exactly one
    // seeded draw decides the successor.
    const sabotagePath = [
      'Log the erasure',
      'Transmit the warning',
      'Push deeper',
      'Strip the locker',
      'Share the berth',
      'Bargain in bad faith',
      'Sabotage the Loom',
    ] as const;

    const first = play([...sabotagePath, 'Break for the core'], {
      seed: 0,
      clockMax: 30,
    });
    const again = play([...sabotagePath, 'Break for the core'], {
      seed: 0,
      clockMax: 30,
    });
    const other = play([...sabotagePath, 'Break for the core'], {
      seed: 1290,
      clockMax: 30,
    });

    expect(again).toEqual(first);
    expect(first.currentCard.id).toBe('le-iii-ahead');
    expect(other.currentCard.id).toBe('le-iii-approach');
  });

  it('consumes no draw when a conditional successor rule matches', () => {
    // With three starting charge the `Transmit the warning` payment leaves the
    // gating resource at 2, so `#when=charge>=2` selects `le-iii-ahead`
    // deterministically — for every seed, and without touching the rng.
    const sabotagePath = [
      'Log the erasure',
      'Transmit the warning',
      'Push deeper',
      'Strip the locker',
      'Share the berth',
      'Bargain in bad faith',
      'Sabotage the Loom',
    ] as const;
    const options = {
      clockMax: 30,
      resources: { ...DEFAULT_RESOURCES, charge: 3 },
    };

    const seeds = [0, 7, 1290];
    for (const seed of seeds) {
      const before = play(sabotagePath, { seed, ...options });
      const after = chooseOption(before, 'Break for the core');
      expect(after.currentCard.id).toBe('le-iii-ahead');
      expect(after.rngSeed).toBe(before.rngSeed);
    }
  });
});

describe('The Long Erasure: act gating', () => {
  it('advances acts in order and records each act a choice was played in', () => {
    let state = createLongErasureRun(0, CONTENT, { clockMax: 40 });
    expect(state.completedActs).toEqual([]);

    for (const label of ACT_II_PATH) state = chooseOption(state, label);
    expect(state.currentCard.id).toBe('le-ii-shelter');
    expect(state.act).toBe('II');
    expect(state.completedActs).toEqual(['I']);

    for (const label of [
      'Strip the derelict',
      'Share the berth',
      'Bargain in bad faith',
      'Keep the bargain',
      'Follow the thread',
    ]) {
      state = chooseOption(state, label);
    }
    expect(state.currentCard.id).toBe('le-iii-approach');
    expect(state.act).toBe('III');
    expect(state.completedActs).toEqual(['I', 'II']);

    state = chooseOption(state, 'Finish the weave');
    expect(state.completedActs).toEqual(['I', 'II', 'III']);
  });

  it('rejects a successor that steps back into an earlier act', () => {
    // Only the reset ending is authored backwards (Ending → entry); the module
    // stops at the ending, so a *playing* run may never re-enter an act.
    const patched: LongErasureContent = {
      ...CONTENT,
      cards: CONTENT.cards.map((card) =>
        card.id === 'le-ii-shelter'
          ? { ...card, options: 'Turn back|le-i-open' }
          : card,
      ),
    };

    let state = createLongErasureRun(0, patched);
    for (const label of ACT_II_PATH) state = chooseOption(state, label);

    expect(caughtError(() => chooseOption(state, 'Turn back'))).toMatchObject({
      code: 'backward-act',
    });
  });
});

describe('The Long Erasure: pressure clock', () => {
  it('costs every beat its authored clock price', () => {
    const path = ACT_II_PATH;
    let state = createLongErasureRun(0, CONTENT);
    let expected = state.clock;

    for (const label of path) {
      const before = state;
      state = chooseOption(state, label);
      expected -= state.currentCard.clockCost;
      expect(state.clock, `${label} → ${state.currentCard.id}`).toBe(expected);
      expect(state.clock).toBeLessThan(before.clock);
    }
  });

  it('is soft at the boundary: reaching zero leaves the run playable', () => {
    // CG-0MWPVYTSU0065BXC freed a tick on `le-ii-bargain`, so this route now
    // costs 16 of the default 17 clock; the exact-zero boundary is exercised
    // with an explicit budget of 16.
    const beforeEnding = play(RESET_PATH.slice(0, -1), { clockMax: 16 });
    expect(beforeEnding.currentCard.id).toBe('le-iii-approach');
    expect(beforeEnding.clock).toBe(0);
    expect(isComplete(beforeEnding)).toBe(false);

    const state = chooseOption(beforeEnding, 'Finish the weave');
    expect(state.clock).toBe(0);
    expect(isComplete(state)).toBe(true);
    expect(state.outcome).toBe('reset');

    // Under the default clock the same route reaches the core with one tick
    // to spare — the survivability nudge's intended (and recorded) effect.
    expect(play(RESET_PATH.slice(0, -1)).clock).toBe(1);
  });

  it('is hard beyond the boundary: an unpayable beat expires the run terminally', () => {
    const state = play(EXPIRY_PATH);

    expect(state.status).toBe('complete');
    expect(isComplete(state)).toBe(true);
    expect(state.outcome).toBe('expired');
    expect(state.endingId).toBeNull();
    // The beat that could not be paid is named, but was never entered…
    expect(state.currentCard.id).toBe('le-iii-approach');
    expect(state.act).toBe('II');
    // Acts I–II were played (five choices in Act II); the unpayable Act III
    // beat was never entered, so it earns nothing — but Act II is not withheld.
    expect(state.completedActs).toEqual(['I', 'II']);
    expect(state.beat).toBe(8);
    // …no clock was deducted, no options are offered and no choice is possible.
    // (2 post-nudge: `le-ii-bargain` now costs 2, not 3 — CG-0MWPVYTSU0065BXC.)
    expect(state.clock).toBe(2);
    expect(availableOptions(state)).toEqual([]);
    expect(caughtError(() => chooseOption(state, 'Finish the weave'))).toMatchObject({
      code: 'complete',
    });
    // An expired run is still scored (and scored as an unfinished arc).
    expect(scoreRun(state).components.arc).toBe(35);
  });

  it('exposes the clock primitive with the same soft/hard contract', () => {
    const state = createLongErasureRun(0, CONTENT);
    expect(state.clock).toBe(16);

    const toZero = advanceClock(state, state.clock);
    expect(toZero.clock).toBe(0);
    expect(toZero.status).toBe('playing');

    const expired = advanceClock(state, state.clock + 1);
    expect(expired.clock).toBe(state.clock);
    expect(expired.status).toBe('complete');
    expect(expired.outcome).toBe('expired');

    // A completed run is never ticked further.
    expect(advanceClock(expired)).toBe(expired);
  });
});

describe('The Long Erasure: state-gated branch', () => {
  it('withholds the gated option until the gating resource is accumulated', () => {
    const below = play(GOODWILL_TWO_PATH);
    expect(below.currentCard.id).toBe('le-ii-bargain');
    expect(below.resources.goodwill).toBe(2);
    expect(labelsOf(below)).toEqual(['Keep the bargain']);

    const atThreshold = play(GOODWILL_THREE_PATH);
    expect(atThreshold.currentCard.id).toBe('le-ii-bargain');
    expect(atThreshold.resources.goodwill).toBe(3);
    expect(labelsOf(atThreshold)).toEqual([
      'Sabotage the Loom',
      'Keep the bargain',
    ]);
  });

  it('pays the gated option\'s cost when it is taken', () => {
    const before = play(GOODWILL_THREE_PATH);
    const after = chooseOption(before, 'Sabotage the Loom');

    expect(after.currentCard.id).toBe('le-ii-sabotage');
    expect(after.resources.goodwill).toBe(0);
    expect(after.history[after.history.length - 1]).toMatchObject({
      cardId: 'le-ii-bargain',
      option: 'Sabotage the Loom',
      cost: { goodwill: 3 },
    });
  });

  it('lets the gated sabotage branch survive to an ending with clock to spare', () => {
    const state = play(GATED_SURVIVAL_PATH);

    // The whole gated branch is walkable: the gate opened, the sabotage was
    // paid for, and the charge-gated short-cut led to the core.
    expect(state.currentCard.id).toBe('le-end-ram');
    expect(state.status).toBe('complete');
    expect(state.outcome).not.toBe('expired');
    expect(state.outcome).toBe('closed');
    expect(state.endingId).toBe('le-end-ram');
    expect(state.endingId).not.toBeNull();
    // The nudge buys exactly one unspent tick on this route (measured: 1;
    // pre-fix the run expired while entering `le-iii-ahead` with 2 left).
    expect(state.clock).toBe(1);
    expect(state.clock).toBeGreaterThanOrEqual(1);
  });
});

describe('The Long Erasure: terminals and journal', () => {
  it('expresses the reset ending as complete + reset, never won/lost', () => {
    const state = play(RESET_PATH);

    expect(state.status).toBe('complete');
    expect(state.outcome).toBe('reset');
    expect(Object.keys(state)).not.toContain('won');
    expect(Object.keys(state)).not.toContain('lost');
    // The score and the journal are the surviving record of the voyage.
    expect(buildEpilogue(state).score.total).toBeGreaterThan(0);
    expect(buildEpilogue(state).journal).toHaveLength(RESET_PATH.length);
  });

  it('closes the run on the deliberate "abandon the voyage" terminal option', () => {
    const state = play(ABANDON_PATH);

    expect(state.status).toBe('complete');
    expect(state.outcome).toBe('closed');
    expect(state.endingId).toBe('le-end-abandon');
    // Act III was never played, so the ending card entry earns no Act III credit
    // (CG-0MWNSR376002QBY9).
    expect(state.completedActs).toEqual(['I', 'II']);
    expect(availableOptions(state)).toEqual([]);
    expect(labelsOf(state)).toEqual([]);
  });

  it('journals exactly one row per choice, most recent first, in the authored prose', () => {
    const state = play(RESET_PATH);
    const journal = runJournal(state);

    expect(journal).toHaveLength(state.history.length);
    // One row per choice, newest first, and each row is the **authored**
    // consequence of that choice (never a paraphrase of the option label).
    const newest = state.history[state.history.length - 1];
    const oldest = state.history[0];
    expect(newest.outcomeProse).toBeTruthy();
    expect(oldest.outcomeProse).toBeTruthy();
    expect(journal[0].outcomeFull).toBe(newest.outcomeProse);
    expect(journal[journal.length - 1].outcomeFull).toBe(oldest.outcomeProse);
    for (const entry of journal) {
      expect(entry.turn).toBeGreaterThan(0);
      expect(entry.storyline).toBe('The Long Erasure');
      expect(entry.text.startsWith('Story update — ')).toBe(true);
    }
  });
});

describe('The Long Erasure: purity of the transition surface', () => {
  it('never mutates the input state and returns plain data', () => {
    const state = deepFreeze(play(RESET_PATH.slice(0, 3)));
    const snapshot = JSON.parse(JSON.stringify(state)) as unknown;

    const next = chooseOption(state, 'Leave it be');

    expect(state).toEqual(snapshot);
    expect(next).not.toBe(state);
    // Plain data: a JSON round-trip is lossless (no functions/class instances).
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);

    const options = availableOptions(state);
    expect(JSON.parse(JSON.stringify(options))).toEqual(options);

    const score = scoreRun(state);
    expect(state).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify(score))).toEqual(score);
  });

  it('reads the same state to the same derived view every time', () => {
    const state = play(RESET_PATH);
    expect(labelsOf(state)).toEqual(labelsOf(state));
    expect(scoreRun(state)).toEqual(scoreRun(state));
    expect(buildEpilogue(state)).toEqual(buildEpilogue(state));
  });
});

// ── Narrative view model (prose contract) ───────────────────────────

/**
 * The prose fields the narrative slice adds to the Phaser-free view model
 * (`CG-0MWO7CRT9001BLNL` pins this shape; sibling `CG-0MWO7CVDI004J3JX`
 * implements it).
 *
 * | Surface | Agreed shape |
 * |---|---|
 * | current beat | `LongErasureCard.context: string \| null` |
 * | options | `StorylineOption.says?: string` (via `availableOptions`) |
 * | resolved outcome | `LongErasureHistoryEntry.outcomeProse: string \| null` |
 * | closing screen | `LongErasureEpilogue.epilogueProse: string \| null` |
 *
 * Cases were red under `it.fails` while the slice was in progress (see
 * `tests/story-line/content/prose-contract.test.ts` for the convention). They
 * are enabled now that this item implements the shape; the marker must not
 * come back.
 */
describe('The Long Erasure: narrative view model (prose contract)', () => {
  /** Reads a compiled option's authored outcome prose, or `null`. */
  function saysOf(option: unknown): string | null {
    return (option as { says?: string | null }).says ?? null;
  }

  /** The prose fixture, loaded through the module's own CSV loader. */
  function proseContent(): LongErasureContent {
    return longErasureContentFromCsv(
      readRepoFile('tests/fixtures/story-line/prose/long-erasure-prose.csv'),
    );
  }

  /** The no-prose fixture (the fallback path). */
  function bareContent(): LongErasureContent {
    return longErasureContentFromCsv(
      readRepoFile('tests/fixtures/story-line/prose/long-erasure-bare.csv'),
    );
  }

  /** Plays the prose fixture to its ending (`Log` then `Seal`). */
  function playToEnding(): LongErasureState {
    const started = createLongErasureRun(1, proseContent());
    const logged = chooseOption(started, 'Log the erasure');
    return chooseOption(logged, 'Seal the hatch');
  }

  it('[red] exposes the current beat’s context headlessly', () => {
    const content = proseContent();
    expect(content.cards[0].context).toBe(
      'The Ashlight holds station at the edge of an Unwriting. Archivist Vane has been here before; the crew have not.',
    );
  });

  it('[green] exposes each option’s authored outcome prose', () => {
    const started = createLongErasureRun(1, proseContent());
    const options = availableOptions(started);
    expect(options.map((option) => option.label)).toEqual([
      'Log the erasure',
      'Rally the crew',
    ]);
    expect(saysOf(options[0]!)).toBe(
      'You log it, and the charts go blank with it.',
    );
    expect(saysOf(options[1]!)).toBe(
      'You raise your voice in a corridor that no longer ends.',
    );
  });

  it('[red] exposes the resolved outcome prose on the journey history', () => {
    const finished = playToEnding();
    expect(finished.history[0].outcomeProse).toBe(
      'You log it, and the charts go blank with it.',
    );
    expect(finished.history[1].outcomeProse).toBe(
      'The hatch seals behind you, and the reading stops mattering.',
    );
  });

  it('[red] exposes the terminal card’s authored epilogue', () => {
    const finished = playToEnding();
    expect(buildEpilogue(finished).epilogueProse).toBe(
      'The timeline closes over the erasure like water. You are the only thing that remembers the room.',
    );
  });

  it('[green] falls back to no prose when the content authors none', () => {
    // The absent-prose path must stay total: `null` (never `''`, never a
    // throw) on every prose surface.
    const content = bareContent();
    expect(content.cards[0].context ?? null).toBeNull();

    const started = createLongErasureRun(1, content);
    expect(saysOf(availableOptions(started)[0]!)).toBeNull();

    const finished = chooseOption(started, 'Walk on');
    expect(finished.history[0].outcomeProse ?? null).toBeNull();
    expect(buildEpilogue(finished).epilogueProse ?? null).toBeNull();
  });

  it('journals the authored outcome prose, truncated to one display line', () => {
    const finished = playToEnding();
    const journal = runJournal(finished);

    // AC7: the journal carries the writer's consequence, not
    // `You chose "…"` / the old label paraphrase.
    expect(journal[0].outcome).toBe('The hatch seals behind you, and the reading stops mattering.');
    expect(journal[1].outcome).toBe('You log it, and the charts go blank with it.');
    expect(journal[0].outcome).not.toContain('You chose');
    expect(journal[0].outcomeFull).toBe(
      'The hatch seals behind you, and the reading stops mattering.',
    );
  });

  it('truncates an over-long authored outcome in the journal without losing it', () => {
    // A long authored consequence is ellipsised to one display line by the
    // shared helper; the untruncated copy survives on the same journal entry.
    const longOutcome = `${'word '.repeat(60).trim()}`;
    const csv = [
      'id,name,effect,options,storylineId,storylineTitle,resources,act,clockCost,context,epilogue',
      `le-x-open,Open,An opening.,"Wait|le-x-end#says=${longOutcome}",long-erasure,The Long Erasure,"hull,morale,stores,goodwill,charge",I,1,,`,
      'le-x-end,End,It ends.,,long-erasure,The Long Erasure,"hull,morale,stores,goodwill,charge",Ending,1,,A closing line.',
    ].join('\n');

    const finished = chooseOption(
      createLongErasureRun(1, longErasureContentFromCsv(csv)),
      'Wait',
    );
    const row = runJournal(finished)[0];

    expect(row.outcome.length).toBeLessThanOrEqual(DEFAULT_OUTCOME_MAX_LENGTH);
    expect(row.outcome.endsWith('…')).toBe(true);
    expect(row.outcome.includes('\n')).toBe(false);
    expect(row.outcomeFull).toBe(longOutcome);
    expect(finished.history[0].outcomeProse).toBe(longOutcome);
  });
});

describe('The Long Erasure: import boundary', () => {
  it('imports no Phaser and no scene module', () => {
    const source = readRepoFile(MODULE_PATH);
    const specifiers = [
      ...source.matchAll(/from\s+['"]([^'"]+)['"]/g),
      ...source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1] ?? '');

    // Non-vacuous guard: the scan really found the module's imports.
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier.toLowerCase()).not.toContain('phaser');
      expect(specifier).not.toMatch(/scenes\//);
    }
  });

  it('never evaluates Phaser for this module graph', () => {
    // The throwing factory above is file-scoped and has not run: neither the
    // module under test nor its `@story-line` dependencies touch Phaser.
    expect(phaserMock.calls).toBe(0);
  });

  it('negative control: a Phaser-bearing module fails under the same mock', async () => {
    const callsBefore = phaserMock.calls;
    await expect(import('../../src/ui/Renderer')).rejects.toThrow();
    expect(phaserMock.calls).toBeGreaterThan(callsBefore);
  });
});
