/**
 * Achievement manifest loader — pure Node, no Electron, no Steamworks SDK.
 *
 * The achievement manifest (`achievement-manifest.json`) is the **single
 * source of truth** for the mapping:
 *
 *     game id ↔ achievement id ↔ Steam API name ↔ hidden flag
 *
 * It must match the static achievement configuration on the Steamworks
 * partner backend exactly. Steam silently drops an `SetAchievement` call
 * whose API name is not registered for the app, so drift between this file
 * and the backend is invisible at runtime unless explicitly validated.
 *
 * This module provides:
 *  - `loadAchievementManifest()` — parse + structural validation, returning
 *    `null` (never throwing) when the file is missing or invalid.
 *  - `validateAchievementManifest()` — semantic validation (duplicate ids /
 *    API names, empty entries) returning a list of non-fatal issues.
 *  - `findAchievement()` / `findEntry()` — lookups used by the sync service
 *    and by game-side tests that assert the game mapping matches the
 *    manifest (F7 drift check).
 *
 * Pure Node so it is unit-testable without the Electron runtime (mirrors
 * `steam-config.ts` and `bonus-catalog.ts`).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  AchievementManifest,
  AchievementManifestEntry,
  AchievementManifestFile,
} from './steam-achievements.js';

// Re-export the file shape for callers that import it from the loader.
export type { AchievementManifestFile } from './steam-achievements.js';

// ── Manifest file shape ─────────────────────────────────────

export const DEFAULT_ACHIEVEMENT_MANIFEST_FILE = 'achievement-manifest.json';
/** Current manifest format version. */
export const ACHIEVEMENT_MANIFEST_VERSION = 1;

// ── Validation issue types ──────────────────────────────────

export type ManifestIssueCode =
  | 'duplicate-game-id'
  | 'duplicate-achievement-id'
  | 'duplicate-steam-api-name'
  | 'empty-achievement-id'
  | 'empty-steam-api-name'
  | 'unsupported-version';

/** A single non-fatal manifest validation issue. */
export interface ManifestIssue {
  code: ManifestIssueCode;
  /** Human-readable diagnostic for logs. */
  message: string;
  /** The offending game id, when applicable. */
  gameId?: string;
  /** The offending achievement id, when applicable. */
  achievementId?: string;
  /** The offending Steam API name, when applicable. */
  steamApiName?: string;
}

/** Directory of the loaded module (works under ESM). */
function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

// ── Loading ─────────────────────────────────────────────────

export interface LoadAchievementManifestOptions {
  /** Explicit manifest path (tests). Defaults to the module directory. */
  manifestPath?: string;
}

/**
 * Load the achievement manifest.
 *
 * Returns `null` when the file is missing, unreadable, invalid JSON, or
 * structurally malformed — callers treat that as "achievements disabled" and
 * degrade gracefully (intake AC3). Never throws.
 */
export function loadAchievementManifest(
  options: LoadAchievementManifestOptions = {},
): AchievementManifestFile | null {
  const manifestPath =
    options.manifestPath ?? path.join(moduleDir(), DEFAULT_ACHIEVEMENT_MANIFEST_FILE);

  try {
    if (!fs.existsSync(manifestPath)) return null;
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return parseManifestFile(parsed);
  } catch {
    return null;
  }
}

/**
 * Parse and structurally validate a manifest object.
 *
 * Returns `null` when the shape is unusable; otherwise returns a manifest
 * with only structurally valid game/achievement entries (invalid entries are
 * dropped) so a single bad row cannot disable the whole manifest.
 */
export function parseManifestFile(value: unknown): AchievementManifestFile | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;

  const version = typeof obj.version === 'number' ? obj.version : ACHIEVEMENT_MANIFEST_VERSION;
  const rawGames = obj.games;
  if (!Array.isArray(rawGames)) return null;

  const games: AchievementManifest[] = [];
  for (const rawGame of rawGames) {
    const game = parseGame(rawGame);
    if (game) games.push(game);
  }

  return { version, games };
}

function parseGame(value: unknown): AchievementManifest | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const gameId = obj.gameId;
  if (typeof gameId !== 'string' || !gameId) return null;

  const rawAchievements = obj.achievements;
  if (!Array.isArray(rawAchievements)) return null;

  const achievements: AchievementManifestEntry[] = [];
  for (const rawEntry of rawAchievements) {
    const entry = parseEntry(rawEntry);
    if (entry) achievements.push(entry);
  }

  return { gameId, achievements };
}

