/**
 * Scene-space guard test lane — the fixtures are what they claim to be
 * (CG-0MWUOEDOW001SE94).
 *
 * The parent epic's later features assert two invariants against the fixtures
 * this suite pins. A suite can only be trusted if its inputs are, so this file
 * proves — per control fixture:
 *
 * - the fixture loads through the **shipped** seams only
 *   (`getContentAdapter` → `cardsFromCsv` → `readManifestStartBag`) and its
 *   manifest names its own content file;
 * - it validates clean through `validateEpisodeManifest` **with its bound
 *   content**, so the defects are semantic (the guard's business) and never
 *   structural (the validator's);
 * - it is structurally sound against the shipped JSON schema as well, so no
 *   later check is reached by a manifest the authoring toolchain would refuse;
 * - two loads are deterministic (same cards, same declared keys, same starting
 *   bag);
 * - its intended violation is recorded **as data** (scene, refused beat,
 *   winning rule) and is asserted here with the runtime's own pure decision
 *   helpers, so a later invariant fails on the exact fact rather than on a
 *   blanket "invalid".
 *
 * The `clean` fixture additionally proves the scene space is non-trivial: it
 * contains a refusable beat, a success close and a non-success (exhausted)
 * close. The two defective fixtures are the positive controls that make the
 * later guard's failures credible.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { classifySceneOutcome, evaluateCondition } from '../../../src/story-line';
import {
  DEFAULT_EPISODE_MANIFEST_SCHEMA_PATH,
  validateEpisodeManifest,
  type Scene,
} from '../../../src/story-line/content/episode-manifest';
import {
  SCENE_GUARD_FIXTURES,
  SCENE_GUARD_FIXTURES_DIR,
  beatOf,
  loadSceneGuardFixture,
  sceneById,
  scenesOf,
  type SceneGuardExpectedViolation,
  type SceneGuardFixture,
} from './scene-guard-fixtures';
import { REPO_ROOT } from './test-support';

/** The shipped schema the authoring toolchain validates every manifest with. */
const MANIFEST_SCHEMA_PATH = resolve(REPO_ROOT, DEFAULT_EPISODE_MANIFEST_SCHEMA_PATH);

/** The shipped adapter + content modules the lane must really bind to. */
const SHIPPED_SEAM_MODULES = [
  'src/story-line/content/adapters.ts',
  'src/story-line/content/csv.ts',
  'src/story-line/content/episode-manifest.ts',
  'src/story-line/resources.ts',
] as const;

const schemaValidator = new Ajv({ allErrors: true, strict: false }).compile(
  JSON.parse(readFileSync(MANIFEST_SCHEMA_PATH, 'utf-8')) as object,
);

/** One beat a scene's clock cannot afford to play. */
interface RefusableBeat {
  /** The scene that would refuse it. */
  readonly sceneId: string;
  /** The refused beat's content card id. */
  readonly beatCardId: string;
}

/**
 * The beats a scene can refuse, given only what the clock guarantees.
 *
 * A scene is entered with its full `budget.clock` and routing always attempts
 * its `entryBeat` first, so the refusal states a guard must find are:
 *
 * - the `entryBeat` itself, when it costs more than the whole clock; or
 * - any **other** beat, when it costs more than the clock left after the entry
 *   beat was played.
 *
 * This is deliberately the minimal reachability fact — the full state
 * enumeration is the next feature's job — and it is exactly what "the fixture
 * contains a refusal" has to mean for a positive control to be credible.
 *
 * @param scene The scene to inspect.
 * @returns Every beat the scene cannot afford, in declaration order.
 */
function refusableBeats(scene: Scene): RefusableBeat[] {
  const entry = scene.beats.find((beat) => beat.cardId === scene.entryBeat);
  const entryCost = entry?.clockCost ?? 0;
  if (entryCost > scene.budget.clock) {
    return [{ sceneId: scene.id, beatCardId: scene.entryBeat }];
  }

  const remainingAfterEntry = scene.budget.clock - entryCost;
  return scene.beats
    .filter((beat) => beat.cardId !== scene.entryBeat && beat.clockCost > remainingAfterEntry)
    .map((beat) => ({ sceneId: scene.id, beatCardId: beat.cardId }));
}

