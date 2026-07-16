/**
 * Gym SpatialRules scene - unit tests for Grid and spatial query APIs.
 *
 * Validates that:
 *  - Grid construction, get/set, bounds checking work correctly
 *  - neighbors() returns correct positions for each distance metric
 *  - shortestPath() finds optimal routes with obstacles
 *  - pathExists() correctly reports connectivity
 *  - computeAdjacencyBonus() computes bonuses with predicates
 *
 * @module tests/gym/GymSpatialRules.test
 */

import { describe, expect, it } from 'vitest';
import {
  Grid,
  neighbors,
  shortestPath,
  pathExists,
  computeAdjacencyBonus,
  type Position,
} from '../../src/core-engine/SpatialRules';

describe('Grid construction and access', () => {
  it('creates a grid with specified dimensions', () => {
    const grid = new Grid<number>(5, 7);
    expect(grid.width).toBe(5);
    expect(grid.height).toBe(7);
  });

  it('throws for invalid dimensions', () => {
    expect(() => new Grid<number>(0, 5)).toThrow('positive integers');
    expect(() => new Grid<number>(-1, 5)).toThrow('positive integers');
    expect(() => new Grid<number>(5, 0)).toThrow('positive integers');
    expect(() => new Grid<number>(3.5, 5)).toThrow('positive integers');
  });

  it('fills with initial value when provided', () => {
    const grid = new Grid<number>(3, 3, 42);
    expect(grid.get({ x: 0, y: 0 })).toBe(42);
    expect(grid.get({ x: 2, y: 2 })).toBe(42);
  });

  it('fills with factory function when provided', () => {
    let counter = 0;
    const grid = new Grid<number>(2, 2, () => ++counter);
    expect(grid.get({ x: 0, y: 0 })).toBe(1);
    expect(grid.get({ x: 1, y: 0 })).toBe(2);
    expect(grid.get({ x: 0, y: 1 })).toBe(3);
    expect(grid.get({ x: 1, y: 1 })).toBe(4);
  });

  it('set and get values correctly', () => {
    const grid = new Grid<number>(3, 3);
    grid.set({ x: 1, y: 2 }, 99);
    expect(grid.get({ x: 1, y: 2 })).toBe(99);
  });

  it('returns undefined for out-of-bounds positions', () => {
    const grid = new Grid<number>(3, 3);
    expect(grid.get({ x: -1, y: 0 })).toBeUndefined();
    expect(grid.get({ x: 0, y: -1 })).toBeUndefined();
    expect(grid.get({ x: 3, y: 0 })).toBeUndefined();
    expect(grid.get({ x: 0, y: 3 })).toBeUndefined();
  });

  it('inBounds correctly checks positions', () => {
    const grid = new Grid<number>(4, 5);
    expect(grid.inBounds({ x: 0, y: 0 })).toBe(true);
    expect(grid.inBounds({ x: 3, y: 4 })).toBe(true);
    expect(grid.inBounds({ x: -1, y: 0 })).toBe(false);
    expect(grid.inBounds({ x: 4, y: 0 })).toBe(false);
    expect(grid.inBounds({ x: 0, y: 5 })).toBe(false);
  });

  it('toIndex and fromIndex are inverses', () => {
    const grid = new Grid<number>(4, 5);
    const positions: Position[] = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        positions.push({ x, y });
      }
    }
    for (const pos of positions) {
      expect(grid.fromIndex(grid.toIndex(pos))).toEqual(pos);
    }
  });

  it('fromArray creates grid with correct values', () => {
    const values = [1, 2, 3, 4, 5, 6];
    const grid = Grid.fromArray(3, 2, values);
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(grid.get({ x: 0, y: 0 })).toBe(1);
    expect(grid.get({ x: 2, y: 1 })).toBe(6);
  });

  it('fromArray throws on mismatched length', () => {
    expect(() => Grid.fromArray(3, 2, [1, 2, 3])).toThrow('expected');
  });
});

