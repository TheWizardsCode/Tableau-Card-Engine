/**
 * Unit tests for the card-pack renderer loader
 * (`src/ui/CardPackLoader.ts`, feature F6 / CG-0MUZIS2VF006NY3T).
 *
 * The loader reads `<contentDir>/packs/manifest.json`, filters packs by
 * `gameId`, core compatibility and entitlement, reads each entitled pack's CSV
 * through the scoped `tce-packs://` scheme, and returns a structural result.
 * The invariants under test:
 *
 *  - a valid manifest discovers the game's committed fixture packs (CSV text +
 *    `tce-packs://` asset URLs);
 *  - packs for another game and core-incompatible packs are filtered out;
 *  - an unentitled pack is reported as locked and never fetched;
 *  - a missing/malformed manifest, a failed CSV fetch and a hostile asset path
 *    degrade structurally — the loader never throws;
 *  - every environment dependency is injectable (no Electron, no network).
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  loadCardPacks,
  PACKS_DIRNAME,
  MANIFEST_ERROR_ID,
} from '../../src/ui/CardPackLoader';
import { CARD_PACK_URL_SCHEME } from '../../src/ui/card-pack-url';
import {
  FIXTURE_GAME_ID,
  FIXTURE_PACK_ID,
  FIXTURE_PACK_TWO_ID,
  makeCardPackManifestJson,
  readCommittedPackCsv,
  withCardPackFixture,
} from '../fixtures/card-pack/helpers';

/** Manifest transport that reads the fixture's materialised manifest. */
function diskManifestFetcher(manifestPath: string) {
  return async (): Promise<string> => fs.readFileSync(manifestPath, 'utf-8');
}

/**
 * CSV transport that reads the file named by a `tce-packs://` URL from a
 * materialised `packs/` tree, recording the URLs it was asked for.
 */
function diskCsvFetcher(packsDir: string, calls: string[] = []) {
  const fetcher = async (url: string): Promise<string> => {
    calls.push(url);
    const parsed = new URL(url);
    const segments = decodeURIComponent(parsed.pathname).split('/').filter(Boolean);
    const packId = segments[0];
    const relative = segments.slice(1).join('/');
    return fs.readFileSync(path.join(packsDir, parsed.hostname, packId, relative), 'utf-8');
  };
  return { fetcher, calls };
}

/**
 * Asset-byte transport that reads the file named by a `tce-packs://` URL from
 * a materialised `packs/` tree, recording the URLs it was asked for.
 */
function diskAssetFetcher(packsDir: string, calls: string[] = []) {
  const fetcher = async (url: string): Promise<Uint8Array> => {
    calls.push(url);
    const parsed = new URL(url);
    const segments = decodeURIComponent(parsed.pathname).split('/').filter(Boolean);
    const packId = segments[0];
    const relative = segments.slice(1).join('/');
    return new Uint8Array(
      fs.readFileSync(path.join(packsDir, parsed.hostname, packId, relative)),
    );
  };
  return { fetcher, calls };
}

describe('loadCardPacks — successful discovery', () => {
  it('discovers the game`s entitled packs with CSV text and tce-packs:// assets', async () => {
    await withCardPackFixture(async (fixture) => {
      const { fetcher, calls } = diskCsvFetcher(fixture.packsDir);
      const { fetcher: fetchAsset, calls: assetCalls } = diskAssetFetcher(
        fixture.packsDir,
      );

      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv: fetcher,
        fetchAsset,
      });

      expect(result.errors).toEqual([]);
      expect(result.incompatible).toEqual([]);
      expect(result.locked).toEqual([]);
      expect(result.packs.map((pack) => pack.manifest.id)).toEqual([
        FIXTURE_PACK_ID,
        FIXTURE_PACK_TWO_ID,
      ]);

      const first = result.packs[0];
      expect(first.enabled).toBe(true);
      expect(first.csv).toBe(readCommittedPackCsv(FIXTURE_PACK_ID));
      expect(first.status.state).toBe('free');
      expect(first.assetUrls).toEqual([
        `${CARD_PACK_URL_SCHEME}://${FIXTURE_GAME_ID}/${FIXTURE_PACK_ID}/assets/icon.png`,
      ]);
      expect(first.assetDataUris).toEqual({
        icon: expect.stringMatching(/^data:image\/png;base64,/),
      });
      expect(assetCalls).toContain(
        `${CARD_PACK_URL_SCHEME}://${FIXTURE_GAME_ID}/${FIXTURE_PACK_ID}/assets/icon.png`,
      );
      expect(calls).toContain(
        `${CARD_PACK_URL_SCHEME}://${FIXTURE_GAME_ID}/${FIXTURE_PACK_ID}/cards.csv`,
      );
    });
  });

  it('requests the manifest from <contentDir>/packs/manifest.json', async () => {
    await withCardPackFixture(async (fixture) => {
      const fetchManifest = vi.fn(async (_url: string) =>
        fs.readFileSync(fixture.manifestPath, 'utf-8'),
      );

      await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest,
        fetchCsv: async () => readCommittedPackCsv(FIXTURE_PACK_ID),
      });

      const requested = fetchManifest.mock.calls[0][0];
      expect(requested).toMatch(new RegExp(`${PACKS_DIRNAME}/manifest\\.json$`));
    });
  });
});

