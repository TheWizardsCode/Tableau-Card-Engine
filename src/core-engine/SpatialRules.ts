export interface Position {
  x: number;
  y: number;
}

export type DistanceMetric = 'manhattan' | 'chebyshev' | 'euclidean';

export interface NeighborOptions {
  range?: number;
  metric?: DistanceMetric;
  includeDiagonals?: boolean;
}

export interface PathOptions extends NeighborOptions {
  blocked?: (position: Position) => boolean;
  cost?: (position: Position) => number;
  heuristic?: (from: Position, to: Position) => number;
  maxIterations?: number;
}

export interface PathExistsOptions extends PathOptions {
  returnPath?: boolean;
}

export interface AdjacencyBonusOptions extends NeighborOptions {
  bonusPerMatch?: number;
}

export type AdjacencyPredicate<T> = (
  origin: T | undefined,
  neighbor: T | undefined,
  neighborPosition: Position,
  originPosition: Position,
) => boolean;

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function keyToPosition(key: string): Position {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function distance(a: Position, b: Position, metric: DistanceMetric): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);

  switch (metric) {
    case 'manhattan':
      return dx + dy;
    case 'chebyshev':
      return Math.max(dx, dy);
    case 'euclidean':
      return Math.hypot(dx, dy);
    default:
      return dx + dy;
  }
}

export class Grid<T> {
  public readonly width: number;
  public readonly height: number;
  private readonly cells: T[];

