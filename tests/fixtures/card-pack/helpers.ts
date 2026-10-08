/**
 * Shared access points for the card-pack fixtures
 * (CG-0MUZIRZYO008B01N, feature F1).
 *
 * These fixtures are the foundation for every card-pack test — manifest
 * parse/validate (F2), CSV merge (F3), the `tce-packs://` protocol (F4),
 * entitlement seams (F5), the renderer loader/listing (F6), and the reference
 * builder (F7). They stand in for a real `<contentDir>/packs/` tree without a
 * launcher, Steam, or a game repo.
 *
 * Two ways to consume them:
 *
 *  1. **On-disk committed variants** — {@link CARD_PACK_MANIFESTS} and
 *     {@link CARD_PACKS_DIR} for tests that `fs`-read a real tree (protocol
 *     handler, content locator).
 *  2. **Disposable materialised tree** — {@link materialiseCardPackFixture} /
 *     {@link withCardPackFixture} copy the committed tree into a fresh
 *     directory under `os.tmpdir()` and remove it on cleanup. This is the
 *     preferred path for any test that needs to *walk* a content directory; it
 *     keeps the committed fixtures read-only and isolates concurrent tests.
 *
 * In-memory manifest documents are built with {@link makeCardPackManifest} /
 * {@link makeCardPackManifestJson} — tests must not hand-roll pack JSON.
 *
 * Fixture layout (`tests/fixtures/card-pack/`):
 *   manifest.json                      — valid `{ version, packs[] }` (two packs)
 *   manifest-malformed.json            — malformed JSON (trailing comma)
 *   manifest-duplicate.json            — two packs sharing one id
 *   manifest-incompatible.json         — `coreEngineVersion: "^9.0.0"`
 *   packs/<gameId>/<packId>/cards.csv  — pack CSV fragment (Main Street schema)
 *   packs/<gameId>/<packId>/assets/…   — one deterministic asset per pack
 *
 * See `README.md` in this directory for provenance and licensing.
 */

import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the committed card-pack fixture directory. */
export const CARD_PACK_FIXTURE_DIR = HERE;

/** Absolute path to the committed `<contentDir>/packs/` source tree. */
export const CARD_PACKS_DIR = path.join(HERE, 'packs');

/** The `gameId` every committed pack belongs to. */
export const FIXTURE_GAME_ID = 'fixture-game';

/** The primary committed pack id (free, one business card). */
export const FIXTURE_PACK_ID = 'fixture-pack';

/** The second committed pack id (exercises additive multi-pack compose). */
export const FIXTURE_PACK_TWO_ID = 'fixture-pack-two';

/** Committed manifest variants, keyed by the scenario each exercises. */
export const CARD_PACK_MANIFESTS = {
  /** Valid `{ version, packs[] }` document with two compatible packs. */
  valid: path.join(HERE, 'manifest.json'),
  /** Malformed JSON (trailing comma) — parser must not throw. */
  malformed: path.join(HERE, 'manifest-malformed.json'),
  /** Two packs sharing the id `fixture-pack` — duplicate detection input. */
  duplicate: path.join(HERE, 'manifest-duplicate.json'),
  /** Valid shape, `coreEngineVersion: "^9.0.0"` — compatibility split input. */
  incompatible: path.join(HERE, 'manifest-incompatible.json'),
} as const;

/** Name of a committed manifest variant. */
export type CardPackManifestVariant = keyof typeof CARD_PACK_MANIFESTS;

/**
 * The core-engine version the committed valid packs are compatible with.
 * Mirrors `ENGINE_VERSION` in `src/core-engine/index.ts`.
 */
export const FIXTURE_COMPATIBLE_VERSION = '0.1.0';

/** A `coreEngineVersion` range the launcher must reject. */
export const FIXTURE_INCOMPATIBLE_RANGE = '^9.0.0';

/**
 * The exact header of `../tce-main-street/src/card-data.csv` (53 columns).
 *
 * Committed pack CSV fragments reuse it so tests can concatenate a synthetic
 * base pool and a pack fragment without hand-maintaining two schemas. Kept as
 * a string for direct concatenation / `computeMergedChecksum` inputs and as an
 * array ({@link CARD_PACK_CSV_COLUMNS}) for assertions.
 */