describe('loadCardPacks — filtering', () => {
  it('ignores packs declared for a different game', async () => {
    await withCardPackFixture(async (fixture) => {
      const manifest = makeCardPackManifestJson([
        { id: 'other-pack', gameId: 'other-game' },
      ]);
      fs.writeFileSync(fixture.manifestPath, manifest, 'utf-8');

      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv: async () => readCommittedPackCsv(FIXTURE_PACK_ID),
      });

      expect(result.packs).toEqual([]);
      expect(result.incompatible).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });

  it('reports core-incompatible packs without fetching them', async () => {
    await withCardPackFixture(async (fixture) => {
      const manifest = makeCardPackManifestJson([
        { id: FIXTURE_PACK_ID, coreEngineVersion: '^9.0.0' },
      ]);
      fs.writeFileSync(fixture.manifestPath, manifest, 'utf-8');
      const fetchCsv = vi.fn(async () => readCommittedPackCsv(FIXTURE_PACK_ID));

      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv,
      });

      expect(result.packs).toEqual([]);
      expect(result.incompatible).toHaveLength(1);
      expect(result.incompatible[0].pack.id).toBe(FIXTURE_PACK_ID);
      expect(result.incompatible[0].reason).toContain('^9.0.0');
      expect(fetchCsv).not.toHaveBeenCalled();
    });
  });

  it('reports a locked pack with its reason and never fetches it', async () => {
    await withCardPackFixture(async (fixture) => {
      const manifest = makeCardPackManifestJson([
        { id: FIXTURE_PACK_ID, entitlement: { steamAppId: 4242 } },
      ]);
      fs.writeFileSync(fixture.manifestPath, manifest, 'utf-8');
      const fetchCsv = vi.fn(async () => readCommittedPackCsv(FIXTURE_PACK_ID));
      const resolveEntitlement = vi.fn(async () => [
        {
          packId: FIXTURE_PACK_ID,
          gameId: FIXTURE_GAME_ID,
          state: 'locked' as const,
          steamAppId: 4242,
          reason: 'Requires Steam DLC 4242.',
        },
      ]);

      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv,
        resolveEntitlement,
      });

      expect(result.packs).toEqual([]);
      expect(result.locked).toHaveLength(1);
      expect(result.locked[0].reason).toBe('Requires Steam DLC 4242.');
      expect(fetchCsv).not.toHaveBeenCalled();

      // The resolver receives status refs carrying the manifest entitlement.
      expect(resolveEntitlement).toHaveBeenCalledWith([
        { id: FIXTURE_PACK_ID, gameId: FIXTURE_GAME_ID, steamAppId: 4242 },
      ]);
    });
  });

  it('treats every compatible pack as free when no entitlement resolver is supplied', async () => {
    await withCardPackFixture(async (fixture) => {
      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv: async () => readCommittedPackCsv(FIXTURE_PACK_ID),
      });

      expect(result.packs.every((pack) => pack.status.state === 'free')).toBe(true);
      expect(result.locked).toEqual([]);
    });
  });
});

