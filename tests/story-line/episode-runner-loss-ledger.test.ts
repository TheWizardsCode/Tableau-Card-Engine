/**
 * Episode runner loss ledger (GDD §2.2.8).
 *
 * The ledger is the beat sheet's permanent record of every irreversible loss.
 * It has exactly two sources, and both are observed rather than computed:
 *
 * - **chain** — after each beat resolution the runner diffs
 *   `engine.getResources` before and after over the manifest's
 *   `resources.irreversible` keys and records one line per negative net change;
 * - **rule** — a scene's `losses[]` rule is applied through
 *   `engine.applyResourceDelta` at close and the observed change is recorded.
 *
 * The suite pins the properties the GDD states as invariants, not just the
 * happy path:
 *
 * - the field names of both entry kinds are exactly the GDD's;
 * - a refund (a net **positive** change on an irreversible key) records
 *   nothing — the ledger never holds a positive `delta`;
 * - a change to a reversible key records nothing (the diff is the
 *   irreversible subset, not the whole bag);
 * - no line exists without a matching `engine.applyResourceDelta` call —
 *   asserted against the fixture adapter double's `appliedDeltas` recorder;
 * - an adapter with no resource seam applies nothing, so it records nothing;
 * - lines are appended in observation order, and rule lines in the order the
 *   scene close applies the manifest's declaration order;
 * - the ledger is handed out read-only (frozen copies) and survives a JSON
 *   round-trip unchanged.
 *
 * Everything runs against the committed `long-erasure` fixture lane (Assumption
 * A3): the real manifest, the real CSV and the real `createStorylineSystem`
 * choice model. The two shapes the fixture does not author — a refund and two
 * loss rules in one scene — are supplied as in-memory overrides, so the
 * committed fixture files stay the single source of truth for everything else.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  createEpisodeRunner,
  createStorylineSystem,
  type EpisodeRunner,
  type LossLedgerEntry,
} from '../../src/story-line';
import type { EpisodeManifest, LossRule } from '../../src/story-line/content/episode-manifest';
import type { ContentCard } from '../../src/story-line/content/types';
import {
  DEFAULT_EPISODE_SEED,
  loadEpisodeFixture,
  type EpisodeFixture,
  type VoyageState,
} from './helpers/episode-fixture';

// ── Helpers ─────────────────────────────────────────────────

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

/**
 * Returns a manifest copy whose `start` points at a chosen scene / beat, so a
 * test can begin a run inside the scene whose loss it needs to observe without
 * editing the committed fixture file.
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

/** Finds one scene of the fixture by id. */
function sceneOf(fixture: EpisodeFixture, sceneId: string) {
  const scene = fixture.manifest.acts
    .flatMap((act) => act.scenes)
    .find((candidate) => candidate.id === sceneId);
  if (scene === undefined) throw new Error(`fixture has no scene "${sceneId}"`);
  return scene;
}

/**
 * Enters a beat and resolves one of its presented options.
 *
 * The option is resolved through the real choice model, so the adapter double's
 * `appliedDeltas` recorder is the witness for whatever the ledger claims.
 */
function resolvePresentedOption(
  runner: EpisodeRunner<VoyageState, ContentCard>,
  fixture: EpisodeFixture,
  beatId: string,
  optionIndex: number,
): void {
  const entry = runner.enterBeat(beatId, fixture.state);
  if (entry.status !== 'presented') throw new Error(`beat "${beatId}" was refused`);
  const option = entry.options[optionIndex];
  if (option === undefined) throw new Error(`beat "${beatId}" presented no option ${optionIndex}`);
  runner.resolveChoice(option, fixture.state);
}

// ── The suite ───────────────────────────────────────────────