export const CARD_PACK_CSV_COLUMNS = [
  'family',
  'id',
  'name',
  'cost',
  'baseIncome',
  'synergyTypes',
  'upgradePath',
  'maxLevel',
  'reputationPerTurn',
  'synergyCoinBonus',
  'synergyRepBonus',
  'description',
  'tier',
  'trigger',
  'effect',
  'target',
  'targetSynergy',
  'coinDelta',
  'reputationDelta',
  'duration',
  'effectType',
  'multiplier',
  'targetBusiness',
  'incomeBonus',
  'synergyRangeBonus',
  'requiredLevel',
  'reputationBonus',
  'newDisplayName',
  'ongoingCost',
  'handSlotsAdded',
  'refreshCostDiscount',
  'actionsPerTurn',
  'peekOncePerTurn',
  'upgradeCostDiscount',
  'purchaseCostDiscount',
  'art_notes',
  'hasChoices',
  'acceptNextCardId',
  'rejectNextCardId',
  'availableWeekStart',
  'availableWeekEnd',
  'allowedBusinessTypes',
  'coinPercentDelta',
  'taxAuditRate',
  'storylineId',
  'storylineTitle',
  'unitTestStatus',
  'unitTestFailReason',
  'browserTestStatus',
  'browserTestFailReason',
  'marketRelevanceBias',
  'freeMarketRerollPerTurn',
  'drawWeight',
] as const;

/** {@link CARD_PACK_CSV_COLUMNS} joined with commas — the raw CSV header. */
export const CARD_PACK_CSV_HEADER = CARD_PACK_CSV_COLUMNS.join(',');

/** Optional entitlement declaration on a pack entry. */
export interface FixturePackEntitlement {
  /** Steam application id that unlocks the pack when owned. */
  readonly steamAppId: number;
}

/** One pack entry in the `<contentDir>/packs/manifest.json` document. */
export interface FixturePackEntry {
  /** Stable pack identifier (the pack directory name under `<gameId>/`). */
  readonly id: string;
  /** Game the pack extends. */
  readonly gameId: string;
  /** Display name shown in the in-game pack listing. */
  readonly title: string;
  /** Short description shown in the pack listing. */
  readonly description: string;
  /** Pack content version (independent of the game/engine version). */
  readonly version: string;
  /** Semver range of core-engine versions this pack supports. */
  readonly coreEngineVersion: string;
  /** Relative path (inside the pack directory) to the CSV fragment. */
  readonly cards: string;
  /** Optional relative asset paths inside the pack directory. */
  readonly assets?: string[];
  /** Optional entitlement gate; absent means the pack is free. */
  readonly entitlement?: FixturePackEntitlement;
}

/** Root document read from `<contentDir>/packs/manifest.json`. */
export interface FixtureCardPackManifest {
  /** Manifest schema version. */
  readonly version: number;
  /** Pack entries declared by the distribution operator. */
  readonly packs: FixturePackEntry[];
}

/** Build a fully-populated fixture pack entry, overriding only what a test cares about. */
export function defaultPackEntry(
  overrides: Partial<FixturePackEntry> = {},
): FixturePackEntry {
  return {
    id: FIXTURE_PACK_ID,
    gameId: FIXTURE_GAME_ID,
    title: 'Fixture Pack',
    description: 'Synthetic free card pack used by card-pack tests.',
    version: '1.0.0',
    coreEngineVersion: '^0.1.0',
    cards: 'cards.csv',
    assets: ['assets/icon.png'],
    ...overrides,
  };
}

/**
 * Build a manifest document. Pass an array of entries (each optionally a
 * partial override) and optional top-level overrides.
 */
export function makeCardPackManifest(
  packs: Partial<FixturePackEntry>[] = [{}],
  document: Partial<Omit<FixtureCardPackManifest, 'packs'>> = {},
): FixtureCardPackManifest {
  return {
    version: 1,
    ...document,
    packs: packs.map((pack) => defaultPackEntry(pack)),
  };
}

/** Serialise {@link makeCardPackManifest} to a JSON string. */
export function makeCardPackManifestJson(
  packs: Partial<FixturePackEntry>[] = [{}],
  document: Partial<Omit<FixtureCardPackManifest, 'packs'>> = {},
): string {
  return JSON.stringify(makeCardPackManifest(packs, document), null, 2);
}

/** Read a committed manifest variant as raw text (unparsed). */
export function readCardPackManifestVariant(
  variant: CardPackManifestVariant,
): string {
  return readFileSync(CARD_PACK_MANIFESTS[variant], 'utf-8');
}

