/**
 * Scene-space guard test lane: fixture loading and the fixtures' declared intent
 * (CG-0MWUOEDOW001SE94).
 *
 * This module is the **single** place a scene-space invariant test obtains its
 * inputs. It is the scene-space counterpart of
 * [`tests/story-line/helpers/episode-fixture.ts`](../../helpers/episode-fixture.ts),
 * and it deliberately does the same three things and nothing more:
 *
 * - {@link loadSceneGuardFixture} binds one of the three committed control
 *   fixtures to the **shipped** content adapter (`getContentAdapter`, selected
 *   by the manifest's own `content.adapter`) and `cardsFromCsv`, and reads the
 *   run's starting bag through the pure `readManifestStartBag` read-through —
 *   no game module, no Phaser, no game-side constant.
 * - {@link SCENE_GUARD_FIXTURES} records each fixture's **intended violation as
 *   data**: the scene id, the refused beat card id and the winning outcome rule
 *   id. A later invariant therefore asserts the exact failure the fixture was
 *   authored for, never a bare "invalid".
 * - {@link sceneById} / {@link beatOf} resolve those authored ids so a test
 *   reads the manifest's own declarations rather than re-typing them.
 *
 * ## The three control fixtures
 *
 * | Fixture | Scene space | Intended result |
 * | --- | --- | --- |
 * | `clean` | Hall (refusable beat, met objective) → crossing or rest → one ending | Both invariants hold. |
 * | `exhausted-success` | The `clean` scene space with each scene's objective-met rule ordered **before** its budget-exhausted rule | An exhausted close classifies `success`. |
 * | `refusal-strand` | Hold ⇄ loop; every entry beat is unaffordable and no route names an ending | A refusal reaches a state with no reachable ending. |
 *
 * `exhausted-success` shares the `clean` scene space on purpose: the two
 * fixtures differ **only** in the order of the outcome table, so a failing
 * invariant is attributable to the ordering and not to a different episode.
 * `refusal-strand` declares an ending that no route names, so the unreachable
 * ending is data a test can point at.
 *
 * Everything here is Phaser-free: the suite asserts that over this module's
 * **real import graph**, not by grepping one file.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { getContentAdapter } from '../../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv, parseResourceDeclaration } from '../../../src/story-line/content/csv';
import type { EpisodeManifest, Scene } from '../../../src/story-line/content/episode-manifest';
import type { ContentAdapter, ContentCard } from '../../../src/story-line/content/types';
import {
  readManifestStartBag,
  type StorylineResourceKey,
  type StorylineResources,
} from '../../../src/story-line/resources';
import { REPO_ROOT } from './test-support';

/** The fixture names this lane exposes. */
export type SceneGuardFixtureName = 'clean' | 'exhausted-success' | 'refusal-strand';

/**
 * The invariant a fixture is authored to violate.
 *
 * The names are the parent epic's invariant identities, so a later feature
 * reports violations under the same vocabulary the fixture records.
 */
export type SceneGuardInvariant =
  /** No exhausted close may classify `success` (parent AC 2; the runtime's `no-success-on-exhausted-close`). */
  | 'no-success-on-exhausted-close'
  /** No refusal may lead to a state with no reachable ending (parent AC 3). */
  | 'refusal-reaches-ending';

/** The exact failure a control fixture is authored for. */
export interface SceneGuardExpectedViolation {
  /** The invariant the fixture must make falsifiable. */
  readonly invariant: SceneGuardInvariant;
  /** The scene the violation is observed in. */
  readonly sceneId: string;
  /** The beat whose entry is refused (the close trigger). */
  readonly refusedBeatCardId: string;
  /** The outcome rule that wins the exhausted close. */
  readonly winningRuleId: string;
  /** One line stating the defect, for a failure message or a report. */
  readonly detail: string;
}

/** One committed control fixture's files and recorded intent. */
export interface SceneGuardFixtureSpec {
  /** The fixture name (`clean`, `exhausted-success`, `refusal-strand`). */
  readonly name: SceneGuardFixtureName;
  /** Manifest file name inside {@link SCENE_GUARD_FIXTURES_DIR}. */
  readonly manifestFile: string;
  /** Content CSV file name inside {@link SCENE_GUARD_FIXTURES_DIR}. */
  readonly csvFile: string;
  /** The violations the fixture is authored to expose (empty for `clean`). */
  readonly expectedViolations: readonly SceneGuardExpectedViolation[];
}