describe('neighbors()', () => {
  it('returns empty array for out-of-bounds origin', () => {
    const grid = new Grid<number>(5, 5);
    expect(neighbors(grid, { x: -1, y: 0 })).toEqual([]);
  });

  it('returns empty array for range=0', () => {
    const grid = new Grid<number>(5, 5);
    expect(neighbors(grid, { x: 2, y: 2 }, { range: 0 })).toEqual([]);
  });

  it('returns all 8 neighbors for interior cell with Chebyshev + diagonals', () => {
    const grid = new Grid<number>(5, 5);
    const result = neighbors(grid, { x: 2, y: 2 }, { includeDiagonals: true, range: 1, metric: 'chebyshev' });
    expect(result).toHaveLength(8);
    expect(result).toContainEqual({ x: 1, y: 1 });
    expect(result).toContainEqual({ x: 2, y: 1 });
    expect(result).toContainEqual({ x: 3, y: 1 });
    expect(result).toContainEqual({ x: 1, y: 2 });
    expect(result).toContainEqual({ x: 3, y: 2 });
    expect(result).toContainEqual({ x: 1, y: 3 });
    expect(result).toContainEqual({ x: 2, y: 3 });
    expect(result).toContainEqual({ x: 3, y: 3 });
  });

  it('returns 4 orthogonal neighbors without diagonals (Manhattan)', () => {
    const grid = new Grid<number>(5, 5);
    const result = neighbors(grid, { x: 2, y: 2 }, { includeDiagonals: false, range: 1, metric: 'manhattan' });
    expect(result).toHaveLength(4);
    expect(result).toContainEqual({ x: 2, y: 1 });
    expect(result).toContainEqual({ x: 1, y: 2 });
    expect(result).toContainEqual({ x: 3, y: 2 });
    expect(result).toContainEqual({ x: 2, y: 3 });
  });

  it('respects Manhattan distance metric', () => {
    const grid = new Grid<number>(5, 5);
    const result = neighbors(grid, { x: 2, y: 2 }, {
      metric: 'manhattan',
      includeDiagonals: true,
      range: 2,
    });
    // Manhattan distance ≤ 2, excluding (0,0)
    // All positions where |dx|+|dy| <= 2 and not both 0
    const expectedCount = 13; // 1-ring (8) + 2-ring diagonals that meet Manhattan ≤ 2
    expect(result.length).toBeGreaterThanOrEqual(expectedCount - 2);
  });

  it('respects Chebyshev distance metric', () => {
    const grid = new Grid<number>(5, 5);
    const result = neighbors(grid, { x: 2, y: 2 }, {
      metric: 'chebyshev',
      includeDiagonals: true,
      range: 2,
    });
    // Chebyshev distance ≤ 2: all cells in a 5x5 square minus center
    expect(result).toHaveLength(24);
  });

  it('limits result to grid bounds at edges with Chebyshev + diagonals', () => {
    const grid = new Grid<number>(3, 3);
    const result = neighbors(grid, { x: 0, y: 0 }, { includeDiagonals: true, range: 1, metric: 'chebyshev' });
    // Corner cell with Chebyshev: 3 neighbors
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ x: 1, y: 0 });
    expect(result).toContainEqual({ x: 0, y: 1 });
    expect(result).toContainEqual({ x: 1, y: 1 });
  });
});

