/**
 * Smoke tests for the card-pack fixtures and the disposable content-directory
 * helper (CG-0MUZIRZYO008B01N, feature F1).
 *
 * The fixtures are the foundation for every later card-pack test, so these
 * tests pin their contract: each committed manifest variant is invalid in
 * exactly the way its name promises, every pack CSV fragment reuses the Main
 * Street schema, and the helper materialises a walkable content directory that
 * it removes on cleanup. They deliberately do **not** import the F2 parser or
 * the F3 merge — the fixtures must stand on their own before those land.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import semver from 'semver';

import {
  CARD_PACK_CSV_COLUMNS,
  CARD_PACK_CSV_HEADER,
  CARD_PACK_MANIFESTS,
  CARD_PACKS_DIR,
  FIXTURE_COMPATIBLE_VERSION,
  FIXTURE_GAME_ID,
  FIXTURE_INCOMPATIBLE_RANGE,
  FIXTURE_PACK_ID,
  FIXTURE_PACK_TWO_ID,
  committedPackDir,
  defaultPackEntry,
  makeCardPackManifest,
  makeCardPackManifestJson,
  materialiseCardPackFixture,
  readCardPackManifestVariant,
  readCommittedPackCsv,
  withCardPackFixture,
  type FixtureCardPackManifest,
} from '../fixtures/card-pack/helpers';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const requiredPackFields = [
  'id',
  'gameId',
  'title',
  'description',
  'version',
  'coreEngineVersion',
  'cards',
] as const;

/** Track any fixture created without an explicit cleanup so no tmp dir leaks. */
const created: Array<{ cleanup(): void }> = [];

afterEach(() => {
  while (created.length > 0) created.pop()?.cleanup();
});

function parseManifestVariant(name: keyof typeof CARD_PACK_MANIFESTS): FixtureCardPackManifest {
  return JSON.parse(readCardPackManifestVariant(name)) as FixtureCardPackManifest;
}

describe('card-pack fixtures — committed variants', () => {
  it('ships a valid manifest with two compatible, schema-complete packs', () => {
    const manifest = parseManifestVariant('valid');

    expect(manifest.version).toBe(1);
    expect(manifest.packs.map((pack) => pack.id)).toEqual([
      FIXTURE_PACK_ID,
      FIXTURE_PACK_TWO_ID,
    ]);

    for (const pack of manifest.packs) {
      for (const field of requiredPackFields) {
        expect(pack[field], `${pack.id}.${field}`).toBeTruthy();
      }
      expect(pack.gameId).toBe(FIXTURE_GAME_ID);
      expect(semver.satisfies(FIXTURE_COMPATIBLE_VERSION, pack.coreEngineVersion)).toBe(
        true,
      );
    }
  });

  it('points every valid pack at a CSV fragment that matches the base schema', () => {
    const manifest = parseManifestVariant('valid');

    for (const pack of manifest.packs) {
      const csvPath = path.join(committedPackDir(pack.id), pack.cards);
      expect(existsSync(csvPath), csvPath).toBe(true);

      const [header, ...rows] = readFileSync(csvPath, 'utf-8').trim().split('\n');
      expect(header).toBe(CARD_PACK_CSV_HEADER);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.split(',').length).toBe(CARD_PACK_CSV_COLUMNS.length);
      }
    }
  });

  it('ships a deterministic 1x1 PNG asset per pack', () => {
    for (const packId of [FIXTURE_PACK_ID, FIXTURE_PACK_TWO_ID]) {
      const assetPath = path.join(committedPackDir(packId), 'assets', 'icon.png');
      const bytes = readFileSync(assetPath);
      expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(bytes.length).toBeLessThan(1024);
    }
  });

  it('rejects the malformed variant as invalid JSON', () => {
    expect(() => parseManifestVariant('malformed')).toThrow();
  });

  it('declares a duplicate pack id in the duplicate variant', () => {
    const manifest = parseManifestVariant('duplicate');
    const ids = manifest.packs.map((pack) => pack.id);
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });

  it('declares a core-incompatible range in the incompatible variant', () => {
    const manifest = parseManifestVariant('incompatible');
    const range = manifest.packs[0]?.coreEngineVersion ?? '';
    expect(range).toBe(FIXTURE_INCOMPATIBLE_RANGE);
    expect(semver.validRange(range)).not.toBeNull();
    expect(semver.satisfies(FIXTURE_COMPATIBLE_VERSION, range)).toBe(false);
  });

  it('offers a duplicate-card fragment that reuses the base card id', () => {
    const duplicateCsv = readCommittedPackCsv(FIXTURE_PACK_ID, 'cards-duplicate.csv');
    const dataRow = duplicateCsv.trim().split('\n')[1] ?? '';
    const idIndex = CARD_PACK_CSV_COLUMNS.indexOf('id');
    expect(dataRow.split(',')[idIndex]).toBe('biz-bakery');
  });

  it('builds manifest documents in memory without hand-rolled JSON', () => {
    const entry = defaultPackEntry({ id: 'custom-pack', entitlement: { steamAppId: 42 } });
    expect(entry.entitlement).toEqual({ steamAppId: 42 });

    const json = makeCardPackManifestJson([{ id: 'custom-pack' }]);
    const parsed = JSON.parse(json) as FixtureCardPackManifest;
    expect(parsed.packs[0]?.id).toBe('custom-pack');
    expect(makeCardPackManifest([{ id: 'a' }, { id: 'b' }]).packs).toHaveLength(2);
  });
});

