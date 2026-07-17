# Rule Engine: Economy Ledger API

Work item: CG-0MPWZ5RFI001DJUA

The rule engine provides a generic resource-tracking component for managing
mutable game economy values (coins, reputation, score). Extracted from the
Main Street game to provide reusable economy mutation semantics for any
tableau card game.

## Exports

```ts
import {
  createEconomyLedger,
  type EconomyLedger,
  type EconomyLedgerConfig,
  type EconomyConstraints,
  type ResourceDelta,
  type ResourceSnapshot,
} from '@rule-engine';
```

## Quick Start

```ts
const ledger = createEconomyLedger({ coins: 10, reputation: 3 });

// Check if a purchase is affordable (with constraints)
const purchaseLedger = createEconomyLedger({
  coins: 10,
  constraints: { minCoins: 0 },
});

if (purchaseLedger.canApply({ coins: -8 })) {
  purchaseLedger.apply({ coins: -8 }, 'buy-business');
}

// Earn income
ledger.apply({ coins: 5 }, 'income');

// Event resolution with multiple resources
ledger.apply({ coins: 3, reputation: 1 }, 'event-resolve');

// Set score directly (for games where score is independent)
ledger.setScore(150);

// Snapshot for undo/redo or save/load
const snapshot = ledger.snapshot();
// { coins: 15, reputation: 4, score: 150 }
```

## Design Principles

### No Built-in Loss Conditions

The EconomyLedger does **not** enforce bankruptcy, reputation collapse, or
other loss conditions. Coins and reputation are allowed to go negative. The
game engine is responsible for win/loss detection after mutations. This
matches the Main Street baseline where `checkImmediateLoss()` reads from
the resource bank after all mutations are applied.

### Purely Additive Semantics

All `apply` operations are purely additive — no multiplicative or clamping
behavior. Negative deltas subtract, positive deltas add. Unspecified fields
in a `ResourceDelta` are left unchanged.

### Constraints are Optional

By default, `canApply` always returns `true`. Constraints (`minCoins`,
`minReputation`) are opt-in and only affect `canApply` — they do **not**
prevent `apply` from executing. The caller is responsible for checking
`canApply` before calling `apply`.

### Score is Independent

Score is treated as an independent resource that can be set directly via
`setScore()`. Unlike coins and reputation (which use additive deltas via
`apply`), score can be set to any absolute value. Games that derive score
from other resources should compute it externally and call `setScore()`.

## API Reference

### `createEconomyLedger(config?)`

Factory function that creates a new `EconomyLedger` instance.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `config.coins` | `number` | `0` | Initial coin balance |
| `config.reputation` | `number` | `0` | Initial reputation |
| `config.score` | `number` | `0` | Initial score |
| `config.constraints` | `EconomyConstraints` | `{}` | Optional `canApply` constraints |

### `EconomyLedger` Interface

| Method | Description |
|--------|-------------|
| `get(resource)` | Returns current value of `coins`, `reputation`, or `score` |
| `snapshot()` | Returns a `ResourceSnapshot` copy of all current values |
| `canApply(delta)` | Checks if delta can be applied given constraints (always `true` without constraints) |
| `apply(delta, reason?)` | Applies additive deltas to specified resources |
| `setScore(value)` | Sets score to an absolute value |

### Types

```ts
interface ResourceDelta {
  coins?: number;
  reputation?: number;
  score?: number;
}

interface ResourceSnapshot {
  coins: number;
  reputation: number;
  score: number;
}

interface EconomyConstraints {
  minCoins?: number;
  minReputation?: number;
}
```

## Integration Notes

### Main Street Migration

Main Street currently manages economy directly on `state.resourceBank`.
To migrate, create an `EconomyLedger` during game setup and delegate all
resource mutations through it:

```ts
// Before (MainStreetEngine.ts):
state.resourceBank.coins -= card.cost;
state.resourceBank.coins += income;

// After:
ledger.apply({ coins: -card.cost }, 'purchase');
ledger.apply({ coins: income }, 'income');
```

The ledger's `snapshot()` method can replace manual resource bank cloning
for undo/redo, and `get()` provides a clean read API for UI display.

### Reputation Multiplier

The EconomyLedger does **not** include reputation-based coin scaling.
Games should apply the reputation multiplier upstream (before calling
`apply`) using their own `applyReputationMultiplier` function. This keeps
the ledger generic and avoids coupling it to Main Street's specific
multiplier formula.

## Tests

51 unit and integration tests are available in
`tests/rule-engine/EconomyLedger.test.ts`, covering:

- `get` / `snapshot` / `canApply` / `apply` / `setScore` semantics
- Invariant checks (no underflow guards, deterministic ordering, additive behavior)
- Integration parity with Main Street economy outcomes
- Direct `computeScore()` function equivalence
- Negative economy integration (bankruptcy, reputation collapse, combined)
