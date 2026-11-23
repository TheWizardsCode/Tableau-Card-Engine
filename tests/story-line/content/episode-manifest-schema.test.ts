/**
 * Episode manifest schema, types and reference fixture (CG-0MWSJYAXE001KMRU).
 *
 * The episode manifest is the beat-sheet layer's authored data
 * (`docs/design/storyline-game-gdd.md` §2.2). This suite pins the three things
 * that keep that data checkable:
 *
 * - `schemas/episode-manifest.schema.json` models the full §2.2 shape, closes
 *   every fixed-shape object with `additionalProperties: false`, and rejects
 *   the malformed documents the later rule families assume are impossible;
 * - `src/story-line/content/episode-manifest.ts` exports the §2.2.9 typed shape
 *   plus the `resources.start` / `resources.bounds` members (GDD §2.8.2) and
 *   the schema path constant, so the editor and the validator share one path;
 * - the committed reference fixture
 *   (`example-games/gym/content/long-erasure-episode.json`) is byte-identical
 *   to the GDD Appendix A fence, so the specification, the fixture and the
 *   tooling cannot drift.
 *
 * The drift pin reads the GDD's `<!-- episode-manifest-example -->` block with
 * the same extraction the GDD §5.3 self-check documents. The fixture is the
 * authoritative copy: it is the Appendix A bytes plus the §2.8.2 start/bounds
 * values, and the GDD fence is kept byte-identical to it.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EPISODE_MANIFEST_SCHEMA_PATH,
  MANIFEST_VERSION,
  type EpisodeManifest,
} from '../../../src/story-line/content/episode-manifest';
import { REPO_ROOT } from './test-support';

/** The GDD that carries the Appendix A worked example. */
const GDD_PATH = resolve(REPO_ROOT, 'docs/design/storyline-game-gdd.md');

/** The generic episode-manifest JSON schema, derived from the module constant. */
const SCHEMA_PATH = resolve(REPO_ROOT, DEFAULT_EPISODE_MANIFEST_SCHEMA_PATH);

/** The committed reference manifest (Appendix A plus start/bounds). */
const FIXTURE_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure-episode.json');

/** Extraction pattern documented by the GDD §5.3 self-check. */
const GDD_BLOCK_PATTERN = /<!-- episode-manifest-example -->\s*```json\n([\s\S]*?)\n```/;

/** Reads a UTF-8 file. */
function readText(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** Reads and parses a JSON file. */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readText(path)) as Record<string, unknown>;
}

/** Extracts the GDD Appendix A fence body (without the surrounding newlines). */
function gddManifestBlock(): string {
  const match = GDD_BLOCK_PATTERN.exec(readText(GDD_PATH));
  if (match === null) {
    throw new Error('episode-manifest-example block not found or not fenced as json');
  }
  return match[1];
}

/**
 * A structural (not semantic) copy of the fixture, mutable for negative cases.
 *
 * The schema is the subject here, so the malformed documents are built by
 * deleting or replacing one field rather than by hand-writing a whole
 * manifest. The structural type keeps `delete` legal without weakening the
 * committed fixture's own typing.
 */
interface MutableManifest {
  [key: string]: unknown;
  acts: Array<{
    [key: string]: unknown;
    scenes: Array<Record<string, unknown>>;
  }>;
}

/** A fresh mutable copy of the fixture. */
function mutableFixture(): MutableManifest {
  return JSON.parse(readText(FIXTURE_PATH)) as MutableManifest;
}

/** Applies one mutation to a fresh fixture copy and returns that same copy. */
function mutated(mutate: (manifest: MutableManifest) => void): MutableManifest {
  const manifest = mutableFixture();
  mutate(manifest);
  return manifest;
}

const schema = readJson(SCHEMA_PATH);
const fixture = readJson(FIXTURE_PATH) as unknown as EpisodeManifest;
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

/** Every object schema node in a JSON Schema document. */
function objectSchemaNodes(node: unknown): Array<Record<string, unknown>> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [];
  const record = node as Record<string, unknown>;
  const nodes: Array<Record<string, unknown>> = [record];
  for (const key of ['definitions', 'properties', 'patternProperties']) {
    const value = record[key];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const child of Object.values(value as Record<string, unknown>)) {
      nodes.push(...objectSchemaNodes(child));
    }
  }
  for (const key of ['items', 'additionalProperties']) {
    if (typeof record[key] === 'object') nodes.push(...objectSchemaNodes(record[key]));
  }
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    const value = record[key];
    if (Array.isArray(value)) for (const child of value) nodes.push(...objectSchemaNodes(child));
  }
  return nodes;
}

/** Asserts the validator rejects `document` and names the expected problem. */
function expectRejected(document: unknown, problem: string): void {
  expect(validate(document)).toBe(false);
  expect(JSON.stringify(validate.errors)).toContain(problem);
}

describe('episode manifest module surface', () => {
  it('exports the literal manifest version and the canonical schema path', () => {
    expect(MANIFEST_VERSION).toBe(1);
    expect(DEFAULT_EPISODE_MANIFEST_SCHEMA_PATH).toBe('schemas/episode-manifest.schema.json');
  });

  it('derives a schema path that still resolves (a schema move fails this test loudly)', () => {
    expect(SCHEMA_PATH.endsWith('/schemas/episode-manifest.schema.json')).toBe(true);
    expect(readJson(SCHEMA_PATH).$id).toBe(
      'https://tableau-card-engine.example/schemas/episode-manifest.schema.json',
    );
  });
});

