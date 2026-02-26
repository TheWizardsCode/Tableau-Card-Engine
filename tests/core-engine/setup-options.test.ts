import { describe, it, expect } from 'vitest';
import {
  resolveSetupOptions,
  resolveBaseSetupOptions,
  createSeededRng,
} from '../../src/core-engine/index';

describe('resolveBaseSetupOptions', () => {
  it('should default rng to Math.random when not provided', () => {
    const result = resolveBaseSetupOptions();
    expect(typeof result.rng).toBe('function');
    const val = result.rng();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('should default rng to Math.random when empty options provided', () => {
    const result = resolveBaseSetupOptions({});
    expect(typeof result.rng).toBe('function');
  });

  it('should preserve custom rng', () => {
    const customRng = () => 0.42;
    const result = resolveBaseSetupOptions({ rng: customRng });
    expect(result.rng).toBe(customRng);
    expect(result.rng()).toBe(0.42);
  });

  it('should produce deterministic results with seeded rng', () => {
    const rng1 = createSeededRng(123);
    const rng2 = createSeededRng(123);
    const result1 = resolveBaseSetupOptions({ rng: rng1 });
    const result2 = resolveBaseSetupOptions({ rng: rng2 });
    expect(result1.rng()).toBe(result2.rng());
    expect(result1.rng()).toBe(result2.rng());
  });
});

describe('resolveSetupOptions', () => {
  describe('default resolution', () => {
    it('should resolve to 2 players by default', () => {
      const { players } = resolveSetupOptions();
      expect(players).toHaveLength(2);
    });

    it('should resolve to 2 players when empty options provided', () => {
      const { players } = resolveSetupOptions({});
      expect(players).toHaveLength(2);
    });

    it('should generate default player names as "Player 1", "Player 2"', () => {
      const { players } = resolveSetupOptions({});
      expect(players[0].name).toBe('Player 1');
      expect(players[1].name).toBe('Player 2');
    });

    it('should set first player as human and rest as AI by default', () => {
      const { players } = resolveSetupOptions({});
      expect(players[0].isAI).toBe(false);
      expect(players[1].isAI).toBe(true);
    });

    it('should default rng to Math.random', () => {
      const { rng } = resolveSetupOptions({});
      expect(typeof rng).toBe('function');
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    });
  });

  describe('custom overrides', () => {
    it('should preserve custom player names', () => {
      const { players } = resolveSetupOptions({
        playerNames: ['Alice', 'Bob'],
      });
      expect(players[0].name).toBe('Alice');
      expect(players[1].name).toBe('Bob');
    });

    it('should preserve custom AI flags', () => {
      const { players } = resolveSetupOptions({
        isAI: [true, false],
      });
      expect(players[0].isAI).toBe(true);
      expect(players[1].isAI).toBe(false);
    });

    it('should preserve custom RNG exactly', () => {
      const customRng = () => 0.5;
      const { rng } = resolveSetupOptions({ rng: customRng });
      expect(rng).toBe(customRng);
      expect(rng()).toBe(0.5);
    });

    it('should respect custom player count', () => {
      const { players } = resolveSetupOptions({ playerCount: 4 });
      expect(players).toHaveLength(4);
      expect(players[0].name).toBe('Player 1');
      expect(players[3].name).toBe('Player 4');
    });

    it('should set all non-first players as AI with custom count', () => {
      const { players } = resolveSetupOptions({ playerCount: 4 });
      expect(players[0].isAI).toBe(false);
      expect(players[1].isAI).toBe(true);
      expect(players[2].isAI).toBe(true);
      expect(players[3].isAI).toBe(true);
    });

    it('should infer playerCount from playerNames length when not explicit', () => {
      const { players } = resolveSetupOptions({
        playerNames: ['A', 'B', 'C'],
      });
      expect(players).toHaveLength(3);
    });

    it('should use explicit playerCount over inferred from names', () => {
      const { players } = resolveSetupOptions({
        playerCount: 2,
        playerNames: ['A', 'B', 'C'],
      });
      expect(players).toHaveLength(2);
      expect(players[0].name).toBe('A');
      expect(players[1].name).toBe('B');
    });
  });

  describe('RNG determinism', () => {
    it('should produce deterministic results with seeded RNG', () => {
      const result1 = resolveSetupOptions({ rng: createSeededRng(42) });
      const result2 = resolveSetupOptions({ rng: createSeededRng(42) });
      // Both should produce the same sequence
      expect(result1.rng()).toBe(result2.rng());
      expect(result1.rng()).toBe(result2.rng());
      expect(result1.rng()).toBe(result2.rng());
    });

    it('should produce different results with different seeds', () => {
      const result1 = resolveSetupOptions({ rng: createSeededRng(1) });
      const result2 = resolveSetupOptions({ rng: createSeededRng(999) });
      // Extremely unlikely to produce the same first value
      const val1 = result1.rng();
      const val2 = result2.rng();
      expect(val1).not.toBe(val2);
    });
  });

  describe('edge cases', () => {
    it('should throw on playerCount 0', () => {
      expect(() => resolveSetupOptions({ playerCount: 0 })).toThrow(
        'at least 1 player',
      );
    });

    it('should throw on negative playerCount', () => {
      expect(() => resolveSetupOptions({ playerCount: -1 })).toThrow(
        'at least 1 player',
      );
    });

    it('should handle 1-player (solitaire) mode', () => {
      const { players } = resolveSetupOptions({ playerCount: 1 });
      expect(players).toHaveLength(1);
      expect(players[0].name).toBe('Player 1');
      expect(players[0].isAI).toBe(false);
    });

    it('should pad short playerNames with defaults', () => {
      const { players } = resolveSetupOptions({
        playerCount: 3,
        playerNames: ['Alice'],
      });
      expect(players[0].name).toBe('Alice');
      expect(players[1].name).toBe('Player 2');
      expect(players[2].name).toBe('Player 3');
    });

    it('should truncate long playerNames to playerCount', () => {
      const { players } = resolveSetupOptions({
        playerCount: 2,
        playerNames: ['A', 'B', 'C', 'D'],
      });
      expect(players).toHaveLength(2);
      expect(players[0].name).toBe('A');
      expect(players[1].name).toBe('B');
    });

    it('should pad short isAI with AI defaults', () => {
      const { players } = resolveSetupOptions({
        playerCount: 3,
        isAI: [false],
      });
      expect(players[0].isAI).toBe(false);
      expect(players[1].isAI).toBe(true);
      expect(players[2].isAI).toBe(true);
    });

    it('should truncate long isAI to playerCount', () => {
      const { players } = resolveSetupOptions({
        playerCount: 2,
        isAI: [true, false, true, false],
      });
      expect(players).toHaveLength(2);
      expect(players[0].isAI).toBe(true);
      expect(players[1].isAI).toBe(false);
    });

    it('should handle all-human configuration', () => {
      const { players } = resolveSetupOptions({
        playerCount: 3,
        isAI: [false, false, false],
      });
      expect(players.every((p) => !p.isAI)).toBe(true);
    });

    it('should handle all-AI configuration', () => {
      const { players } = resolveSetupOptions({
        playerCount: 3,
        isAI: [true, true, true],
      });
      expect(players.every((p) => p.isAI)).toBe(true);
    });
  });

  describe('type compatibility', () => {
    it('should return objects matching PlayerInfo shape', () => {
      const { players } = resolveSetupOptions({});
      for (const player of players) {
        expect(player).toHaveProperty('name');
        expect(player).toHaveProperty('isAI');
        expect(typeof player.name).toBe('string');
        expect(typeof player.isAI).toBe('boolean');
      }
    });

    it('should return a readonly players array', () => {
      const { players } = resolveSetupOptions({});
      // Players array is typed as readonly; verify length and access
      expect(players.length).toBeGreaterThan(0);
      expect(players[0]).toBeDefined();
    });
  });
});
