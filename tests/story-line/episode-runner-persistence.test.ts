/**
 * Episode runner versioned run state (GDD §3.5.2).
 *
 * A checkpoint of the beat sheet is exactly nine fields — `seed`,
 * `currentActId`, `currentSceneId`, `currentBeatId`, `sceneClockRemaining`,
 * `pendingChain`, `sceneHistory`, `routeHistory` and `lossLedger` — written
 * through the core `serializeWithVersion` / `deserializeWithVersion` helpers by
 * `EpisodeRunStateSerializer` at `schemaVersion: 1`. Resources and the journal
 * stay in the game's own state; the scene-exit records are transcript material.
 *
 * This suite pins the contract:
 *
 * - the payload carries exactly those nine fields and round-trips through
 *   `JSON.parse(JSON.stringify(…))`;
 * - a restored runner **resumes mid-scene** — its `sceneClockRemaining` is the
 *   saved value and the next beat charges from it (no clock reset on restore);
 * - a pending chain survives the round-trip, so a restored run takes the same
 *   door the live run would;
 * - the ledger (both `chain` and `rule` lines) deep-equals the saved ledger, so
 *   a reload is never a refund;
 * - a version mismatch is **refused** by `deserializeWithVersion` (v1 has no
 *   `migrate` hook) and no partial state is restored; a payload naming an
 *   undeclared scene is refused too;
 * - serialising and restoring consume no RNG and apply no resource delta,
 *   asserted against the fixture adapter double.
 *
 * Everything runs against the committed `long-erasure` fixture lane. The only
 * shape the fixture does not author — a run that begins in `s-iii-core` so a
 * close can fire its loss rule — is supplied as an in-memory manifest copy.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  EPISODE_RUN_STATE_SCHEMA_VERSION,
  EpisodeRunStateSerializer,
  createEpisodeRunner,
  deserializeRunState,
  hydrateRunState,
  serializeRunState,
  type EpisodeRunner,
  type SerializedEpisodeRunState,
} from '../../src/story-line';
import {
  deserializeWithVersion,
  serializeWithVersion,
} from '../../src/core-engine/SaveLoad';
import type { EpisodeManifest, Scene } from '../../src/story-line/content/episode-manifest';
import type { ContentCard } from '../../src/story-line/content/types';
import {
  DEFAULT_EPISODE_SEED,
  loadEpisodeFixture,
  type EpisodeFixture,
  type VoyageState,
} from './helpers/episode-fixture';

// ── Helpers ─────────────────────────────────────────────────

/** The nine persisted fields of GDD §3.5.2, in the report's order. */
const PERSISTED_FIELDS = [
  'seed',
  'currentActId',
  'currentSceneId',
  'currentBeatId',
  'sceneClockRemaining',
  'pendingChain',
  'sceneHistory',
  'routeHistory',
  'lossLedger',
] as const;

/**
 * `true` only when `A` and `B` are assignable to each other.
 *
 * Used to pin `SerializedEpisodeRunState`'s keys against {@link PERSISTED_FIELDS}:
 * a field added to only one side resolves the type to `never`, which fails the
 * `tsc --noEmit` build.
 */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** A persisted payload after a JSON round-trip (the shape a save backend holds). */
function jsonRoundTrip(payload: ReturnType<EpisodeRunner<VoyageState, ContentCard>['serialize']>) {
  return JSON.parse(JSON.stringify(payload)) as typeof payload;
}

/** Builds the runner under test, optionally from an in-memory manifest copy. */
function makeRunner(
  fixture: EpisodeFixture,
  manifest: EpisodeManifest = fixture.manifest,
): EpisodeRunner<VoyageState, ContentCard> {
  return createEpisodeRunner({
    manifest,
    storyline: fixture.storyline,
    content: fixture.cardsById,
    seed: DEFAULT_EPISODE_SEED,
  });
}

/** Builds a runner resumed from a (JSON-round-tripped) payload. */
function makeRestoredRunner(
  fixture: EpisodeFixture,
  payload: ReturnType<EpisodeRunner<VoyageState, ContentCard>['serialize']>,
  manifest: EpisodeManifest = fixture.manifest,
): EpisodeRunner<VoyageState, ContentCard> {
  return createEpisodeRunner({
    manifest,
    storyline: fixture.storyline,
    content: fixture.cardsById,
    restored: payload,
  });
}

/** Finds one scene of the fixture by id. */
function sceneOf(fixture: EpisodeFixture, sceneId: string): Scene {
  const scene = fixture.manifest.acts
    .flatMap((act) => act.scenes)
    .find((candidate) => candidate.id === sceneId);
  if (scene === undefined) throw new Error(`fixture has no scene "${sceneId}"`);
  return scene;
}

