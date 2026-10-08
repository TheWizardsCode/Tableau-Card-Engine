/**
 * End-to-end integration test for the non-Steam reward path
 * (CG-0MUZGBUHC000P13V, feature F8 of CG-0MUZF156A007OUIT).
 *
 * Unlike the per-module unit suites (which pin each seam in isolation), this
 * test drives the **shipped** configuration through the **whole launcher chain**
 * so the pieces are proven to fit together:
 *
 *   `action-rewards.json` (data)
 *     → `action-rewards-config` loader + drift validator
 *     → `ActionVerifierRegistry` (manual self-attest for itch.io)
 *     → `ActionRewardService` over the unified `ContentUnlockStore`
 *     → `action-rewards-ipc` handler table (the main-process bridge)
 *     → `content-unlock-client` (the renderer's total read API)
 *     → `computeSteamLocks` / `applySteamLocks` (the Game Selector)
 *
 * Two guarantees are asserted:
 *   1. An itch.io follow rule unlocks its designated game after manual
 *      self-attestation, and the Game Selector renders that game unlocked.
 *   2. The existing Steam follow reward behaves **unchanged** — it still
 *      unlocks the catalog's `bonusGameId` (Feudalism) through its own service.
 *
 * A third case proves the **DLC** target kind reaches the same read path: a DLC
 * unlocked through the unified store is reachable through the pure `DlcGate`
 * fed by the renderer client, and unreachable before.
 *
 * Pure Node — no browser, no Electron, no Steam client. Runs under
 * `--project unit`. External seams (unlock store, Steam follow source) are
 * deterministic in-memory fakes; the config, catalog, and every pure module are
 * the real shipped ones.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  buildActionRewardRegistry,
  loadActionRewardsConfig,
  validateActionRewardsConfig,
} from '../../electron/action-rewards-config';
import { createActionRewardHandlers } from '../../electron/action-rewards-ipc';
import {
  ActionRewardService,
  MemoryContentUnlockStore,
  type ContentUnlockRecord,
} from '../../electron/action-rewards';
import {
  ActionVerifierRegistry,
  SELF_ATTEST_VERIFIER_ID,
  STEAM_FOLLOW_VERIFIER_ID,
} from '../../electron/action-verifiers';
import { loadBonusCatalog } from '../../electron/bonus-catalog';
import {
  FakeFollowSource,
  MemoryUnlockStore,
  SteamFollowService,
  type BonusCatalog,
} from '../../electron/steam-follow';
import type { SteamConfig } from '../../electron/steam-config';
import {
  createUnlockRuleSet,
  targetKey,
  type GameTarget,
} from '../../electron/unlock-rules';
import {
  createContentUnlockClient,
  type ContentUnlockBridge,
  type UnlockTargetLike,
} from '../../src/ui/content-unlock-client';
import {
  applySteamLocks,
  computeSteamLocks,
  isDlcUnlocked,
  STEAM_LOCK_ACTION,
  STEAM_LOCK_FOLLOW,
  type SteamFollowStatusLike,
} from '../../src/ui/steam-lock';
import type { GameEntry } from '../../src/ui/GameSelectorScene';
import { createDlcGate } from '../../src/core-engine/DlcGate';

const ELECTRON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../electron');
const CONFIG_PATH = path.join(ELECTRON_DIR, 'action-rewards.json');

/** The verifier ids the launcher registers; the drift validator checks against these. */
const REGISTERED_VERIFIER_IDS = [SELF_ATTEST_VERIFIER_ID, STEAM_FOLLOW_VERIFIER_ID];

/** The itch.io rule's designated game (data from the shipped config/catalog). */
const GOLF: GameTarget = { kind: 'game', gameId: 'golf' };

/** A deterministic Steam config so `SteamFollowService` never reads the filesystem. */
const STEAM_CONFIG: SteamConfig = {
  appId: '480',
  developerSteamId: '76561198000000000',
  storeUrl: 'steam://store/480',
};

/** A `follow` status as the Game Selector would hold before following. */
const STEAM_LOCKED: SteamFollowStatusLike = { state: 'locked' };

/** Build the Game Selector entries from the real catalog (sceneKey/title/description). */
function entriesFromCatalog(catalog: BonusCatalog): GameEntry[] {
  return catalog.games.map((game) => ({
    sceneKey: game.sceneKey,
    title: game.title,
    description: game.description,
  }));
}

/**
 * Wire the main-process handler table to the renderer client exactly as
 * `main.ts` + `preload.cjs` do: the handlers are the bridge, the client is the
 * renderer's total read API.
 */
