/**
 * Core Engine: DifficultyPresets Generic API Tests
 *
 * Tests for createPresetLookup and getPresetNames using a mock
 * config type (no dependency on any example game).
 */
import { describe, it, expect } from 'vitest';

import {
  createPresetLookup,
  getPresetNames,
  type DifficultyConfig,
  type DifficultyPresetRegistry,
} from '../../src/core-engine/DifficultyPresets';

// ── Mock Types ──────────────────────────────────────────────

/** Game-specific config extending the generic DifficultyConfig. */
interface MockConfig extends DifficultyConfig {
  readonly startingGold: number;
  readonly maxTurns: number;
}

// ── Test Fixtures ───────────────────────────────────────────

const EASY: Readonly<MockConfig> = {
  difficultyName: 'Easy',
  startingGold: 100,
  maxTurns: 30,
};

const MEDIUM: Readonly<MockConfig> = {
  difficultyName: 'Medium',
  startingGold: 50,
  maxTurns: 20,
};

const HARD: Readonly<MockConfig> = {
  difficultyName: 'Hard',
  startingGold: 25,
  maxTurns: 10,
};

const REGISTRY: DifficultyPresetRegistry<MockConfig> = {
  Easy: EASY,
  Medium: MEDIUM,
  Hard: HARD,
};

// ── createPresetLookup ──────────────────────────────────────

describe('createPresetLookup', () => {
  it('returns the correct config for a known name', () => {
    const lookup = createPresetLookup(REGISTRY, MEDIUM);
    expect(lookup('Easy')).toBe(EASY);
    expect(lookup('Medium')).toBe(MEDIUM);
    expect(lookup('Hard')).toBe(HARD);
  });

  it('returns the default config for an unrecognized name', () => {
    const lookup = createPresetLookup(REGISTRY, MEDIUM);
    expect(lookup('Extreme')).toBe(MEDIUM);
  });

  it('returns the default config for undefined', () => {
    const lookup = createPresetLookup(REGISTRY, MEDIUM);
    expect(lookup(undefined)).toBe(MEDIUM);
  });

  it('returns the default config for empty string', () => {
    const lookup = createPresetLookup(REGISTRY, MEDIUM);
    expect(lookup('')).toBe(MEDIUM);
  });

  it('is case-sensitive (lowercase "easy" does not match "Easy")', () => {
    const lookup = createPresetLookup(REGISTRY, MEDIUM);
    expect(lookup('easy')).toBe(MEDIUM); // falls back to default
  });

  it('returns a function (not the config directly)', () => {
    const lookup = createPresetLookup(REGISTRY, MEDIUM);
    expect(typeof lookup).toBe('function');
  });

  it('works with a different default config', () => {
    const lookup = createPresetLookup(REGISTRY, HARD);
    expect(lookup(undefined)).toBe(HARD);
    expect(lookup('UnknownDifficulty')).toBe(HARD);
  });

  it('works with an empty registry (always returns default)', () => {
    const emptyRegistry: DifficultyPresetRegistry<MockConfig> = {};
    const lookup = createPresetLookup(emptyRegistry, EASY);
    expect(lookup('Easy')).toBe(EASY); // not in registry, returns default
    expect(lookup(undefined)).toBe(EASY);
  });

  it('works with a single-entry registry', () => {
    const singleRegistry: DifficultyPresetRegistry<MockConfig> = { Solo: HARD };
    const lookup = createPresetLookup(singleRegistry, MEDIUM);
    expect(lookup('Solo')).toBe(HARD);
    expect(lookup('Other')).toBe(MEDIUM);
  });
});

// ── getPresetNames ──────────────────────────────────────────

describe('getPresetNames', () => {
  it('returns all preset names from the registry', () => {
    const names = getPresetNames(REGISTRY);
    expect(names).toHaveLength(3);
    expect(names).toContain('Easy');
    expect(names).toContain('Medium');
    expect(names).toContain('Hard');
  });

  it('returns an empty array for an empty registry', () => {
    const emptyRegistry: DifficultyPresetRegistry<MockConfig> = {};
    const names = getPresetNames(emptyRegistry);
    expect(names).toHaveLength(0);
  });

  it('returns names in object key order', () => {
    // JS object keys preserve insertion order for string keys
    const ordered: DifficultyPresetRegistry<MockConfig> = {
      Alpha: EASY,
      Beta: MEDIUM,
      Gamma: HARD,
    };
    const names = getPresetNames(ordered);
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('returns a fresh array each call (not a cached reference)', () => {
    const names1 = getPresetNames(REGISTRY);
    const names2 = getPresetNames(REGISTRY);
    expect(names1).toEqual(names2);
    expect(names1).not.toBe(names2); // different array instances
  });
});

// ── DifficultyConfig interface ──────────────────────────────

describe('DifficultyConfig interface', () => {
  it('requires difficultyName field', () => {
    const config: DifficultyConfig = { difficultyName: 'Test' };
    expect(config.difficultyName).toBe('Test');
  });

  it('allows game-specific extensions', () => {
    const config: MockConfig = {
      difficultyName: 'Custom',
      startingGold: 75,
      maxTurns: 15,
    };
    expect(config.difficultyName).toBe('Custom');
    expect(config.startingGold).toBe(75);
    expect(config.maxTurns).toBe(15);
  });
});

// ── Module Isolation (US-23) ────────────────────────────────

describe('DifficultyPresets module isolation', () => {
  it('DifficultyPresets.ts has no example-games imports (US-23 AC#4)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/core-engine/DifficultyPresets.ts', 'utf-8');
    expect(source).not.toMatch(/example-games/);
  });

  it('DifficultyPresets.ts contains M6 extraction design notes (US-23 AC#5)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/core-engine/DifficultyPresets.ts', 'utf-8');
    expect(source).toMatch(/Design Notes.*M6|M6.*Design Notes|M6 Extraction/i);
  });
});
