/**
 * Unit tests for the pluggable action-verification seam
 * (electron/action-verifiers.ts, CG-0MUZGBR3I006BAZ1).
 *
 * These pin the behaviour F3+ depend on:
 *  - the manual self-attest verifier is the default verification method;
 *  - the existing Steam `FollowSource` is adapted as one verifier whose
 *    detection behaviour is unchanged (automatic detection wins; manual
 *    attestation is only the fallback);
 *  - verifiers are resolved from config by platform/action/rule;
 *  - adding a platform needs only a new verifier + a config entry — no change
 *    to the registry, service, store, or IPC;
 *  - every resolution/verification path is total (unknown platform, missing
 *    verifier, malformed input) and never throws.
 *
 * Pure Node — no browser, no Electron; runs under `--project unit`.
 */
import { describe, it, expect } from 'vitest';

import {
  ActionVerifierRegistry,
  FakeActionVerifier,
  ManualSelfAttestVerifier,
  SELF_ATTEST_VERIFIER_ID,
  STEAM_FOLLOW_VERIFIER_ID,
  SteamFollowActionVerifier,
  createDefaultActionVerifierRegistry,
  resolveVerifierForRule,
  verifierKey,
  type ActionVerifierConfig,
} from '../../electron/action-verifiers';
import { FakeFollowSource } from '../../electron/steam-follow';
import type { PlatformActionUnlockRule } from '../../electron/unlock-rules';

const DEV_ID = '76561198000000000';

/**
 * A `FollowSource` double whose binding exposes no automatic follow check.
 * `FakeFollowSource.followCheckSupported` is typed as the literal `true`, so
 * the override is applied at runtime through a widened cast.
 */
function withoutAutomaticCheck(source: FakeFollowSource): FakeFollowSource {
  (source as { followCheckSupported: boolean }).followCheckSupported = false;
  return source;
}

/** A platform-action rule fixture (platform/action names are deliberately opaque). */
function platformRule(
  id: string,
  platform: string,
  action: string,
  gameId = 'some-game',
): PlatformActionUnlockRule {
  return {
    id,
    trigger: { kind: 'platform-action', platform, action },
    target: { kind: 'game', gameId },
  };
}

// ── Manual self-attest (the default) ───────────────────────

describe('ManualSelfAttestVerifier', () => {
  it('is the documented default verification method', () => {
    const verifier = new ManualSelfAttestVerifier();
    expect(verifier.id).toBe(SELF_ATTEST_VERIFIER_ID);
    expect(verifier.supportsAutomaticVerification()).toBe(false);
  });

  it('does not verify until the player attests', async () => {
    const verifier = new ManualSelfAttestVerifier();

    const pending = await verifier.verify({ platform: 'any', action: 'follow' });
    expect(pending).toMatchObject({
      verifierId: SELF_ATTEST_VERIFIER_ID,
      outcome: 'not-verified',
      verified: false,
      automatic: false,
    });

    const attested = await verifier.verify({ platform: 'any', action: 'follow', attested: true });
    expect(attested).toMatchObject({
      verifierId: SELF_ATTEST_VERIFIER_ID,
      outcome: 'verified',
      verified: true,
      automatic: false,
    });
  });

  it('treats only an explicit `true` as attestation', async () => {
    const verifier = new ManualSelfAttestVerifier();
    // `false` and `undefined` are equivalent — no attestation.
    expect((await verifier.verify({ platform: 'p', action: 'a', attested: false })).verified).toBe(false);
    expect((await verifier.verify({ platform: 'p', action: 'a' })).verified).toBe(false);
    // A truthy non-boolean is not an attestation (nothing is coerced).
    const coerced = await verifier.verify({
      platform: 'p',
      action: 'a',
      attested: 'yes' as unknown as boolean,
    });
    expect(coerced.verified).toBe(false);
  });

  it('has no native action-page opener (the caller falls back to a browser)', async () => {
    const verifier = new ManualSelfAttestVerifier();
    expect(await verifier.openActionPage('https://example.test/')).toBe(false);
  });

  it('is total: verify() never throws for a missing or malformed request', async () => {
    const verifier = new ManualSelfAttestVerifier();

    await expect(verifier.verify()).resolves.toMatchObject({ verified: false });
    await expect(
      verifier.verify(undefined as unknown as Parameters<typeof verifier.verify>[0]),
    ).resolves.toMatchObject({ verified: false });
    await expect(
      verifier.verify({ platform: '', action: '' }),
    ).resolves.toMatchObject({ verified: false });
  });
});

// ── Steam adapter (existing detection, unchanged) ──────────