/** The context a scene close is classified against at the starting bag. */
function closeContext(
  fixture: SceneGuardFixture,
  scene: Scene,
  budgetExhausted: boolean,
): Parameters<typeof classifySceneOutcome>[1] {
  return {
    objectiveMet: evaluateCondition(scene.objective.check, fixture.startBag),
    budgetExhausted,
    resources: fixture.startBag,
  };
}

/** Resolves the scene, beat and rule an expected violation names. */
function resolveViolation(
  fixture: SceneGuardFixture,
  violation: SceneGuardExpectedViolation,
): { scene: Scene; beat: Scene['beats'][number] } {
  const scene = sceneById(fixture.manifest, violation.sceneId);
  return { scene, beat: beatOf(scene, violation.refusedBeatCardId) };
}

/** Every outcome the manifest's outcome tables can assign, in declaration order. */
function outcomesOf(manifest: SceneGuardFixture['manifest']): string[] {
  return scenesOf(manifest).flatMap((scene) => scene.outcomeRules.map((rule) => rule.outcome));
}

// ── The lane binds the shipped seams ────────────────────────

describe('scene guard lane: loads through the shipped content seams', () => {
  for (const spec of SCENE_GUARD_FIXTURES) {
    it(`${spec.name}: names its own content file and resolves the shipped adapter`, () => {
      const fixture = loadSceneGuardFixture(spec.name);

      expect(fixture.spec).toBe(spec);
      expect(fixture.manifest.content.file).toBe(
        `tests/fixtures/story-line/scene-guard/${spec.csvFile}`,
      );
      expect(fixture.csvPath).toBe(join(SCENE_GUARD_FIXTURES_DIR, spec.csvFile));
      expect(fixture.adapter.gameId).toBe(fixture.manifest.content.adapter);
      expect(fixture.cards.length).toBeGreaterThan(0);
      expect(fixture.cardsById.size).toBe(fixture.cards.length);
    });

    it(`${spec.name}: the content file declares exactly the manifest's resource keys`, () => {
      const fixture = loadSceneGuardFixture(spec.name);

      expect(fixture.contentDeclaredResources).toEqual(fixture.declaredResources);
      for (const card of fixture.cards) {
        expect(card.resourceKeys, card.id).toEqual(fixture.declaredResources);
      }
      expect(Object.keys(fixture.startBag).sort()).toEqual(
        [...fixture.declaredResources].sort(),
      );
    });
  }
});

// ── Every control fixture is structurally valid ─────────────

describe('scene guard lane: control fixtures are structurally valid', () => {
  for (const spec of SCENE_GUARD_FIXTURES) {
    it(`${spec.name}: validates clean through validateEpisodeManifest`, () => {
      const fixture = loadSceneGuardFixture(spec.name);

      const result = validateEpisodeManifest(
        fixture.manifest,
        fixture.cards,
        fixture.contentDeclaredResources,
        fixture.adapter,
      );

      expect(result.findings).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.manifestId).toBe(fixture.manifest.id);
      expect(result.counts.acts).toBe(fixture.manifest.acts.length);
    });

    it(`${spec.name}: satisfies the shipped episode-manifest JSON schema`, () => {
      const fixture = loadSceneGuardFixture(spec.name);

      const valid = schemaValidator(fixture.manifest);
      expect(schemaValidator.errors ?? []).toEqual([]);
      expect(valid).toBe(true);
    });
  }
});

// ── Determinism ─────────────────────────────────────────────

describe('scene guard lane: the lane loads deterministically', () => {
  for (const spec of SCENE_GUARD_FIXTURES) {
    it(`${spec.name}: two loads yield the same cards, declared keys and start bag`, () => {
      const first = loadSceneGuardFixture(spec.name);
      const second = loadSceneGuardFixture(spec.name);

      expect(second.manifest).toEqual(first.manifest);
      expect(second.cards).toEqual(first.cards);
      expect(second.cards.map((card) => card.id)).toEqual(first.cards.map((card) => card.id));
      expect([...second.cardsById.keys()]).toEqual([...first.cardsById.keys()]);
      expect(second.declaredResources).toEqual(first.declaredResources);
      expect(second.contentDeclaredResources).toEqual(first.contentDeclaredResources);
      expect(second.startBag).toEqual(first.startBag);
    });
  }
});

