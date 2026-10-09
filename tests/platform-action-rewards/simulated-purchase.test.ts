/**
 * Scoped simulated purchase — unified content-unlock write path
 * (MS-0MV0M5BHH0020WFY / core feature of CG-0MUZF156A007OUIT).
 *
 * Proves the dev/QA simulated purchase unlocks **only** its declared DLC,
 * scoped by rule id and an explicit `simulatePurchase` signal:
 *   - the `SimulatedPurchaseVerifier` ignores plain self-attestation;
 *   - `ActionRewardService.refresh({ ruleIds })` evaluates only the named rule;
 *   - a scoped residential-pack purchase never collateral-unlocks the itch.io
 *     golf reward, and a global `refresh({ attested: true })` never unlocks the
 *     residential pack;
 *   - the IPC handler and the renderer client carry the scoped request.
 *
 * Pure Node — no Electron; runs under `--project unit`.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  ActionRewardService,
  MemoryContentUnlockStore,
} from '../../electron/action-rewards';
import {
  SIMULATED_PURCHASE_VERIFIER_ID,
  SimulatedPurchaseVerifier,
  createContentUnlockVerifierRegistry,
} from '../../electron/action-verifiers';
import { createActionRewardHandlers } from '../../electron/action-rewards-ipc';
import { loadActionRewardsConfig, resolveConfiguredVerifierId } from '../../electron/action-rewards-config';
import { createContentUnlockClient } from '../../src/ui/content-unlock-client';
import {
  createUnlockRuleSet,
  type DlcTarget,
  type GameTarget,
} from '../../electron/unlock-rules';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(HERE, '../../electron/action-rewards.json');

const GOLF: GameTarget = { kind: 'game', gameId: 'golf' };
const RESIDENTIAL: DlcTarget = {
  kind: 'dlc',
  gameId: 'main-street',
  dlcId: 'main-street-residential-pack',
};

const PACK_RULE_ID = 'main-street-residential-pack-purchase';
const GOLF_RULE_ID = 'itchio-follow';

/** The verifier mapping the shipped config declares. */
const SHIPPED_VERIFIER_CONFIG = {
  defaultVerifierId: 'manual-self-attest',
  platforms: { 'itch.io': 'manual-self-attest' },
  actions: { 'dev:simulate-purchase': 'simulated-purchase' },
};

/** A service over the two rules with the shipped verifier mapping. */
function makeService() {
  const store = new MemoryContentUnlockStore();
  const service = new ActionRewardService({
    rules: createUnlockRuleSet([
      {
        id: GOLF_RULE_ID,
        trigger: { kind: 'platform-action', platform: 'itch.io', action: 'follow' },
        target: GOLF,
      },
      {
        id: PACK_RULE_ID,
        trigger: { kind: 'platform-action', platform: 'dev', action: 'simulate-purchase' },
        target: RESIDENTIAL,
      },
    ]),
    store,
    verifiers: createContentUnlockVerifierRegistry(),
    verifierConfig: SHIPPED_VERIFIER_CONFIG,
  });
  return { service, store };
}

describe('SimulatedPurchaseVerifier', () => {
  it('verifies only on an explicit simulatePurchase signal', async () => {
    const verifier = new SimulatedPurchaseVerifier();
    expect(verifier.id).toBe(SIMULATED_PURCHASE_VERIFIER_ID);

    expect((await verifier.verify()).verified).toBe(false);
    expect(
      (await verifier.verify({ platform: 'dev', action: 'simulate-purchase' })).verified,
    ).toBe(false);
    // Self-attestation alone must NOT satisfy a simulated purchase.
    expect(
      (
        await verifier.verify({
          platform: 'dev',
          action: 'simulate-purchase',
          attested: true,
        })
      ).verified,
    ).toBe(false);
    expect(
      (
        await verifier.verify({
          platform: 'dev',
          action: 'simulate-purchase',
          simulatePurchase: true,
        })
      ).verified,
    ).toBe(true);
  });
});

