/**
 * Unit tests for the Steam follow-to-unlock core (electron/steam-follow.ts).
 *
 * These are the F2 contract tests (CG-0MSMAJQQT004SDCC): they pin the
 * `FollowSource` interface and the game-agnostic unlock flow against a
 * deterministic fake, with no Steam client present. They must pass under
 * `--project unit` (pure Node, no browser).
 *
 * Covered:
 *  - FollowSource contract (init/open/follow/close)
 *  - follow detected → unlock flow triggered
 *  - already unlocked → no re-verification on subsequent launches
 *  - Steam absent → graceful degraded path (no crash, no unlock)
 *  - catalog resolution is game-agnostic (one of three designated; others locked)
 *  - unlock persistence round-trip across simulated launches (file store)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  FakeFollowSource,
  FileUnlockStore,
  MemoryUnlockStore,
  SteamFollowService,
  resolveBonusGame,
  type BonusCatalog,
} from '../../electron/steam-follow';
import type { SteamConfig } from '../../electron/steam-config';

const CONFIG: SteamConfig = {
  appId: '123456',
  developerSteamId: '76561198000000000',
  storeUrl: 'steam://store/123456',
};

/** A three-game catalog with exactly one designated bonus (game-agnostic). */
function makeCatalog(bonusGameId: string): BonusCatalog {
  return {
    bonusGameId,
    games: [
      { id: 'main-street', title: 'Main Street', sceneKey: 'MainStreetScene', description: 'City builder' },
      { id: 'golf', title: 'Golf', sceneKey: 'GolfScene', description: 'Solitaire golf' },
      { id: 'feudalism', title: 'Feudalism', sceneKey: 'FeudalismScene', description: 'Manor builder' },
    ],
  };
}

describe('FakeFollowSource (FollowSource contract)', () => {
  it('reports the configured availability and following state', async () => {
    const source = new FakeFollowSource({ availability: 'available', following: true });
    expect(await source.init()).toBe('available');
    expect(source.isSteamAvailable()).toBe(true);
    expect(await source.isFollowing('76561198000000000')).toBe(true);
  });

  it('returns unavailable (and does not follow) when Steam is absent', async () => {
    const source = new FakeFollowSource({ availability: 'unavailable', following: true });
    expect(await source.init()).toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
    // Even with `following: true`, an unavailable session must not report a follow.
    expect(await source.isFollowing('76561198000000000')).toBe(false);
  });

  it('records opened store URLs and honours the configured open result', async () => {
    const source = new FakeFollowSource({ openResult: false });
    expect(await source.openStorePage('steam://store/123456')).toBe(false);
    expect(source.openedUrls).toEqual(['steam://store/123456']);
  });

  it('releases the session on close()', () => {
    const source = new FakeFollowSource();
    source.close();
    expect(source.closed).toBe(true);
  });
});

describe('SteamFollowService.refresh()', () => {
  it('unlocks the designated bonus when the follow is confirmed', async () => {
    const source = new FakeFollowSource({ following: true });
    const store = new MemoryUnlockStore();
    const service = new SteamFollowService(source, store, makeCatalog('feudalism'), CONFIG);

    const result = await service.refresh();

    expect(result).toEqual({ unlocked: true, chosenGameId: 'feudalism', reason: 'follow-confirmed' });
    expect(await store.load()).toMatchObject({ unlocked: true, chosenGameId: 'feudalism' });
    expect(result.chosenGameId).toBe('feudalism');
  });

  it('does not unlock when the player is not following', async () => {
    const source = new FakeFollowSource({ following: false });
    const store = new MemoryUnlockStore();
    const service = new SteamFollowService(source, store, makeCatalog('feudalism'), CONFIG);

    const result = await service.refresh();

    expect(result).toEqual({ unlocked: false, chosenGameId: null, reason: 'not-following' });
    expect(await store.load()).toBeNull();
  });

  it('is game-agnostic: the unlocked game follows the catalog designation', async () => {
    const source = new FakeFollowSource({ following: true });
    const store = new MemoryUnlockStore();
    const service = new SteamFollowService(source, store, makeCatalog('golf'), CONFIG);

    const result = await service.refresh();

    expect(result.chosenGameId).toBe('golf');
    expect((await store.load())?.chosenGameId).toBe('golf');
  });

  it('never re-verifies an already-unlocked player (no re-verification prompt)', async () => {
    const source = new FakeFollowSource({ following: true });
    const store = new MemoryUnlockStore({
      unlocked: true,
      chosenGameId: 'feudalism',
      unlockedAt: '2026-01-01T00:00:00.000Z',
    });
    const service = new SteamFollowService(source, store, makeCatalog('feudalism'), CONFIG);

    const result = await service.refresh();

    expect(result).toEqual({ unlocked: true, chosenGameId: 'feudalism', reason: 'already-unlocked' });
    expect(source.followingChecks).toBe(0);
  });

  it('degrades gracefully when Steam is absent (no crash, no unlock)', async () => {
    const source = new FakeFollowSource({ availability: 'unavailable', following: true });
    const store = new MemoryUnlockStore();
    const service = new SteamFollowService(source, store, makeCatalog('feudalism'), CONFIG);

    const result = await service.refresh();

    expect(result).toEqual({ unlocked: false, chosenGameId: null, reason: 'steam-unavailable' });
    expect(await store.load()).toBeNull();
  });

  it('treats a missing config or catalog as config-missing', async () => {
    const source = new FakeFollowSource({ following: true });
    const store = new MemoryUnlockStore();

    const noConfig = await new SteamFollowService(source, store, makeCatalog('feudalism'), null).refresh();
    expect(noConfig.reason).toBe('config-missing');

    const noCatalog = await new SteamFollowService(source, store, null, CONFIG).refresh();
    expect(noCatalog.reason).toBe('config-missing');

    const badCatalog = await new SteamFollowService(source, store, makeCatalog('missing-game'), CONFIG).refresh();
    expect(badCatalog.reason).toBe('config-missing');
  });
});