/**
 * Returns a manifest copy whose `start` points at a chosen scene / beat, so a
 * test can begin a run inside the scene whose close it needs, without editing
 * the committed fixture file.
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

/** Enters a beat and resolves the option at `optionIndex`. */
function resolveOption(
  runner: EpisodeRunner<VoyageState, ContentCard>,
  fixture: EpisodeFixture,
  beatId: string,
  optionIndex: number,
): void {
  const entry = runner.enterBeat(beatId, fixture.state);
  if (entry.status !== 'presented') throw new Error(`beat "${beatId}" was refused`);
  const option = entry.options[optionIndex];
  if (option === undefined) {
    throw new Error(`beat "${beatId}" presented no option ${optionIndex}`);
  }
  runner.resolveChoice(option, fixture.state);
}

/** Closes the current scene and routes the close. */
function closeAndRoute(
  runner: EpisodeRunner<VoyageState, ContentCard>,
  fixture: EpisodeFixture,
) {
  const close = runner.closeScene(fixture.state);
  return { close, route: runner.routeScene(close, fixture.state) };
}

/**
 * Drives the run from `s-i-open` to a mid-scene checkpoint in `s-ii-shelter`.
 *
 * The path visits act i (`s-i-open` → `s-i-answer`), takes the chain door into
 * `s-ii-shelter`, enters its beat and spends one irreversible hull point, so the
 * saved state carries non-empty histories, a mid-scene clock and a chain ledger
 * line.
 */
function driveToShelterCheckpoint(runner: EpisodeRunner<VoyageState, ContentCard>, fixture: EpisodeFixture) {
  resolveOption(runner, fixture, 'le-i-open', 0); // in-scene push: continues
  closeAndRoute(runner, fixture); // s-i-open -> s-i-answer (quiet-answer)

  resolveOption(runner, fixture, 'le-i-transmit', 0); // pushes le-ii-shelter (chain)
  closeAndRoute(runner, fixture); // s-i-answer -> s-ii-shelter (failed-watch)

  // `failed-watch` is gated on budget exhaustion, so the ungated chain door
  // `follow-the-door` wins here and opens the pushed `le-ii-shelter`.
  resolveOption(runner, fixture, 'le-ii-shelter', 1); // Strip the derelict: hull -1
}

/**
 * Drives a run that begins in `s-iii-core` to a close with both ledger kinds.
 *
 * `Ram the core` spends three hull (a `chain` line and a pending ending), the
 * following beat is refused for want of clock (so the close classifies
 * `failure` through the authored `budget: "exhausted"` rule) and the scene's
 * `hull-sacrificed` rule appends a `rule` line.
 */
function driveToMixedLedgerState(
  fixture: EpisodeFixture,
): EpisodeRunner<VoyageState, ContentCard> {
  const runner = makeRunner(fixture, manifestStartingAt(fixture, 's-iii-core', 'le-iii-approach'));
  resolveOption(runner, fixture, 'le-iii-approach', 2); // Ram the core: hull -3
  runner.enterBeat('le-iii-ahead', fixture.state); // refused: cost 3 > clock 2
  runner.closeScene(fixture.state); // failure -> hull-sacrificed rule line
  return runner;
}

// ── The nine persisted fields ───────────────────────────────