/**
 * Absolute path to a pack directory in the committed fixture tree.
 *
 * @param packId Pack id (directory under `<gameId>/`).
 * @param gameId Game the pack belongs to; defaults to {@link FIXTURE_GAME_ID}.
 */
export function committedPackDir(
  packId: string = FIXTURE_PACK_ID,
  gameId: string = FIXTURE_GAME_ID,
): string {
  return path.join(CARD_PACKS_DIR, gameId, packId);
}

/** Read a committed pack CSV fragment (e.g. `cards.csv`) as raw text. */
export function readCommittedPackCsv(
  packId: string = FIXTURE_PACK_ID,
  filename = 'cards.csv',
  gameId: string = FIXTURE_GAME_ID,
): string {
  return readFileSync(path.join(committedPackDir(packId, gameId), filename), 'utf-8');
}

/** A materialised, disposable card-pack content directory. */
export interface MaterialisedCardPackFixture {
  /** The temporary `<contentDir>` root. */
  readonly contentDir: string;
  /** `<contentDir>/packs` — the discovered packs root. */
  readonly packsDir: string;
  /** `<contentDir>/packs/manifest.json` — the installed manifest. */
  readonly manifestPath: string;
  /** Absolute path to a pack directory inside the materialised `packs/` tree. */
  packDir(packId?: string, gameId?: string): string;
  /**
   * Remove {@link contentDir} and everything under it. Idempotent — safe to
   * call from both an explicit test step and `afterEach`.
   */
  cleanup(): void;
}

/** Options for {@link materialiseCardPackFixture}. */
export interface MaterialiseCardPackFixtureOptions {
  /**
   * Which committed manifest variant to install as
   * `<packs>/manifest.json`. Defaults to `'valid'`.
   */
  variant?: CardPackManifestVariant;
  /**
   * Override the manifest contents (installed verbatim). When set, `variant`
   * is ignored.
   */
  manifest?: string;
  /**
   * Extra files to write inside the materialised `packs/` tree, keyed by a
   * POSIX-style relative path (e.g. `fixture-game/fixture-pack/extra.csv`).
   * Parent directories are created automatically.
   */
  extraFiles?: Record<string, string | Uint8Array>;
}

/**
 * Copy the committed card-pack tree into a fresh disposable directory under
 * `os.tmpdir()` and install the requested manifest variant.
 *
 * The returned fixture owns the directory: call {@link
 * MaterialisedCardPackFixture.cleanup} when done (or use
 * {@link withCardPackFixture} to scope it automatically).
 */
export function materialiseCardPackFixture(
  options: MaterialiseCardPackFixtureOptions = {},
): MaterialisedCardPackFixture {
  const contentDir = mkdtempSync(path.join(os.tmpdir(), 'tce-card-pack-'));
  const packsDir = path.join(contentDir, 'packs');

  // Copy the whole committed `packs/` tree (all pack dirs + assets), then
  // install the requested manifest on top.
  cpSync(CARD_PACKS_DIR, packsDir, { recursive: true });
  const manifestPath = path.join(packsDir, 'manifest.json');
  if (options.manifest !== undefined) {
    writeFileSync(manifestPath, options.manifest, 'utf-8');
  } else {
    copyFileSync(CARD_PACK_MANIFESTS[options.variant ?? 'valid'], manifestPath);
  }

  for (const [relativePath, contents] of Object.entries(options.extraFiles ?? {})) {
    const target = path.join(packsDir, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }

  let cleaned = false;
  return {
    contentDir,
    packsDir,
    manifestPath,
    packDir(packId = FIXTURE_PACK_ID, gameId = FIXTURE_GAME_ID): string {
      return path.join(packsDir, gameId, packId);
    },
    cleanup(): void {
      if (cleaned) return;
      cleaned = true;
      rmSync(contentDir, { recursive: true, force: true });
    },
  };
}

/**
 * Run `fn` against a freshly materialised fixture and always clean up after
 * it, even when `fn` throws. Supports sync and async callbacks.
 */
export function withCardPackFixture<T>(
  fn: (fixture: MaterialisedCardPackFixture) => T,
  options: MaterialiseCardPackFixtureOptions = {},
): T {
  const fixture = materialiseCardPackFixture(options);
  try {
    const result = fn(fixture);
    if (result instanceof Promise) {
      return result.finally(() => fixture.cleanup()) as T;
    }
    fixture.cleanup();
    return result;
  } catch (error) {
    fixture.cleanup();
    throw error;
  }
}