describe('SteamFollowActionVerifier', () => {
  it('verifies automatically when the follow is detected', async () => {
    const source = new FakeFollowSource({ following: true });
    const verifier = new SteamFollowActionVerifier(source, DEV_ID);

    const result = await verifier.verify({ platform: 'steam', action: 'follow' });

    expect(result).toMatchObject({
      verifierId: STEAM_FOLLOW_VERIFIER_ID,
      outcome: 'verified',
      verified: true,
      automatic: true,
    });
    // Detection still goes through the existing FollowSource contract.
    expect(source.checkedDeveloperIds).toEqual([DEV_ID]);
    expect(verifier.supportsAutomaticVerification()).toBe(true);
  });

  it('does not verify when the follow is not detected', async () => {
    const source = new FakeFollowSource({ following: false });
    const verifier = new SteamFollowActionVerifier(source, DEV_ID);

    const result = await verifier.verify({ platform: 'steam', action: 'follow' });

    expect(result).toMatchObject({ outcome: 'not-verified', verified: false, automatic: true });
    expect(source.followingChecks).toBe(1);
  });

  it('keeps automatic detection authoritative over self-attestation', async () => {
    // When the SDK can genuinely detect a non-follow, an attestation must not
    // override it — this preserves today's `refresh()` behaviour.
    const source = new FakeFollowSource({ following: false });
    const verifier = new SteamFollowActionVerifier(source, DEV_ID);

    const result = await verifier.verify({ platform: 'steam', action: 'follow', attested: true });

    expect(result.outcome).toBe('not-verified');
    expect(result.verified).toBe(false);
  });

  it('degrades to unavailable (no unlock) when Steam is absent', async () => {
    const source = new FakeFollowSource({ availability: 'unavailable', following: true });
    const verifier = new SteamFollowActionVerifier(source, DEV_ID);

    const result = await verifier.verify({ platform: 'steam', action: 'follow' });

    expect(result).toMatchObject({ outcome: 'unavailable', verified: false });
    // The source must not be asked to follow-check when the session is absent.
    expect(source.followingChecks).toBe(0);
  });

  it('honours the manual self-attest fallback when detection is unsupported', async () => {
    // Mirrors today's `claimManually()` path when the binding exposes no
    // `ISteamFriends::IsFollowing` call.
    const source = withoutAutomaticCheck(new FakeFollowSource({ following: false }));
    const verifier = new SteamFollowActionVerifier(source, DEV_ID);

    expect(verifier.supportsAutomaticVerification()).toBe(false);

    const pending = await verifier.verify({ platform: 'steam', action: 'follow' });
    expect(pending.outcome).toBe('unavailable');

    const attested = await verifier.verify({ platform: 'steam', action: 'follow', attested: true });
    expect(attested).toMatchObject({ outcome: 'verified', verified: true, automatic: false });
  });

  it('honours the manual fallback when no developer id is configured', async () => {
    const source = new FakeFollowSource({ following: true });
    const verifier = new SteamFollowActionVerifier(source, null);

    expect(verifier.supportsAutomaticVerification()).toBe(false);
    expect((await verifier.verify({ platform: 'steam', action: 'follow' })).outcome).toBe(
      'unavailable',
    );
    expect(source.followingChecks).toBe(0);

    expect(
      (await verifier.verify({ platform: 'steam', action: 'follow', attested: true })).outcome,
    ).toBe('verified');
  });

  it('is total: a throwing source degrades instead of propagating', async () => {
    const throwingSource = new FakeFollowSource({ following: true });
    throwingSource.isFollowing = async () => {
      throw new Error('steam blew up');
    };
    const verifier = new SteamFollowActionVerifier(throwingSource, DEV_ID);

    const result = await verifier.verify({ platform: 'steam', action: 'follow' });

    expect(result).toMatchObject({ outcome: 'unavailable', verified: false });
  });

  it('opens the action page through the source, or reports it cannot', async () => {
    const source = new FakeFollowSource({ openResult: true });
    const verifier = new SteamFollowActionVerifier(source, DEV_ID);
    expect(await verifier.openActionPage('steam://store/1')).toBe(true);
    expect(source.openedUrls).toEqual(['steam://store/1']);

    const noSource = new SteamFollowActionVerifier(null, DEV_ID);
    expect(await noSource.openActionPage('steam://store/1')).toBe(false);
  });

  it('is total: openActionPage never throws when the source throws', async () => {
    const source = new FakeFollowSource();
    source.openStorePage = async () => {
      throw new Error('boom');
    };
    const verifier = new SteamFollowActionVerifier(source, DEV_ID);
    await expect(verifier.openActionPage('steam://store/1')).resolves.toBe(false);
  });
});

