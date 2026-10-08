/**
 * Unit tests for the generalised action-reward service and the unified,
 * target-keyed content-unlock persistence
 * (electron/action-rewards.ts, CG-0MUZGBRP2001XOUA — feature F3).
 *
 * These pin the behaviour the downstream features (generalised bridge, lock
 * computation, DLC gate) depend on:
 *  - a unified `ContentUnlockStore` keyed by target (`game:<id>` /
 *    `dlc:<gameId>:<dlcId>`), memory + file implementations, corrupt-file-safe;
 *  - `ActionRewardService` evaluates every platform-action rule against the
 *    store through resolved verifiers, unlocking idempotently;
 *  - an already-unlocked target is never re-verified;
 *  - missing config / missing verifiers / throwing verifiers degrade totally
 *    (never throw, never fabricate an unlock);
 *  - the Steam follow reward flows through the same service path.
 *
 * Pure Node — no browser, no Electron; runs under `--project unit`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  ActionRewardService,
  FileContentUnlockStore,
  MemoryContentUnlockStore,
  parseContentUnlocks,
  serializeContentUnlocks,
  type ContentUnlockRecord,
} from '../../electron/action-rewards';
import {
  ActionVerifierRegistry,
  FakeActionVerifier,
  STEAM_FOLLOW_VERIFIER_ID,
  SteamFollowActionVerifier,
} from '../../electron/action-verifiers';
import { FakeFollowSource } from '../../electron/steam-follow';
import {
  createUnlockRuleSet,
  targetKey,
  type DlcTarget,
  type GameTarget,
  type PlatformActionUnlockRule,
} from '../../electron/unlock-rules';

const GAME: GameTarget = { kind: 'game', gameId: 'feudalism' };
const DLC: DlcTarget = { kind: 'dlc', gameId: 'main-street', dlcId: 'riverfront-pack' };
const DEV_ID = '76561198000000000';

/** A platform-action rule whose names are deliberately opaque data. */
function platformRule(
  id: string,
  platform: string,
  action: string,
  target: GameTarget | DlcTarget,
): PlatformActionUnlockRule {
  return { id, trigger: { kind: 'platform-action', platform, action }, target };
}

/** A registry whose default verifier is the supplied fake. */
function registryWith(fake: FakeActionVerifier): ActionVerifierRegistry {
  return new ActionVerifierRegistry(fake.id).register(fake);
}

// ── Unified persistence: memory store ──────────────────────

describe('MemoryContentUnlockStore', () => {
  it('starts empty and unlocks a game target under the stable target key', async () => {
    const store = new MemoryContentUnlockStore();
    expect(await store.getAll()).toEqual([]);
    expect(await store.isUnlocked(GAME)).toBe(false);

    const record = await store.unlock(GAME, '2026-10-08T00:00:00.000Z');

    expect(record.key).toBe('game:feudalism');
    expect(record.key).toBe(targetKey(GAME));
    expect(await store.isUnlocked(GAME)).toBe(true);
    expect(await store.getAll()).toEqual([
      { key: 'game:feudalism', target: GAME, unlockedAt: '2026-10-08T00:00:00.000Z' },
    ]);
  });

  it('keys DLC by `<gameId>:<dlcId>` so DLC and game targets never collide', async () => {
    const store = new MemoryContentUnlockStore();
    await store.unlock(DLC, '2026-10-08T00:00:00.000Z');

    expect(await store.isUnlocked(DLC)).toBe(true);
    expect(await store.isUnlocked(GAME)).toBe(false);
    expect(await store.isUnlocked({ kind: 'dlc', gameId: 'main-street', dlcId: 'other' })).toBe(false);
    expect(await store.getAll()).toEqual([
      {
        key: 'dlc:main-street:riverfront-pack',
        target: DLC,
        unlockedAt: '2026-10-08T00:00:00.000Z',
      },
    ]);
  });

  it('is idempotent: re-unlocking keeps the original timestamp and one record', async () => {
    const store = new MemoryContentUnlockStore();
    await store.unlock(GAME, 'first');
    const second = await store.unlock(GAME, 'second');

    expect(second.unlockedAt).toBe('first');
    expect(await store.getAll()).toHaveLength(1);
  });

  it('does not share target references with the caller', async () => {
    const store = new MemoryContentUnlockStore();
    const mutable: GameTarget = { kind: 'game', gameId: 'feudalism' };
    await store.unlock(mutable, '2026-10-08T00:00:00.000Z');
    mutable.gameId = 'mutated';

    expect(await store.isUnlocked(GAME)).toBe(true);
  });
});

