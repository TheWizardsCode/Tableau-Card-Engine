# AI Module — Shared Core Engine Components

This module provides reusable AI abstractions for use across all tableau card
games built with the Tableau Card Engine.

## Components

### `AiPlayer<TStrategy>`

A generic wrapper that binds an [AI strategy](#aistrategybase) to a random
number generator (RNG). Game-specific player classes extend this and expose
decision methods that delegate to the strategy while hiding the `rng` parameter
from callers.

See [`AiStrategy.ts`](./AiStrategy.ts) for the base types and usage examples.

### `CardMemoryTracker`

A probabilistic memory system that simulates imperfect recall of observed cards
(e.g., cards seen on a discard pile). Designed as a drop-in component for AI
players that need to "remember" previously seen cards with configurable accuracy.

**Key features:**

- **Configurable skill rating (0–100):** Controls the probability of correctly
  recalling a card count. 100 = perfect recall, 0 = always misremembers.
- **Configurable `maxCopies`:** Sets the upper bound for random counts when the
  AI misremembers. Default is 4 (standard 52-card deck). Set to 8 for a double
  deck, or adjust per game requirements.
- **Deterministic testing:** Accepts an external RNG function, allowing tests
  to use seeded PRNGs for reproducible results.
- **Backward compatible:** The constructor accepts either a plain `skill`
  number (original API) or a configuration object with `skill` and `maxCopies`
  fields.

**Example usage:**

```ts
import { CardMemoryTracker, CardMemoryTrackerConfig } from '@ai/index';

// Default: skill=80, maxCopies=4 (for a standard 52-card deck)
const memory = new CardMemoryTracker();

// Double deck: skill=90, maxCopies=8
const memory = new CardMemoryTracker({ skill: 90, maxCopies: 8 });

// Record observed cards
memory.recordCard(createCard('Q', 'hearts', true));

// Query with a game RNG
const recalled = memory.getVisibleRanks(gameRng);
```

### `AiUtils`

Shared utility functions for AI decision-making:

- `pickRandom<T>(items: T[], rng: () => number): T` — Uniform random selection
- `pickBest<T>(items: T[], score: (item: T) => number, rng: () => number): T` —
  Scored selection with random tie-breaking

## Exports

All components are re-exported from the barrel file [`index.ts`](./index.ts):

```ts
export type { AiStrategyBase } from './AiStrategy';
export { AiPlayer } from './AiStrategy';
export { pickRandom, pickBest } from './AiUtils';
export { CardMemoryTracker, CardMemoryTrackerConfig } from './CardMemoryTracker';
```
