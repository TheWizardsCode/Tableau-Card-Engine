/**
 * Manifest schema guard for the story-line editor harness.
 *
 * The editor consumes the generated manifest as its view model, so the harness
 * must fail loudly if the generic JSON schema or the committed manifest
 * artefact moves out from under it. Both paths are derived from the
 * generator's own exported defaults (`DEFAULT_GRAPH_OUTPUTS`,
 * `DEFAULT_MANIFEST_SCHEMA_PATH`) — a move breaks the derived path and the
 * existence assertion throws instead of silently validating a stale file.
 *
 * @module
 */
import { existsSync, readFileSync } from 'node:fs';

import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  buildStorylineManifestFromCsv,
  serialiseManifest,
} from '../../../src/story-line/content/manifest';
import {
  MANIFEST_ARTEFACT_PATH,
  MANIFEST_SCHEMA_PATH,
  copyEditorFixtureFiles,
} from './fixtures';

describe('story-line editor manifest schema guard', () => {
  it('derives a schema path that still resolves (a schema move fails this test loudly)', () => {
    // ENOENT here would fail the whole describe block; the explicit existence
    // assertion keeps the failure message readable.
    expect(MANIFEST_SCHEMA_PATH.endsWith('/schemas/story-line-manifest.schema.json')).toBe(true);
    expect(existsSync(MANIFEST_SCHEMA_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(MANIFEST_SCHEMA_PATH, 'utf-8')).title).toBe(
      'TCE Story-Line Content Manifest',
    );
  });

  it('validates the committed manifest artefact against the generic schema (ajv)', () => {
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      JSON.parse(readFileSync(MANIFEST_SCHEMA_PATH, 'utf-8')),
    );
    const artefact = JSON.parse(readFileSync(MANIFEST_ARTEFACT_PATH, 'utf-8'));
    expect(validate(artefact)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('validates a manifest generated from the isolated fixture CSV copy (harness chain)', () => {
    // The editor's round-trip starts from a temp CSV copy and regenerates the
    // artefact; that generated manifest must satisfy the same generic schema.
    const fixture = copyEditorFixtureFiles();
    try {
      const validate = new Ajv({ allErrors: true, strict: false }).compile(
        JSON.parse(readFileSync(MANIFEST_SCHEMA_PATH, 'utf-8')),
      );
      const generated = JSON.parse(
        serialiseManifest(
          buildStorylineManifestFromCsv(readFileSync(fixture.csvPath, 'utf-8'), GYM_CONTENT_ADAPTER),
        ),
      );
      expect(validate(generated)).toBe(true);
      expect(validate.errors).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });
});