describe('episode manifest JSON schema', () => {
  it('is draft-07 with its $id under schemas/', () => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(String(schema.$id)).toContain('/schemas/');
  });

  it('validates the committed reference manifest', () => {
    expect(validate(fixture)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('models exactly the three documented SceneCondition forms', () => {
    const definitions = schema.definitions as Record<string, Record<string, unknown>>;
    const forms = definitions.condition.oneOf as Array<Record<string, unknown>>;
    expect(forms).toHaveLength(3);
    expect(forms[0].required).toEqual(['objective']);
    expect(forms[1].required).toEqual(['budget']);
    expect(forms[2].$ref).toBe('#/definitions/resourceCheck');
    expect(definitions.resourceCheck.required).toEqual(['field', 'op', 'value']);
    expect(definitions.resourceCheck.properties).toMatchObject({
      op: { enum: ['>=', '<=', '>', '<', '=='] },
    });
  });

  it('accepts each SceneCondition form and rejects a second condition vocabulary', () => {
    const withCondition = (when: unknown) =>
      mutated(manifest => {
        const outcomeRules = manifest.acts[0].scenes[0].outcomeRules as Array<
          Record<string, unknown>
        >;
        outcomeRules[0].when = when;
      });

    expect(validate(withCondition({ objective: 'met' }))).toBe(true);
    expect(validate(withCondition({ budget: 'exhausted' }))).toBe(true);
    expect(validate(withCondition({ field: 'hull', op: '>=', value: 3 }))).toBe(true);

    expectRejected(
      withCondition({ field: 'hull', op: '!=', value: 3 }),
      'must be equal to one of the allowed values',
    );
    expect(validate(withCondition({ condition: 'objective-met' }))).toBe(false);
  });

  it('closes every fixed-shape object with additionalProperties: false', () => {
    const open = objectSchemaNodes(schema).filter(node => {
      const hasFixedShape = node.properties !== undefined || node.patternProperties !== undefined;
      return hasFixedShape && node.additionalProperties !== false;
    });
    expect(open).toEqual([]);
  });

  it('rejects a beat whose value is not an integer within its documented range', () => {
    expectRejected(
      mutated(manifest => {
        const beat = manifest.acts[0].scenes[0].beats as Array<Record<string, unknown>>;
        beat[0].clockCost = -1;
      }),
      'must be >= 0',
    );

    expectRejected(
      mutated(manifest => {
        const beat = manifest.acts[0].scenes[0].beats as Array<Record<string, unknown>>;
        beat[0].clockCost = 1.5;
      }),
      'must be integer',
    );
  });

  it('rejects a scene missing its objective', () => {
    expectRejected(
      mutated(manifest => {
        delete manifest.acts[0].scenes[0].objective;
      }),
      'objective',
    );
  });

  it('rejects an unknown top-level key', () => {
    expectRejected(
      mutated(manifest => {
        manifest.schemaVersion = 1;
      }),
      'additionalProperties',
    );
  });

  it('rejects a non-literal manifestVersion and a manifestVersion above 1', () => {
    expectRejected(
      mutated(manifest => {
        manifest.manifestVersion = 2;
      }),
      'must be equal to constant',
    );

    expectRejected(
      mutated(manifest => {
        manifest.manifestVersion = '1';
      }),
      'must be equal to constant',
    );
  });

  it('rejects an id that violates the documented pattern', () => {
    expectRejected(
      mutated(manifest => {
        manifest.id = 'The_Long_Erasure';
      }),
      'must match pattern',
    );
  });

  it('rejects an objective statement longer than 90 characters', () => {
    expectRejected(
      mutated(manifest => {
        const objective = manifest.acts[0].scenes[0].objective as Record<string, unknown>;
        objective.statement = 'x'.repeat(91);
      }),
      'must NOT have more than 90 characters',
    );
  });
});

describe('episode manifest reference fixture', () => {
  it('carries the §2.8.2 start bag and bounds for exactly the declared keys', () => {
    const { resources } = fixture;
    const declared = [...resources.declared].sort();
    expect(Object.keys(resources.start).sort()).toEqual(declared);
    expect(Object.keys(resources.bounds).sort()).toEqual(declared);
    for (const key of declared) {
      const value = resources.start[key];
      const bounds = resources.bounds[key];
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(bounds.min);
      expect(value).toBeLessThanOrEqual(bounds.max);
    }
  });

  it('is byte-identical to the GDD Appendix A fence (the drift pin)', () => {
    expect(gddManifestBlock() + '\n').toBe(readText(FIXTURE_PATH));
  });

  it('is deep-equal to the GDD Appendix A block after parsing', () => {
    expect(JSON.parse(gddManifestBlock())).toEqual(fixture);
  });

  it('names the content file it resolves its beats in', () => {
    expect(fixture.content.file).toBe('example-games/gym/content/long-erasure.csv');
    expect(fixture.content.adapter).toBe('long-erasure');
  });
});