describe('episode runner loss ledger', () => {
  it('records one chain line per irreversible key that fell across a resolution', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(
      fixture,
      manifestStartingAt(fixture, 's-ii-shelter', 'le-ii-shelter'),
    );
    expect(fixture.state.resources.hull).toBe(5);

    // `Strip the derelict` authors `#cost=hull:1` — the player's choice spent
    // the irreversible key, and the ledger only watched it happen.
    resolvePresentedOption(runner, fixture, 'le-ii-shelter', 1);

    expect(fixture.state.resources.hull).toBe(4);
    const ledger = runner.getLossLedger();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toEqual({
      kind: 'chain',
      sceneId: 's-ii-shelter',
      beatId: 'le-ii-shelter',
      field: 'hull',
      delta: -1,
    });
    // Exactly the GDD's field names for a chain line — no more, no fewer.
    expect(Object.keys(ledger[0]).sort()).toEqual(
      ['beatId', 'delta', 'field', 'kind', 'sceneId'].sort(),
    );
    // The line corresponds one-to-one with the seam call that made it.
    expect(fixture.state.appliedDeltas).toEqual([
      { delta: { hull: -1 }, after: expect.objectContaining({ hull: 4 }) },
    ]);
  });

  it('records nothing for a net positive (refund) change on an irreversible key', () => {
    // The committed fixture never refunds hull, so the refund door is authored
    // in memory on top of the real card (`extra=hull:1` grants rather than
    // spends). A grant is a positive delta and the ledger must stay empty.
    const base = loadEpisodeFixture();
    const cards = base.cards.map((card) =>
      card.id === 'le-i-open'
        ? { ...card, options: 'Bank the salvage|le-i-log#extra=hull:1' }
        : card,
    );
    const fixture = loadEpisodeFixture({ cards });
    const runner = makeRunner(fixture);
    expect(fixture.state.resources.hull).toBe(5);

    resolvePresentedOption(runner, fixture, 'le-i-open', 0);

    expect(fixture.state.resources.hull).toBe(6);
    // The seam really did apply the grant …
    expect(fixture.state.appliedDeltas).toEqual([
      { delta: { hull: 1 }, after: expect.objectContaining({ hull: 6 }) },
    ]);
    // … and the ledger still records nothing: it never holds a positive line.
    expect(runner.getLossLedger()).toEqual([]);
    expect(runner.getState().lossLedger).toEqual([]);
  });

  it('records nothing when the resolution changes only reversible keys', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);

    // `Log the erasure` authors `#cost=stores:1` — a declared, reversible key.
    resolvePresentedOption(runner, fixture, 'le-i-open', 0);

    expect(fixture.state.resources.stores).toBe(3);
    expect(fixture.state.appliedDeltas).toEqual([
      { delta: { stores: -1 }, after: expect.objectContaining({ stores: 3 }) },
    ]);
    // The diff window is the manifest's irreversible subset, not the whole bag.
    expect(runner.getLossLedger()).toEqual([]);
  });

  it('records a rule line through the scene-close seam, observed not computed', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(
      fixture,
      manifestStartingAt(fixture, 's-iii-core', 'le-iii-approach'),
    );
    const lossRule = sceneOf(fixture, 's-iii-core').losses?.[0];
    expect(lossRule).toEqual(
      expect.objectContaining({ id: 'hull-sacrificed', field: 'hull', amount: 1 }),
    );
    expect(fixture.state.resources.hull).toBe(5);

    const recorded = runner.applyLossRule(lossRule!, fixture.state);

    expect(fixture.state.resources.hull).toBe(4);
    expect(recorded).toEqual({
      kind: 'rule',
      sceneId: 's-iii-core',
      ruleId: 'hull-sacrificed',
      field: 'hull',
      delta: -1,
      statement: 'Breaking for the core on the last of the watch costs the hull.',
    });
    expect(runner.getLossLedger()).toEqual([recorded]);
    // Exactly the GDD's field names for a rule line.
    expect(Object.keys(recorded!).sort()).toEqual(
      ['delta', 'field', 'kind', 'ruleId', 'sceneId', 'statement'].sort(),
    );
    // The runner applied the rule through the engine seam — one call, and the
    // recorded delta is the change that call produced.
    expect(fixture.state.appliedDeltas).toEqual([
      { delta: { hull: -1 }, after: expect.objectContaining({ hull: 4 }) },
    ]);
  });

  it('appends loss rules in the declaration order the scene close applies them', () => {
    // Two irreversible loss rules on one scene, so a close-time pass can be
    // proved to append in `losses[]` order rather than any other order.
    const base = loadEpisodeFixture();
    const scene = sceneOf(base, 's-iii-core');
    const first: LossRule = {
      id: 'hull-breached',
      on: 'failure',
      field: 'hull',
      amount: 1,
      statement: 'The frame gives at the first seam.',
    };
    const second: LossRule = {
      id: 'hull-abandoned',
      on: 'failure',
      field: 'hull',
      amount: 2,
      statement: 'The frame gives all the way.',
    };
    const manifest: EpisodeManifest = {
      ...base.manifest,
      acts: base.manifest.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((candidate) =>
          candidate.id === scene.id
            ? { ...candidate, losses: [first, second], entryBeat: 'le-iii-approach' }
            : candidate,
        ),
      })),
      start: { act: 'act-iii', scene: 's-iii-core', beat: 'le-iii-approach' },
    };
    const fixture = loadEpisodeFixture({ manifest });
    const runner = makeRunner(fixture);

    const recorded = [first, second].map((rule) => runner.applyLossRule(rule, fixture.state));

    expect(recorded.map((entry) => entry?.ruleId)).toEqual(['hull-breached', 'hull-abandoned']);
    expect(runner.getLossLedger()).toEqual(recorded);
    expect(runner.getLossLedger().map((entry) => entry.kind)).toEqual(['rule', 'rule']);
    expect(runner.getLossLedger().map((entry) => entry.delta)).toEqual([-1, -2]);
    expect(fixture.state.appliedDeltas.map((applied) => applied.delta)).toEqual([
      { hull: -1 },
      { hull: -2 },
    ]);
  });

  it('appends ledger lines in observation order across both sources', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(
      fixture,
      manifestStartingAt(fixture, 's-iii-core', 'le-iii-approach'),
    );

    // A chain loss first: `Ram the core` authors `#cost=hull:3`.
    resolvePresentedOption(runner, fixture, 'le-iii-approach', 2);
    expect(fixture.state.resources.hull).toBe(2);
    // Then the scene's own close-time loss rule.
    const lossRule = sceneOf(fixture, 's-iii-core').losses![0];
    runner.applyLossRule(lossRule, fixture.state);

    expect(runner.getLossLedger().map((entry) => entry.kind)).toEqual(['chain', 'rule']);
    expect(runner.getLossLedger().map((entry) => entry.delta)).toEqual([-3, -1]);
    expect(runner.getLossLedger().map((entry) => entry.sceneId)).toEqual([
      's-iii-core',
      's-iii-core',
    ]);
  });

  it('records nothing without a corresponding applyResourceDelta call', () => {
    // An adapter that omits the optional resource seam applies nothing (core
    // logs and leaves state untouched), so neither source can produce a line.
    const fixture = loadEpisodeFixture();
    const seamlessEngine = { ...fixture.engine, applyResourceDelta: undefined };
    const storyline = createStorylineSystem<VoyageState, ContentCard>({ engine: seamlessEngine });
    const runner = createEpisodeRunner<VoyageState, ContentCard>({
      manifest: fixture.manifest,
      storyline,
      content: fixture.cardsById,
      seed: DEFAULT_EPISODE_SEED,
    });

    resolvePresentedOption(runner, fixture, 'le-i-open', 0);
    const lossRule: LossRule = {
      id: 'hull-sacrificed',
      on: 'failure',
      field: 'hull',
      amount: 1,
      statement: 'Breaking for the core costs the hull.',
    };
    const recorded = runner.applyLossRule(lossRule, fixture.state);

    expect(recorded).toBeNull();
    expect(fixture.state.appliedDeltas).toEqual([]);
    expect(fixture.state.resources.hull).toBe(5);
    expect(runner.getLossLedger()).toEqual([]);
  });

  it('hands out ledger lines read-only, as fresh copies on every read', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(
      fixture,
      manifestStartingAt(fixture, 's-ii-shelter', 'le-ii-shelter'),
    );
    resolvePresentedOption(runner, fixture, 'le-ii-shelter', 1);

    const ledger = runner.getLossLedger();
    expect(Object.isFrozen(ledger)).toBe(true);
    expect(Object.isFrozen(ledger[0])).toBe(true);
    expect(Object.isFrozen(runner.getState().lossLedger)).toBe(true);

    // Two reads never share an array (or an entry) instance.
    expect(runner.getLossLedger()).not.toBe(ledger);
    expect(runner.getLossLedger()[0]).not.toBe(ledger[0]);
    expect(runner.getState().lossLedger[0]).not.toBe(ledger[0]);

    // Mutating what a caller received cannot change the run's ledger.
    expect(() => {
      (ledger as LossLedgerEntry[]).push({
        kind: 'chain',
        sceneId: 'forged',
        beatId: 'forged',
        field: 'hull',
        delta: -99,
      });
    }).toThrow(TypeError);
    expect(() => {
      (ledger[0] as { delta: number }).delta = -99;
    }).toThrow(TypeError);
    expect(runner.getLossLedger()).toHaveLength(1);
    expect(runner.getLossLedger()[0].delta).toBe(-1);
  });

  it('survives a JSON round-trip unchanged', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(
      fixture,
      manifestStartingAt(fixture, 's-iii-core', 'le-iii-approach'),
    );
    resolvePresentedOption(runner, fixture, 'le-iii-approach', 2);
    const lossRule = sceneOf(fixture, 's-iii-core').losses![0];
    runner.applyLossRule(lossRule, fixture.state);

    const lines = runner.getLossLedger();
    expect(lines).toHaveLength(2);

    const roundTripped = JSON.parse(JSON.stringify(lines)) as LossLedgerEntry[];
    expect(roundTripped).toEqual([...lines]);
    expect(roundTripped).toEqual(runner.getState().lossLedger.map((entry) => ({ ...entry })));
  });
});
