/**
 * Pluggable action-verification seam — pure Node, no Electron import
 * (CG-0MUZGBR3I006BAZ1, feature F2 of CG-0MUZF156A007OUIT).
 *
 * The launcher rewards content for arbitrary actions on arbitrary platforms
 * (`electron/unlock-rules.ts`, F1). *How* an action is verified differs per
 * platform, and some platforms expose no detection API at all. This module
 * makes verification **pluggable**:
 *
 *   - `ActionVerifier` — the seam. A verifier answers, for a resolved request,
 *     whether the player satisfied the action, whether verification was
 *     automatic, and (optionally) opens the action page.
 *   - `ManualSelfAttestVerifier` — the **default** verifier: the honour-system
 *     fallback for platforms with no detection API. It never verifies until
 *     the player explicitly attests.
 *   - `SteamFollowActionVerifier` — adapts the existing `FollowSource`
 *     (`electron/steam-follow.ts`) as one verifier. Its detection behaviour is
 *     **unchanged**: an available, capable source is authoritative; manual
 *     attestation is only the fallback when automatic detection is not
 *     possible (mirroring the existing `claimManually()` path).
 *   - `ActionVerifierRegistry` — resolves a verifier from config by rule,
 *     `(platform, action)`, platform, then a default.
 *
 * **Extensibility contract.** Adding a platform is a new `ActionVerifier`
 * implementation plus a config entry — the registry, reward service, store,
 * and IPC are untouched.
 *
 * **Totality contract.** Every resolution and verification path is total:
 * unknown platforms, missing verifiers, malformed config, and throwing sources
 * all degrade to a documented default and never throw.
 */
import type { FollowSource } from './steam-follow.js';
import type { UnlockRule } from './unlock-rules.js';

// ── Verifier ids ───────────────────────────────────────────

/** Registry id of the default manual self-attest verifier. */
export const SELF_ATTEST_VERIFIER_ID = 'manual-self-attest';

/** Registry id of the Steam follow-detection adapter. */
export const STEAM_FOLLOW_VERIFIER_ID = 'steam-follow';

// ── Verification request/result ────────────────────────────

/** Input to a verification: the action identity plus optional context. */
export interface ActionVerificationRequest {
  /** Platform the action was performed on — data, never hard-coded. */
  platform: string;
  /** Action performed on that platform — data, never hard-coded. */
  action: string;
  /**
   * URL to open for the action (config), used by `openActionPage`. Verifiers
   * that do not need it ignore it.
   */
  actionUrl?: string;
  /**
   * Whether the player has self-attested to completing the action. Only an
   * explicit `true` counts; every other value is treated as "no attestation".
   */
  attested?: boolean;
}

/**
 * Outcome of one verification attempt:
 *   - `'verified'`     — the action is satisfied.
 *   - `'not-verified'` — verification ran but the action is not satisfied.
 *   - `'unavailable'`  — verification could not run (e.g. Steam absent, no
 *                        detection API); the caller should offer self-attest.
 */
export type ActionVerificationOutcome = 'verified' | 'not-verified' | 'unavailable';

/** The result of a verification, with diagnostics for the UI. */
export interface ActionVerificationResult {
  /** `id` of the verifier that produced this result. */
  verifierId: string;
  outcome: ActionVerificationOutcome;
  /** Convenience flag: `true` iff `outcome === 'verified'`. */
  verified: boolean;
  /** Whether verification was automatic (no self-attestation involved). */
  automatic: boolean;
  /** Human-readable explanation for diagnostics/UI. Never a reason to branch on. */
  reason: string;
}

// ── Verifier contract ──────────────────────────────────────

/**
 * One pluggable verification method.
 *
 * The reward service depends only on this interface, so a new platform is a
 * new implementation plus a config entry. Every method is total — an
 * implementation must never throw.
 */
export interface ActionVerifier {
  /** Stable id referenced by config (e.g. `manual-self-attest`). */
  readonly id: string;
  /** Human-readable label for diagnostics/UI. */
  readonly label: string;
  /**
   * Whether this verifier can detect the action automatically. When `false`
   * the caller should offer the manual self-attest path instead.
   */
  supportsAutomaticVerification(): boolean;
  /**
   * Open the action page in a platform-native client when one exists.
   * Returns `false` when the verifier cannot open it (the caller falls back
   * to a browser). Never throws.
   */
  openActionPage(url: string): Promise<boolean>;
  /**
   * Verify the action. Never throws; a missing/malformed request or a failing
   * backend degrades to a non-verified/unavailable result.
   */
  verify(request?: ActionVerificationRequest): Promise<ActionVerificationResult>;
}