describe('episode runner persistence: the nine persisted fields', () => {
  it('serialises exactly the nine §3.5.2 fields through the versioned helper', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    driveToShelterCheckpoint(runner, fixture);

    const saved = runner.serialize();
    const state = runner.getState();

    // Compile-time: the payload interface and the nine-field list are mutually
    // assignable, so a field added to or removed from either side fails the build.
    const persistedFieldsAreExact: MutuallyAssignable<
      keyof SerializedEpisodeRunState,
      (typeof PERSISTED_FIELDS)[number]
    > = true;
    expect(persistedFieldsAreExact).toBe(true);

    // The versioned envelope, at schema version 1.
    expect(saved.schemaVersion).toBe(EPISODE_RUN_STATE_SCHEMA_VERSION);
    expect(saved.schemaVersion).toBe(1);

    // Exactly nine fields — no resources, no journal, no scene-exit records.
    expect(Object.keys(saved.data).sort()).toEqual([...PERSISTED_FIELDS].sort());
    expect(saved.data).toEqual({
      seed: state.seed,
      currentActId: state.currentActId,
      currentSceneId: state.currentSceneId,
      currentBeatId: state.currentBeatId,
      sceneClockRemaining: state.sceneClockRemaining,
      pendingChain: state.pendingChain,
      sceneHistory: [...state.sceneHistory],
      routeHistory: [...state.routeHistory],
      lossLedger: state.lossLedger.map((entry) => ({ ...entry })),
    });

    // The payload owns its copies: mutating it cannot reach the run.
    (saved.data.sceneHistory as string[]).push('tampered');
    expect(runner.getState().sceneHistory).toEqual(state.sceneHistory);
  });

  it('round-trips a routed mid-scene run through JSON with every field preserved', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    driveToShelterCheckpoint(runner, fixture);

    const original = runner.getState();
    expect(original.sceneHistory).toEqual(['s-i-answer', 's-ii-shelter']);
    expect(original.routeHistory).toEqual(['quiet-answer', 'follow-the-door']);
    expect(original.lossLedger).toHaveLength(1);
    expect(original.sceneClockRemaining).toBe(4);
    expect(original.sceneClockRemaining).toBeLessThan(
      sceneOf(fixture, 's-ii-shelter').budget.clock,
    );

    const restored = makeRestoredRunner(fixture, jsonRoundTrip(runner.serialize()));

    expect(restored.getState()).toEqual(original);
    // A resumed run owns its own state: mutating the source snapshot is not a
    // channel into the restored runner.
    expect(restored.getState()).not.toBe(original);
  });

  it('preserves a pending chain so the restored run takes the same door as the live run', () => {
    const liveFixture = loadEpisodeFixture();
    const live = makeRunner(liveFixture);
    resolveOption(live, liveFixture, 'le-i-open', 0);
    closeAndRoute(live, liveFixture);
    resolveOption(live, liveFixture, 'le-i-transmit', 0); // pendingChain: le-ii-shelter

    const saved = jsonRoundTrip(live.serialize());
    expect(saved.data.pendingChain).toBe('le-ii-shelter');

    const restoredFixture = loadEpisodeFixture();
    const restored = makeRestoredRunner(restoredFixture, saved);
    expect(restored.getState().pendingChain).toBe('le-ii-shelter');

    const liveRoute = closeAndRoute(live, liveFixture).route;
    const restoredRoute = closeAndRoute(restored, restoredFixture).route;

    expect(restoredRoute.route.id).toBe(liveRoute.route.id);
    expect(restoredRoute.nextBeat).toBe('le-ii-shelter');
    expect(restoredRoute.exit).toEqual(liveRoute.exit);
  });

  it('resumes mid-scene without resetting the scene clock', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    driveToShelterCheckpoint(runner, fixture);

    // The checkpoint is *after* entering `le-ii-shelter` (cost 2 of 6).
    const saved = jsonRoundTrip(runner.serialize());
    expect(saved.data.sceneClockRemaining).toBe(4);

    const restored = makeRestoredRunner(fixture, saved);
    expect(restored.getState().sceneClockRemaining).toBe(4);

    // The next beat charges from the saved clock: 4 - 2 = 2. A restore that
    // reloaded `budget.clock` would leave 4 here instead.
    const entry = restored.enterBeat('le-ii-derelict', fixture.state);
    expect(entry.status).toBe('presented');
    if (entry.status !== 'presented') throw new Error('restored beat was refused');
    expect(entry.clockRemaining).toBe(2);
    expect(restored.getState().sceneClockRemaining).toBe(2);
    expect(restored.getState().currentBeatId).toBe('le-ii-derelict');
  });
});

// ── Ledger fidelity ─────────────────────────────────────────

describe('episode runner persistence: ledger fidelity', () => {
  it('restores the ledger deep-equal to the save, as a reload rather than a refund', () => {
    const fixture = loadEpisodeFixture();
    const runner = driveToMixedLedgerState(fixture);

    const original = runner.getState();
    expect(original.lossLedger.map((entry) => entry.kind)).toEqual(['chain', 'rule']);
    expect(original.pendingChain).toBe('le-end-ram');

    const resourcesBefore = { ...fixture.state.resources };
    const appliedBefore = fixture.state.appliedDeltas.length;
    const rngBefore = fixture.state.rngCalls;

    const restored = makeRestoredRunner(fixture, jsonRoundTrip(runner.serialize()));

    expect(restored.getLossLedger()).toEqual(original.lossLedger);
    expect(restored.getState().lossLedger).toEqual(original.lossLedger);
    expect(restored.getState()).toEqual(original);

    // Restoring is not an apply: resources, seam calls and RNG are untouched.
    expect(fixture.state.resources).toEqual(resourcesBefore);
    expect(fixture.state.appliedDeltas).toHaveLength(appliedBefore);
    expect(fixture.state.rngCalls).toBe(rngBefore);
  });
});

// ── Refusals ────────────────────────────────────────────────