describe('SteamFollowService.getStatus()', () => {
  it('reports config-missing, steam-unavailable, locked, or unlocked', async () => {
    const catalog = makeCatalog('feudalism');

    const noConfig = new SteamFollowService(new FakeFollowSource(), new MemoryUnlockStore(), catalog, null);
    expect((await noConfig.getStatus()).state).toBe('config-missing');

    const noSteam = new SteamFollowService(
      new FakeFollowSource({ availability: 'unavailable' }),
      new MemoryUnlockStore(),
      catalog,
      CONFIG,
    );
    expect((await noSteam.getStatus()).state).toBe('steam-unavailable');

    const locked = new SteamFollowService(new FakeFollowSource(), new MemoryUnlockStore(), catalog, CONFIG);
    expect((await locked.getStatus()).state).toBe('locked');

    const unlocked = new SteamFollowService(
      new FakeFollowSource(),
      new MemoryUnlockStore({ unlocked: true, chosenGameId: 'feudalism', unlockedAt: 'x' }),
      catalog,
      CONFIG,
    );
    expect((await unlocked.getStatus()).state).toBe('unlocked');
  });
});

describe('SteamFollowService.openFollowPage()', () => {
  it('opens the configured store URL when Steam is available', async () => {
    const source = new FakeFollowSource();
    const service = new SteamFollowService(source, new MemoryUnlockStore(), makeCatalog('feudalism'), CONFIG);

    expect(await service.openFollowPage()).toBe(true);
    expect(source.openedUrls).toEqual([CONFIG.storeUrl]);
  });

  it('returns false (browser fallback) when Steam is absent', async () => {
    const source = new FakeFollowSource({ availability: 'unavailable' });
    const service = new SteamFollowService(source, new MemoryUnlockStore(), makeCatalog('feudalism'), CONFIG);

    expect(await service.openFollowPage()).toBe(false);
    expect(source.openedUrls).toEqual([]);
  });
});

describe('resolveBonusGame()', () => {
  it('resolves only the designated game and leaves the others locked', () => {
    const catalog = makeCatalog('feudalism');
    expect(resolveBonusGame(catalog)?.id).toBe('feudalism');
    expect(catalog.games.filter((g) => g.id === 'feudalism')).toHaveLength(1);
    // The other catalog entries are present but not the designated bonus.
    expect(resolveBonusGame(catalog)?.id).not.toBe('main-street');
    expect(resolveBonusGame(catalog)?.id).not.toBe('golf');
  });

  it('returns null when the designated id is not in the catalog', () => {
    expect(resolveBonusGame(makeCatalog('nope'))).toBeNull();
  });
});

describe('FileUnlockStore persistence round-trip', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-steam-unlock-'));
    filePath = path.join(dir, 'nested', 'steam-unlock.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists the unlock and restores it across a simulated launch', async () => {
    // Launch 1: follow confirmed → unlock persisted to disk.
    const service1 = new SteamFollowService(
      new FakeFollowSource({ following: true }),
      new FileUnlockStore(filePath),
      makeCatalog('feudalism'),
      CONFIG,
    );
    expect((await service1.refresh()).reason).toBe('follow-confirmed');

    // Launch 2: a fresh service + store reads the persisted state and does
    // not re-verify the follow.
    const source2 = new FakeFollowSource({ following: false });
    const service2 = new SteamFollowService(source2, new FileUnlockStore(filePath), makeCatalog('feudalism'), CONFIG);
    const result = await service2.refresh();

    expect(result).toEqual({ unlocked: true, chosenGameId: 'feudalism', reason: 'already-unlocked' });
    expect(source2.followingChecks).toBe(0);
  });

  it('treats a missing or corrupt file as not-unlocked (never throws)', async () => {
    const missing = new FileUnlockStore(path.join(dir, 'does-not-exist.json'));
    expect(await missing.load()).toBeNull();

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'not json {{{');
    const corrupt = new FileUnlockStore(filePath);
    expect(await corrupt.load()).toBeNull();
  });
});
