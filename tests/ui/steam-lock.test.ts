/**
 * Unit tests for the Steam bonus lock computation (src/ui/steam-lock.ts).
 *
 * Pins the game-agnostic gating contract (F4, CG-0MSMAJQQT004SDCC): the
 * designated bonus is locked until the follow is confirmed, other catalog
 * games stay locked for future milestones, base content is never locked, and
 * the plain browser (no catalog) locks nothing (intake AC4/AC5).
 */
import { describe, it, expect } from 'vitest';
import {
  applySteamLocks,
  computeSteamLocks,
  STEAM_LOCK_FOLLOW,
  STEAM_LOCK_MILESTONE,
  STEAM_LOCK_UNAVAILABLE,
  type BonusCatalogLike,
} from '../../src/ui/steam-lock';
import type { GameEntry } from '../../src/ui/GameSelectorScene';

const GAMES: GameEntry[] = [
  { sceneKey: 'MainStreetScene', title: 'Main Street', description: 'Base content' },
  { sceneKey: 'FeudalismScene', title: 'Feudalism', description: 'Designated bonus' },
  { sceneKey: 'GolfScene', title: 'Golf', description: 'Reserved bonus' },
  { sceneKey: 'ColorettoScene', title: 'Coloretto', description: 'Reserved bonus' },
];

const CATALOG: BonusCatalogLike = {
  bonusGameId: 'feudalism',
  games: [
    { id: 'feudalism', title: 'Feudalism', sceneKey: 'FeudalismScene', description: 'Designated bonus' },
    { id: 'golf', title: 'Golf', sceneKey: 'GolfScene', description: 'Reserved bonus' },
    { id: 'coloretto', title: 'Coloretto', sceneKey: 'ColorettoScene', description: 'Reserved bonus' },
  ],
};

describe('computeSteamLocks()', () => {
  it('locks nothing in a plain browser (no catalog)', () => {
    expect(computeSteamLocks(GAMES, null, { state: 'locked' }).size).toBe(0);
    expect(computeSteamLocks(GAMES, undefined, null).size).toBe(0);
  });

  it('never locks base content outside the catalog', () => {
    const locks = computeSteamLocks(GAMES, CATALOG, { state: 'locked' });
    expect(locks.has('MainStreetScene')).toBe(false);
  });

  it('locks the designated bonus with the follow message while locked', () => {
    const locks = computeSteamLocks(GAMES, CATALOG, { state: 'locked' });
    expect(locks.get('FeudalismScene')).toBe(STEAM_LOCK_FOLLOW);
  });

  it('locks the other catalog games with milestone messaging', () => {
    const locks = computeSteamLocks(GAMES, CATALOG, { state: 'locked' });
    expect(locks.get('GolfScene')).toBe(STEAM_LOCK_MILESTONE);
    expect(locks.get('ColorettoScene')).toBe(STEAM_LOCK_MILESTONE);
  });

  it('uses the unavailable message for the bonus when Steam is unreachable', () => {
    const locks = computeSteamLocks(GAMES, CATALOG, { state: 'steam-unavailable' });
    expect(locks.get('FeudalismScene')).toBe(STEAM_LOCK_UNAVAILABLE);
  });

  it('unlocks exactly the chosen game once unlocked', () => {
    const locks = computeSteamLocks(GAMES, CATALOG, {
      state: 'unlocked',
      unlock: { unlocked: true, chosenGameId: 'feudalism' },
    });
    expect(locks.has('FeudalismScene')).toBe(false);
    // The reserved games remain locked.
    expect(locks.get('GolfScene')).toBe(STEAM_LOCK_MILESTONE);
  });

  it('is game-agnostic: a different designation changes the unlocked game', () => {
    const golfCatalog: BonusCatalogLike = { ...CATALOG, bonusGameId: 'golf' };
    const locked = computeSteamLocks(GAMES, golfCatalog, { state: 'locked' });
    expect(locked.get('GolfScene')).toBe(STEAM_LOCK_FOLLOW);
    expect(locked.get('FeudalismScene')).toBe(STEAM_LOCK_MILESTONE);

    const unlocked = computeSteamLocks(GAMES, golfCatalog, {
      state: 'unlocked',
      unlock: { unlocked: true, chosenGameId: 'golf' },
    });
    expect(unlocked.has('GolfScene')).toBe(false);
  });
});

describe('applySteamLocks()', () => {
  it('marks locked entries and leaves others unmarked without mutating input', () => {
    const locks = new Map([['FeudalismScene', STEAM_LOCK_FOLLOW]]);
    const result = applySteamLocks(GAMES, locks);

    expect(GAMES[1].locked).toBeUndefined();
    expect(result[1]).toMatchObject({ sceneKey: 'FeudalismScene', locked: true, lockMessage: STEAM_LOCK_FOLLOW });
    expect(result[0].locked).toBe(false);
    expect(result[2].locked).toBe(false);
  });
});
