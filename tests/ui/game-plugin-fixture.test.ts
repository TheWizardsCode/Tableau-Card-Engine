/**
 * Contract tests for the runtime game plugin loader fixtures
 * (CG-0MUG2ZIA7004WCNL).
 *
 * The fixture is the foundation for every later loader test, so these tests
 * pin its contract: the entry module is importable in Node and exports a
 * Phaser-compatible scene class plus `GAME_INFO`; each committed manifest
 * variant is invalid in exactly the way its name promises; and the shared
 * `makeManifest` builder produces documents the parser can consume.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';

import {
  PLUGIN_GAME_ENTRY_PATH,
  PLUGIN_GAME_THUMBNAIL_PATH,
  PLUGIN_GAME_MANIFESTS,
  FIXTURE_COMPATIBLE_VERSION,
  FIXTURE_INCOMPATIBLE_RANGE,
  defaultManifestEntry,
  makeManifest,
  makeManifestJson,
  readManifestVariant,
  type FixtureManifest,
} from '../fixtures/plugin-game/helpers';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Import the fixture's ESM entry module without TypeScript resolution. */
async function importFixtureEntry(): Promise<Record<string, unknown>> {
  return (await import(
    /* @vite-ignore */ pathToFileURL(PLUGIN_GAME_ENTRY_PATH).href
  )) as Record<string, unknown>;
}

describe('runtime game plugin fixture — artifact', () => {
  it('exports a Phaser-compatible scene class and GAME_INFO', async () => {
    const mod = await importFixtureEntry();

    expect(typeof mod.FixtureGameScene).toBe('function');
    expect(mod.default).toBe(mod.FixtureGameScene);

    const info = mod.GAME_INFO as Record<string, unknown>;
    expect(info).toBeDefined();
    expect(info.id).toBe('fixture-game');
    expect(info.sceneKey).toBe('FixtureGameScene');
    expect(typeof info.title).toBe('string');
    expect(typeof info.description).toBe('string');

    const SceneClass = mod.FixtureGameScene as new () => { sceneKey: string; create: () => void };
    const instance = new SceneClass();
    expect(instance.sceneKey).toBe(info.sceneKey);
    expect(typeof instance.create).toBe('function');
  });

  it('ships a deterministic 1x1 PNG thumbnail under 1 KB', () => {
    const bytes = readFileSync(PLUGIN_GAME_THUMBNAIL_PATH);
    expect(bytes.length).toBeLessThan(1024);
    expect(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true);
    // IHDR width/height (big-endian) immediately follow the 8-byte signature.
    expect(bytes.readUInt32BE(16)).toBe(1);
    expect(bytes.readUInt32BE(20)).toBe(1);
  });
});

describe('runtime game plugin fixture — manifest variants', () => {
  it('commits the valid manifest with the documented entry shape', () => {
    const manifest = JSON.parse(readManifestVariant('valid')) as FixtureManifest;
    expect(manifest.version).toBe(1);
    expect(manifest.games).toHaveLength(1);

    const entry = manifest.games[0];
    expect(entry).toMatchObject({
      id: 'fixture-game',
      sceneKey: 'FixtureGameScene',
      thumbnail: 'assets/thumbnail.png',
      entry: 'entry.js',
    });
    expect(entry.coreEngineVersion).toBe(`^${FIXTURE_COMPATIBLE_VERSION}`);
  });

  it('exposes a malformed variant that is not valid JSON', () => {
    const raw = readManifestVariant('malformed');
    expect(() => JSON.parse(raw)).toThrow(SyntaxError);
  });

  it('exposes an incompatible variant whose range does not include the engine version', () => {
    const manifest = JSON.parse(readManifestVariant('incompatible')) as FixtureManifest;
    expect(manifest.games[0].coreEngineVersion).toBe(FIXTURE_INCOMPATIBLE_RANGE);
    expect(manifest.games[0].coreEngineVersion).not.toContain(FIXTURE_COMPATIBLE_VERSION);
  });

  it('exposes a duplicate variant where id and sceneKey both repeat', () => {
    const manifest = JSON.parse(readManifestVariant('duplicate')) as FixtureManifest;
    expect(manifest.games).toHaveLength(2);
    const [first, second] = manifest.games;
    expect(first.id).toBe(second.id);
    expect(first.sceneKey).toBe(second.sceneKey);
  });

  it('exposes a missing-file variant pointing at a non-existent entry module', async () => {
    const manifest = JSON.parse(readManifestVariant('missingFile')) as FixtureManifest;
    const entry = manifest.games[0];
    expect(entry.entry).toBe('missing-entry.js');
    await expect(importFixtureEntryFollowing(entry.entry)).rejects.toThrow();
  });

  it('exposes an invalid-range variant whose coreEngineVersion is not semver', () => {
    const manifest = JSON.parse(readManifestVariant('invalidRange')) as FixtureManifest;
    expect(manifest.games[0].coreEngineVersion).toBe('not-a-semver-range');
  });

  it('exposes a missing-fields variant that omits required entry fields', () => {
    const manifest = JSON.parse(readManifestVariant('missingFields')) as FixtureManifest;
    const entry = manifest.games[0] as Partial<FixtureManifest['games'][number]>;
    expect(entry.coreEngineVersion).toBeUndefined();
    expect(entry.entry).toBeUndefined();
  });

  it('reads every committed variant from its declared path', () => {
    const variants = Object.keys(PLUGIN_GAME_MANIFESTS);
    expect(variants).toHaveLength(7);
    for (const variant of variants) {
      expect(readManifestVariant(variant as keyof typeof PLUGIN_GAME_MANIFESTS).length)
        .toBeGreaterThan(0);
    }
  });
});

describe('runtime game plugin fixture — makeManifest builder', () => {
  it('produces a valid document with defaults', () => {
    const manifest = makeManifest();
    expect(manifest.version).toBe(1);
    expect(manifest.games).toEqual([defaultManifestEntry()]);
    // Round-trips through JSON without loss.
    expect(JSON.parse(makeManifestJson())).toEqual(manifest);
  });

  it('merges per-entry and document overrides', () => {
    const manifest = makeManifest(
      [{ id: 'alpha' }, { id: 'beta', coreEngineVersion: '^9.0.0' }],
      { version: 2 },
    );
    expect(manifest.version).toBe(2);
    expect(manifest.games.map((g) => g.id)).toEqual(['alpha', 'beta']);
    expect(manifest.games[1].coreEngineVersion).toBe('^9.0.0');
    // Unspecified fields keep their defaults.
    expect(manifest.games[0].sceneKey).toBe('FixtureGameScene');
    expect(manifest.games[1].entry).toBe('entry.js');
  });
});

/**
 * Attempt to import a sibling entry module by relative name, used to prove the
 * `missing-file` variant truly references an absent artifact.
 */
async function importFixtureEntryFollowing(relativeEntry: string): Promise<unknown> {
  const { dirname, join } = await import('node:path');
  const { pathToFileURL: toUrl } = await import('node:url');
  const target = toUrl(join(dirname(PLUGIN_GAME_ENTRY_PATH), relativeEntry)).href;
  return import(/* @vite-ignore */ target);
}
