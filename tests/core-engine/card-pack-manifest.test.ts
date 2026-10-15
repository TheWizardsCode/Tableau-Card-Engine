/**
 * Unit tests for the card-pack manifest contract and core-engine version
 * compatibility (CG-0MUZIS0K7006C5WU, feature F2).
 *
 * Uses the synthetic fixtures from F1 (CG-0MUZIRZYO008B01N) so the tests
 * exercise the exact `{ version, packs[] }` shape the renderer loader will
 * read from `<contentDir>/packs/manifest.json`. Every error path asserts the
 * structural `{ ok: false, errors }` contract: `parseCardPackManifest` must
 * never throw.
 */

import { describe, it, expect } from 'vitest';

import {
  ENGINE_VERSION,
  DEFAULT_ENGINE_VERSION,
  parseCardPackManifest,
  splitPacksByCompatibility,
  filterPacksByGameId,
} from '../../src/core-engine';
import {
  readCardPackManifestVariant,
  makeCardPackManifest,
  makeCardPackManifestJson,
  defaultPackEntry,
  FIXTURE_GAME_ID,
  FIXTURE_PACK_ID,
  FIXTURE_PACK_TWO_ID,
} from '../fixtures/card-pack/helpers';

/** Narrow a parse result to its success shape, failing the test otherwise. */
function expectOk(result: ReturnType<typeof parseCardPackManifest>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected ok, got: ${result.errors.join('; ')}`);
  return result.manifest;
}

describe('DEFAULT_ENGINE_VERSION', () => {
  it('is re-exported from the core engine (single source of truth)', () => {
    expect(DEFAULT_ENGINE_VERSION).toBe(ENGINE_VERSION);
  });
});

describe('parseCardPackManifest — success paths', () => {
  it('parses the valid fixture manifest', () => {
    const manifest = expectOk(
      parseCardPackManifest(readCardPackManifestVariant('valid')),
    );

    expect(manifest.version).toBe(1);
    expect(manifest.packs.map((pack) => pack.id)).toEqual([
      FIXTURE_PACK_ID,
      FIXTURE_PACK_TWO_ID,
    ]);
    expect(manifest.packs[0]).toMatchObject({
      id: FIXTURE_PACK_ID,
      gameId: FIXTURE_GAME_ID,
      title: 'Fixture Pack',
      description: 'Synthetic free card pack used by card-pack tests.',
      version: '1.0.0',
      coreEngineVersion: '^0.1.0',
      cards: 'cards.csv',
      assets: ['assets/icon.png'],
    });
  });

  it('accepts an already-parsed document object', () => {
    const manifest = expectOk(parseCardPackManifest(makeCardPackManifest()));
    expect(manifest.packs[0]).toEqual(defaultPackEntry());
  });

  it('accepts a stringified manifest from the builder', () => {
    const manifest = expectOk(
      parseCardPackManifest(makeCardPackManifestJson([{}])),
    );
    expect(manifest.packs).toHaveLength(1);
  });

  it('keeps assets and entitlement optional and omits them when absent', () => {
    const manifest = expectOk(
      parseCardPackManifest(
        makeCardPackManifestJson([
          { assets: undefined, entitlement: undefined },
        ]),
      ),
    );
    expect(manifest.packs[0]).not.toHaveProperty('assets');
    expect(manifest.packs[0]).not.toHaveProperty('entitlement');
  });

  it('preserves a valid entitlement object', () => {
    const manifest = expectOk(
      parseCardPackManifest(
        makeCardPackManifestJson([{ entitlement: { steamAppId: 42 } }]),
      ),
    );
    expect(manifest.packs[0]?.entitlement).toEqual({ steamAppId: 42 });
  });
});

describe('parseCardPackManifest — malformed input', () => {
  it('reports a missing manifest without throwing', () => {
    for (const missing of [undefined, null, '', '   ']) {
      const result = parseCardPackManifest(missing);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('reports malformed JSON without throwing', () => {
    const result = parseCardPackManifest(readCardPackManifestVariant('malformed'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/Malformed JSON/);
    }
  });

  it('rejects a non-object, non-string input', () => {
    for (const input of [42, true, ['array']]) {
      const result = parseCardPackManifest(input);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a document whose packs field is not an array', () => {
    const result = parseCardPackManifest({ version: 1, packs: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/packs: expected an array/);
    }
  });

  it('rejects a missing or invalid version', () => {
    for (const version of [undefined, 'one', 0, 1.5]) {
      const result = parseCardPackManifest({ version, packs: [] });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join('\n')).toMatch(
          /version: expected a positive integer/,
        );
      }
    }
  });

  it('rejects non-object pack entries', () => {
    const result = parseCardPackManifest({ version: 1, packs: [null, 42] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join('\n');
      expect(joined).toContain('packs[0]: expected an object');
      expect(joined).toContain('packs[1]: expected an object');
    }
  });
});

describe('parseCardPackManifest — field validation', () => {
  it('names each missing required field', () => {
    const result = parseCardPackManifest(
      makeCardPackManifest([
        {
          id: undefined as unknown as string,
          gameId: undefined as unknown as string,
          title: undefined as unknown as string,
          description: undefined as unknown as string,
          version: undefined as unknown as string,
          coreEngineVersion: undefined as unknown as string,
          cards: undefined as unknown as string,
        },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join('\n');
      for (const field of [
        'id',
        'gameId',
        'title',
        'description',
        'version',
        'coreEngineVersion',
        'cards',
      ]) {
        expect(joined).toContain(`packs[0].${field}`);
      }
    }
  });

  it('rejects empty-string fields', () => {
    const result = parseCardPackManifest(
      makeCardPackManifest([{ title: '   ', cards: '' }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join('\n');
      expect(joined).toContain('packs[0].title');
      expect(joined).toContain('packs[0].cards');
    }
  });

  it('rejects an invalid coreEngineVersion range as a field error, not a throw', () => {
    const result = parseCardPackManifest(
      makeCardPackManifest([{ coreEngineVersion: 'not-a-semver-range' }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(
        /coreEngineVersion: "not-a-semver-range" is not a valid semver range/,
      );
    }
  });

  it('rejects a non-array assets field', () => {
    const result = parseCardPackManifest(
      makeCardPackManifest([
        { assets: 'assets/icon.png' as unknown as string[] },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/packs\[0\]\.assets/);
    }
  });

  it('rejects non-string assets entries', () => {
    const result = parseCardPackManifest(
      makeCardPackManifest([
        { assets: ['ok.png', 42 as unknown as string] },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join('\n');
      expect(joined).toContain('packs[0].assets[1]');
      expect(joined).not.toContain('packs[0].assets[0]');
    }
  });

  it('rejects a non-object entitlement', () => {
    const result = parseCardPackManifest(
      makeCardPackManifest([
        { entitlement: 'steam' as unknown as { steamAppId: number } },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/packs\[0\]\.entitlement/);
    }
  });

  it('rejects an invalid entitlement.steamAppId', () => {
    for (const steamAppId of ['abc', -1, 0, 2.5]) {
      const result = parseCardPackManifest(
        makeCardPackManifest([
          { entitlement: { steamAppId: steamAppId as unknown as number } },
        ]),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join('\n')).toContain(
          'packs[0].entitlement.steamAppId',
        );
      }
    }
  });
});

describe('parseCardPackManifest — duplicates', () => {
  it('reports duplicate pack ids and duplicate (gameId, id) pairs', () => {
    const result = parseCardPackManifest(
      readCardPackManifestVariant('duplicate'),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join('\n');
      expect(joined).toContain('duplicate pack id "fixture-pack"');
      expect(joined).toContain('duplicate pack (gameId, id) ("fixture-game", "fixture-pack")');
    }
  });

  it('reports a pack id reused across two games', () => {
    const result = parseCardPackManifest(
      makeCardPackManifest([
        { id: 'shared', gameId: 'game-a' },
        { id: 'shared', gameId: 'game-b' },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join('\n');
      expect(joined).toContain('duplicate pack id "shared"');
      // Different games are distinct on disk, so only the flat id collides.
      expect(joined).not.toContain('duplicate pack (gameId, id)');
    }
  });
});

describe('splitPacksByCompatibility', () => {
  it('treats a matching range as compatible', () => {
    const manifest = expectOk(
      parseCardPackManifest(readCardPackManifestVariant('valid')),
    );
    const { compatible, incompatible } = splitPacksByCompatibility(
      manifest.packs,
      DEFAULT_ENGINE_VERSION,
    );

    expect(compatible).toHaveLength(2);
    expect(incompatible).toHaveLength(0);
  });

  it('reports an incompatible pack with a reason naming the range and version', () => {
    const manifest = expectOk(
      parseCardPackManifest(readCardPackManifestVariant('incompatible')),
    );
    const { compatible, incompatible } = splitPacksByCompatibility(
      manifest.packs,
      '0.1.0',
    );

    expect(compatible).toHaveLength(0);
    expect(incompatible).toHaveLength(1);
    expect(incompatible[0].pack.id).toBe(FIXTURE_PACK_ID);
    expect(incompatible[0].reason).toContain('^9.0.0');
    expect(incompatible[0].reason).toContain('0.1.0');
  });

  it('partitions a mixed catalogue', () => {
    const entries = makeCardPackManifest([
      { id: 'ok', coreEngineVersion: '^0.1.0' },
      { id: 'future', coreEngineVersion: '^9.0.0' },
    ]).packs;

    const { compatible, incompatible } = splitPacksByCompatibility(
      entries,
      '0.1.0',
    );
    expect(compatible.map((pack) => pack.id)).toEqual(['ok']);
    expect(incompatible.map((entry) => entry.pack.id)).toEqual(['future']);
  });

  it('honours the supplied launcher version and range semantics', () => {
    const entry = defaultPackEntry({ coreEngineVersion: '~0.1.0' });
    expect(splitPacksByCompatibility([entry], '0.1.5').compatible).toHaveLength(1);
    expect(splitPacksByCompatibility([entry], '0.2.0').incompatible).toHaveLength(1);
  });
});

describe('filterPacksByGameId', () => {
  it('selects only the packs belonging to one game, preserving order', () => {
    const packs = makeCardPackManifest([
      { id: 'a', gameId: 'game-a' },
      { id: 'b', gameId: 'game-b' },
      { id: 'c', gameId: 'game-a' },
    ]).packs;

    expect(filterPacksByGameId(packs, 'game-a').map((pack) => pack.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('returns an empty array when no pack matches', () => {
    const packs = makeCardPackManifest([{ id: 'a', gameId: 'game-a' }]).packs;
    expect(filterPacksByGameId(packs, 'game-z')).toEqual([]);
  });

  it('returns an empty array for an empty catalogue', () => {
    expect(filterPacksByGameId([], 'game-a')).toEqual([]);
  });
});