// ── Manual self-attest (the default) ───────────────────────

/**
 * The documented default verifier: an honour-system self-attest.
 *
 * Used for platforms that expose no detection API (e.g. an itch.io follow).
 * It never claims automatic detection and only verifies on an explicit
 * `attested: true`.
 */
export class ManualSelfAttestVerifier implements ActionVerifier {
  readonly id = SELF_ATTEST_VERIFIER_ID;
  readonly label = 'Manual self-attest';

  supportsAutomaticVerification(): boolean {
    return false;
  }

  async openActionPage(_url: string): Promise<boolean> {
    // No native client: the caller opens the action URL in a browser.
    return false;
  }

  async verify(request?: ActionVerificationRequest): Promise<ActionVerificationResult> {
    const attested = request?.attested === true;
    return {
      verifierId: this.id,
      outcome: attested ? 'verified' : 'not-verified',
      verified: attested,
      automatic: false,
      reason: attested
        ? 'Player attested to completing the action'
        : 'Awaiting player self-attestation',
    };
  }
}

// ── Steam follow adapter ───────────────────────────────────

/**
 * Adapts the existing Steam `FollowSource` as one `ActionVerifier`.
 *
 * Detection behaviour is unchanged from today's `SteamFollowService`:
 *   - an available source whose binding exposes `IsFollowing`, with a
 *     configured developer id, is authoritative — a detected non-follow is
 *     `not-verified` even if the player attests;
 *   - when automatic detection is impossible (Steam absent, no developer id,
 *     or the binding exposes no follow check) the verifier reports
 *     `unavailable` so the UI offers self-attest, and an explicit attestation
 *     verifies — mirroring `SteamFollowService.claimManually()`.
 */
export class SteamFollowActionVerifier implements ActionVerifier {
  readonly id = STEAM_FOLLOW_VERIFIER_ID;
  readonly label = 'Steam follow detection';

  constructor(
    private readonly source: FollowSource | null | undefined,
    private readonly developerSteamId: string | null | undefined,
  ) {}

  supportsAutomaticVerification(): boolean {
    return this.canAutoDetect();
  }

  async openActionPage(url: string): Promise<boolean> {
    if (!this.source) return false;
    try {
      return await this.source.openStorePage(url);
    } catch {
      return false;
    }
  }

  async verify(request?: ActionVerificationRequest): Promise<ActionVerificationResult> {
    const attested = request?.attested === true;
    try {
      if (this.canAutoDetect()) {
        if (!this.source!.isSteamAvailable()) {
          // Automatic detection is structurally available but Steam is absent.
          // An attestation still unlocks (today's `claimManually()` contract).
          return this.result(
            attested ? 'verified' : 'unavailable',
            false,
            attested ? 'Steam absent; verified by self-attestation' : 'Steam is not available',
          );
        }
        const following = await this.source!.isFollowing(this.developerSteamId!);
        return this.result(
          following ? 'verified' : 'not-verified',
          true,
          following ? 'Steam follow detected automatically' : 'Steam follow not detected',
        );
      }

      // Automatic detection is impossible on this source/config.
      return this.result(
        attested ? 'verified' : 'unavailable',
        false,
        attested
          ? 'Automatic detection unavailable; verified by self-attestation'
          : 'Automatic detection unavailable; awaiting self-attestation',
      );
    } catch {
      // A broken Steamworks session must never propagate.
      return this.result(
        attested ? 'verified' : 'unavailable',
        false,
        attested
          ? 'Detection failed; verified by self-attestation'
          : 'Steam detection failed',
      );
    }
  }

  /** Whether automatic detection can run for this source and config. */
  private canAutoDetect(): boolean {
    return (
      !!this.source &&
      this.source.followCheckSupported !== false &&
      typeof this.developerSteamId === 'string' &&
      this.developerSteamId.length > 0
    );
  }

  private result(
    outcome: ActionVerificationOutcome,
    automatic: boolean,
    reason: string,
  ): ActionVerificationResult {
    return { verifierId: this.id, outcome, verified: outcome === 'verified', automatic, reason };
  }
}

// ── Config-driven resolution ───────────────────────────────