// ── The clean fixture's scene space is non-trivial ──────────

describe('scene guard lane: the clean fixture exercises both invariants', () => {
  it('contains at least one beat refusal', () => {
    const fixture = loadSceneGuardFixture('clean');
    const refusals = scenesOf(fixture.manifest).flatMap(refusableBeats);

    expect(refusals).toContainEqual({ sceneId: 'sg-hall', beatCardId: 'sg-hall-wait' });
  });

  it('contains a success close and a non-success close of the same scene', () => {
    const fixture = loadSceneGuardFixture('clean');
    const hall = sceneById(fixture.manifest, 'sg-hall');

    // The objective is met at the starting bag, so the two closes differ only
    // in the exhaustion trigger.
    expect(closeContext(fixture, hall, false).objectiveMet).toBe(true);

    expect(classifySceneOutcome(hall, closeContext(fixture, hall, false))).toEqual({
      ruleId: 'hall-held',
      outcome: 'success',
    });
    expect(classifySceneOutcome(hall, closeContext(fixture, hall, true))).toEqual({
      ruleId: 'hall-spent',
      outcome: 'failure',
    });
    expect(outcomesOf(fixture.manifest)).toEqual(expect.arrayContaining(['success', 'failure']));
  });

  it('routes both closes into scenes whose one door reaches the declared ending', () => {
    const fixture = loadSceneGuardFixture('clean');

    for (const sceneId of ['sg-crossing', 'sg-rest']) {
      const scene = sceneById(fixture.manifest, sceneId);
      expect(scene.routes).toHaveLength(1);
      expect(scene.routes[0].to).toEqual({ kind: 'ending', cardId: 'sg-end-quiet' });
    }
  });
});

// ── Each defective fixture records (and really has) its defect ──

