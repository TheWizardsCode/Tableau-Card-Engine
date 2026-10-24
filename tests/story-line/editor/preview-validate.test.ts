/**
 * Preview/diff and validate-before-write for the editor write bridge.
 *
 * The epic's core promise: **every edit returns a preview/diff and runs the
 * validator before writing**. These tests pin that contract against the Gym
 * fixture:
 *
 * - `previewEdit` reports the before/after CSV rows of the affected cards plus
 *   the validation report (text and JSON agree);
 * - an invalid edit (a dangling successor) is surfaced by name, produces no
 *   candidate text, and writes nothing — the CSV stays byte-identical;
 * - `validateEdit` gives the same verdict as the preview, nothing written;
 * - `applyEdit` on a valid edit writes once, on an invalid one refuses with a
 *   non-2xx-style status and leaves the file untouched.
 *
 * All edits run against temp copies; the committed Gym content is never
 * mutated (asserted at the end).
 *
 * @module
 */
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { computeContentChecksum } from '../../../src/story-line/content/csv';
import {
  applyEdit,
  previewEdit,
  validateEdit,
} from '../../../src/story-line/editor/api';
import {
  CONTENT_CSV_PATH,
  copyEditorFixtureFiles,
  type EditorFixtureFiles,
} from './fixtures';

/** The artefact paths of a fixture copy. */
function artefactPaths(fixture: EditorFixtureFiles) {
  return { json: fixture.manifestPath, mermaid: fixture.mermaidPath };
}

/** A valid, documented edit: rename the `Public Investment` card. */
const VALID_RENAME = {
  kind: 'update-card',
  spec: { id: 'gym-story-invest', name: 'Municipal Investment', effect: 'Gain 150 coins' },
} as const;

/**
 * A deliberately dangling edit: add an option that targets a card that does
 * not exist, while keeping every existing successor. `gym-story-start` keeps
 * its other options, so the only validator finding is the unknown successor
 * (no card becomes unreachable).
 */
const DANGLING_EDIT = {
  kind: 'update-card',
  spec: {
    id: 'gym-story-start',
    options: 'Invest|gym-story-invest;Ignore|gym-story-ignore;Bold move|gym-story-ghost',
  },
} as const;

describe('previewEdit — the diff', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('returns the before/after CSV rows of the affected card and nothing else', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, VALID_RENAME);

    expect(preview.ok).toBe(true);
    expect(preview.kind).toBe('update-card');
    expect(preview.errors).toEqual([]);
    expect(preview.affectedIds).toEqual(['gym-story-invest']);

    const row = preview.rows[0];
    expect(row.id).toBe('gym-story-invest');
    expect(row.status).toBe('changed');
    expect(row.before?.name).toBe('Public Investment');
    expect(row.after?.name).toBe('Municipal Investment');
    expect(row.before?.effect).toBe('Gain 120 coins');
    expect(row.after?.effect).toBe('Gain 150 coins');
    expect(row.changedColumns).toEqual(expect.arrayContaining(['name', 'effect']));

    // Unaffected fields carry through unchanged.
    expect(row.after?.storylineId).toBe('gym-story');
    expect(row.before?.storylineId).toBe('gym-story');
  });

  it('shows an added row for a new card, with the adapter defaults and no before', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, {
      kind: 'add-card',
      spec: {
        id: 'gym-story-endgame',
        name: 'The Endgame',
        effect: 'Everything ends.',
        hasChoices: false,
        storylineId: 'gym-story-lone',
        storylineTitle: 'Lone Arc',
      },
    });

    expect(preview.ok).toBe(true);
    const row = preview.rows.find((candidate) => candidate.id === 'gym-story-endgame');
    expect(row).toBeDefined();
    expect(row?.status).toBe('added');
    expect(row?.before).toBeNull();
    // The adapter's newCardDefaults fill the game columns.
    expect(row?.after?.trigger).toBe('Incident');
    expect(row?.after?.cost).toBe('0');
    expect(preview.affectedIds).toContain('gym-story-endgame');
  });

  it('never writes during a preview (fixture stays byte-identical)', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    previewEdit(before, GYM_CONTENT_ADAPTER, VALID_RENAME);
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);
  });
});

