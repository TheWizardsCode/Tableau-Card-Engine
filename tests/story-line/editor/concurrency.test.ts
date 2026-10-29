/**
 * The editor write bridge's concurrency guard.
 *
 * The guard exists so an editor that loaded a content CSV can never clobber an
 * edit someone else made on disk in the meantime: the checksum captured at load
 * is compared, by the writer itself, with the checksum of the file it just read.
 * On a mismatch nothing is written and the caller is told to reload.
 *
 * These tests pin the three properties that matter:
 *
 * - a stale token is refused with a reload instruction and a byte-identical file;
 * - the guard lives in the single writer (`applyContentEditToFile`), so no
 *   caller can bypass it;
 * - the checksum is the content model's own `computeContentChecksum` — there is
 *   no second hash to drift out of step.
 *
 * All edits run against temp copies (`copyEditorFixtureFiles`), never the
 * committed Gym content.
 *
 * @module
 */
import { readFileSync, writeFileSync } from 'node:fs';


import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  applyContentEditToFile,
  updateContentCard,
} from '../../../src/story-line/content/author';
import { computeContentChecksum } from '../../../src/story-line/content/csv';
import { applyEdit, previewEdit } from '../../../src/story-line/editor/api';
import { CONTENT_CSV_PATH, copyEditorFixtureFiles, type EditorFixtureFiles } from './fixtures';

/** The edit used by these tests: rename one documented Gym card. */
const RENAME = {
  kind: 'update-card',
  spec: { id: 'gym-story-invest', name: 'Municipal Investment' },
} as const;

/** The artefact paths of a fixture copy (same temp directory, real basenames). */
function artefactPaths(fixture: EditorFixtureFiles) {
  return { json: fixture.manifestPath, mermaid: fixture.mermaidPath };
}

/** Loads the fixture content and returns its checksum. */
function loadChecksum(fixture: EditorFixtureFiles): string {
  return computeContentChecksum(readFileSync(fixture.csvPath, 'utf-8'));
}

describe('editor write bridge concurrency guard', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('refuses to write when the content changed on disk since load and instructs a reload', () => {
    const loadedChecksum = loadChecksum(fixture);

    // Someone else edits the file after the editor loaded it.
    const external = `${readFileSync(fixture.csvPath, 'utf-8')}`.replace(
      'Town Meeting',
      'Town Assembly',
    );
    writeFileSync(fixture.csvPath, external, 'utf-8');
    const externalChecksum = computeContentChecksum(external);
    expect(externalChecksum).not.toBe(loadedChecksum);

    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: RENAME,
      expectedChecksum: loadedChecksum,
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('stale-content');
    expect(result.code).toBe(409);
    expect(result.written).toBe(false);
    expect(result.reloadRequired).toBe(true);
    expect(result.message).toMatch(/reload/i);
    expect(result.errors.join(' ')).toContain(loadedChecksum);
    expect(result.errors.join(' ')).toContain(externalChecksum);

    // Nothing was clobbered: the external edit survives byte for byte.
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(external);
  });

  it('accepts the edit when the token matches and reports the new checksum', () => {
    const loadedChecksum = loadChecksum(fixture);

    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: RENAME,
      expectedChecksum: loadedChecksum,
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('applied');
    expect(result.written).toBe(true);

    const written = readFileSync(fixture.csvPath, 'utf-8');
    expect(result.checksum).toBe(computeContentChecksum(written));
    expect(result.checksum).not.toBe(loadedChecksum);
    expect(written).toContain('Municipal Investment');

    // The old token is now itself stale — a retry cannot double-apply.
    const retry = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: RENAME,
      expectedChecksum: loadedChecksum,
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });
    expect(retry.status).toBe('stale-content');
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(written);
  });

  it('enforces the guard inside the writer, so no caller can bypass it', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const stale = applyContentEditToFile({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      expectedChecksum: 'deadbeef',
      mutate: (csv) => updateContentCard(csv, GYM_CONTENT_ADAPTER, RENAME.spec),
    });

    expect(stale.ok).toBe(false);
    expect(stale.stale).toBe(true);
    expect(stale.reloadRequired).toBe(true);
    expect(stale.written).toBe(false);
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);

    const accepted = applyContentEditToFile({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      expectedChecksum: computeContentChecksum(before),
      mutate: (csv) => updateContentCard(csv, GYM_CONTENT_ADAPTER, RENAME.spec),
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.written).toBe(true);
    expect(accepted.stale).toBeUndefined();
  });

  it('uses the content model checksum (no second hash) for both load and write', () => {
    const loaded = previewEdit(
      readFileSync(fixture.csvPath, 'utf-8'),
      GYM_CONTENT_ADAPTER,
      RENAME,
    );
    expect(loaded.checksum).toBe(loadChecksum(fixture));

    // A byte-only change (whitespace) is still a change to the token.
    writeFileSync(fixture.csvPath, `${readFileSync(fixture.csvPath, 'utf-8')}\n`, 'utf-8');
    expect(computeContentChecksum(readFileSync(fixture.csvPath, 'utf-8'))).not.toBe(loaded.checksum);
  });

  it('never writes on a refused preview (the token is read-only there)', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const preview = previewEdit(before, GYM_CONTENT_ADAPTER, {
      kind: 'update-card',
      spec: { id: 'gym-story-start', options: 'Invest|gym-story-invest;Ignore|gym-story-ghost' },
    });

    expect(preview.ok).toBe(false);
    expect(preview.errors.join(' ')).toContain('gym-story-ghost');
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);
  });
});

describe('concurrency fixture isolation', () => {
  it('runs against a temp copy, leaving the committed Gym content untouched', () => {
    const committed = readFileSync(CONTENT_CSV_PATH, 'utf-8');
    const fixture = copyEditorFixtureFiles();
    try {
      applyEdit({
        contentPath: fixture.csvPath,
        adapter: GYM_CONTENT_ADAPTER,
        edit: RENAME,
        expectedChecksum: computeContentChecksum(committed),
        artefactPaths: artefactPaths(fixture),
        manualDocs: [],
      });
      expect(readFileSync(fixture.csvPath, 'utf-8')).toContain('Municipal Investment');
    } finally {
      fixture.cleanup();
    }
    expect(readFileSync(CONTENT_CSV_PATH, 'utf-8')).toBe(committed);
  });
});