function rendererClientFor(handlers: ReturnType<typeof createActionRewardHandlers>) {
  const bridge: ContentUnlockBridge = {
    isUnlocked: (target: UnlockTargetLike) => handlers.isUnlocked(target),
    getUnlocks: (): Promise<ContentUnlockRecord[]> => handlers.getUnlocks(),
  };
  return createContentUnlockClient(bridge);
}

describe('itch.io follow → self-attest → unlock → Game Selector (end-to-end)', () => {
  it('drives the shipped config through the whole launcher chain', async () => {
    // 1. Load the shipped data and validate it against the real capabilities.
    const config = loadActionRewardsConfig({ configPath: CONFIG_PATH });
    const catalog = loadBonusCatalog();
    expect(config, 'shipped action-rewards.json must load').not.toBeNull();
    expect(catalog, 'shipped bonus-catalog.json must load').not.toBeNull();

    const registry = buildActionRewardRegistry(catalog, REGISTERED_VERIFIER_IDS);
    expect(validateActionRewardsConfig(config, registry)).toEqual([]);

    // The shipped itch.io rule targets the catalog's golf entry (data, not code).
    const itchRule = config!.rules.find((rule) => rule.id === 'itchio-follow');
    expect(itchRule).toBeDefined();
    expect(itchRule!.trigger).toEqual({ kind: 'platform-action', platform: 'itch.io', action: 'follow' });
    expect(itchRule!.target).toEqual(GOLF);

    // 2. Build the service the main process wires, with the real verifier registry.
    const store = new MemoryContentUnlockStore();
    const service = new ActionRewardService({
      rules: createUnlockRuleSet(config!.rules),
      store,
      verifiers: new ActionVerifierRegistry(), // manual self-attest only
      verifierConfig: config!.verifiers,
    });
    const handlers = createActionRewardHandlers(service);
    const client = rendererClientFor(handlers);

    const entries = entriesFromCatalog(catalog!);

    // 3. Before attestation: nothing is unlocked and the selector locks golf
    //    with the action message (not the follow/milestone message).
    expect(await client.isUnlocked(GOLF)).toBe(false);
    const lockedLocks = computeSteamLocks(entries, catalog, STEAM_LOCKED, []);
    expect(lockedLocks.get('GolfScene')).toBe(STEAM_LOCK_ACTION);

    // 4. Player self-attests through the renderer bridge (passing the shipped URL).
    const results = await handlers.refresh({
      attested: true,
      actionUrls: config!.actionUrls,
    });
    const itchResult = results.find((result) => result.ruleId === 'itchio-follow');
    expect(itchResult).toMatchObject({ outcome: 'unlocked', key: 'game:golf' });

    // 5. The renderer read API now reports golf unlocked, backed by the store.
    expect(await client.isUnlocked(GOLF)).toBe(true);
    expect(await store.isUnlocked(GOLF)).toBe(true);
    const records = await client.getUnlocks();
    expect(records.map((record) => record.key)).toContain(targetKey(GOLF));

    // 6. The Game Selector reads that state and renders golf unlocked, while the
    //    Steam-designated bonus (feudalism) stays locked.
    const unlockedLocks = computeSteamLocks(entries, catalog, STEAM_LOCKED, records.map((r) => r.target));
    expect(unlockedLocks.has('GolfScene')).toBe(false);
    expect(unlockedLocks.get('FeudalismScene')).toBe(STEAM_LOCK_FOLLOW);

    const applied = applySteamLocks(entries, unlockedLocks);
    expect(applied.find((entry) => entry.sceneKey === 'GolfScene')?.locked).toBe(false);
    expect(applied.find((entry) => entry.sceneKey === 'FeudalismScene')).toMatchObject({
      locked: true,
      lockMessage: STEAM_LOCK_FOLLOW,
    });
  });

  it('is idempotent across a relaunch: the persisted game target survives and is not re-verified', async () => {
    const config = loadActionRewardsConfig({ configPath: CONFIG_PATH });
    expect(config).not.toBeNull();

    // First run persists the unlock in a memory store "relaunch" object.
    const firstStore = new MemoryContentUnlockStore();
    await new ActionRewardService({
      rules: createUnlockRuleSet(config!.rules),
      store: firstStore,
      verifierConfig: config!.verifiers,
    }).refresh({ attested: true });

    const persisted = await firstStore.getAll();
    expect(persisted.map((record) => record.key)).toContain('game:golf');

    // Second run starts from the persisted records: golf is already unlocked and
    // the service reports `already-unlocked` without re-running verification.
    const secondStore = new MemoryContentUnlockStore(persisted);
    const service = new ActionRewardService({
      rules: createUnlockRuleSet(config!.rules),
      store: secondStore,
      verifierConfig: config!.verifiers,
    });
    const [secondResult] = await service.refresh();

    expect(secondResult).toMatchObject({ ruleId: 'itchio-follow', outcome: 'already-unlocked' });
    expect(secondResult.verification).toBeNull();
    expect(await secondStore.isUnlocked(GOLF)).toBe(true);
  });
});

