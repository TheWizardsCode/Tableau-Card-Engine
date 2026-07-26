# Balance Analysis Library API

This document describes the public API of the Main Street Balance Analysis Library, located at `scripts/balance/`.

## Module Overview

```
scripts/balance/
├── index.ts                          # Library entry point — re-exports all public API
├── engine/
│   ├── index.ts                      # Engine barrel file
│   ├── statistics.ts                 # Statistical helper functions (median, IQR, Gini, HHI, CI)
│   ├── card-metrics.ts               # Micro-level per-card metrics M1–M7
│   ├── global-metrics.ts             # Macro-level global metrics G1–G8
│   ├── baseline.ts                   # Baseline capture, validation, and loading
│   └── comparison.ts                 # Comparison engine with guardrail evaluation
├── guards/
│   └── thresholds.ts                 # Guardrail threshold definitions and evaluation
└── utils/
    └── statistics.ts                 # Re-export alias for backward compatibility
```

## Statistics Module (`engine/statistics.ts`)

Pure computation functions with no dependencies on Monte Carlo data.

### `median(data: number[]): number`

Returns the median value. Handles odd/even length arrays. Returns NaN for empty arrays.

**Example:**
```ts
median([1, 3, 5, 7, 9]); // → 5
median([1, 3, 5, 7]);    // → 4
median([]);               // → NaN
```

### `iqr(data: number[]): { q1: number; q3: number; iqr: number }`

Returns Q1, Q3, and interquartile range using the inclusive method.

**Example:**
```ts
iqr([1, 2, 3, 4, 5, 6, 7, 8, 9]);
// → { q1: 3, q3: 7, iqr: 4 }
```

### `gini(data: number[]): number`

Computes the Gini coefficient of inequality. Returns 0 for perfect equality, approaches 1 for extreme inequality. Applies sample correction (multiplies by n/(n-1)). Throws `TypeError` for empty arrays, negative values, or NaN.

**Example:**
```ts
gini([1, 1, 1, 1]);        // → 0 (perfect equality)
gini([0, 0, 0, 100]);      // → ~1 (high inequality)
gini([5, 10, 15, 20, 25]); // → ~0.33 (moderate)
```

### `hhi(data: number[]): number`

Computes the Herfindahl-Hirschman Index on a 0–10000 scale. Treats input as market shares (0–1 or 0–100). Returns 10000 for a single monopoly, lower for more diverse distributions. Throws `TypeError` for negative values.

**Example:**
```ts
hhi([1.0]);           // → 10000
hhi([0.5, 0.5]);      // → 5000
hhi([0.3, 0.3, 0.4]); // → 3400
```

### `confidenceInterval(data: number[], zScore?: number): ConfidenceIntervalResult`

Returns `{ lower, upper, marginOfError, mean, n }` for a confidence interval around the mean. Default z-score is 1.96 (95% confidence).

**Example:**
```ts
confidenceInterval([10, 12, 14, 16, 18, 20]);
// → { lower: 11.59, upper: 18.41, marginOfError: 3.41, mean: 15, n: 6 }
```

## Card Metrics Module (`engine/card-metrics.ts`)

### Exported Types

- **`CardTemplate`**: Card data from CSV (id, name, family, cost, baseIncome, synergyTypes, coinDelta, reputationDelta, upgradePath).
- **`CardMetricResult`**: `{ metricName, value, note?, dependentMetric? }`

### M1 — `computePickRate(cardId, runs)`

Returns purchases / market appearances. Returns null when `marketOffers` data is absent (empty arrays across all runs).

**Example:**
```ts
computePickRate('biz-bakery', runs);
// → { metricName: 'pickRate', value: 0.667, note: '2 purchases / 3 appearances' }
```

### M2 — `computeWinRateDelta(cardId, runs)`

Returns `winRateWhenOwned - winRateWhenNotOwned`. Returns null when `cardsOwned` is absent.

**Example:**
```ts
computeWinRateDelta('biz-bakery', runs);
// → { metricName: 'winRateDelta', value: 0.25, note: 'Owned: 8/10 = 80% | Not owned: 5/10 = 50%' }
```

### M3 — `computeCostToIncomeRatio(card)`

Returns cost / baseIncome from static CSV data. Returns Infinity when baseIncome is zero.

**Example:**
```ts
computeCostToIncomeRatio({ cost: 6, baseIncome: 2, ... });
// → { metricName: 'costToIncomeRatio', value: 3, note: '6 cost / 2 income = 3.00 turns' }
```

### M4 — `computeSynergyUtilization(cardId, runs, card)`

Returns null (requires per-source income breakdown not yet available in Monte Carlo harness).

### M5 — `computeUpgradeAdoption(upgradeCardId, parentCardId, runs)`

Returns upgrades / parent purchases. Returns null when `cardsOwned` absent.

**Example:**
```ts
computeUpgradeAdoption('upg-bakery-1', 'biz-bakery', runs);
// → { metricName: 'upgradeAdoption', value: 0.5, note: '3 upgrades / 6 parent purchases' }
```

### M6 — `computeEventImpactScore(eventCardId, runs, allCards)`