describe('card-pack fixtures — disposable content directory', () => {
  it('materialises a walkable packs tree and removes it on cleanup', () => {
    const fixture = materialiseCardPackFixture();
    created.push(fixture);

    expect(existsSync(fixture.contentDir)).toBe(true);
    expect(existsSync(fixture.packsDir)).toBe(true);
    expect(existsSync(fixture.manifestPath)).toBe(true);

    const packDir = fixture.packDir();
    expect(existsSync(path.join(packDir, 'cards.csv'))).toBe(true);
    expect(existsSync(path.join(packDir, 'cards-duplicate.csv'))).toBe(true);
    expect(existsSync(path.join(packDir, 'assets', 'icon.png'))).toBe(true);
    expect(
      existsSync(path.join(fixture.packDir(FIXTURE_PACK_TWO_ID), 'cards.csv')),
    ).toBe(true);

    // The installed manifest is the requested variant, not a pack directory.
    const installed = JSON.parse(
      readFileSync(fixture.manifestPath, 'utf-8'),
    ) as FixtureCardPackManifest;
    expect(installed.packs.map((pack) => pack.id)).toContain(FIXTURE_PACK_ID);

    fixture.cleanup();
    expect(existsSync(fixture.contentDir)).toBe(false);
    // Idempotent: a second cleanup must not throw.
    expect(() => fixture.cleanup()).not.toThrow();
  });

  it('installs an explicit manifest override and extra files', () => {
    const fixture = materialiseCardPackFixture({
      manifest: makeCardPackManifestJson([{ id: 'override-pack' }]),
      extraFiles: {
        'fixture-game/fixture-pack/nested/extra.txt': 'hello',
      },
    });
    created.push(fixture);

    const installed = JSON.parse(
      readFileSync(fixture.manifestPath, 'utf-8'),
    ) as FixtureCardPackManifest;
    expect(installed.packs[0]?.id).toBe('override-pack');
    expect(
      readFileSync(
        path.join(fixture.packDir(), 'nested', 'extra.txt'),
        'utf-8',
      ),
    ).toBe('hello');
  });

  it('can install a committed non-valid manifest variant', () => {
    const fixture = materialiseCardPackFixture({ variant: 'malformed' });
    created.push(fixture);
    expect(() =>
      JSON.parse(readFileSync(fixture.manifestPath, 'utf-8')),
    ).toThrow();
  });

  it('cleans up automatically via withCardPackFixture, even on throw', async () => {
    let captured = '';
    await withCardPackFixture(async (fixture) => {
      captured = fixture.contentDir;
      expect(existsSync(captured)).toBe(true);
    });
    expect(existsSync(captured)).toBe(false);

    await expect(
      withCardPackFixture(async (fixture) => {
        captured = fixture.contentDir;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(existsSync(captured)).toBe(false);
  });

  it('keeps the committed fixture tree read-only and intact', () => {
    // Sanity: the source tree is a directory with a pack subdirectory; the
    // helper must copy from it, never move or mutate it.
    expect(statSync(CARD_PACKS_DIR).isDirectory()).toBe(true);
    expect(existsSync(committedPackDir(FIXTURE_PACK_ID))).toBe(true);
  });
});