describe('the Steam follow reward still behaves unchanged (end-to-end)', () => {
  it('unlocks the catalog bonusGameId via follow detection, not the itch.io game', async () => {
    const catalog = loadBonusCatalog();
    expect(catalog).not.toBeNull();

    const source = new FakeFollowSource({ following: true });
    const store = new MemoryUnlockStore();
    const steam = new SteamFollowService(source, store, catalog, STEAM_CONFIG);

    const result = await steam.refresh();

    expect(result).toEqual({ unlocked: true, chosenGameId: 'feudalism', reason: 'follow-confirmed' });
    expect(await store.load()).toMatchObject({ unlocked: true, chosenGameId: 'feudalism' });
    // The Steam reward never unlocks the itch.io-designated golf game.
    expect(await store.load()).not.toMatchObject({ chosenGameId: 'golf' });

    // The selector reflects the follow half of the unified state.
    const entries = entriesFromCatalog(catalog!);
    const status: SteamFollowStatusLike = { state: 'unlocked', unlock: { unlocked: true, chosenGameId: 'feudalism' } };
    const locks = computeSteamLocks(entries, catalog, status, []);
    expect(locks.has('FeudalismScene')).toBe(false);
    expect(locks.get('GolfScene')).toBe(STEAM_LOCK_ACTION);
  });

  it('still supports the manual self-attest claim when detection is unavailable', async () => {
    const catalog = loadBonusCatalog();
    const source = new FakeFollowSource({ availability: 'unavailable' });
    const store = new MemoryUnlockStore();
    const steam = new SteamFollowService(source, store, catalog, STEAM_CONFIG);

    // Automatic refresh cannot verify without Steam…
    await expect(steam.refresh()).resolves.toMatchObject({ unlocked: false, reason: 'steam-unavailable' });
    // …but the documented manual claim still unlocks, unchanged.
    await expect(steam.claimManually()).resolves.toMatchObject({
      unlocked: true,
      chosenGameId: 'feudalism',
      reason: 'manual-claim',
    });
  });
});

describe('DLC targets reach the same read path (end-to-end)', () => {
  it('gates DLC content on the unified unlock state read through the bridge', async () => {
    const catalog = loadBonusCatalog();
    expect(catalog).not.toBeNull();

    const dlcTarget = { kind: 'dlc' as const, gameId: 'main-street', dlcId: 'riverfront-pack' };
    const rules = createUnlockRuleSet([
      {
        id: 'itchio-follow-dlc',
        trigger: { kind: 'platform-action', platform: 'itch.io', action: 'follow' },
        target: dlcTarget,
      },
    ]);

    const store = new MemoryContentUnlockStore();
    const handlers = createActionRewardHandlers(
      new ActionRewardService({ rules, store, verifiers: new ActionVerifierRegistry() }),
    );
    const client = rendererClientFor(handlers);

    // The DLC is unreachable until the action is verified (total reader → false).
    const gateBefore = createDlcGate({
      gameId: 'main-street',
      isUnlocked: (target) => client.isUnlocked(target),
    });
    expect(await gateBefore.isUnlocked('riverfront-pack')).toBe(false);
    expect(await gateBefore.check('riverfront-pack')).toMatchObject({ unlocked: false, reason: 'locked' });
    expect(isDlcUnlocked('main-street', 'riverfront-pack', { unlockedTargets: [] })).toBe(false);

    // Verify the action and the DLC becomes reachable through the same state.
    await handlers.refresh({ attested: true });

    const gateAfter = createDlcGate({
      gameId: 'main-street',
      isUnlocked: (target) => client.isUnlocked(target),
    });
    expect(await gateAfter.isUnlocked('riverfront-pack')).toBe(true);
    expect(await gateAfter.check('riverfront-pack')).toMatchObject({ unlocked: true, reason: 'unlocked' });
    expect(
      isDlcUnlocked('main-street', 'riverfront-pack', {
        unlockedTargets: (await client.getUnlocks()).map((record) => record.target),
      }),
    ).toBe(true);
  });
});