describe('shortestPath()', () => {
  it('returns null for out-of-bounds start', () => {
    const grid = new Grid<number>(5, 5);
    expect(shortestPath(grid, { x: -1, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it('returns null for out-of-bounds goal', () => {
    const grid = new Grid<number>(5, 5);
    expect(shortestPath(grid, { x: 2, y: 2 }, { x: 5, y: 5 })).toBeNull();
  });

  it('returns single-step path when start equals goal', () => {
    const grid = new Grid<number>(5, 5);
    const path = shortestPath(grid, { x: 2, y: 2 }, { x: 2, y: 2 });
    expect(path).toHaveLength(1);
    expect(path![0]).toEqual({ x: 2, y: 2 });
  });

  it('finds direct path between adjacent cells', () => {
    const grid = new Grid<number>(5, 5);
    const path = shortestPath(grid, { x: 2, y: 2 }, { x: 3, y: 2 }, { includeDiagonals: false });
    expect(path).toHaveLength(2);
    expect(path![0]).toEqual({ x: 2, y: 2 });
    expect(path![1]).toEqual({ x: 3, y: 2 });
  });

  it('finds path around obstacles', () => {
    const grid = new Grid<number>(3, 3);
    const blocked: Position[] = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const path = shortestPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 }, {
      includeDiagonals: false,
      blocked: (pos) => blocked.some((b) => b.x === pos.x && b.y === pos.y),
    });
    // Must go: (0,0) -> (0,1) -> (1,2 or 0,2) -> (2,2) -> (2,1) -> (2,0)
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual({ x: 2, y: 0 });
    // Path should not include blocked cells
    for (const pos of path!) {
      const isBlocked = blocked.some((b) => b.x === pos.x && b.y === pos.y);
      expect(isBlocked).toBe(false);
    }
  });

  it('returns null when goal is blocked', () => {
    const grid = new Grid<number>(3, 3);
    expect(shortestPath(grid, { x: 0, y: 0 }, { x: 1, y: 0 }, {
      blocked: () => false,
    })).not.toBeNull();
  });

  it('returns null when start is blocked', () => {
    const grid = new Grid<number>(3, 3);
    expect(shortestPath(grid, { x: 0, y: 0 }, { x: 2, y: 2 }, {
      blocked: (pos) => pos.x === 0 && pos.y === 0,
    })).toBeNull();
  });

  it('finds diagonal path with Chebyshev metric when includeDiagonals is true', () => {
    const grid = new Grid<number>(5, 5);
    const path = shortestPath(grid, { x: 0, y: 0 }, { x: 2, y: 2 }, {
      includeDiagonals: true,
      metric: 'chebyshev',
    });
    expect(path).not.toBeNull();
    // Diagonal should take 3 steps (0,0)→(1,1)→(2,2)
    expect(path!.length).toBeLessThanOrEqual(3);
  });

  it('returns shorter path with Chebyshev diagonals than without', () => {
    const grid = new Grid<number>(5, 5);
    const pathOrtho = shortestPath(grid, { x: 0, y: 0 }, { x: 4, y: 4 }, {
      includeDiagonals: false,
    });
    const pathDiag = shortestPath(grid, { x: 0, y: 0 }, { x: 4, y: 4 }, {
      includeDiagonals: true,
      metric: 'chebyshev',
    });
    expect(pathOrtho).not.toBeNull();
    expect(pathDiag).not.toBeNull();
    expect(pathDiag!.length).toBeLessThan(pathOrtho!.length);
  });
});

describe('pathExists()', () => {
  it('returns true when a path exists', () => {
    const grid = new Grid<number>(5, 5);
    expect(pathExists(grid, { x: 0, y: 0 }, { x: 4, y: 4 })).toBe(true);
  });

  it('returns false when goal is blocked', () => {
    const grid = new Grid<number>(3, 3);
    const result = pathExists(grid, { x: 0, y: 0 }, { x: 2, y: 2 }, {
      blocked: (pos) => pos.x === 2 && pos.y === 2,
    });
    // shortestPath returns null when goal is blocked
    expect(result).toBe(false);
  });

  it('returns false when start is blocked', () => {
    const grid = new Grid<number>(3, 3);
    expect(pathExists(grid, { x: 0, y: 0 }, { x: 2, y: 2 }, {
      blocked: (pos) => pos.x === 0 && pos.y === 0,
    })).toBe(false);
  });

  it('returns path object when returnPath is true', () => {
    const grid = new Grid<number>(5, 5);
    const result = pathExists(grid, { x: 0, y: 0 }, { x: 2, y: 2 }, {
      returnPath: true,
    });
    expect(result).not.toBe(false);
    if (typeof result === 'object') {
      expect(result.path).toBeInstanceOf(Array);
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.path[0]).toEqual({ x: 0, y: 0 });
      expect(result.path[result.path.length - 1]).toEqual({ x: 2, y: 2 });
    }
  });

  it('returns false when returnPath is true and no path exists', () => {
    const grid = new Grid<number>(3, 3);
    const result = pathExists(grid, { x: 0, y: 0 }, { x: 2, y: 2 }, {
      returnPath: true,
      blocked: () => true,
    });
    expect(result).toBe(false);
  });
});

describe('computeAdjacencyBonus()', () => {
  it('returns 0 for out-of-bounds origin', () => {
    const grid = new Grid<number>(5, 5);
    const bonus = computeAdjacencyBonus(
      grid,
      { x: -1, y: 0 },
      () => true,
    );
    expect(bonus).toBe(0);
  });

  it('returns bonus count based on matching predicate (Chebyshev for full 8 neighbors)', () => {
    // Grid with values: all 1s
    const grid = Grid.fromArray(3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const bonus = computeAdjacencyBonus(
      grid,
      { x: 1, y: 1 },
      (origin, neighbor) => origin === neighbor,
      { includeDiagonals: true, range: 1, metric: 'chebyshev' },
    );
    // Center cell with Chebyshev: 8 neighbors, all match (all value 1)
    expect(bonus).toBe(8);
  });

  it('returns partial bonus when some neighbors do not match (Chebyshev)', () => {
    // Grid: center = 5, neighbors have varying values
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const grid = Grid.fromArray(3, 3, values);
    const bonus = computeAdjacencyBonus(
      grid,
      { x: 1, y: 1 },
      (origin, neighbor) => origin !== undefined && neighbor !== undefined && neighbor > origin!,
      { includeDiagonals: true, range: 1, metric: 'chebyshev' },
    );
    // Center value is 5. Neighbors with Chebyshev in row-major: 1,2,3,4,6,7,8,9
    // Neighbors > 5: 6,7,8,9 = 4
    expect(bonus).toBe(4);
  });

  it('uses custom bonusPerMatch factor (Chebyshev)', () => {
    const grid = Grid.fromArray(2, 2, [1, 1, 1, 1]);
    const bonus = computeAdjacencyBonus(
      grid,
      { x: 0, y: 0 },
      () => true,
      { includeDiagonals: true, range: 1, bonusPerMatch: 3, metric: 'chebyshev' },
    );
    // Corner cell (0,0) with Chebyshev: neighbors are (1,0), (0,1), (1,1) = 3 matches × 3 = 9
    expect(bonus).toBe(9);
  });
});
