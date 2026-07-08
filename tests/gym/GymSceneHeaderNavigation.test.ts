/**
 * GymSceneHeaderNavigation Test Suite
 *
 * Unit tests for the Prev/Next navigation buttons added to Gym demo scenes
 * via GymSceneBase.initHeader().
 *
 * Tests:
 * - getAdjacentGymSceneKey wrap-around navigation logic
 * - GymRouterScene exclusion from navigation catalogue
 *
 * @module tests/gym/GymSceneHeaderNavigation
 */

import { describe, expect, it } from 'vitest';
import {
  GYM_SCENE_CATALOGUE,
  GYM_ROUTER_KEY,
  getAdjacentGymSceneKey,
} from '../../example-games/gym/GymRegistry';

// ── getAdjacentGymSceneKey tests ───────────────────────────

describe('getAdjacentGymSceneKey', () => {
  const CATALOGUE_KEYS = GYM_SCENE_CATALOGUE.map((e) => e.sceneKey);
  const FIRST_KEY = CATALOGUE_KEYS[0];
  const LAST_KEY = CATALOGUE_KEYS[CATALOGUE_KEYS.length - 1];
  const SECOND_KEY = CATALOGUE_KEYS[1];
  const SECOND_LAST_KEY = CATALOGUE_KEYS[CATALOGUE_KEYS.length - 2];

  it('returns the next scene key for the first entry', () => {
    expect(getAdjacentGymSceneKey(FIRST_KEY, 'next')).toBe(SECOND_KEY);
  });

  it('returns the previous scene key for the second entry', () => {
    expect(getAdjacentGymSceneKey(SECOND_KEY, 'prev')).toBe(FIRST_KEY);
  });

  it('wraps around: next on last scene returns first', () => {
    expect(getAdjacentGymSceneKey(LAST_KEY, 'next')).toBe(FIRST_KEY);
  });

  it('wraps around: prev on first scene returns last', () => {
    expect(getAdjacentGymSceneKey(FIRST_KEY, 'prev')).toBe(LAST_KEY);
  });

  it('navigates next from second-to-last to last', () => {
    expect(getAdjacentGymSceneKey(SECOND_LAST_KEY, 'next')).toBe(LAST_KEY);
  });

  it('navigates prev from second to first', () => {
    expect(getAdjacentGymSceneKey(SECOND_KEY, 'prev')).toBe(FIRST_KEY);
  });

  it('throws for an unknown scene key', () => {
    expect(() => getAdjacentGymSceneKey('NonExistentScene', 'next')).toThrow();
  });
});

// ── Router exclusion test ──────────────────────────────────

describe('GymRouterScene exclusion', () => {
  it('GYM_ROUTER_KEY is NOT in GYM_SCENE_CATALOGUE', () => {
    const routerInCatalogue = GYM_SCENE_CATALOGUE.some(
      (e) => e.sceneKey === GYM_ROUTER_KEY,
    );
    expect(routerInCatalogue).toBe(false);
  });
});