function parseEntry(value: unknown): AchievementManifestEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const achievementId = obj.achievementId;
  const steamApiName = obj.steamApiName;
  const hidden = obj.hidden;

  if (typeof achievementId !== 'string' || !achievementId) return null;
  if (typeof steamApiName !== 'string' || !steamApiName) return null;
  if (typeof hidden !== 'boolean') return null;

  return { achievementId, steamApiName, hidden };
}

// ── Validation ──────────────────────────────────────────────

/**
 * Semantic validation of a manifest.
 *
 * Detects the drift conditions that would otherwise cause silently dropped
 * unlocks (intake AC4):
 *  - duplicate game ids,
 *  - duplicate achievement ids across the whole manifest (lookup ambiguity),
 *  - duplicate Steam API names across the whole manifest (Steam API names are
 *    unique per app),
 *  - empty id / API-name strings,
 *  - an unsupported manifest version.
 *
 * Returns an empty array when the manifest is clean. Non-fatal: callers log
 * the issues and continue.
 */
export function validateAchievementManifest(
  manifest: AchievementManifestFile,
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];

  if (manifest.version !== ACHIEVEMENT_MANIFEST_VERSION) {
    issues.push({
      code: 'unsupported-version',
      message: `Unsupported manifest version ${manifest.version} (expected ${ACHIEVEMENT_MANIFEST_VERSION}).`,
    });
  }

  const seenGameIds = new Set<string>();
  // Achievement ids and Steam API names are app-global, so uniqueness is
  // enforced across every game in the manifest, not just within one game.
  const seenAchievementIds = new Set<string>();
  const seenApiNames = new Set<string>();

  for (const game of manifest.games) {
    if (seenGameIds.has(game.gameId)) {
      issues.push({
        code: 'duplicate-game-id',
        message: `Duplicate game id '${game.gameId}'.`,
        gameId: game.gameId,
      });
    }
    seenGameIds.add(game.gameId);

    for (const entry of game.achievements) {
      if (!entry.achievementId) {
        issues.push({
          code: 'empty-achievement-id',
          message: `Empty achievement id in game '${game.gameId}'.`,
          gameId: game.gameId,
        });
      } else if (seenAchievementIds.has(entry.achievementId)) {
        issues.push({
          code: 'duplicate-achievement-id',
          message: `Duplicate achievement id '${entry.achievementId}' (also in game '${game.gameId}').`,
          gameId: game.gameId,
          achievementId: entry.achievementId,
        });
      }
      seenAchievementIds.add(entry.achievementId);

      if (!entry.steamApiName) {
        issues.push({
          code: 'empty-steam-api-name',
          message: `Empty Steam API name for achievement '${entry.achievementId}' in game '${game.gameId}'.`,
          gameId: game.gameId,
          achievementId: entry.achievementId,
        });
      } else if (seenApiNames.has(entry.steamApiName)) {
        issues.push({
          code: 'duplicate-steam-api-name',
          message: `Duplicate Steam API name '${entry.steamApiName}' (also in game '${game.gameId}').`,
          gameId: game.gameId,
          steamApiName: entry.steamApiName,
        });
      }
      seenApiNames.add(entry.steamApiName);
    }
  }

  return issues;
}

// ── Lookups ─────────────────────────────────────────────────

/** Find the per-game manifest for *gameId*, or `null` when absent. */
export function findGameManifest(
  manifest: AchievementManifestFile,
  gameId: string,
): AchievementManifest | null {
  return manifest.games.find((g) => g.gameId === gameId) ?? null;
}

/**
 * Resolve an achievement entry by game id + achievement id.
 *
 * Returns `null` when either the game or the achievement is unknown —
 * the sync service uses this to detect manifest drift.
 */
export function findAchievementEntry(
  manifest: AchievementManifestFile | null,
  gameId: string,
  achievementId: string,
): AchievementManifestEntry | null {
  if (!manifest) return null;
  const game = findGameManifest(manifest, gameId);
  if (!game) return null;
  return game.achievements.find((a) => a.achievementId === achievementId) ?? null;
}
