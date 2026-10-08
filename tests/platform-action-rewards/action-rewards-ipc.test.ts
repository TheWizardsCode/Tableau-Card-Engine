/**
 * Unit tests for the generalised action-reward IPC handler table
 * (electron/action-rewards-ipc.ts, CG-0MUZGBSSQ009ISHG — feature F5).
 *
 * The handlers are pure (no Electron import); these tests exercise the exact
 * surface the additive `window.tce.contentUnlocks` preload bridge invokes,
 * proving the renderer's contract without an Electron runtime. They pin the
 * **totality** the epic requires: a missing service, a throwing service, and a
 * malformed renderer-supplied target all degrade to a safe value and never
 * throw, so a DLC/game gate can never crash the owning game.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ACTION_REWARD_CHANNELS,
  createActionRewardHandlers,
  isUnlockTarget,
} from '../../electron/action-rewards-ipc';
import {
  ActionRewardService,
  MemoryContentUnlockStore,
} from '../../electron/action-rewards';
import {
  ActionVerifierRegistry,
  FakeActionVerifier,
} from '../../electron/action-verifiers';
import {
  createUnlockRuleSet,
  type DlcTarget,
  type GameTarget,
  type UnlockTarget,
} from '../../electron/unlock-rules';

const GAME: GameTarget = { kind: 'game', gameId: 'golf' };
const DLC: DlcTarget = { kind: 'dlc', gameId: 'main-street', dlcId: 'riverfront-pack' };
const STEAM_DLC: DlcTarget = { kind: 'dlc', gameId: 'golf', dlcId: 'links-pack' };

/** A real service over a memory store with a verifying fake action verifier. */
function makeService(options: { verified?: boolean } = {}) {
  const verifier = new FakeActionVerifier({
    id: 'fake-action-verifier',
    verified: options.verified ?? true,
  });
  const store = new MemoryContentUnlockStore();
  const service = new ActionRewardService({
    rules: createUnlockRuleSet([
      {
        id: 'rule-game',
        trigger: { kind: 'platform-action', platform: 'itch.io', action: 'follow' },
        target: GAME,
      },
      {
        id: 'rule-dlc',
        trigger: { kind: 'platform-action', platform: 'itch.io', action: 'follow' },
        target: DLC,
      },
    ]),
    store,
    verifiers: new ActionVerifierRegistry(verifier.id).register(verifier),
    verifierConfig: { defaultVerifierId: verifier.id },
  });
  return { service, store, verifier };
}

describe('ACTION_REWARD_CHANNELS', () => {
  it('namespaces every channel under contentUnlocks:', () => {
    for (const channel of Object.values(ACTION_REWARD_CHANNELS)) {
      expect(channel.startsWith('contentUnlocks:')).toBe(true);
    }
  });

  it('exposes exactly one channel per handler', () => {
    expect(Object.keys(ACTION_REWARD_CHANNELS).sort()).toEqual([
      'getUnlocks',
      'isUnlocked',
      'refresh',
    ]);
  });

  it('keeps preload.cjs contentUnlocks channel names in parity with the handler module', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const preload = fs.readFileSync(path.join(here, '..', '..', 'electron', 'preload.cjs'), 'utf-8');
    const invoked = [...preload.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]);
    const contentUnlockChannels = invoked.filter((channel) => channel.startsWith('contentUnlocks:'));

    expect(new Set(contentUnlockChannels)).toEqual(
      new Set(Object.values(ACTION_REWARD_CHANNELS)),
    );
  });
});

describe('isUnlockTarget()', () => {
  it('accepts well-formed game and DLC targets', () => {
    expect(isUnlockTarget(GAME)).toBe(true);
    expect(isUnlockTarget(DLC)).toBe(true);
  });

  it('rejects malformed targets', () => {
    for (const value of [
      undefined,
      null,
      {},
      { kind: 'game' },
      { kind: 'game', gameId: '' },
      { kind: 'dlc', gameId: 'main-street' },
      { kind: 'dlc', gameId: 'main-street', dlcId: '' },
      { kind: 'other', gameId: 'x' },
      'game:golf',
    ]) {
      expect(isUnlockTarget(value)).toBe(false);
    }
  });
});

