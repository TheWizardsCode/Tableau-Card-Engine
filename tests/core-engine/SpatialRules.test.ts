import { describe, it, expect } from 'vitest';

import {
  Grid,
  neighbors,
  shortestPath,
  pathExists,
  computeAdjacencyBonus,
  type Position,
} from '../../src/core-engine/SpatialRules';

function key(p: Position): string {
  return `${p.x},${p.y}`;
}

describe('SpatialRules', () => {
  describe('neighbors', () => {
    it('supports Manhattan, Chebyshev, and Euclidean metrics with range scaling', () => {
      const grid = new Grid<number>(5, 5);
      const center = { x: 2, y: 2 };

      const manhattan = neighbors(grid, center, {
        metric: 'manhattan',
        range: 2,
        includeDiagonals: true,
      });
      const chebyshev = neighbors(grid, center, {
        metric: 'chebyshev',
        range: 2,
        includeDiagonals: true,
      });
      const euclidean = neighbors(grid, center, {
        metric: 'euclidean',
        range: 2,
        includeDiagonals: true,
      });

      expect(manhattan).toHaveLength(12);
      expect(chebyshev).toHaveLength(24);
      expect(euclidean).toHaveLength(12);
    });

    it('handles edge clamping and orthogonal-only mode', () => {
      const grid = new Grid<number>(4, 4);
      const result = neighbors(grid, { x: 0, y: 0 }, {
        metric: 'manhattan',
        range: 2,
        includeDiagonals: false,
      });

      expect(result.map(key)).toEqual(['1,0', '2,0', '0,1', '0,2']);
    });
  });

  describe('pathfinding', () => {
    it('finds shortest path when unblocked', () => {
      const grid = new Grid<number>(5, 5);
      const path = shortestPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 });
      expect(path).not.toBeNull();
      expect(path?.map(key)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
    });

    it('routes around blocked cells', () => {
      const grid = new Grid<number>(5, 5);
      const blocked = new Set(['1,1', '2,1', '3,1']);

      const path = shortestPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 }, {
        blocked: (p) => blocked.has(key(p)),
      });

      expect(path).not.toBeNull();
      expect(path?.some((p) => blocked.has(key(p)))).toBe(false);
    });

    it('supports weighted costs and prefers cheaper routes', () => {
      const grid = new Grid<number>(3, 3);

      const path = shortestPath(grid, { x: 0, y: 1 }, { x: 2, y: 1 }, {
        cost: (p) => (p.x === 1 && p.y === 1 ? 10 : 1),
      });

      expect(path).not.toBeNull();
      expect(path?.map(key)).toEqual(['0,1', '0,0', '1,0', '2,0', '2,1']);
    });

    it('pathExists returns boolean and optional path payload', () => {
      const grid = new Grid<number>(3, 3);
      const blocked = new Set(['1,0', '1,1', '1,2']);

      const exists = pathExists(grid, { x: 0, y: 1 }, { x: 2, y: 1 }, {
        blocked: (p) => blocked.has(key(p)),
      });
      expect(exists).toBe(false);

      const withPath = pathExists(grid, { x: 0, y: 0 }, { x: 2, y: 0 }, {
        returnPath: true,
      });

      expect(withPath).toEqual({
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      });
    });
  });

  describe('computeAdjacencyBonus', () => {
    it('counts matching neighbors with configurable range and metric', () => {
      const grid = Grid.fromArray(3, 1, [
        { type: 'Food' },
        { type: 'Food' },
        { type: 'Culture' },
      ]);

      const bonus = computeAdjacencyBonus(
        grid,
        { x: 1, y: 0 },
        (value, neighbor) => Boolean(value && neighbor && value.type === neighbor.type),
        { metric: 'manhattan', range: 1, bonusPerMatch: 2, includeDiagonals: false },
      );

      expect(bonus).toBe(2);
    });
  });
});