// ── Config-driven resolution ───────────────────────────────

describe('ActionVerifierRegistry — resolution', () => {
  function registryWithSteam(source: FakeFollowSource): ActionVerifierRegistry {
    return createDefaultActionVerifierRegistry(source, DEV_ID);
  }

  it('always provides the manual self-attest default', () => {
    const registry = new ActionVerifierRegistry();
    // Constructed bare, the registry still resolves *something* total.
    expect(registry.resolve({ platform: 'unknown', action: 'whatever' }).id).toBe(
      SELF_ATTEST_VERIFIER_ID,
    );
  });

  it('defaults to the manual self-attest verifier when no config matches', () => {
    const registry = registryWithSteam(new FakeFollowSource());
    const verifier = registry.resolve({ platform: 'itch.io', action: 'follow' });
    expect(verifier).toBeInstanceOf(ManualSelfAttestVerifier);
  });

  it('resolves by platform from config', () => {
    const source = new FakeFollowSource();
    const registry = registryWithSteam(source);
    const verifier = registry.resolve(
      { platform: 'steam', action: 'follow' },
      { platforms: { steam: STEAM_FOLLOW_VERIFIER_ID } },
    );
    expect(verifier.id).toBe(STEAM_FOLLOW_VERIFIER_ID);
  });

  it('resolves by (platform, action), which beats the platform mapping', () => {
    const source = new FakeFollowSource();
    const registry = registryWithSteam(source);
    const config: ActionVerifierConfig = {
      platforms: { steam: SELF_ATTEST_VERIFIER_ID },
      actions: { [verifierKey('steam', 'follow')]: STEAM_FOLLOW_VERIFIER_ID },
    };
    const verifier = registry.resolve({ platform: 'steam', action: 'follow' }, config);
    expect(verifier.id).toBe(STEAM_FOLLOW_VERIFIER_ID);

    // A different action on the same platform falls back to the platform rule.
    expect(registry.resolve({ platform: 'steam', action: 'review' }, config).id).toBe(
      SELF_ATTEST_VERIFIER_ID,
    );
  });

  it('resolves by rule id, which beats platform/action mappings', () => {
    const source = new FakeFollowSource();
    const registry = registryWithSteam(source);
    const config: ActionVerifierConfig = {
      rules: { special: STEAM_FOLLOW_VERIFIER_ID },
      platforms: { steam: SELF_ATTEST_VERIFIER_ID },
    };
    expect(
      registry.resolve({ platform: 'steam', action: 'follow', ruleId: 'special' }, config).id,
    ).toBe(STEAM_FOLLOW_VERIFIER_ID);
  });

  it('is total: an unknown verifier id or malformed config falls back to the default', () => {
    const registry = registryWithSteam(new FakeFollowSource());
    const cases: Array<ActionVerifierConfig | null | undefined> = [
      { platforms: { steam: 'does-not-exist' } },
      { defaultVerifierId: 'does-not-exist' },
      { platforms: null as unknown as Record<string, string> },
      'garbage' as unknown as ActionVerifierConfig,
      null,
      undefined,
    ];
    for (const config of cases) {
      expect(() => registry.resolve({ platform: 'steam', action: 'follow' }, config)).not.toThrow();
      expect(registry.resolve({ platform: 'steam', action: 'follow' }, config).id).toBe(
        SELF_ATTEST_VERIFIER_ID,
      );
    }
  });

  it('is total: malformed resolution input never throws', () => {
    const registry = registryWithSteam(new FakeFollowSource());
    const badInputs: unknown[] = [undefined, null, {}, { platform: 5, action: null }, 'nope'];
    for (const input of badInputs) {
      const resolve = () =>
        registry.resolve(input as Parameters<typeof registry.resolve>[0]);
      expect(resolve).not.toThrow();
      expect(resolve().id).toBe(SELF_ATTEST_VERIFIER_ID);
    }
  });

  it('honours a config default verifier when nothing more specific matches', () => {
    const source = new FakeFollowSource();
    const registry = registryWithSteam(source);
    const verifier = registry.resolve(
      { platform: 'itch.io', action: 'follow' },
      { defaultVerifierId: STEAM_FOLLOW_VERIFIER_ID },
    );
    expect(verifier.id).toBe(STEAM_FOLLOW_VERIFIER_ID);
  });

  it('produces a deterministic resolution for equal inputs', () => {
    const source = new FakeFollowSource();
    const registry = registryWithSteam(source);
    const config: ActionVerifierConfig = { platforms: { steam: STEAM_FOLLOW_VERIFIER_ID } };
    const input = { platform: 'steam', action: 'follow' };
    expect(registry.resolve(input, config).id).toBe(registry.resolve(input, config).id);
  });

  it('exposes registered verifiers for diagnostics', () => {
    const source = new FakeFollowSource();
    const registry = registryWithSteam(source);
    expect(registry.has(SELF_ATTEST_VERIFIER_ID)).toBe(true);
    expect(registry.has(STEAM_FOLLOW_VERIFIER_ID)).toBe(true);
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.ids()).toEqual(
      expect.arrayContaining([SELF_ATTEST_VERIFIER_ID, STEAM_FOLLOW_VERIFIER_ID]),
    );
  });

  it('resolves a verifier directly from a platform-action rule', () => {
    const source = new FakeFollowSource();
    const registry = registryWithSteam(source);
    const config: ActionVerifierConfig = { platforms: { steam: STEAM_FOLLOW_VERIFIER_ID } };

    const rule = platformRule('steam-follow-rule', 'steam', 'follow');
    expect(resolveVerifierForRule(registry, rule, config).id).toBe(STEAM_FOLLOW_VERIFIER_ID);

    // A non-platform rule (or a malformed one) degrades to the default.
    const achievementRule = {
      id: 'ach-rule',
      trigger: { kind: 'achievement', achievementIds: ['x'] },
      target: { kind: 'game', gameId: 'g' },
    } as const;
    expect(resolveVerifierForRule(registry, achievementRule, config).id).toBe(
      SELF_ATTEST_VERIFIER_ID,
    );
    expect(
      resolveVerifierForRule(registry, null as unknown as typeof rule, config).id,
    ).toBe(SELF_ATTEST_VERIFIER_ID);
  });
});