/**
 * Config that resolves a `(platform, action)` (or a rule id) to a verifier id.
 *
 * Precedence, highest first:
 *   1. `rules[ruleId]`
 *   2. `actions[verifierKey(platform, action)]`
 *   3. `platforms[platform]`
 *   4. `defaultVerifierId`
 *   5. the manual self-attest verifier
 *
 * Every field is optional; an unknown verifier id is ignored and resolution
 * falls through to the default (never throws).
 */
export interface ActionVerifierConfig {
  /** Verifier id used when no more specific mapping matches. */
  defaultVerifierId?: string;
  /** `platform` → verifier id. */
  platforms?: Record<string, string>;
  /** `verifierKey(platform, action)` → verifier id. */
  actions?: Record<string, string>;
  /** Rule id → verifier id (a rule-level override). */
  rules?: Record<string, string>;
}

/** The inputs resolution needs about the action being verified. */
export interface ActionVerifierResolutionInput {
  platform: string;
  action: string;
  /** Optional rule id, enabling a rule-level override. */
  ruleId?: string;
}

/**
 * Stable config key for a `(platform, action)` pair. Each part is
 * percent-encoded so the `:` separator stays unambiguous.
 */
export function verifierKey(platform: string, action: string): string {
  return `${encodeURIComponent(platform)}:${encodeURIComponent(action)}`;
}

/**
 * Registry of available `ActionVerifier`s plus config-driven resolution.
 *
 * A registry always registers the manual self-attest verifier, so resolution
 * is total even for a bare `new ActionVerifierRegistry()`.
 */
export class ActionVerifierRegistry {
  private readonly verifiers = new Map<string, ActionVerifier>();
  private readonly fallback: ManualSelfAttestVerifier;
  private readonly defaultVerifierId: string;

  constructor(defaultVerifierId: string = SELF_ATTEST_VERIFIER_ID) {
    this.fallback = new ManualSelfAttestVerifier();
    this.register(this.fallback);
    this.defaultVerifierId =
      typeof defaultVerifierId === 'string' && defaultVerifierId.length > 0
        ? defaultVerifierId
        : SELF_ATTEST_VERIFIER_ID;
  }

  /** Register a verifier (idempotent by `id`; malformed values are ignored). */
  register(verifier: ActionVerifier): this {
    if (isActionVerifier(verifier)) this.verifiers.set(verifier.id, verifier);
    return this;
  }

  /** Register several verifiers. */
  registerAll(verifiers: readonly ActionVerifier[]): this {
    if (Array.isArray(verifiers)) for (const verifier of verifiers) this.register(verifier);
    return this;
  }

  /** Whether a verifier id is registered. */
  has(id: string): boolean {
    return this.verifiers.has(id);
  }

  /** The registered verifier for an id, or `undefined`. */
  get(id: string): ActionVerifier | undefined {
    return this.verifiers.get(id);
  }

  /** All registered verifier ids (for diagnostics). */
  ids(): string[] {
    return [...this.verifiers.keys()];
  }

  /**
   * Resolve the verifier for an action. Total: any unknown platform, missing
   * verifier, or malformed config/input degrades to the configured default
   * (ultimately the manual self-attest verifier).
   */
  resolve(
    input?: ActionVerifierResolutionInput | null,
    config?: ActionVerifierConfig | null,
  ): ActionVerifier {
    const cfg = isRecord(config) ? config : null;
    const fallback = this.resolveDefault(cfg);

    if (!isRecord(input)) return fallback;
    const platform = typeof input.platform === 'string' ? input.platform : '';
    const action = typeof input.action === 'string' ? input.action : '';
    const ruleId = typeof input.ruleId === 'string' ? input.ruleId : '';

    if (cfg) {
      if (ruleId) {
        const byRule = this.lookup(cfg.rules, ruleId);
        if (byRule) return byRule;
      }
      if (platform && action) {
        const byAction = this.lookup(cfg.actions, verifierKey(platform, action));
        if (byAction) return byAction;
      }
      if (platform) {
        const byPlatform = this.lookup(cfg.platforms, platform);
        if (byPlatform) return byPlatform;
      }
    }

    return fallback;
  }

  private resolveDefault(config: ActionVerifierConfig | null): ActionVerifier {
    if (config && typeof config.defaultVerifierId === 'string') {
      const configured = this.get(config.defaultVerifierId);
      if (configured) return configured;
    }
    return this.get(this.defaultVerifierId) ?? this.fallback;
  }

