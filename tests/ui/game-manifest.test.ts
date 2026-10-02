/**
 * Unit tests for the runtime game manifest parser and core-version
 * compatibility split (CG-0MUG2ZIYN0026WHV, feature F2).
 *
 * Uses the synthetic fixtures from F1 (CG-0MUG2ZIA7004WCNL) so the tests
 * exercise the exact manifest shape the runtime loader will read.
 */

import { describe, it, expect } from 'vitest';

import { ENGINE_VERSION } from '../../src/core-engine';
import {
  parseGameManifest,
  splitByCompatibility,
  DEFAULT_ENGINE_VERSION,
} from '../../src/ui/game-manifest';
import {
  readManifestVariant,
  makeManifest,
  makeManifestJson,
  defaultManifestEntry,
} from '../fixtures/plugin-game/helpers';

describe('DEFAULT_ENGINE_VERSION', () => {
  it('is re-exported from the core engine (single source of truth)', () => {
    expect(DEFAULT_ENGINE_VERSION).toBe(ENGINE_VERSION);
  });
});

describe('parseGameManifest', () => {
  it('parses the valid fixture manifest', () => {
    const result = parseGameManifest(readManifestVariant('valid'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.version).toBe(1);
    expect(result.manifest.games).toHaveLength(1);
    expect(result.manifest.games[0]).toMatchObject({
      id: 'fixture-game',
      sceneKey: 'FixtureGameScene',
      title: 'Fixture Game',
      thumbnail: 'assets/thumbnail.png',
      coreEngineVersion: '^0.1.0',
      entry: 'entry.js',
    });
  });

  it('accepts an already-parsed document object', () => {
    const result = parseGameManifest(makeManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.games[0]).toEqual(defaultManifestEntry());
    }
  });

  it('accepts a stringified manifest from the builder', () => {
    const result = parseGameManifest(makeManifestJson([{}]));
    expect(result.ok).toBe(true);
  });

  it('reports a missing manifest without throwing', () => {
    for (const missing of [undefined, null, '', '   ']) {
      const result = parseGameManifest(missing);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('reports malformed JSON without throwing', () => {
    const result = parseGameManifest(readManifestVariant('malformed'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/Malformed JSON/);
    }
  });

  it('rejects a document whose games field is not an array', () => {
    const result = parseGameManifest({ version: 1, games: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/games: expected an array/);
    }
  });

  it('rejects a missing or invalid version', () => {
    for (const version of [undefined, 'one', 0]) {
      const result = parseGameManifest({ version, games: [] });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join('\n')).toMatch(/version: expected a positive integer/);
      }
    }
  });

  it('names each missing required field', () => {
    const result = parseGameManifest(readManifestVariant('missingFields'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join('\n');
      expect(joined).toContain('games[0].coreEngineVersion');
      expect(joined).toContain('games[0].entry');
    }
  });

  it('rejects duplicate ids and scene keys', () => {
    const result = parseGameManifest(readManifestVariant('duplicate'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join('\n');
      expect(joined).toContain('duplicate id "fixture-game"');
      expect(joined).toContain('duplicate sceneKey "FixtureGameScene"');
    }
  });

  it('rejects an invalid semver range as a field error, not a throw', () => {
    const result = parseGameManifest(readManifestVariant('invalidRange'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(
        /coreEngineVersion: "not-a-semver-range" is not a valid semver range/,
      );
    }
  });

  it('treats thumbnail as optional but rejects a non-string thumbnail', () => {
    const withoutThumbnail = parseGameManifest(
      makeManifestJson([{ thumbnail: undefined as unknown as string }]),
    );
    expect(withoutThumbnail.ok).toBe(true);
    if (withoutThumbnail.ok) {
      expect(withoutThumbnail.manifest.games[0].thumbnail).toBeUndefined();
    }

    const badThumbnail = parseGameManifest({
      version: 1,
      games: [defaultManifestEntry({ thumbnail: 42 as unknown as string })],
    });
    expect(badThumbnail.ok).toBe(false);
    if (!badThumbnail.ok) {
      expect(badThumbnail.errors.join('\n')).toContain('games[0].thumbnail');
    }
  });
});

describe('splitByCompatibility', () => {
  it('treats a matching range as compatible', () => {
    const { manifest } = parseGameManifest(readManifestVariant('valid')) as {
      ok: true;
      manifest: { games: ReturnType<typeof defaultManifestEntry>[] };
    };
    const { compatible, incompatible } = splitByCompatibility(
      manifest.games,
      DEFAULT_ENGINE_VERSION,
    );

    expect(compatible).toHaveLength(1);
    expect(incompatible).toHaveLength(0);
  });

  it('reports an incompatible entry with a reason naming the range and version', () => {
    const { manifest } = parseGameManifest(readManifestVariant('incompatible')) as {
      ok: true;
      manifest: { games: ReturnType<typeof defaultManifestEntry>[] };
    };
    const { compatible, incompatible } = splitByCompatibility(manifest.games, '0.1.0');

    expect(compatible).toHaveLength(0);
    expect(incompatible).toHaveLength(1);
    expect(incompatible[0].entry.id).toBe('fixture-game');
    expect(incompatible[0].reason).toContain('^9.0.0');
    expect(incompatible[0].reason).toContain('0.1.0');
  });

  it('partitions a mixed catalogue', () => {
    const entries = makeManifest([
      { id: 'ok', sceneKey: 'OkScene', coreEngineVersion: '^0.1.0' },
      { id: 'future', sceneKey: 'FutureScene', coreEngineVersion: '^9.0.0' },
    ]).games;

    const { compatible, incompatible } = splitByCompatibility(entries, '0.1.0');
    expect(compatible.map((e) => e.id)).toEqual(['ok']);
    expect(incompatible.map((g) => g.entry.id)).toEqual(['future']);
  });

  it('honours the supplied launcher version and the range semantics', () => {
    const entry = defaultManifestEntry({ coreEngineVersion: '~0.1.0' });
    expect(splitByCompatibility([entry], '0.1.5').compatible).toHaveLength(1);
    expect(splitByCompatibility([entry], '0.2.0').incompatible).toHaveLength(1);
  });
});