// ── Unified persistence: file store ────────────────────────

describe('serializeContentUnlocks / parseContentUnlocks', () => {
  it('round-trips a game and a DLC record (deep equality, order preserved)', () => {
    const records: ContentUnlockRecord[] = [
      { key: targetKey(GAME), target: GAME, unlockedAt: 'a' },
      { key: targetKey(DLC), target: DLC, unlockedAt: 'b' },
    ];

    expect(parseContentUnlocks(serializeContentUnlocks(records))).toEqual(records);
  });

  it('never throws: malformed JSON, a missing list, and malformed entries degrade to []', () => {
    expect(parseContentUnlocks('not json {{{')).toEqual([]);
    expect(parseContentUnlocks('{}')).toEqual([]);
    expect(parseContentUnlocks('{"unlocks":"nope"}')).toEqual([]);
    expect(parseContentUnlocks('{"unlocks":[null,{"key":"x"},{"target":{"kind":"game"}}]}')).toEqual([]);
  });

  it('drops only the malformed entry, keeping valid records', () => {
    const raw = JSON.stringify({
      unlocks: [
        { key: 'game:feudalism', target: GAME, unlockedAt: 'a' },
        { key: 'bogus', target: { kind: 'nope' }, unlockedAt: 'b' },
      ],
    });
    expect(parseContentUnlocks(raw)).toEqual([
      { key: 'game:feudalism', target: GAME, unlockedAt: 'a' },
    ]);
  });
});

describe('FileContentUnlockStore persistence', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-content-unlock-'));
    filePath = path.join(dir, 'nested', 'content-unlocks.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists a game and a DLC target across a simulated relaunch', async () => {
    const launch1 = new FileContentUnlockStore(filePath);
    await launch1.unlock(GAME);
    await launch1.unlock(DLC);

    // Launch 2: a brand-new store instance reads the same file.
    const launch2 = new FileContentUnlockStore(filePath);
    const records = await launch2.getAll();

    expect(records.map((r) => r.key).sort()).toEqual(['dlc:main-street:riverfront-pack', 'game:feudalism']);
    expect(await launch2.isUnlocked(GAME)).toBe(true);
    expect(await launch2.isUnlocked(DLC)).toBe(true);
  });

  it('is idempotent across relaunches (original timestamp preserved)', async () => {
    await new FileContentUnlockStore(filePath).unlock(GAME, 'original');
    const again = await new FileContentUnlockStore(filePath).unlock(GAME, 'later');

    expect(again.unlockedAt).toBe('original');
    expect(await new FileContentUnlockStore(filePath).getAll()).toHaveLength(1);
  });

  it('treats a missing or corrupt file as empty (never throws)', async () => {
    const missing = new FileContentUnlockStore(filePath);
    expect(await missing.getAll()).toEqual([]);
    expect(await missing.isUnlocked(GAME)).toBe(false);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'not json {{{');
    const corrupt = new FileContentUnlockStore(filePath);
    expect(await corrupt.getAll()).toEqual([]);
    expect(await corrupt.isUnlocked(GAME)).toBe(false);
  });
});

// ── ActionRewardService ────────────────────────────────────