  private lookup(map: unknown, key: string): ActionVerifier | null {
    if (!isRecord(map)) return null;
    const id = map[key];
    if (typeof id !== 'string') return null;
    return this.get(id) ?? null;
  }
}

/**
 * Build a registry with the manual self-attest default and, when a Steam
 * source is supplied, the Steam follow adapter.
 */
export function createDefaultActionVerifierRegistry(
  steamSource?: FollowSource | null,
  developerSteamId?: string | null,
): ActionVerifierRegistry {
  const registry = new ActionVerifierRegistry();
  if (steamSource) {
    registry.register(new SteamFollowActionVerifier(steamSource, developerSteamId ?? null));
  }
  return registry;
}

/**
 * Resolve the verifier for an F1 rule. Only platform-action rules carry a
 * verifier; any other (or malformed) rule degrades to the default. Total.
 */
export function resolveVerifierForRule(
  registry: ActionVerifierRegistry,
  rule: UnlockRule | null | undefined,
  config?: ActionVerifierConfig | null,
): ActionVerifier {
  if (!isRecord(rule)) return registry.resolve(undefined, config);
  const ruleId = typeof rule.id === 'string' ? rule.id : undefined;
  const trigger = isRecord(rule.trigger) ? rule.trigger : null;
  if (
    trigger &&
    trigger.kind === 'platform-action' &&
    typeof trigger.platform === 'string' &&
    typeof trigger.action === 'string'
  ) {
    return registry.resolve({ platform: trigger.platform, action: trigger.action, ruleId }, config);
  }
  return registry.resolve({ platform: '', action: '', ruleId }, config);
}

// ── Deterministic fake ─────────────────────────────────────

export interface FakeActionVerifierOptions {
  /** Verifier id. Defaults to `'fake-action-verifier'`. */
  id?: string;
  /** Human-readable label. */
  label?: string;
  /** `supportsAutomaticVerification()` result. Defaults to `true`. */
  automatic?: boolean;
  /** `verify()` outcome when `outcome` is omitted. Defaults to `false`. */
  verified?: boolean;
  /** Force a specific `verify()` outcome. */
  outcome?: ActionVerificationOutcome;
  /** `openActionPage()` result. Defaults to `false`. */
  openResult?: boolean;
}

/**
 * Deterministic in-memory `ActionVerifier` for tests and for new-platform
 * fixtures. No timers, no RNG, no I/O; every call is explicit and recorded.
 */
export class FakeActionVerifier implements ActionVerifier {
  readonly id: string;
  readonly label: string;
  readonly automatic: boolean;
  readonly verified: boolean;
  readonly outcome: ActionVerificationOutcome | null;
  readonly openResult: boolean;

  /** Every request passed to `verify()`, in call order. */
  readonly verifyCalls: (ActionVerificationRequest | undefined)[] = [];
  /** Every URL passed to `openActionPage()`, in call order. */
  readonly openedUrls: string[] = [];
  /** Force `verify()` to throw, to prove the caller tolerates it. */
  verifyThrows = false;

  constructor(options: FakeActionVerifierOptions = {}) {
    this.id = options.id ?? 'fake-action-verifier';
    this.label = options.label ?? 'Fake action verifier';
    this.automatic = options.automatic ?? true;
    this.verified = options.verified ?? false;
    this.outcome = options.outcome ?? null;
    this.openResult = options.openResult ?? false;
  }

  supportsAutomaticVerification(): boolean {
    return this.automatic;
  }

  async openActionPage(url: string): Promise<boolean> {
    this.openedUrls.push(url);
    return this.openResult;
  }

  async verify(request?: ActionVerificationRequest): Promise<ActionVerificationResult> {
    this.verifyCalls.push(request);
    if (this.verifyThrows) throw new Error('FakeActionVerifier.verify() forced failure');
    const outcome = this.outcome ?? (this.verified ? 'verified' : 'not-verified');
    return {
      verifierId: this.id,
      outcome,
      verified: outcome === 'verified',
      automatic: this.automatic,
      reason: `FakeActionVerifier(${this.id}) outcome=${outcome}`,
    };
  }
}

// ── Internal guards ────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isActionVerifier(value: unknown): value is ActionVerifier {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.label === 'string' &&
    typeof value.supportsAutomaticVerification === 'function' &&
    typeof value.openActionPage === 'function' &&
    typeof value.verify === 'function'
  );
}
