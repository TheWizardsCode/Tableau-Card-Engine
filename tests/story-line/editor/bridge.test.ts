/**
 * The editor write bridge: artefacts, documentation honesty and the
 * single-write-path guard.
 *
 * The bridge's whole reason to exist is that an accepted edit is followed by
 * artefact regeneration *and* an honest statement about what is not
 * machine-regenerable:
 *
 * - the committed Mermaid/JSON artefacts are rewritten and re-checked (the
 *   `--check` drift guards report no drift after an accepted edit);
 * - hand-written documentation is never claimed to be in sync: an edit that
 *   touches a documented row (the Gym demo's card catalogue) returns an
 *   explicit "manual documentation update required" naming the check that now
 *   fails;
 * - no editor module writes the content CSV itself — the T1 write-path guard
 *   still passes, and the arcade artefacts live outside the editor roots
 *   precisely so that guard stays meaningful (it is exercised below).
 *
 * @module
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { computeContentChecksum } from '../../../src/story-line/content/csv';
import {
  setStoryline,
  setStorylineBatch,
  checkCommittedArtefacts,
  applyEdit,
  previewEdit,
  regenerateArtefacts,
} from '../../../src/story-line/editor/api';
import { DEFAULT_MANUAL_DOC_SECTIONS, findManualDocUpdates } from '../../../src/story-line/editor/manual-docs';
import {
  assertSingleWritePath,
  scanWritePaths,
} from './write-path-guard';
import {
  CONTENT_CSV_PATH,
  REPO_ROOT,
  copyEditorFixtureFiles,
  type EditorFixtureFiles,
} from './fixtures';

/** The artefact paths of a fixture copy. */
function artefactPaths(fixture: EditorFixtureFiles) {
  return { json: fixture.manifestPath, mermaid: fixture.mermaidPath };
}

/** Loads the fixture content and returns its checksum. */
function loadChecksum(fixture: EditorFixtureFiles): string {
  return computeContentChecksum(readFileSync(fixture.csvPath, 'utf-8'));
}

describe('applyEdit — artefact regeneration after an accepted edit', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('regenerates the Mermaid/JSON artefacts and the drift guards report no drift', () => {
    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: {
        kind: 'update-card',
        spec: { id: 'gym-story-invest', name: 'Municipal Investment' },
      },
      expectedChecksum: loadChecksum(fixture),
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });

    expect(result.ok).toBe(true);
    expect(result.artefacts?.regenerated).toBe(true);
    expect([...result.artefacts?.written ?? []].sort()).toEqual(
      [fixture.manifestPath, fixture.mermaidPath].sort(),
    );
    expect(result.artefacts?.ok).toBe(true);
    expect(result.artefacts?.drifts).toEqual([]);

    // Both committed artefacts now mention the renamed card…
    expect(readFileSync(fixture.manifestPath, 'utf-8')).toContain('Municipal Investment');
    expect(readFileSync(fixture.mermaidPath, 'utf-8')).toContain('Municipal Investment');

    // …and the `--check`-equivalent drift guard passes for both.
    const edited = readFileSync(fixture.csvPath, 'utf-8');
    expect(checkCommittedArtefacts(edited, GYM_CONTENT_ADAPTER, { artefactPaths: artefactPaths(fixture) })).toEqual([]);
  });

  it('reports drift before content is edited away from the committed artefacts', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const drifts = checkCommittedArtefacts(before, GYM_CONTENT_ADAPTER, {
      artefactPaths: artefactPaths(fixture),
    });
    // The fixture copies are byte-identical to the committed artefacts, so no drift.
    expect(drifts).toEqual([]);

    // A stale artefact (committed content ahead of the artefact) is reported.
    writeFileSync(
      fixture.manifestPath,
      readFileSync(fixture.manifestPath, 'utf-8').replace('Public Investment', 'Renamed In Stale'),
      'utf-8',
    );
    const stale = checkCommittedArtefacts(before, GYM_CONTENT_ADAPTER, {
      artefactPaths: artefactPaths(fixture),
    });
    expect(stale.map((drift) => drift.reason)).toEqual(['drift']);
    expect(stale[0].format).toBe('json');
    expect(stale[0].message).toContain('regenerate');
  });

  it('regenerateArtefacts repairs stale artefacts without touching content', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    writeFileSync(fixture.manifestPath, '{"stale": true}\n', 'utf-8');

    const { manifest, artefacts } = regenerateArtefacts(before, GYM_CONTENT_ADAPTER, {
      artefactPaths: artefactPaths(fixture),
    });

    expect(manifest.gameId).toBe('gym');
    expect(artefacts.ok).toBe(true);
    expect(artefacts.written).toHaveLength(2);
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);
  });
});