describe('ActionRewardService.refresh()', () => {
  it('verifies and persists a game target (rule → verify → unlock → persist)', async () => {
    const verifier = new FakeActionVerifier({ verified: true });
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('itch-follow', 'itch', 'follow', GAME)]);
    const service = new ActionRewardService({ rules, store, verifiers: registryWith(verifier) });

    const [result] = await service.refresh();

    expect(result).toMatchObject({
      ruleId: 'itch-follow',
      target: GAME,
      key: 'game:feudalism',
      outcome: 'unlocked',
    });
    expect(result.verification).toMatchObject({ verified: true });
    expect(verifier.verifyCalls).toHaveLength(1);
    expect(verifier.verifyCalls[0]).toMatchObject({ platform: 'itch', action: 'follow' });
    expect(await store.isUnlocked(GAME)).toBe(true);
  });

  it('verifies and persists a DLC target through the same path', async () => {
    const verifier = new FakeActionVerifier({ verified: true });
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('dlc-rule', 'wave', 'review', DLC)]);
    const service = new ActionRewardService({ rules, store, verifiers: registryWith(verifier) });

    const [result] = await service.refresh();

    expect(result).toMatchObject({ key: 'dlc:main-street:riverfront-pack', outcome: 'unlocked' });
    expect(await store.isUnlocked(DLC)).toBe(true);
    expect(await store.isUnlocked(GAME)).toBe(false);
  });

  it('handles several rules in one pass (game + DLC), preserving rule order', async () => {
    const verifier = new FakeActionVerifier({ verified: true });
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([
      platformRule('r1', 'p', 'a', GAME),
      platformRule('r2', 'p', 'b', DLC),
    ]);
    const service = new ActionRewardService({ rules, store, verifiers: registryWith(verifier) });

    const results = await service.refresh();

    expect(results.map((r) => r.ruleId)).toEqual(['r1', 'r2']);
    expect(results.every((r) => r.outcome === 'unlocked')).toBe(true);
    expect(await store.getAll()).toHaveLength(2);
  });

  it('is idempotent and never re-verifies an already-unlocked target', async () => {
    const verifier = new FakeActionVerifier({ verified: true });
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('r1', 'p', 'a', GAME)]);
    const service = new ActionRewardService({ rules, store, verifiers: registryWith(verifier) });

    await service.refresh();
    const [second] = await service.refresh();

    expect(second.outcome).toBe('already-unlocked');
    expect(second.verification).toBeNull();
    // The verifier ran exactly once (first pass) — no re-verification.
    expect(verifier.verifyCalls).toHaveLength(1);
    expect(await store.getAll()).toHaveLength(1);
  });

  it('leaves the target locked when verification is not satisfied', async () => {
    const verifier = new FakeActionVerifier({ verified: false });
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('r1', 'p', 'a', GAME)]);
    const service = new ActionRewardService({ rules, store, verifiers: registryWith(verifier) });

    const [result] = await service.refresh();

    expect(result.outcome).toBe('not-verified');
    expect(await store.isUnlocked(GAME)).toBe(false);
  });

  it('reports verification-unavailable (and stays locked) when detection is impossible', async () => {
    const verifier = new FakeActionVerifier({ outcome: 'unavailable' });
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('r1', 'p', 'a', GAME)]);
    const service = new ActionRewardService({ rules, store, verifiers: registryWith(verifier) });

    const [result] = await service.refresh();

    expect(result.outcome).toBe('verification-unavailable');
    expect(await store.isUnlocked(GAME)).toBe(false);
  });

  it('passes the self-attestation flag and the configured action URL to the verifier', async () => {
    const verifier = new FakeActionVerifier({ verified: true });
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('r1', 'p', 'a', GAME)]);
    const service = new ActionRewardService({ rules, store, verifiers: registryWith(verifier) });

    await service.refresh({ attested: true, actionUrls: { r1: 'https://example.test/follow' } });

    expect(verifier.verifyCalls[0]).toMatchObject({
      attested: true,
      actionUrl: 'https://example.test/follow',
    });
  });

  it('skips non-platform-action (achievement) rules and malformed rules', async () => {
    const verifier = new FakeActionVerifier({ verified: true });
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([
      // Achievement trigger — not this service's responsibility.
      {
        id: 'ach',
        trigger: { kind: 'achievement', achievementIds: ['first-win'] },
        target: GAME,
      },
      // Malformed platform rule (missing action).
      {
        id: 'bad',
        trigger: { kind: 'platform-action', platform: 'p', action: '' },
        target: DLC,
      } as unknown as PlatformActionUnlockRule,
      platformRule('good', 'p', 'a', GAME),
    ]);
    const service = new ActionRewardService({ rules, store, verifiers: registryWith(verifier) });

    const results = await service.refresh();

    expect(results.map((r) => r.ruleId)).toEqual(['good']);
    expect(verifier.verifyCalls).toHaveLength(1);
  });

  it('degrades totally for missing/empty rules (no throw, no unlock)', async () => {
    const store = new MemoryContentUnlockStore();
    for (const rules of [null, undefined, createUnlockRuleSet([])]) {
      const service = new ActionRewardService({ rules, store });
      await expect(service.refresh()).resolves.toEqual([]);
    }
    expect(await store.getAll()).toEqual([]);
  });
});

// ── Degradation: missing verifiers, throwing verifiers ─────

