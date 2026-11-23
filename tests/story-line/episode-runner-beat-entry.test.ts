/**
 * Episode runner beat entry (GDD §2.3 steps A.1–A.3).
 *
 * This suite owns the first three numbered steps of the routing contract:
 *
 * - **A.1** a beat's `clockCost` is read from the validated manifest (never
 *   from the legacy per-card CSV column) — the affordable entry below asserts
 *   the returned cost against the manifest beat it selected;
 * - **A.2** a beat whose cost exceeds the remaining clock is refused: it is not
 *   played, its options are never presented, and the refusal carries
 *   `budgetExhausted = true` + reason `budget-exhausted` for the scene close;
 * - **A.3** otherwise the cost is charged, the card's `context` prose and the
 *   (already affordance-gated) options are presented — and a cost exactly equal
 *   to the remaining clock is affordable, because spending the last tick is a
 *   legal authored climax.
 *
 * Every assertion runs against the committed fixture lane
 * (`tests/story-line/helpers/episode-fixture.ts`): the real manifest, the real
 * content adapter and the real `createStorylineSystem` choice model, with the
 * headless engine double recording RNG draws so "beat entry consumes no RNG"
 * is proved rather than assumed.
 *
 * @module
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createEpisodeRunner,
  type BeatEntry,
} from '../../src/story-line';
import type { EpisodeManifest } from '../../src/story-line/content/episode-manifest';
import {
  DEFAULT_EPISODE_SEED,
  episodeStep,
  loadEpisodeFixture,
  stepsOwnedBy,
  type EpisodeFixture,
} from './helpers/episode-fixture';

// ── Helpers ─────────────────────────────────────────────────

/** Builds the runner under test, optionally from an in-memory manifest copy. */
function makeRunner(fixture: EpisodeFixture, manifest: EpisodeManifest = fixture.manifest) {
  return createEpisodeRunner({
    manifest,
    storyline: fixture.storyline,
    content: fixture.cardsById,
    seed: DEFAULT_EPISODE_SEED,
  });
}

/**
 * Returns a manifest copy whose `start` points at a chosen scene / beat.
 *
 * The fixture loader accepts a manifest override, so a test can begin a run at
 * the scene it needs without editing the committed fixture (the file stays the
 * single source of truth for the episode's content).
 */
function manifestStartingAt(
  fixture: EpisodeFixture,
  sceneId: string,
  beatId: string,
): EpisodeManifest {
  const act = fixture.manifest.acts.find((candidate) =>
    candidate.scenes.some((scene) => scene.id === sceneId),
  );
  if (act === undefined) throw new Error(`fixture has no act declaring scene "${sceneId}"`);
  return { ...fixture.manifest, start: { act: act.id, scene: sceneId, beat: beatId } };
}

/** Asserts the §2.3 step a test covers is registered against this suite. */
function expectOwnsStep(id: string): void {
  const step = episodeStep(id);
  expect(step).toBeDefined();
  expect(step?.owningTest).toBe('episode-runner-beat-entry');
}

// ── The suite ───────────────────────────────────────────────