describe('scene guard lane: the intended violations are recorded as data', () => {
  it('records intent on every fixture: none for clean, one per defective control', () => {
    const clean = loadSceneGuardFixture('clean');
    const exhausted = loadSceneGuardFixture('exhausted-success');
    const strand = loadSceneGuardFixture('refusal-strand');

    expect(clean.expectedViolations).toEqual([]);
    expect(exhausted.expectedViolations.map((violation) => violation.invariant)).toEqual([
      'no-success-on-exhausted-close',
    ]);
    expect(strand.expectedViolations.map((violation) => violation.invariant)).toEqual([
      'refusal-reaches-ending',
    ]);
    // The loaded fixture exposes the table's entry, never a copy of its own.
    for (const fixture of [clean, exhausted, strand]) {
      expect(fixture.expectedViolations).toBe(fixture.spec.expectedViolations);
    }
  });

  it('every recorded violation resolves to a beat and a winning rule the manifest authors', () => {
    for (const spec of SCENE_GUARD_FIXTURES) {
      const fixture = loadSceneGuardFixture(spec.name);

      for (const violation of fixture.expectedViolations) {
        const { scene, beat } = resolveViolation(fixture, violation);

        // The refused beat must be one the scene's clock can actually refuse.
        expect(beat.cardId).toBe(violation.refusedBeatCardId);
        expect(refusableBeats(scene)).toContainEqual({
          sceneId: scene.id,
          beatCardId: beat.cardId,
        });

        // The winning rule must be the scene's own, and the outcome it assigns
        // must be reachable at the starting bag.
        const rule = scene.outcomeRules.find(
          (candidate) => candidate.id === violation.winningRuleId,
        );
        expect(rule).toBeDefined();
        const classification = classifySceneOutcome(
          scene,
          closeContext(fixture, scene, true),
        );
        expect(classification.ruleId).toBe(violation.winningRuleId);
        expect(violation.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it('exhausted-success: an exhausted close classifies success via the object-met rule', () => {
    const fixture = loadSceneGuardFixture('exhausted-success');
    const violation = fixture.expectedViolations[0];
    const { scene } = resolveViolation(fixture, violation);

    // The defect needs the objective met: without it the exhausted close falls
    // through to the failure rule and the fixture would be clean.
    expect(evaluateCondition(scene.objective.check, fixture.startBag)).toBe(true);

    expect(classifySceneOutcome(scene, closeContext(fixture, scene, true))).toEqual({
      ruleId: 'hall-held',
      outcome: 'success',
    });

    // The same scene space in the clean fixture classifies the same close as a
    // failure — the fixtures differ only in the outcome-table order.
    const clean = loadSceneGuardFixture('clean');
    const cleanHall = sceneById(clean.manifest, 'sg-hall');
    expect(classifySceneOutcome(cleanHall, closeContext(clean, cleanHall, true))).toEqual({
      ruleId: 'hall-spent',
      outcome: 'failure',
    });
  });

  it('refusal-strand: no route names the declared ending, so the refusal loop cannot reach one', () => {
    const fixture = loadSceneGuardFixture('refusal-strand');
    const violation = fixture.expectedViolations[0];
    const { scene } = resolveViolation(fixture, violation);

    expect(fixture.manifest.endings).toEqual(['sg-end-quiet']);
    expect(fixture.cardsById.has('sg-end-quiet')).toBe(true);

    // No scene has an ending door, nor a chain door that could open one.
    expect(
      scenesOf(fixture.manifest).flatMap((candidate) =>
        candidate.routes.filter((route) => route.to.kind !== 'beat'),
      ),
    ).toEqual([]);

    // The two scenes route only to each other, so the refusal loop is closed.
    const hold = sceneById(fixture.manifest, 'sg-hold');
    const loop = sceneById(fixture.manifest, 'sg-loop');
    expect(
      hold.routes.every((route) => route.to.kind === 'beat' && route.to.scene === 'sg-loop'),
    ).toBe(true);
    expect(
      loop.routes.every((route) => route.to.kind === 'beat' && route.to.scene === 'sg-hold'),
    ).toBe(true);

    // The recorded refusal really is a refusal, and it classifies the recorded rule.
    expect(classifySceneOutcome(scene, closeContext(fixture, scene, true))).toEqual({
      ruleId: 'hold-spent',
      outcome: 'failure',
    });
    expect(refusableBeats(sceneById(fixture.manifest, 'sg-loop'))).toEqual([
      { sceneId: 'sg-loop', beatCardId: 'sg-loop-open' },
    ]);
  });
});

// ── The helper's real import graph ──────────────────────────

/** Extracts every static `from '<specifier>'` in a module's source. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /\bfrom\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

/** Resolves a relative specifier from a file, or `null` when it is not relative. */
function resolveModule(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Not this candidate: try the next extension form.
    }
  }
  return null;
}

/** Walks the relative import graph from `root`. */
function importGraph(root: string): {
  files: readonly string[];
  specifiers: readonly string[];
} {
  const visited = new Set<string>();
  const specifiers: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiers(readFileSync(file, 'utf-8'))) {
      specifiers.push(specifier);
      const resolved = resolveModule(file, specifier);
      if (resolved !== null) queue.push(resolved);
    }
  }
  return { files: [...visited], specifiers };
}

describe('scene guard lane: the helper imports no game module and no Phaser module', () => {
  const helperPath = join(
    dirname(fileURLToPath(import.meta.url)),
    'scene-guard-fixtures.ts',
  );
  const graph = importGraph(helperPath);

  it('walks a real graph through the shipped content seams', () => {
    expect(graph.files).toContain(helperPath);
    for (const modulePath of SHIPPED_SEAM_MODULES) {
      expect(graph.files).toContain(resolve(REPO_ROOT, modulePath));
    }
    expect(graph.files.length).toBeGreaterThan(SHIPPED_SEAM_MODULES.length);
  });

  it('never imports Phaser', () => {
    expect(
      graph.specifiers.filter(
        (specifier) => specifier === 'phaser' || specifier.startsWith('phaser/'),
      ),
    ).toEqual([]);
    expect(graph.files.filter((file) => file.includes('/node_modules/phaser/'))).toEqual([]);
  });

  it('never imports a game module or reads a game repository file', () => {
    expect(graph.files.filter((file) => file.includes('/example-games/'))).toEqual([]);
    expect(graph.files.filter((file) => file.includes('GymLongErasureGame'))).toEqual([]);
    expect(
      graph.specifiers.filter((specifier) => specifier.includes('example-games/')),
    ).toEqual([]);
  });
});