describe('ActionRewardService degradation', () => {
  it('falls back to self-attest for a platform with no configured verifier', async () => {
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('itch-follow', 'itch', 'follow', GAME)]);
    // Default registry only registers the manual self-attest verifier.
    const service = new ActionRewardService({ rules, store });

    const [locked] = await service.refresh();
    expect(locked.outcome).toBe('not-verified');
    expect(await store.isUnlocked(GAME)).toBe(false);

    const [unlocked] = await service.refresh({ attested: true });
    expect(unlocked.outcome).toBe('unlocked');
    expect(await store.isUnlocked(GAME)).toBe(true);
  });

  it('never throws when a resolved verifier throws (degrades to unavailable)', async () => {
    const verifier = new FakeActionVerifier({ verified: true });
    verifier.verifyThrows = true;
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('r1', 'p', 'a', GAME)]);
    const service = new ActionRewardService({ rules, store, verifiers: registryWith(verifier) });

    const [result] = await service.refresh();

    expect(result.outcome).toBe('verification-unavailable');
    expect(await store.isUnlocked(GAME)).toBe(false);
  });

  it('exposes a total read API even when the store throws', async () => {
    const throwingStore = {
      getAll: async () => {
        throw new Error('boom');
      },
      isUnlocked: async () => {
        throw new Error('boom');
      },
      unlock: async (): Promise<ContentUnlockRecord> => {
        throw new Error('boom');
      },
    };
    const rules = createUnlockRuleSet([platformRule('r1', 'p', 'a', GAME)]);
    const service = new ActionRewardService({ rules, store: throwingStore });

    await expect(service.getUnlocks()).resolves.toEqual([]);
    await expect(service.isUnlocked(GAME)).resolves.toBe(false);
    await expect(service.refresh()).resolves.toHaveLength(1);
  });
});

// ── Read API ───────────────────────────────────────────────

describe('ActionRewardService read API', () => {
  it('isUnlocked / getUnlocks reflect the unified store', async () => {
    const store = new MemoryContentUnlockStore([
      { key: targetKey(GAME), target: GAME, unlockedAt: 'a' },
    ]);
    const service = new ActionRewardService({ rules: null, store });

    expect(await service.isUnlocked(GAME)).toBe(true);
    expect(await service.isUnlocked(DLC)).toBe(false);
    expect((await service.getUnlocks()).map((r) => r.key)).toEqual(['game:feudalism']);
  });
});

// ── Steam follow reward through the same service path ──────

describe('ActionRewardService with the Steam follow verifier', () => {
  it('unlocks the game via automatic Steam follow detection', async () => {
    const source = new FakeFollowSource({ following: true });
    const registry = new ActionVerifierRegistry(STEAM_FOLLOW_VERIFIER_ID).register(
      new SteamFollowActionVerifier(source, DEV_ID),
    );
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('steam-follow', 'steam', 'follow', GAME)]);
    const service = new ActionRewardService({ rules, store, verifiers: registry });

    const [result] = await service.refresh();

    expect(result.outcome).toBe('unlocked');
    expect(source.followingChecks).toBe(1);
    expect(source.checkedDeveloperIds).toEqual([DEV_ID]);
    expect(await store.isUnlocked(GAME)).toBe(true);
  });

  it('leaves the game locked when the Steam follow is not detected', async () => {
    const source = new FakeFollowSource({ following: false });
    const registry = new ActionVerifierRegistry(STEAM_FOLLOW_VERIFIER_ID).register(
      new SteamFollowActionVerifier(source, DEV_ID),
    );
    const store = new MemoryContentUnlockStore();
    const rules = createUnlockRuleSet([platformRule('steam-follow', 'steam', 'follow', GAME)]);
    const service = new ActionRewardService({ rules, store, verifiers: registry });

    const [result] = await service.refresh();

    expect(result.outcome).toBe('not-verified');
    expect(await store.isUnlocked(GAME)).toBe(false);
  });

  it('persists the Steam unlock across a relaunch (file store)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-steam-reward-'));
    const filePath = path.join(dir, 'content-unlocks.json');
    try {
      const registry = new ActionVerifierRegistry(STEAM_FOLLOW_VERIFIER_ID).register(
        new SteamFollowActionVerifier(new FakeFollowSource({ following: true }), DEV_ID),
      );
      const rules = createUnlockRuleSet([platformRule('steam-follow', 'steam', 'follow', GAME)]);
      await new ActionRewardService({ rules, store: new FileContentUnlockStore(filePath), verifiers: registry }).refresh();

      const launch2 = new FileContentUnlockStore(filePath);
      const source2 = new FakeFollowSource({ following: false });
      const registry2 = new ActionVerifierRegistry(STEAM_FOLLOW_VERIFIER_ID).register(
        new SteamFollowActionVerifier(source2, DEV_ID),
      );
      const [second] = await new ActionRewardService({ rules, store: launch2, verifiers: registry2 }).refresh();

      expect(second.outcome).toBe('already-unlocked');
      expect(source2.followingChecks).toBe(0);
      expect(await launch2.isUnlocked(GAME)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