describe('episode runner beat entry', () => {
  it('registers A.1–A.3 against this suite in the §2.3 step map', () => {
    expect(stepsOwnedBy('episode-runner-beat-entry').map((step) => step.id)).toEqual([
      'A.1',
      'A.2',
      'A.3',
    ]);
    expect(episodeStep('A.2')?.contract).toContain('budget-exhausted');
    expect(episodeStep('A.3')?.contract).toContain('isOptionAffordable');

    // The record is a discriminated union, so a caller presenting options
    // cannot reach them on a refusal.
    expectTypeOf<BeatEntry['status']>().toEqualTypeOf<'presented' | 'refused'>();
  });

  it('A.1/A.3 charges the manifest cost and presents the beat when affordable', () => {
    expectOwnsStep('A.1');
    expectOwnsStep('A.3');

    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    const scene = fixture.manifest.acts[0].scenes.find((s) => s.id === 's-i-open')!;
    const beat = scene.beats.find((b) => b.cardId === 'le-i-open')!;
    const card = fixture.cardsById.get('le-i-open')!;

    const entry = runner.enterBeat('le-i-open', fixture.state);

    // A.1: the cost is the manifest's `clockCost`, not a re-derived value.
    expect(entry.status).toBe('presented');
    expect(entry.clockCost).toBe(beat.clockCost);
    expect(entry.sceneId).toBe(scene.id);
    expect(entry.cardId).toBe('le-i-open');

    // A.3: the charge is applied and reported as the post-charge remainder.
    expect(entry.clockRemaining).toBe(scene.budget.clock - beat.clockCost);
    expect(runner.getState().sceneClockRemaining).toBe(scene.budget.clock - beat.clockCost);
    expect(runner.getState().currentBeatId).toBe('le-i-open');

    if (entry.status !== 'presented') throw new Error('expected a presented entry');
    expect(entry.context).toBe(card.context);
    expect(entry.options).toHaveLength(2);
    expect(entry.options.map((option) => option.label)).toEqual([
      'Log the erasure',
      'Rally the survey crew',
    ]);

    // The presentation payload is immutable, like the run-state snapshot.
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.options)).toBe(true);
    expect('reason' in entry).toBe(false);
  });

  it('A.3 treats a cost exactly equal to the remaining clock as affordable', () => {
    expectOwnsStep('A.3');

    const fixture = loadEpisodeFixture();
    // s-i-answer has a 2-tick budget and its entry beat costs exactly 2.
    const runner = makeRunner(fixture, manifestStartingAt(fixture, 's-i-answer', 'le-i-transmit'));

    const entry = runner.enterBeat('le-i-transmit', fixture.state);

    expect(entry.status).toBe('presented');
    expect(entry.clockCost).toBe(2);
    expect(entry.clockRemaining).toBe(0);
    expect(runner.getState().sceneClockRemaining).toBe(0);
    expect(runner.getState().currentBeatId).toBe('le-i-transmit');
    expect(runner.getBudgetExhausted()).toBe(false);
    if (entry.status !== 'presented') throw new Error('expected a presented entry');
    // Spending the last tick still presents the beat's options.
    expect(entry.options.length).toBeGreaterThan(0);
  });

  it('A.2 refuses a beat that costs more than the remaining clock', () => {
    expectOwnsStep('A.2');

    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture, manifestStartingAt(fixture, 's-i-answer', 'le-i-transmit'));
    const charged = runner.enterBeat('le-i-transmit', fixture.state);
    expect(charged.status).toBe('presented');
    expect(runner.getState().sceneClockRemaining).toBe(0);

    // le-i-silent also costs 2: unaffordable once the clock is spent.
    const entry = runner.enterBeat('le-i-silent', fixture.state);

    expect(entry.status).toBe('refused');
    if (entry.status !== 'refused') throw new Error('expected a refused entry');
    expect(entry.reason).toBe('budget-exhausted');
    expect(entry.budgetExhausted).toBe(true);
    expect(entry.clockCost).toBe(2);
    expect(entry.clockRemaining).toBe(0);

    // The beat was never played: position and clock are unchanged.
    const state = runner.getState();
    expect(state.currentBeatId).toBe('le-i-transmit');
    expect(state.sceneClockRemaining).toBe(0);

    // Its options are never presented: a refusal carries none at all.
    expect('options' in entry).toBe(false);
    expect('context' in entry).toBe(false);

    // The refusal is carried for the scene close.
    expect(runner.getBudgetExhausted()).toBe(true);
    expect(entry).not.toBe(charged);
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('A.3 presents only options the declared-key affordability gate accepts', () => {
    expectOwnsStep('A.3');

    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    // The Transmit option on le-i-log costs charge:1; charging is impossible
    // at 0 charge, so only the free option may be presented.
    fixture.state.resources.charge = 0;

    const entry = runner.enterBeat('le-i-log', fixture.state);

    expect(entry.status).toBe('presented');
    if (entry.status !== 'presented') throw new Error('expected a presented entry');
    expect(entry.options.map((option) => option.label)).toEqual(['Stay silent']);
  });

  it('consumes no RNG on an affordable entry or a refusal', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture, manifestStartingAt(fixture, 's-i-answer', 'le-i-transmit'));
    expect(fixture.state.rngCalls).toBe(0);

    runner.enterBeat('le-i-transmit', fixture.state);
    expect(fixture.state.rngCalls).toBe(0);

    runner.enterBeat('le-i-silent', fixture.state);
    expect(fixture.state.rngCalls).toBe(0);
    expect(fixture.state.rngDraws).toEqual([]);
  });

  it('rejects a beat the current scene does not assign, naming the scene', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);

    // le-i-transmit belongs to s-i-answer, not the start scene s-i-open.
    expect(() => runner.enterBeat('le-i-transmit', fixture.state)).toThrow(
      /not assigned to the current scene "s-i-open"/,
    );
    // Nothing was charged by the rejected request.
    expect(runner.getState().sceneClockRemaining).toBe(2);
    expect(runner.getBudgetExhausted()).toBe(false);
  });
});
