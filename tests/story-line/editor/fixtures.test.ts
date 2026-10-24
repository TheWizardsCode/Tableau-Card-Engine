/**
 * Tests for the editor fixture helper (`tests/story-line/editor/fixtures.ts`).
 *
 * The core contract: edit tests run against isolated temp copies and **never**
 * mutate the committed content CSV or artefacts. Underlying paths derive from
 * the generator's own exported defaults, so an artefact/schema move makes an
 * existence assertion fail loudly instead of silently copying stale files.
 *
 * @module
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  buildStorylineManifestFromCsv,
  serialiseManifest,
} from '../../../src/story-line/content/manifest';
import {
  CONTENT_CSV_PATH,
  MANIFEST_ARTEFACT_PATH,
  MERMAID_ARTEFACT_PATH,
  copyEditorFixtureFiles,
} from './fixtures';

describe('story-line editor fixture helper', () => {
  // Committed originals, captured once: every test then proves they are
  // byte-identical afterwards no matter what the copies were mutated with.
  const originals = {
    csv: readFileSync(CONTENT_CSV_PATH, 'utf-8'),
    manifest: readFileSync(MANIFEST_ARTEFACT_PATH, 'utf-8'),
    mermaid: readFileSync(MERMAID_ARTEFACT_PATH, 'utf-8'),
  };

  it('points every fixture source at existing committed files (a moved artefact fails this test)', () => {
    // The paths are derived from the generator's exported defaults; if an
    // artefact or the content file moves, these existence assertions fail —
    // the "one obvious test" the item requires.
    expect(CONTENT_CSV_PATH.endsWith('/example-games/gym/content/storylines.csv')).toBe(true);
    expect(MANIFEST_ARTEFACT_PATH.endsWith('/example-games/gym/content/storyline-manifest.json')).toBe(true);
    expect(MERMAID_ARTEFACT_PATH.endsWith('/example-games/gym/content/storyline-graph.mmd')).toBe(true);
    expect(existsSync(CONTENT_CSV_PATH)).toBe(true);
    expect(existsSync(MANIFEST_ARTEFACT_PATH)).toBe(true);
    expect(existsSync(MERMAID_ARTEFACT_PATH)).toBe(true);
  });

  it('copies the content CSV and artefacts into an isolated temp directory', () => {
    const fixture = copyEditorFixtureFiles();
    let dir = '';
    try {
      dir = fixture.dir;
      // The copies live under the OS temp dir, outside the repository, and
      // keep their source filenames (derived from the defaults).
      expect(dir.startsWith(tmpdir())).toBe(true);
      expect(dirname(fixture.csvPath)).toBe(dir);
      expect(basename(fixture.csvPath)).toBe(basename(CONTENT_CSV_PATH));
      expect(basename(fixture.manifestPath)).toBe(basename(MANIFEST_ARTEFACT_PATH));
      expect(basename(fixture.mermaidPath)).toBe(basename(MERMAID_ARTEFACT_PATH));

      // Copies are distinct paths, but byte-identical to the originals.
      expect(fixture.csvPath).not.toBe(CONTENT_CSV_PATH);
      expect(fixture.manifestPath).not.toBe(MANIFEST_ARTEFACT_PATH);
      expect(fixture.mermaidPath).not.toBe(MERMAID_ARTEFACT_PATH);
      expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(originals.csv);
      expect(readFileSync(fixture.manifestPath, 'utf-8')).toBe(originals.manifest);
      expect(readFileSync(fixture.mermaidPath, 'utf-8')).toBe(originals.mermaid);
    } finally {
      fixture.cleanup();
    }
    expect(existsSync(dir)).toBe(false);
  });

  it('leaves the committed originals byte-identical after editing the copies', () => {
    const fixture = copyEditorFixtureFiles();
    try {
      // Simulate an editor edit against the isolated copies.
      writeFileSync(fixture.csvPath, originals.csv.replace('Town Meeting', 'Renamed Meeting'), 'utf-8');
      writeFileSync(fixture.manifestPath, originals.manifest.replace('Town Meeting', 'Renamed Meeting'), 'utf-8');
      // The committed originals are untouched.
      expect(readFileSync(CONTENT_CSV_PATH, 'utf-8')).toBe(originals.csv);
      expect(readFileSync(MANIFEST_ARTEFACT_PATH, 'utf-8')).toBe(originals.manifest);
      expect(readFileSync(MERMAID_ARTEFACT_PATH, 'utf-8')).toBe(originals.mermaid);
    } finally {
      fixture.cleanup();
    }
  });

  it('keeps the fixture copies coherent: the manifest matches a fresh generation from the copy', () => {
    // The editor consumes the manifest as its view model; a fixture that pairs
    // a CSV with a stale artefact would corrupt every later slice. Regenerating
    // from the copied CSV must reproduce the copied manifest byte-for-byte.
    const fixture = copyEditorFixtureFiles();
    try {
      const generated = serialiseManifest(
        buildStorylineManifestFromCsv(readFileSync(fixture.csvPath, 'utf-8'), GYM_CONTENT_ADAPTER),
      );
      expect(generated).toBe(originals.manifest);
    } finally {
      fixture.cleanup();
    }
  });
});