describe('episode runner persistence: refusals', () => {
  it('refuses a version mismatch without restoring any partial state', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    resolveOption(runner, fixture, 'le-i-open', 0);
    const before = runner.getState();
    const saved = jsonRoundTrip(runner.serialize());

    // Both directions of mismatch: an older and a newer schema are refusals
    // because v1 deliberately ships no `migrate` hook.
    for (const schemaVersion of [0, 2]) {
      const foreign = {
        ...saved,
        schemaVersion,
        // The payload would move the run if it were (partially) applied.
        data: { ...saved.data, currentSceneId: 's-ii-shelter', currentBeatId: 'le-ii-shelter' },
      };
      expect(() => runner.restore(foreign)).toThrow(
        `Incompatible save version: expected 1, got ${schemaVersion}`,
      );
      expect(runner.getState()).toEqual(before);
    }

    // A restored construction is refused before any run state exists.
    expect(() =>
      createEpisodeRunner({
        manifest: fixture.manifest,
        storyline: fixture.storyline,
        content: fixture.cardsById,
        restored: { ...saved, schemaVersion: 2 },
      }),
    ).toThrow('Incompatible save version: expected 1, got 2');
  });

  it('refuses a payload naming a scene the manifest does not declare', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    const before = runner.getState();
    const saved = jsonRoundTrip(runner.serialize());
    const foreign = {
      ...saved,
      data: { ...saved.data, currentSceneId: 's-nowhere' } as SerializedEpisodeRunState,
    };

    expect(() => hydrateRunState(foreign.data, fixture.manifest)).toThrow(
      /no act of episode "long-erasure" declares/,
    );
    expect(() => runner.restore(foreign)).toThrow(/no act of episode "long-erasure" declares/);
    expect(runner.getState()).toEqual(before);
  });

  it('refuses a payload whose act contradicts the scene', () => {
    const fixture = loadEpisodeFixture();
    const saved = jsonRoundTrip(makeRunner(fixture).serialize());
    const foreign: SerializedEpisodeRunState = { ...saved.data, currentActId: 'act-ii' };

    expect(() => hydrateRunState(foreign, fixture.manifest)).toThrow(
      /says act "act-ii" for scene "s-i-open"/,
    );
  });

  it('refuses a structurally corrupt payload before trusting it', () => {
    const fixture = loadEpisodeFixture();
    const saved = makeRunner(fixture).serialize();

    expect(() =>
      deserializeRunState({ ...saved.data, sceneClockRemaining: -1 }),
    ).toThrow(/field "sceneClockRemaining" must be an integer/);
    expect(() =>
      deserializeRunState({
        ...saved.data,
        lossLedger: 'nope',
      } as unknown as SerializedEpisodeRunState),
    ).toThrow(/field "lossLedger" must be an array/);
  });
});

// ── The serializer and the pure helpers ─────────────────────

describe('episode runner persistence: serializer surface', () => {
  it('exposes the v1 SaveSerializer with no migrate hook', () => {
    expect(EPISODE_RUN_STATE_SCHEMA_VERSION).toBe(1);
    expect(EpisodeRunStateSerializer.schemaVersion).toBe(1);
    // No migration hook: a mismatch is a refusal, not a best-effort load.
    expect(EpisodeRunStateSerializer.migrate).toBeUndefined();
  });

  it('round-trips a run state through the core save helpers and the pure functions', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    driveToShelterCheckpoint(runner, fixture);
    const state = runner.getState();

    const payload = serializeWithVersion(EpisodeRunStateSerializer, state);
    expect(payload.data).toEqual(serializeRunState(state));

    expect(deserializeWithVersion(EpisodeRunStateSerializer, payload)).toEqual(state);
    expect(deserializeRunState(payload.data)).toEqual(state);
    expect(hydrateRunState(payload.data, fixture.manifest)).toEqual(state);
  });

  it('consumes no RNG and applies no resource delta when serialising or restoring', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    driveToShelterCheckpoint(runner, fixture);

    // Reset the adapter double's recorders, then prove both operations are pure.
    fixture.state.rngCalls = 0;
    fixture.state.rngDraws.length = 0;
    fixture.state.appliedDeltas.length = 0;
    const resourcesBefore = { ...fixture.state.resources };

    const saved = runner.serialize();
    const restored = makeRestoredRunner(fixture, jsonRoundTrip(saved));
    restored.restore(saved);

    expect(fixture.state.rngCalls).toBe(0);
    expect(fixture.state.rngDraws).toEqual([]);
    expect(fixture.state.appliedDeltas).toEqual([]);
    expect(fixture.state.resources).toEqual(resourcesBefore);
    expect(restored.getState().sceneClockRemaining).toBe(
      runner.getState().sceneClockRemaining,
    );
  });
});