Returns `coinDelta + repDelta * 5` from CSV data. Returns null for unknown card IDs.

**Example:**
```ts
computeEventImpactScore('evt-festival', runs, cards);
// → { metricName: 'eventImpactScore', value: 8, note: 'coinDelta(3) + repDelta(1) × 5 = 8' }
```

### M7 — `computeSurvivalRate(cardId, runs)`

Returns wins(card owned) / runs(card owned). Returns null when card was never owned.

**Example:**
```ts
computeSurvivalRate('biz-bakery', runs);
// → { metricName: 'survivalRate', value: 0.75, note: '6 wins / 8 runs = 75.0%' }
```

## Global Metrics Module (`engine/global-metrics.ts`)

### Exported Types

- **`MetricsInput`**: Strategy×difficulty combination with aggregated metrics + per-run summaries.
- **`ScoreDistribution`**: `{ median, mean, q1, q3, iqr, min, max, stdDev, n }`
- **`EconomyHealthResult`**: `{ avgCoinsPerTurn, avgFinalCoins, avgTurns, note }`
- **`SynergyDiversityResult`**: `{ hhi, synergyShares }`
- **`LossModeResult`**: `{ lossShares: { bankruptcy, reputationCollapse, timeout }, totalLosses }`
- **`CardUsageDiversityResult`**: `{ value, uniqueCardsUsed, totalAppearances, metricName }`
- **`TurnByTurnSnapshot`**: `{ avgCoinsByTurn, avgReputationByTurn, avgScoreByTurn, maxTurnObserved }`
- **`TrapCardResult`**: `{ trapCardCount, trapCardIds, averageTrapWinRateDelta }`

### G1 — `computeWinRateByStrategy(combos)`

Returns `Record<strategy, Record<difficulty, number>>` with win rates for each strategy×difficulty combination. Returns empty record for empty input.

### G2 — `computeScoreDistribution(runs)`

Computes median, mean, Q1, Q3, IQR, min, max, stdDev from `finalScore` values. Returns null for fewer than 1 run.

### G3 — `computeEconomyHealth(runs)`

Returns `avgCoinsPerTurn`, `avgFinalCoins`, `avgTurns` from `economyHistory` data. Returns null when economy history absent.

### G4 — `computeSynergyDiversityIndex(runs, allCards)`

Returns null (HHI computation requires per-run grid synergy composition not yet in harness).

### G5 — `computeLossModeDecomposition(combos)`

Returns bankruptcy, reputation collapse, and timeout shares from loss reason data. Works immediately without Phase 1 data.

### G6 — `computeCardUsageDiversity(runs)`

Returns Gini coefficient of card appearance frequencies across won runs. Returns null when no won runs have card ownership data.

### G7 — `computeTurnByTurnSnapshots(runs)`

Returns average coins, reputation, and score at each turn across runs. Returns null when `economyHistory` absent.

### G8 — `computeTrapCardPrevalence(cardResults)`

Counts cards with winRateDelta < -10% AND pickRate > 20%. Returns null for empty input.

## Baseline Module (`engine/baseline.ts`)

### `captureBaseline(combinations, sourceInfo)`

Creates a `BaselineData` object from strategy×difficulty combination results with metadata.

**Example:**
```ts
const baseline = captureBaseline(combinations, { tool: 'balance-report', cardDataCsv: 'card-data.csv' });
```

### `validateBaselineShape(value)`

Type guard that validates an unknown object has the correct `BaselineData` shape.

**Example:**
```ts
const result = validateBaselineShape(parsedJSON);
if (!result.valid) console.error(result.errors);
```

### `loadBaseline(path)`

Loads a baseline from a JSON file path (Node.js only). Returns error object in browser context.

## Guardrails Module (`guards/thresholds.ts`)

### `GUARDRAIL_DEFINITIONS`

Readonly array of all 10 guardrail definitions from PRD §3.3 with `id`, `description`, `range: [lower, upper]`, and `severity` (critical | warning | info).

### `evaluateGuardrails(values, overrides?)`

Evaluates a set of metric values against guardrail thresholds. Returns `{ passed, flagged, failed, total, overall, results }` where `overall` is 'pass', 'flag', or 'fail'.

**Example:**
```ts
const result = evaluateGuardrails({ winRate_greedy_medium: 55 });
if (result.overall === 'fail') process.exit(1);
```

## Comparison Module (`engine/comparison.ts`)

### `compareMetrics(inputs, thresholdOverrides?)`

Compares current metrics against baseline values, computes deltas and percentage deltas, and evaluates against guardrail thresholds.

**Example:**
```ts
const report = compareMetrics([
  { id: 'winRate_greedy_medium', baseline: 45, current: 52 },
  { id: 'medianScore_greedy_medium', baseline: 150, current: 165 },
]);
console.log(report.summary.overall); // 'pass' | 'flag' | 'fail'
console.log(report.comparisons[0].deltaPct); // 15.56
```

Returns a `ComparisonReport` with `meta`, `summary`, `comparisons`, and `guardrails` sections conforming to PRD §6.5.

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-26 | Initial implementation of C-1 through C-6 |
