# Core Engine: Spatial Rules API

Work item: CG-0MM5ZG7071KO7PVG

The core engine now provides a reusable 2D grid and adjacency/pathfinding API in `src/core-engine/SpatialRules.ts`.

## Exports

```ts
import {
  Grid,
  neighbors,
  computeAdjacencyBonus,
  pathExists,
  shortestPath,
  type Position,
  type DistanceMetric,
} from '@core-engine';
```

## Neighbor queries

```ts
const grid = new Grid<string>(5, 5, 'empty');
const around = neighbors(grid, { x: 2, y: 2 }, {
  range: 2,
  metric: 'manhattan', // 'manhattan' | 'chebyshev' | 'euclidean'
  includeDiagonals: true,
});
```

- `range` controls search radius.
- `metric` controls distance function.
- `includeDiagonals` can force orthogonal-only traversal.

## Adjacency bonus helper

```ts
const bonus = computeAdjacencyBonus(
  grid,
  { x: 2, y: 2 },
  (origin, neighbor) => origin === 'food' && neighbor === 'food',
  { range: 1, metric: 'manhattan', bonusPerMatch: 1 },
);
```

## Pathfinding

```ts
const found = pathExists(grid, { x: 0, y: 0 }, { x: 4, y: 4 }, {
  blocked: (p) => p.x === 1 && p.y === 0,
});

const path = shortestPath(grid, { x: 0, y: 0 }, { x: 4, y: 4 }, {
  cost: (p) => (p.x === 2 ? 3 : 1),
});
```

- Uses A* with deterministic tie-breaking.
- `cost` enables weighted path selection.
- `blocked` marks impassable positions.

## Main Street migration note

`example-games/main-street/MainStreetAdjacency.ts` keeps its public `neighbors(index, range)` signature for backward compatibility. Internally it now delegates to `@core-engine/SpatialRules` using a 1x10 `Grid` adapter. Existing Main Street behavior and tests are preserved.