describe('previewEdit — validation before write', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('surfaces a dangling successor by name and refuses the candidate', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, DANGLING_EDIT);

    expect(preview.ok).toBe(false);
    expect(preview.csv).toBeUndefined();
    expect(preview.validation.valid).toBe(false);
    expect(preview.validation.issues).toHaveLength(1);
    expect(preview.validation.issues[0].code).toBe('unknown-successor');
    expect(preview.validation.issues[0].cardId).toBe('gym-story-start');
    expect(preview.validation.issues[0].target).toBe('gym-story-ghost');
    expect(preview.errors.join(' ')).toContain('gym-story-ghost');
    expect(preview.rows).toEqual([]);
    expect(preview.affectedIds).toEqual([]);
  });

  it('runs the validator against the full candidate, not just the edited row', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    // Dropping the storyline id from a choice card is `missing-storyline-id`.
    const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, {
      kind: 'update-card',
      spec: { id: 'gym-story-start', storylineId: null },
    });

    expect(preview.ok).toBe(false);
    expect(
      preview.validation.issues.some((issue) => issue.code === 'missing-storyline-id'),
    ).toBe(true);
  });

  it('text and JSON reports agree for a valid candidate', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, VALID_RENAME);

    expect(preview.report).toContain('RESULT: VALID');
    const json = JSON.parse(preview.reportJson) as {
      valid: boolean;
      issues: unknown[];
      findings: unknown[];
    };
    expect(json.valid).toBe(true);
    expect(json.issues).toHaveLength(preview.validation.issues.length);
    expect(json.findings).toHaveLength(preview.validation.findings.length);
  });

  it('text and JSON reports agree for an invalid candidate', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, DANGLING_EDIT);

    expect(preview.report).toContain('RESULT: INVALID');
    const json = JSON.parse(preview.reportJson) as { valid: boolean; issues: unknown[] };
    expect(json.valid).toBe(false);
    expect(json.issues).toHaveLength(preview.validation.issues.length);
  });
});

describe('validateEdit — reports without a diff', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('agrees with the preview verdict and writes nothing', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');

    const good = validateEdit(csv, GYM_CONTENT_ADAPTER, VALID_RENAME);
    expect(good.ok).toBe(true);
    expect(good.validation.valid).toBe(true);
    expect(good.checksum).toBe(computeContentChecksum(csv));

    const bad = validateEdit(csv, GYM_CONTENT_ADAPTER, DANGLING_EDIT);
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toContain('gym-story-ghost');

    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(csv);
  });
});

describe('applyEdit — validate before write', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('writes a valid edit and regenerates the artefacts', () => {
    const loaded = computeContentChecksum(readFileSync(fixture.csvPath, 'utf-8'));
    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: VALID_RENAME,
      expectedChecksum: loaded,
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('applied');
    expect(result.code).toBe(200);
    expect(result.written).toBe(true);
    expect(result.errors).toEqual([]);
    expect(readFileSync(fixture.csvPath, 'utf-8')).toContain('Municipal Investment');
  });

  it('refuses an invalid edit with a non-2xx code and leaves the CSV byte-identical', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const loaded = computeContentChecksum(before);

    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: DANGLING_EDIT,
      expectedChecksum: loaded,
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.code).toBe(422);
    expect(result.written).toBe(false);
    expect(result.errors.join(' ')).toContain('gym-story-ghost');
    expect(result.preview.errors.join(' ')).toContain('gym-story-ghost');
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);
    // No artefacts were (re)written either.
    expect(result.artefacts).toBeUndefined();
    expect(result.manualDocUpdates).toEqual([]);
  });

  it('dry run previews and validates without writing content or artefacts', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const beforeManifest = readFileSync(fixture.manifestPath, 'utf-8');
    const beforeMermaid = readFileSync(fixture.mermaidPath, 'utf-8');
    const loaded = computeContentChecksum(before);

    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: VALID_RENAME,
      expectedChecksum: loaded,
      dryRun: true,
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('dry-run');
    expect(result.written).toBe(false);
    expect(result.preview.csv).toContain('Municipal Investment');
    expect(result.artefacts?.regenerated).toBe(false);
    expect(result.artefacts?.written).toEqual([]);
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);
    expect(readFileSync(fixture.manifestPath, 'utf-8')).toBe(beforeManifest);
    expect(readFileSync(fixture.mermaidPath, 'utf-8')).toBe(beforeMermaid);
    // The dry run reports the drift the accepted edit would introduce …
    expect(result.artefacts?.drifts.length).toBeGreaterThan(0);
    expect(result.artefacts?.ok).toBe(false);
  });

  it('rejects an unknown edit kind instead of silently doing nothing', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const result = previewEdit(before, GYM_CONTENT_ADAPTER, {
      kind: 'reticulate-splines',
      spec: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('unknown edit kind "reticulate-splines"');
  });

  it('the committed Gym content is never mutated by any of the above', () => {
    // Sanity: the suite's edits were all against temp copies.
    expect(readFileSync(CONTENT_CSV_PATH, 'utf-8')).toContain('Public Investment');
    expect(readFileSync(CONTENT_CSV_PATH, 'utf-8')).not.toContain('Municipal Investment');
  });
});
