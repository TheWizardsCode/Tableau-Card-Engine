/**
 * Bonus-catalog loader (F3/F4, CG-0MSMAJQQT004SDCC).
 *
 * The catalog is **config-driven** so no game title is hard-coded in the
 * unlock logic (intake AC4). `bonusGameId` designates the single bundled game
 * unlocked by the Steam follow incentive; the rest remain locked and reserved
 * for future milestones.
 *
 * Pure Node (no Electron import) so it is unit-testable.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { BonusCatalog, BonusCatalogEntry } from './steam-follow.js';

export const DEFAULT_BONUS_CATALOG_FILE = 'bonus-catalog.json';

/** Directory of the loaded module (works under ESM). */
function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Load the bonus catalog.
 *
 * Returns `null` when the file is missing/invalid or the designated
 * `bonusGameId` does not resolve — callers treat that as "no unlock
 * configured" and degrade gracefully.
 */
export function loadBonusCatalog(options: { catalogPath?: string } = {}): BonusCatalog | null {
  const catalogPath = options.catalogPath ?? path.join(moduleDir(), DEFAULT_BONUS_CATALOG_FILE);
  if (!fs.existsSync(catalogPath)) return null;

  try {
    const raw = fs.readFileSync(catalogPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BonusCatalog>;
    if (typeof parsed.bonusGameId !== 'string' || !Array.isArray(parsed.games)) return null;

    const games = parsed.games.filter(isBonusEntry);
    if (games.length === 0) return null;

    const catalog: BonusCatalog = { bonusGameId: parsed.bonusGameId, games };
    if (!games.some((g) => g.id === catalog.bonusGameId)) return null;
    return catalog;
  } catch {
    return null;
  }
}

function isBonusEntry(value: unknown): value is BonusCatalogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.sceneKey === 'string' &&
    typeof entry.description === 'string'
  );
}
