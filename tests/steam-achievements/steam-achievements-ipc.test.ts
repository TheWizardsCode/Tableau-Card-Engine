/**
 * Achievement IPC handler-table tests (F6, CG-0MUNC7EXO001LITF).
 *
 * The handlers are pure (no Electron import); these tests exercise the exact
 * surface the preload bridge invokes and prove:
 *  - every handler is total (safe value, never throws) for edge inputs,
 *  - the preload channel names stay in parity with the handler module.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

import {
  STEAM_ACHIEVEMENT_CHANNELS,
  createSteamAchievementHandlers,
} from '../../electron/steam-achievements-ipc.js';
import {
  FakeAchievementSource,
  MemoryAchievementStore,
  SteamAchievementService,
  type AchievementManifestFile,
} from '../../electron/steam-achievements.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD_PATH = path.join(here, '..', '..', 'electron', 'preload.cjs');

const MANIFEST: AchievementManifestFile = {
  version: 1,
  games: [
    {
      gameId: 'test-game',
      achievements: [
        { achievementId: 'foodie-row', steamApiName: 'TCE_TEST_FOODIE_ROW', hidden: false },
      ],
    },
  ],
};

function makeHandlers(options: { available?: boolean; manifest?: AchievementManifestFile | null } = {}) {
  const source = new FakeAchievementSource({
    availability: options.available === false ? 'unavailable' : 'available',
  });
  const store = new MemoryAchievementStore();
  const manifest = options.manifest === undefined ? MANIFEST : options.manifest;
  const service = new SteamAchievementService(source, store, manifest);
  return { handlers: createSteamAchievementHandlers(service), source, store };
}

// ── Channel names ───────────────────────────────────────────

describe('STEAM_ACHIEVEMENT_CHANNELS', () => {
  it('namespaces every channel under steamAchievements:', () => {
    for (const channel of Object.values(STEAM_ACHIEVEMENT_CHANNELS)) {
      expect(channel.startsWith('steamAchievements:')).toBe(true);
    }
  });

  it('keeps preload.cjs channel names in parity with the handler module', () => {
    const preload = fs.readFileSync(PRELOAD_PATH, 'utf-8');
    // Extract the literal channel strings the preload invokes.
    const invoked = [...preload.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]);
    const achievementChannels = invoked.filter((c) => c.startsWith('steamAchievements:'));

    expect(new Set(achievementChannels)).toEqual(new Set(Object.values(STEAM_ACHIEVEMENT_CHANNELS)));
  });
});

// ── Handler behaviour ───────────────────────────────────────

describe('createSteamAchievementHandlers()', () => {
  it('isAvailable reflects the source', async () => {
    expect(await makeHandlers().handlers.isAvailable()).toBe(true);
    expect(await makeHandlers({ available: false }).handlers.isAvailable()).toBe(false);
  });

  it('hasManifest reflects the loaded manifest', async () => {
    expect(await makeHandlers().handlers.hasManifest()).toBe(true);
    expect(await makeHandlers({ manifest: null }).handlers.hasManifest()).toBe(false);
  });

  it('unlock returns the mapped result and persists', async () => {
    const { handlers, store } = makeHandlers();
    const result = await handlers.unlock('foodie-row');
    expect(result).toMatchObject({ achievementId: 'foodie-row', unlocked: true, synced: true });
    expect(await store.load()).toEqual(['foodie-row']);
  });

  it('getUnlocked reflects persisted ids', async () => {
    const { handlers } = makeHandlers();
    expect(await handlers.getUnlocked()).toEqual([]);
    await handlers.unlock('foodie-row');
    expect(await handlers.getUnlocked()).toEqual(['foodie-row']);
  });

  it('resync returns a summary', async () => {
    const { handlers, store } = makeHandlers();
    await store.save(['foodie-row']);
    expect(await handlers.resync()).toMatchObject({ synced: 1, failed: 0, steamAvailable: true });
  });
});

// ── Handler totality ────────────────────────────────────────

describe('handler totality (never throws)', () => {
  const edgeInputs: unknown[] = [undefined, null, '', 123, {}, [], 'unknown-achievement'];

  it('unlock is total for every edge input', async () => {
    const { handlers } = makeHandlers();
    for (const input of edgeInputs) {
      await expect(
        handlers.unlock(input as string),
        `unlock(${JSON.stringify(input)}) should not throw`,
      ).resolves.toBeDefined();
    }
  });

  it('getUnlocked / isAvailable / hasManifest / resync never throw', async () => {
    const { handlers } = makeHandlers();
    await expect(handlers.getUnlocked()).resolves.toBeDefined();
    await expect(handlers.isAvailable()).resolves.toBeDefined();
    await expect(handlers.hasManifest()).resolves.toBeDefined();
    await expect(handlers.resync()).resolves.toBeDefined();
  });

  it('degrades safely when no manifest is loaded', async () => {
    const { handlers } = makeHandlers({ manifest: null });
    const result = await handlers.unlock('foodie-row');
    expect(result).toMatchObject({ unlocked: false, reason: 'manifest-missing' });
  });
});