describe('createActionRewardHandlers()', () => {
  it('isUnlocked reflects the unified store for game and DLC targets', async () => {
    const { service, store } = makeService();
    const handlers = createActionRewardHandlers(service);

    expect(await handlers.isUnlocked(GAME)).toBe(false);
    await store.unlock(GAME, '2026-10-08T00:00:00.000Z');
    expect(await handlers.isUnlocked(GAME)).toBe(true);
    expect(await handlers.isUnlocked(DLC)).toBe(false);
    await store.unlock(DLC, '2026-10-08T00:00:00.000Z');
    expect(await handlers.isUnlocked(DLC)).toBe(true);
  });

  it('getUnlocks returns every persisted record', async () => {
    const { service, store } = makeService();
    const handlers = createActionRewardHandlers(service);
    expect(await handlers.getUnlocks()).toEqual([]);

    await store.unlock(GAME, '2026-10-08T00:00:00.000Z');
    expect(await handlers.getUnlocks()).toEqual([
      { key: 'game:golf', target: GAME, unlockedAt: '2026-10-08T00:00:00.000Z' },
    ]);
  });

  it('refresh verifies and persists every configured platform-action rule idempotently', async () => {
    const { service, verifier } = makeService({ verified: true });
    const handlers = createActionRewardHandlers(service);

    const first = await handlers.refresh({ attested: true });
    expect(first.map((result) => result.outcome)).toEqual(['unlocked', 'unlocked']);
    expect((await handlers.getUnlocks()).map((record) => record.key)).toEqual([
      'game:golf',
      'dlc:main-street:riverfront-pack',
    ]);
    expect(verifier.verifyCalls.length).toBe(2);

    const second = await handlers.refresh();
    expect(second.map((result) => result.outcome)).toEqual([
      'already-unlocked',
      'already-unlocked',
    ]);
    // An already-unlocked target is never re-verified.
    expect(verifier.verifyCalls.length).toBe(2);
  });

  it('is total when no service is supplied', async () => {
    for (const service of [null, undefined]) {
      const handlers = createActionRewardHandlers(service);
      expect(await handlers.isUnlocked(GAME)).toBe(false);
      expect(await handlers.getUnlocks()).toEqual([]);
      expect(await handlers.refresh({ attested: true })).toEqual([]);
    }
  });

  it('is total when the service throws', async () => {
    const throwing = {
      isUnlocked: async () => {
        throw new Error('store exploded');
      },
      getUnlocks: async () => {
        throw new Error('store exploded');
      },
      refresh: async () => {
        throw new Error('store exploded');
      },
    } as unknown as ActionRewardService;
    const handlers = createActionRewardHandlers(throwing);

    expect(await handlers.isUnlocked(GAME)).toBe(false);
    expect(await handlers.getUnlocks()).toEqual([]);
    expect(await handlers.refresh()).toEqual([]);
  });

  it('never calls the service for a malformed target and returns false', async () => {
    const isUnlocked = vi.fn(async () => true);
    const service = {
      isUnlocked,
      getUnlocks: async () => [],
      refresh: async () => [],
    } as unknown as ActionRewardService;
    const handlers = createActionRewardHandlers(service);

    for (const malformed of [
      undefined,
      null,
      {},
      { kind: 'game' },
      { kind: 'dlc', gameId: 'main-street' },
      { kind: 'other', gameId: 'x' },
    ]) {
      expect(await handlers.isUnlocked(malformed as unknown as UnlockTarget)).toBe(false);
    }
    expect(isUnlocked).not.toHaveBeenCalled();
  });

  it('coerces a non-boolean unlock result and a non-array record/result list to safe values', async () => {
    const service = {
      isUnlocked: async () => 'yes',
      getUnlocks: async () => null,
      refresh: async () => ({ not: 'an array' }),
    } as unknown as ActionRewardService;
    const handlers = createActionRewardHandlers(service);

    expect(await handlers.isUnlocked(GAME)).toBe(false);
    expect(await handlers.getUnlocks()).toEqual([]);
    expect(await handlers.refresh()).toEqual([]);
  });

  it('normalises a malformed refresh request before delegating', async () => {
    const { service } = makeService({ verified: true });
    const refresh = vi.spyOn(service, 'refresh');
    const handlers = createActionRewardHandlers(service);

    await handlers.refresh({ attested: false, actionUrls: { a: 'https://x', b: 3 } } as never);
    expect(refresh).toHaveBeenCalledWith({ actionUrls: { a: 'https://x' } });
  });

  it('exposes a Steam-follow DLC target through the same read API', async () => {
    const { service, store } = makeService();
    const handlers = createActionRewardHandlers(service);
    await store.unlock(STEAM_DLC, '2026-10-08T00:00:00.000Z');
    expect(await handlers.isUnlocked(STEAM_DLC)).toBe(true);
    expect(await handlers.isUnlocked(DLC)).toBe(false);
  });
});
