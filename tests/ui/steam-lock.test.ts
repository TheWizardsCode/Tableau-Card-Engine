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
  isDlcUnlocked,
  isTargetUnlocked,
  STEAM_LOCK_ACTION,
  STEAM_LOCK_FOLLOW,
  STEAM_LOCK_MILESTONE,
  STEAM_LOCK_UNAVAILABLE,
  type BonusCatalogLike,
  type UnlockStateLike,
  type UnlockTargetLike,
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

/** A catalog whose golf entry is gated by an action-reward rule (`gatedBy`). */
const ACTION_CATALOG: BonusCatalogLike = {
  bonusGameId: 'feudalism',
  games: [
    { id: 'feudalism', title: 'Feudalism', sceneKey: 'FeudalismScene', description: 'Designated bonus' },
    {
      id: 'golf',
      title: 'Golf',
      sceneKey: 'GolfScene',
      description: 'Action-gated bonus',
      gatedBy: 'itchio-follow',
    },
  ],
};

/** The action-reward unlock targets used across the unified-state tests. */
const GOLF_TARGET: UnlockTargetLike = { kind: 'game', gameId: 'golf' };
const RIVERFRONT_DLC: UnlockTargetLike = { kind: 'dlc', gameId: 'main-street', dlcId: 'riverfront-pack' };

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

describe('isTargetUnlocked() / isDlcUnlocked() — one source of truth', () => {
  it('unlocks the follow-designated game when the follow is confirmed', () => {
    const state: UnlockStateLike = {
      follow: { state: 'unlocked', unlock: { unlocked: true, chosenGameId: 'feudalism' } },
    };

    expect(isTargetUnlocked({ kind: 'game', gameId: 'feudalism' }, state)).toBe(true);
    expect(isTargetUnlocked({ kind: 'game', gameId: 'golf' }, state)).toBe(false);
  });

  it('unlocks a game target unlocked by an action-reward record', () => {
    const state: UnlockStateLike = { unlockedTargets: [GOLF_TARGET] };

    expect(isTargetUnlocked(GOLF_TARGET, state)).toBe(true);
    expect(isTargetUnlocked({ kind: 'game', gameId: 'coloretto' }, state)).toBe(false);
  });

  it('reports a DLC target locked or unlocked from the same state', () => {
    expect(isDlcUnlocked('main-street', 'riverfront-pack', { unlockedTargets: [GOLF_TARGET] })).toBe(false);

    const unlockedState: UnlockStateLike = { unlockedTargets: [GOLF_TARGET, RIVERFRONT_DLC] };
    expect(isDlcUnlocked('main-street', 'riverfront-pack', unlockedState)).toBe(true);
    // A different DLC in the same game is unaffected.
    expect(isDlcUnlocked('main-street', 'other-pack', unlockedState)).toBe(false);
    // A DLC target is never unlocked by the follow reward.
    expect(isDlcUnlocked('main-street', 'riverfront-pack', {
      follow: { state: 'unlocked', unlock: { unlocked: true, chosenGameId: 'main-street' } },
    })).toBe(false);
  });

  it('is total: null/undefined/malformed state and target report not-unlocked', () => {
    expect(isTargetUnlocked(null, null)).toBe(false);
    expect(isTargetUnlocked(undefined, undefined)).toBe(false);
    expect(isTargetUnlocked({ kind: 'game', gameId: '' }, {})).toBe(false);
    expect(isDlcUnlocked('main-street', 'riverfront-pack', null)).toBe(false);

    const malformed = { unlockedTargets: [null, { kind: 'bogus' }] } as unknown as UnlockStateLike;
    expect(isTargetUnlocked(GOLF_TARGET, malformed)).toBe(false);
  });
});

describe('action-reward gating in the Game Selector', () => {
  it('uses the action message for a gated entry, then unlocks it from the unified state', () => {
    const locked = computeSteamLocks(GAMES, ACTION_CATALOG, { state: 'locked' });
    expect(locked.get('GolfScene')).toBe(STEAM_LOCK_ACTION);

    const unlocked = computeSteamLocks(GAMES, ACTION_CATALOG, { state: 'locked' }, [GOLF_TARGET]);
    expect(unlocked.has('GolfScene')).toBe(false);
    // The follow-designated game is still locked, and a non-catalog game is free.
    expect(unlocked.get('FeudalismScene')).toBe(STEAM_LOCK_FOLLOW);
    expect(unlocked.has('MainStreetScene')).toBe(false);
  });

  it('renders the selector consistently with the in-game DLC check for the same state', () => {
    const state: UnlockStateLike = { unlockedTargets: [GOLF_TARGET, RIVERFRONT_DLC] };

    // Selector: the action-reward game target renders unlocked.
    const locks = computeSteamLocks(GAMES, ACTION_CATALOG, { state: 'locked' }, state.unlockedTargets);
    expect(locks.has('GolfScene')).toBe(false);

    // In-game: the DLC target is unlocked in the same state, through the shared
    // predicate, so both agree on "unlocked".
    expect(isDlcUnlocked('main-street', 'riverfront-pack', state)).toBe(true);
    expect(isTargetUnlocked(GOLF_TARGET, state)).toBe(true);
  });
});