describe('manual documentation updates (hand-written rows are never claimed in sync)', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('reports a manual doc update naming the failing check when a documented row changes', () => {
    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: { kind: 'update-card', spec: { id: 'gym-story-invest', name: 'Municipal Investment' } },
      expectedChecksum: loadChecksum(fixture),
      artefactPaths: artefactPaths(fixture),
      manualDocs: DEFAULT_MANUAL_DOC_SECTIONS,
    });

    expect(result.ok).toBe(true);
    expect(result.artefacts?.ok).toBe(true); // generated artefacts ARE in sync
    expect(result.manualDocumentationRequired).toBe(true);
    expect(result.manualDocUpdates).toHaveLength(1);

    const update = result.manualDocUpdates[0];
    expect(update.check).toBe('gym-storyline-demo-catalogue');
    expect(update.touchedIds).toEqual(['gym-story-invest']);
    // The check that now fails is named, and the generated artefacts are
    // explicitly NOT claimed to cover it.
    expect(update.path).toContain('GymStorylineDemo.ts');
    expect(update.verifyCommand).toContain('GymStorylineDemo.test.ts');
    expect(result.message).toContain('manual documentation update required');
    expect(result.message).toContain('gym-storyline-demo-catalogue');
    expect(result.message).not.toContain('no hand-written documentation');
  });

  it('reports nothing when the edited row is not hand-documented', () => {
    // Add a brand-new card that no documented section lists.
    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: {
        kind: 'add-card',
        spec: {
          id: 'gym-story-unique',
          name: 'A Unique New Card',
          effect: 'Nothing else references it.',
          hasChoices: false,
          // A single-member storyline of its own: an unlinked card inside an
          // existing storyline would be unreachable and refused.
          storylineId: 'gym-story-lone',
          storylineTitle: 'Lone Arc',
        },
      },
      expectedChecksum: loadChecksum(fixture),
      artefactPaths: artefactPaths(fixture),
      manualDocs: DEFAULT_MANUAL_DOC_SECTIONS,
    });

    expect(result.ok).toBe(true);
    expect(result.manualDocumentationRequired).toBe(false);
    expect(result.manualDocUpdates).toEqual([]);
    expect(result.message).toContain('no hand-written documentation section');
  });

  it('findManualDocUpdates is a pure filter over the registry', () => {
    expect(findManualDocUpdates(['gym-story-start'])).toHaveLength(1);
    expect(findManualDocUpdates(['something-else'])).toEqual([]);
    expect(findManualDocUpdates(['gym-story-start', 'gym-story-end'])).toHaveLength(1);
  });
});

describe('setStoryline bridge (the F4 wrapper over the author API)', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('reassigns a card through setStoryline and validates it', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const result = setStoryline(csv, GYM_CONTENT_ADAPTER, {
      id: 'gym-story-invest',
      storylineId: 'gym-story-alt',
      storylineTitle: 'Alt Arc',
    });

    expect(result.ok).toBe(true);
    expect(result.csv).toContain('gym-story-alt');
    // The old group still has cards; the reassigned card left it.
    const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, {
      kind: 'set-storyline',
      spec: { id: 'gym-story-invest', storylineId: 'gym-story-alt', storylineTitle: 'Alt Arc' },
    });
    expect(preview.ok).toBe(true);
    expect(preview.rows[0].after?.storylineId).toBe('gym-story-alt');
  });

  it('batch-reassigns every member in one author-pass and validates once', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    // Reassign the *whole* group: splitting a storyline without retargeting
    // its links would leave members unreachable, which validation refuses.
    const ids = ['gym-story-start', 'gym-story-invest', 'gym-story-ignore', 'gym-story-end'];
    const result = setStorylineBatch(csv, GYM_CONTENT_ADAPTER, {
      ids,
      storylineId: 'gym-story-merged',
      storylineTitle: 'Merged Arc',
    });

    expect(result.ok).toBe(true);
    expect(result.csv).toContain('gym-story-merged');
    // The whole group moved in one candidate that validates.
    const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, {
      kind: 'set-storyline-batch',
      spec: { ids, storylineId: 'gym-story-merged', storylineTitle: 'Merged Arc' },
    });
    expect(preview.ok).toBe(true);
    expect(preview.rows.map((row) => row.id).sort()).toEqual([...ids].sort());
    expect(preview.rows.every((row) => row.after?.storylineId === 'gym-story-merged')).toBe(true);
    expect(preview.rows.every((row) => row.after?.storylineTitle === 'Merged Arc')).toBe(true);
  });

  it('is a path to the write bridge: applyEdit accepts the set-storyline kind', () => {
    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: {
        kind: 'set-storyline',
        spec: { id: 'gym-story-end', storylineId: 'gym-story-alt', storylineTitle: 'Alt Arc' },
      },
      expectedChecksum: loadChecksum(fixture),
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);
    expect(readFileSync(fixture.csvPath, 'utf-8')).toContain('gym-story-alt');
  });
});

describe('single-write-path guard (T1) with the bridge in place', () => {
  it('passes: no editor module writes the content CSV itself', () => {
    const scan = scanWritePaths({ baseDir: REPO_ROOT });
    expect(() => assertSingleWritePath(scan)).not.toThrow();
    expect(scan.skipped).toEqual([]); // every editor root now exists and was scanned
  });

  it('the committed Gym content is byte-identical after all bridge tests ran', () => {
    const committed = readFileSync(CONTENT_CSV_PATH, 'utf-8');
    expect(committed).toContain('Public Investment');
    expect(committed).not.toContain('Municipal Investment');
    expect(committed).not.toContain('gym-story-alt');
  });
});