describe('scoped simulated purchase via ActionRewardService', () => {
  it('unlocks only the named rule and never collateral-unlocks other rewards', async () => {
    const { service } = makeService();

    const results = await service.refresh({
      ruleIds: [PACK_RULE_ID],
      simulatePurchase: true,
    });

    expect(results.map((result) => result.ruleId)).toEqual([PACK_RULE_ID]);
    expect(results[0].outcome).toBe('unlocked');
    expect(await service.isUnlocked(RESIDENTIAL)).toBe(true);
    // The itch.io golf reward is untouched by the scoped purchase.
    expect(await service.isUnlocked(GOLF)).toBe(false);
  });

  it('does not unlock the residential pack on a global self-attest refresh', async () => {
    const { service } = makeService();

    await service.refresh({ attested: true });

    // The golfer still gets their honour-system follow reward …
    expect(await service.isUnlocked(GOLF)).toBe(true);
    // … but the simulated-purchase rule ignores attestation.
    expect(await service.isUnlocked(RESIDENTIAL)).toBe(false);
  });

  it('treats an empty ruleIds scope as "evaluate nothing"', async () => {
    const { service } = makeService();

    const results = await service.refresh({ ruleIds: [] });

    expect(results).toEqual([]);
    expect(await service.isUnlocked(GOLF)).toBe(false);
    expect(await service.isUnlocked(RESIDENTIAL)).toBe(false);
  });
});

describe('scoped simulated purchase through the IPC + renderer bridge', () => {
  it('carries ruleIds and simulatePurchase through the handler table', async () => {
    const { service } = makeService();
    const handlers = createActionRewardHandlers(service);

    const results = await handlers.refresh({
      ruleIds: [PACK_RULE_ID],
      simulatePurchase: true,
    });

    expect(results.map((result) => result.ruleId)).toEqual([PACK_RULE_ID]);
    expect(await handlers.isUnlocked(RESIDENTIAL)).toBe(true);
    expect(await handlers.isUnlocked(GOLF)).toBe(false);
  });

  it('exposes a typed refresh on the renderer content-unlock client', async () => {
    const { service } = makeService();
    const handlers = createActionRewardHandlers(service);
    const seen: { ruleIds?: string[]; simulatePurchase?: boolean }[] = [];
    const client = createContentUnlockClient({
      isUnlocked: (target) => handlers.isUnlocked(target),
      getUnlocks: () => handlers.getUnlocks(),
      refresh: (options) => {
        seen.push({ ruleIds: options?.ruleIds, simulatePurchase: options?.simulatePurchase });
        return handlers.refresh(options);
      },
    });

    const results = await client.refresh({
      ruleIds: [PACK_RULE_ID],
      simulatePurchase: true,
    });

    expect(seen).toEqual([{ ruleIds: [PACK_RULE_ID], simulatePurchase: true }]);
    expect(results[0].ruleId).toBe(PACK_RULE_ID);
    expect(await client.isUnlocked(RESIDENTIAL)).toBe(true);
  });
});

describe('shipped action-rewards.json — residential purchase rule', () => {
  it('declares the rule, its DLC target and its scoped verifier', () => {
    const config = loadActionRewardsConfig({ configPath: CONFIG_PATH });
    expect(config).not.toBeNull();

    const rule = config!.rules.find((item) => item.id === PACK_RULE_ID);
    expect(rule, `shipped rule ${PACK_RULE_ID}`).toBeDefined();
    expect(rule!.trigger).toEqual({
      kind: 'platform-action',
      platform: 'dev',
      action: 'simulate-purchase',
    });
    expect(rule!.target).toEqual(RESIDENTIAL);
    expect(resolveConfiguredVerifierId(rule!, config!.verifiers)).toBe(
      SIMULATED_PURCHASE_VERIFIER_ID,
    );
    // The itch.io rule is unchanged and still self-attests.
    const golf = config!.rules.find((item) => item.id === GOLF_RULE_ID);
    expect(golf!.target).toEqual(GOLF);
  });

  it('unlocks only the residential pack through the shipped config', async () => {
    const config = loadActionRewardsConfig({ configPath: CONFIG_PATH });
    const store = new MemoryContentUnlockStore();
    const service = new ActionRewardService({
      rules: { version: config!.version, rules: config!.rules },
      store,
      verifiers: createContentUnlockVerifierRegistry(),
      verifierConfig: config!.verifiers,
    });

    const purchase = await service.refresh({
      ruleIds: [PACK_RULE_ID],
      simulatePurchase: true,
    });
    expect(purchase.map((result) => result.ruleId)).toEqual([PACK_RULE_ID]);
    expect(await service.isUnlocked(RESIDENTIAL)).toBe(true);
    expect(await service.isUnlocked(GOLF)).toBe(false);

    // A separate global self-attest refresh unlocks golf but not the pack.
    const globalStore = new MemoryContentUnlockStore();
    const globalService = new ActionRewardService({
      rules: { version: config!.version, rules: config!.rules },
      store: globalStore,
      verifiers: createContentUnlockVerifierRegistry(),
      verifierConfig: config!.verifiers,
    });
    await globalService.refresh({ attested: true });
    expect(await globalService.isUnlocked(GOLF)).toBe(true);
    expect(await globalService.isUnlocked(RESIDENTIAL)).toBe(false);
  });
});