describe('loadCardPacks — degradation', () => {
  it('reports a manifest read failure instead of throwing', async () => {
    const result = await loadCardPacks({
      contentDir: '/nonexistent-content',
      gameId: FIXTURE_GAME_ID,
      fetchManifest: async () => {
        throw new Error('disk on fire');
      },
      fetchCsv: async () => '',
    });

    expect(result.packs).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe(MANIFEST_ERROR_ID);
    expect(result.errors[0].reason).toContain('disk on fire');
  });

  it('reports an invalid manifest structurally', async () => {
    await withCardPackFixture(async (fixture) => {
      fs.writeFileSync(fixture.manifestPath, '{ "version": 1, "packs": [', 'utf-8');

      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv: async () => '',
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe(MANIFEST_ERROR_ID);
      expect(result.packs).toEqual([]);
    });
  });

  it('reports a CSV fetch failure per pack and keeps loading the rest', async () => {
    await withCardPackFixture(async (fixture) => {
      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv: async (url: string) => {
          if (url.includes(`/${FIXTURE_PACK_ID}/`)) throw new Error('protocol denied');
          return readCommittedPackCsv(FIXTURE_PACK_TWO_ID);
        },
        fetchAsset: async () => new Uint8Array([137, 80, 78, 71]),
      });

      expect(result.packs.map((pack) => pack.manifest.id)).toEqual([FIXTURE_PACK_TWO_ID]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe(FIXTURE_PACK_ID);
      expect(result.errors[0].reason).toContain('protocol denied');
    });
  });

  it('records a hostile asset path but still loads the pack`s cards', async () => {
    await withCardPackFixture(async (fixture) => {
      const manifest = makeCardPackManifestJson([
        { id: FIXTURE_PACK_ID, assets: ['../../escape.png'] },
      ]);
      fs.writeFileSync(fixture.manifestPath, manifest, 'utf-8');

      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv: async () => readCommittedPackCsv(FIXTURE_PACK_ID),
      });

      expect(result.packs).toHaveLength(1);
      expect(result.packs[0].assetUrls).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe(FIXTURE_PACK_ID);
      expect(result.errors[0].reason).toContain('Invalid asset');
    });
  });

  it('locks every pack when the entitlement resolver throws', async () => {
    await withCardPackFixture(async (fixture) => {
      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv: async () => readCommittedPackCsv(FIXTURE_PACK_ID),
        resolveEntitlement: async () => {
          throw new Error('bridge exploded');
        },
      });

      expect(result.packs).toEqual([]);
      expect(result.locked).toHaveLength(2);
      expect(result.locked.every((pack) => pack.reason.length > 0)).toBe(true);
    });
  });

  it('falls back to the importer transport when no fetchCsv is supplied', async () => {
    await withCardPackFixture(async (fixture) => {
      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        importer: async () => ({
          default: readCommittedPackCsv(FIXTURE_PACK_ID),
        }),
      });

      expect(result.packs).toHaveLength(2);
      expect(result.packs[0].csv).toBe(readCommittedPackCsv(FIXTURE_PACK_ID));
    });
  });
});

describe('loadCardPacks — asset inlining', () => {
  it('inlines each declared asset as a data URI keyed by card id (filename stem)', async () => {
    await withCardPackFixture(async (fixture) => {
      const manifest = makeCardPackManifestJson([
        { id: FIXTURE_PACK_ID, assets: ['assets/biz-solar.png', 'assets/theme.mp3'] },
      ]);
      fs.writeFileSync(fixture.manifestPath, manifest, 'utf-8');

      const assetBytes: Record<string, Uint8Array> = {
        'biz-solar.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        'theme.mp3': new Uint8Array([73, 68, 51, 4, 0, 0, 0]),
      };
      const calls: string[] = [];

      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv: async () => readCommittedPackCsv(FIXTURE_PACK_ID),
        fetchAsset: async (url: string) => {
          calls.push(url);
          const filename = url.split('/').pop() ?? '';
          const bytes = assetBytes[filename];
          if (!bytes) throw new Error(`no fixture bytes for ${url}`);
          return bytes;
        },
      });

      expect(result.errors).toEqual([]);
      const pack = result.packs[0];
      expect(pack.assetUrls).toHaveLength(2);
      expect(Object.keys(pack.assetDataUris).sort()).toEqual(['biz-solar', 'theme']);

      const png = pack.assetDataUris['biz-solar'];
      expect(png).toMatch(/^data:image\/png;base64,/);
      expect(
        Buffer.from(png.split(',')[1], 'base64').equals(
          Buffer.from(assetBytes['biz-solar.png']),
        ),
      ).toBe(true);

      expect(pack.assetDataUris['theme']).toMatch(/^data:audio\/mpeg;base64,/);
      expect(calls).toHaveLength(2);
    });
  });

  it('reports a missing/unreadable asset structurally and omits it without dropping the pack', async () => {
    await withCardPackFixture(async (fixture) => {
      const manifest = makeCardPackManifestJson([
        { id: FIXTURE_PACK_ID, assets: ['assets/present.png', 'assets/missing.png'] },
      ]);
      fs.writeFileSync(fixture.manifestPath, manifest, 'utf-8');

      const result = await loadCardPacks({
        contentDir: fixture.contentDir,
        gameId: FIXTURE_GAME_ID,
        fetchManifest: diskManifestFetcher(fixture.manifestPath),
        fetchCsv: async () => readCommittedPackCsv(FIXTURE_PACK_ID),
        fetchAsset: async (url: string) => {
          if (url.endsWith('missing.png')) throw new Error('not found');
          return new Uint8Array([1, 2, 3]);
        },
      });

      expect(result.packs).toHaveLength(1);
      expect(result.packs[0].assetUrls).toHaveLength(2);
      expect(result.packs[0].assetDataUris).toEqual({
        present: expect.stringMatching(/^data:image\/png;base64,/),
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe(FIXTURE_PACK_ID);
      expect(result.errors[0].reason).toContain('assets/missing.png');
      expect(result.errors[0].reason).toContain('not found');
    });
  });
});