// ── Extensibility: new platform = new verifier + config entry ──

describe('ActionVerifierRegistry — adding a new platform', () => {
  it('needs only a verifier implementing the interface plus a config entry', async () => {
    // A brand-new platform's verification method. It lives entirely outside
    // `action-verifiers.ts` (here, in the test) and implements only the public
    // `ActionVerifier` contract — no reward-service, store, or IPC change.
    class NewPlatformVerifier extends FakeActionVerifier {
      constructor() {
        super({ id: 'newstore-token', label: 'NewStore token check', verified: true });
      }
    }

    const newVerifier = new NewPlatformVerifier();
    const registry = new ActionVerifierRegistry()
      .register(new ManualSelfAttestVerifier())
      .register(newVerifier);

    const config: ActionVerifierConfig = {
      platforms: { 'brand-new-storefront': 'newstore-token' },
    };

    const resolved = registry.resolve(
      { platform: 'brand-new-storefront', action: 'follow' },
      config,
    );
    expect(resolved).toBe(newVerifier);

    const result = await resolved.verify({ platform: 'brand-new-storefront', action: 'follow' });
    expect(result).toMatchObject({ verified: true, verifierId: 'newstore-token' });

    // The manual default still covers every unconfigured platform, so the new
    // platform required no change to any other module.
    expect(registry.resolve({ platform: 'other', action: 'follow' }, config).id).toBe(
      SELF_ATTEST_VERIFIER_ID,
    );
  });

  it('resolves the new platform through a config entry without touching the registry default', () => {
    const fake = new FakeActionVerifier({ id: 'y', label: 'Y', verified: true });
    const registry = new ActionVerifierRegistry().register(new ManualSelfAttestVerifier()).register(fake);

    expect(
      registry.resolve({ platform: 'z', action: 'a' }, { actions: { [verifierKey('z', 'a')]: 'y' } })
        .id,
    ).toBe('y');
  });
});

// ── Names are data, not code ───────────────────────────────

describe('action verifiers — platform/action names are data', () => {
  it('behaves purely from the supplied names, not hard-coded ones', () => {
    const source = new FakeFollowSource();
    const registry = createDefaultActionVerifierRegistry(source, DEV_ID);

    // Deliberately arbitrary platform/action names resolve exactly as configured.
    const config: ActionVerifierConfig = {
      platforms: { 'totally-made-up-platform': STEAM_FOLLOW_VERIFIER_ID },
    };
    expect(
      registry.resolve({ platform: 'totally-made-up-platform', action: 'thing' }, config).id,
    ).toBe(STEAM_FOLLOW_VERIFIER_ID);
    expect(registry.resolve({ platform: 'steam', action: 'follow' }, config).id).toBe(
      SELF_ATTEST_VERIFIER_ID,
    );
  });
});