/** Absolute path of the committed scene-guard fixtures directory. */
export const SCENE_GUARD_FIXTURES_DIR = join(REPO_ROOT, 'tests/fixtures/story-line/scene-guard');

/**
 * Every control fixture, with its files and its recorded intent.
 *
 * This is the lane's authoritative table: the suite iterates it, and a later
 * invariant reads {@link SceneGuardExpectedViolation} rather than hard-coding
 * ids of its own.
 */
export const SCENE_GUARD_FIXTURES: readonly SceneGuardFixtureSpec[] = [
  {
    name: 'clean',
    manifestFile: 'clean.episode.json',
    csvFile: 'clean.csv',
    expectedViolations: [],
  },
  {
    name: 'exhausted-success',
    manifestFile: 'exhausted-success.episode.json',
    csvFile: 'exhausted-success.csv',
    expectedViolations: [
      {
        invariant: 'no-success-on-exhausted-close',
        sceneId: 'sg-hall',
        refusedBeatCardId: 'sg-hall-wait',
        winningRuleId: 'hall-held',
        detail:
          'The hall objective is met at the start bag, and the objective-met rule is ordered ' +
          'before the budget-exhausted rule, so the close of a refused beat classifies success.',
      },
    ],
  },
  {
    name: 'refusal-strand',
    manifestFile: 'refusal-strand.episode.json',
    csvFile: 'refusal-strand.csv',
    expectedViolations: [
      {
        invariant: 'refusal-reaches-ending',
        sceneId: 'sg-hold',
        refusedBeatCardId: 'sg-hold-wait',
        winningRuleId: 'hold-spent',
        detail:
          'Both scenes route only to each other, every entry beat is unaffordable, and no ' +
          'route names the declared ending, so the refusal loop never reaches an ending.',
      },
    ],
  },
];

/** Options for {@link loadSceneGuardFixture}. */
export interface SceneGuardFixtureOptions {
  /** In-memory manifest override (e.g. a mutated copy reordering a route table). */
  readonly manifest?: EpisodeManifest;
  /** In-memory card override (defaults to the cards parsed from the fixture CSV). */
  readonly cards?: readonly ContentCard[];
}

/** One loaded control fixture, bound to the shipped content seams. */
export interface SceneGuardFixture {
  /** The fixture name. */
  readonly name: SceneGuardFixtureName;
  /** The fixture's declared files and recorded intent. */
  readonly spec: SceneGuardFixtureSpec;
  /** Absolute path of the manifest file that was read. */
  readonly manifestPath: string;
  /** Absolute path of the CSV the manifest's `content.file` names. */
  readonly csvPath: string;
  /** The parsed manifest (the file's meaning, never a copy of it). */
  readonly manifest: EpisodeManifest;
  /** The content adapter the manifest selects (`getContentAdapter`). */
  readonly adapter: ContentAdapter;
  /** Every content card, in file order. */
  readonly cards: readonly ContentCard[];
  /** The cards keyed by id — the id space beats and endings resolve in. */
  readonly cardsById: ReadonlyMap<string, ContentCard>;
  /** The manifest's declared resource keys, in declaration order. */
  readonly declaredResources: readonly StorylineResourceKey[];
  /**
   * The declared keys the **content file** yields (`#resources:` line, else the
   * first card's `resources` cell). Passing this set to
   * `validateEpisodeManifest` makes the manifest-vs-content binding a real
   * check instead of a tautology.
   */
  readonly contentDeclaredResources: readonly StorylineResourceKey[];
  /** The run's starting bag, read through `readManifestStartBag`. */
  readonly startBag: StorylineResources;
  /** The exact failure the fixture is authored for (empty for `clean`). */
  readonly expectedViolations: readonly SceneGuardExpectedViolation[];
}

/** Reads and parses a JSON file. */
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8')) as unknown;
}

/** The spec for a fixture name, or `undefined` when the name is unknown. */
export function sceneGuardFixtureSpec(
  name: SceneGuardFixtureName,
): SceneGuardFixtureSpec | undefined {
  return SCENE_GUARD_FIXTURES.find((spec) => spec.name === name);
}