  constructor(width: number, height: number, initialValue?: T | (() => T)) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Grid dimensions must be positive integers, got ${width}x${height}.`);
    }

    this.width = width;
    this.height = height;
    this.cells = new Array<T>(width * height);

    if (typeof initialValue === 'function') {
      for (let i = 0; i < this.cells.length; i++) {
        this.cells[i] = (initialValue as () => T)();
      }
    } else if (initialValue !== undefined) {
      this.cells.fill(initialValue);
    }
  }

  static fromArray<T>(width: number, height: number, values: T[]): Grid<T> {
    if (values.length !== width * height) {
      throw new Error(
        `Grid.fromArray expected ${width * height} values for ${width}x${height}, got ${values.length}.`,
      );
    }

    const grid = new Grid<T>(width, height);
    values.forEach((value, index) => {
      grid.cells[index] = value;
    });
    return grid;
  }

  inBounds(position: Position): boolean {
    return (
      position.x >= 0
      && position.x < this.width
      && position.y >= 0
      && position.y < this.height
    );
  }

  toIndex(position: Position): number {
    if (!this.inBounds(position)) {
      throw new Error(`Position (${position.x}, ${position.y}) is out of bounds.`);
    }
    return position.y * this.width + position.x;
  }

  fromIndex(index: number): Position {
    if (!Number.isInteger(index) || index < 0 || index >= this.cells.length) {
      throw new Error(`Index ${index} is out of bounds for grid size ${this.cells.length}.`);
    }

    return {
      x: index % this.width,
      y: Math.floor(index / this.width),
    };
  }

  get(position: Position): T | undefined {
    if (!this.inBounds(position)) {
      return undefined;
    }

    return this.cells[this.toIndex(position)];
  }

  set(position: Position, value: T): void {
    this.cells[this.toIndex(position)] = value;
  }
}

export function neighbors<T>(
  grid: Grid<T>,
  position: Position,
  options: NeighborOptions = {},
): Position[] {
  if (!grid.inBounds(position)) {
    return [];
  }

  const metric = options.metric ?? 'manhattan';
  const includeDiagonals = options.includeDiagonals ?? true;
  const range = Math.max(0, Math.floor(options.range ?? 1));

  if (range === 0) {
    return [];
  }

  const result: Position[] = [];

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      if (!includeDiagonals && dx !== 0 && dy !== 0) {
        continue;
      }

      const candidate = { x: position.x + dx, y: position.y + dy };
      if (!grid.inBounds(candidate)) {
        continue;
      }

      if (distance(position, candidate, metric) <= range) {
        result.push(candidate);
      }
    }
  }

  return result;
}

function defaultHeuristic(metric: DistanceMetric): (from: Position, to: Position) => number {
  return (from: Position, to: Position) => distance(from, to, metric);
}

function selectBestOpenNode(
  openSet: Set<string>,
  fScore: Map<string, number>,
  gScore: Map<string, number>,
): string {
  const ordered = Array.from(openSet).sort((a, b) => {
    const fa = fScore.get(a) ?? Number.POSITIVE_INFINITY;
    const fb = fScore.get(b) ?? Number.POSITIVE_INFINITY;
    if (fa !== fb) {
      return fa - fb;
    }

    const ga = gScore.get(a) ?? Number.POSITIVE_INFINITY;
    const gb = gScore.get(b) ?? Number.POSITIVE_INFINITY;
    if (ga !== gb) {
      return ga - gb;
    }

    return a.localeCompare(b);
  });

  return ordered[0];
}

function reconstructPath(cameFrom: Map<string, string>, currentKey: string): Position[] {
  const path: Position[] = [keyToPosition(currentKey)];
  let key = currentKey;

  while (cameFrom.has(key)) {
    key = cameFrom.get(key)!;
    path.push(keyToPosition(key));
  }

  return path.reverse();
}

export function shortestPath<T>(
  grid: Grid<T>,
  start: Position,
  goal: Position,
  options: PathOptions = {},
): Position[] | null {
  if (!grid.inBounds(start) || !grid.inBounds(goal)) {
    return null;
  }

  const metric = options.metric ?? 'manhattan';
  const includeDiagonals = options.includeDiagonals ?? false;
  const blocked = options.blocked ?? (() => false);
  const cost = options.cost ?? (() => 1);
  const heuristic = options.heuristic ?? defaultHeuristic(metric);
  const maxIterations = options.maxIterations ?? grid.width * grid.height * 10;

  const startKey = positionKey(start);
  const goalKey = positionKey(goal);

  if (blocked(start) || blocked(goal)) {
    return null;
  }

  const openSet = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();

  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, heuristic(start, goal)]]);

  let iterations = 0;

  while (openSet.size > 0 && iterations < maxIterations) {
    iterations += 1;

    const currentKey = selectBestOpenNode(openSet, fScore, gScore);
    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, currentKey);
    }

    openSet.delete(currentKey);
    const currentPosition = keyToPosition(currentKey);

    for (const next of neighbors(grid, currentPosition, {
      range: 1,
      metric,
      includeDiagonals,
    })) {
      if (blocked(next)) {
        continue;
      }

      const nextKey = positionKey(next);
      const tentativeG = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + cost(next);

      if (tentativeG < (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentativeG);
        fScore.set(nextKey, tentativeG + heuristic(next, goal));
        openSet.add(nextKey);
      }
    }
  }

  return null;
}

export function pathExists<T>(
  grid: Grid<T>,
  start: Position,
  goal: Position,
  options: PathExistsOptions = {},
): boolean | { path: Position[] } {
  const path = shortestPath(grid, start, goal, options);
  if (options.returnPath) {
    return path ? { path } : false;
  }
  return Boolean(path);
}

export function computeAdjacencyBonus<T>(
  grid: Grid<T>,
  origin: Position,
  predicate: AdjacencyPredicate<T>,
  options: AdjacencyBonusOptions = {},
): number {
  const bonusPerMatch = options.bonusPerMatch ?? 1;
  const originValue = grid.get(origin);

  if (!grid.inBounds(origin) || originValue === undefined) {
    return 0;
  }

  let bonus = 0;
  for (const adjacent of neighbors(grid, origin, options)) {
    const adjacentValue = grid.get(adjacent);
    if (predicate(originValue, adjacentValue, adjacent, origin)) {
      bonus += bonusPerMatch;
    }
  }

  return bonus;
}
