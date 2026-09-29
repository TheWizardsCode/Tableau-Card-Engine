/**
 * Unit tests for the Steam-follow IPC handler table
 * (electron/steam-follow-ipc.ts).
 *
 * The handlers are pure (no Electron import); these tests exercise the exact
 * surface the preload bridge invokes, proving the renderer's contract without
 * an Electron runtime.
 */
import { describe, it, expect } from 'vitest';
import {
  STEAM_FOLLOW_CHANNELS,
  createSteamFollowHandlers,
} from '../../electron/steam-follow-ipc';
import {
  FakeFollowSource,
  MemoryUnlockStore,
  SteamFollowService,
  type BonusCatalog,
} from '../../electron/steam-follow';
import type { SteamConfig } from '../../electron/steam-config';

const CONFIG: SteamConfig = {
  appId: '123456',
  developerSteamId: '76561198000000000',
  storeUrl: 'steam://store/123456',
};

const CATALOG: BonusCatalog = {
  bonusGameId: 'feudalism',
  games: [
    { id: 'feudalism', title: 'Feudalism', sceneKey: 'FeudalismScene', description: 'Manor builder' },
  ],
};

function makeHandlers(options: { following?: boolean; available?: boolean; config?: SteamConfig | null } = {}) {
  const source = new FakeFollowSource({
    following: options.following ?? true,
    availability: options.available === false ? 'unavailable' : 'available',
  });
  const store = new MemoryUnlockStore();
  const config = options.config === undefined ? CONFIG : options.config;
  const service = new SteamFollowService(source, store, CATALOG, config);
  return { handlers: createSteamFollowHandlers(service, source, config, CATALOG), source, store };
}

describe('STEAM_FOLLOW_CHANNELS', () => {
  it('namespaces every channel under steamFollow:', () => {
    for (const channel of Object.values(STEAM_FOLLOW_CHANNELS)) {
      expect(channel.startsWith('steamFollow:')).toBe(true);
    }
  });
});

describe('createSteamFollowHandlers()', () => {
  it('isSteamAvailable reflects the source', async () => {
    expect(await makeHandlers().handlers.isSteamAvailable()).toBe(true);
    expect(await makeHandlers({ available: false }).handlers.isSteamAvailable()).toBe(false);
  });

  it('getStatus reports locked then unlocked', async () => {
    const { handlers } = makeHandlers();
    expect((await handlers.getStatus()).state).toBe('locked');
    await handlers.claim();
    expect((await handlers.getStatus()).state).toBe('unlocked');
  });

  it('openStorePage delegates to the service (Steam available)', async () => {
    const { handlers, source } = makeHandlers();
    expect(await handlers.openStorePage()).toBe(true);
    expect(source.openedUrls).toEqual([CONFIG.storeUrl]);
  });

  it('openStorePage returns false when Steam is unavailable (browser fallback)', async () => {
    const { handlers, source } = makeHandlers({ available: false });
    expect(await handlers.openStorePage()).toBe(false);
    expect(source.openedUrls).toEqual([]);
  });

  it('isFollowing uses the configured developer account and is false without config', async () => {
    const { handlers, source } = makeHandlers({ following: true });
    expect(await handlers.isFollowing()).toBe(true);
    expect(source.checkedDeveloperIds).toEqual([CONFIG.developerSteamId]);

    const { handlers: noConfig } = makeHandlers({ config: null });
    expect(await noConfig.isFollowing()).toBe(false);
  });

  it('claim unlocks the designated bonus', async () => {
    const { handlers } = makeHandlers({ following: true });
    expect(await handlers.claim()).toEqual({
      unlocked: true,
      chosenGameId: 'feudalism',
      reason: 'follow-confirmed',
    });
  });

  it('claim reports not-following without unlocking', async () => {
    const { handlers } = makeHandlers({ following: false });
    expect(await handlers.claim()).toEqual({ unlocked: false, chosenGameId: null, reason: 'not-following' });
  });

  it('claimManually unlocks via self-attestation', async () => {
    const { handlers } = makeHandlers();
    expect(await handlers.claimManually()).toEqual({
      unlocked: true,
      chosenGameId: 'feudalism',
      reason: 'manual-claim',
    });
  });

  it('supportsAutomaticFollowCheck reflects the source capability', async () => {
    const { handlers } = makeHandlers();
    expect(await handlers.supportsAutomaticFollowCheck()).toBe(true);
  });

  it('getBonusCatalog returns the configured catalog (for the lock UI)', async () => {
    const { handlers } = makeHandlers();
    expect(await handlers.getBonusCatalog()).toEqual(CATALOG);
  });
});