/**
 * Loads one control fixture through the shipped content seams.
 *
 * The manifest's `content.adapter` selects the adapter and its `content.file`
 * names the CSV, so the binding is proved on every run instead of being
 * hard-coded here. Every read fails loudly: an unknown fixture name, an
 * unknown adapter, an unusable starting bag or a missing file is an error, not
 * an empty fixture.
 *
 * @param name    The fixture to load (`clean`, `exhausted-success`, `refusal-strand`).
 * @param options Optional in-memory overrides.
 * @returns The manifest, its cards keyed by id, the declared keys and start bag.
 */
export function loadSceneGuardFixture(
  name: SceneGuardFixtureName,
  options: SceneGuardFixtureOptions = {},
): SceneGuardFixture {
  const spec = sceneGuardFixtureSpec(name);
  if (spec === undefined) {
    throw new Error(
      `Scene guard fixture "${name}" is not declared. Known fixtures: ` +
        SCENE_GUARD_FIXTURES.map((entry) => entry.name).join(', '),
    );
  }

  const manifestPath = join(SCENE_GUARD_FIXTURES_DIR, spec.manifestFile);
  const manifest: EpisodeManifest =
    options.manifest ?? (readJson(manifestPath) as EpisodeManifest);
  const csvPath = resolve(REPO_ROOT, manifest.content.file);

  const adapter = getContentAdapter(manifest.content.adapter);
  if (adapter === undefined) {
    throw new Error(
      `Scene guard fixture "${name}" names unknown content adapter "${manifest.content.adapter}".`,
    );
  }

  const parsedCsv = parseCsv(readFileSync(csvPath, 'utf-8'));
  const cards = options.cards ?? cardsFromCsv(parsedCsv, adapter);
  const cardsById = new Map(cards.map((card) => [card.id, card] as const));
  const fileDeclaredResources = parseResourceDeclaration(parsedCsv.declarations);
  const contentDeclaredResources =
    fileDeclaredResources.length > 0 ? fileDeclaredResources : (cards[0]?.resourceKeys ?? []);

  const declaredResources = manifest.resources.declared;
  const startBagRead = readManifestStartBag(declaredResources, manifest.resources.start);
  if (!startBagRead.ok) {
    throw new Error(
      `Scene guard fixture "${name}" has an unusable resources.start bag: ` +
        startBagRead.issues.map((issue) => `${issue.reason}:${issue.key}`).join(', '),
    );
  }

  return {
    name,
    spec,
    manifestPath,
    csvPath,
    manifest,
    adapter,
    cards,
    cardsById,
    declaredResources,
    contentDeclaredResources,
    startBag: startBagRead.bag,
    expectedViolations: spec.expectedViolations,
  };
}

/** Every scene of a manifest, in act then declaration order. */
export function scenesOf(manifest: EpisodeManifest): readonly Scene[] {
  return manifest.acts.flatMap((act) => act.scenes);
}

/**
 * Resolves a scene id in a manifest.
 *
 * @param manifest The manifest to search.
 * @param sceneId  The scene id to resolve.
 * @returns The scene.
 * @throws Error when the manifest declares no such scene.
 */
export function sceneById(manifest: EpisodeManifest, sceneId: string): Scene {
  const scene = scenesOf(manifest).find((candidate) => candidate.id === sceneId);
  if (scene === undefined) {
    throw new Error(
      `Scene "${sceneId}" is not declared by episode "${manifest.id}" ` +
        `(scenes: ${scenesOf(manifest)
          .map((candidate) => candidate.id)
          .join(', ')}).`,
    );
  }
  return scene;
}

/**
 * Resolves one beat of a scene by its card id.
 *
 * @param scene   The scene whose beat set is searched.
 * @param cardId  The beat's content card id.
 * @returns The authored beat (its `clockCost` and optional note).
 * @throws Error when the scene authors no such beat.
 */
export function beatOf(scene: Scene, cardId: string): Scene['beats'][number] {
  const beat = scene.beats.find((candidate) => candidate.cardId === cardId);
  if (beat === undefined) {
    throw new Error(
      `Scene "${scene.id}" authors no beat "${cardId}" ` +
        `(beats: ${scene.beats.map((candidate) => candidate.cardId).join(', ')}).`,
    );
  }
  return beat;
}
