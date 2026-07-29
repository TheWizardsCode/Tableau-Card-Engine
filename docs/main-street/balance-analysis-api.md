# Balance Analysis Library — API Reference

> **Location:** `scripts/balance/`
>
> **Status:** Phase 2 — Core Library Implementation Complete
>
> This document describes every public export in the Balance Analysis Library. Each module is documented with its purpose, function signatures, type definitions, and usage examples.

---

## Table of Contents

1. [Engine Module Index](#engine-module-index)
2. [Statistics (`engine/statistics.ts`)](#engine-statistics)
3. [Card Metrics (`engine/card-metrics.ts`)](#engine-card-metrics)
4. [Global Metrics (`engine/global-metrics.ts`)](#engine-global-metrics)
5. [Comparison (`engine/comparison.ts`)](#engine-comparison)
6. [Baseline (`engine/baseline.ts`)](#engine-baseline)
7. [Guardrail Thresholds (`guards/thresholds.ts`)](#guards-thresholds)

---

## Engine Module Index

**File:** `scripts/balance/engine/index.ts`

Barrel file that re-exports all public functions and types from engine sub-modules. Import from here:

```ts
import {
  median, iqr, gini,
  computePickRate, computeWinRateDelta,
  computeScoreDistribution,
  compareMetrics,
  captureBaseline,
  // ... etc
} from '../../scripts/balance/engine';
```

---

## `engine/statistics.ts` {#engine-statistics}

Fundamental statistical helpers for balance analysis. All functions are pure, typed, and handle edge cases (empty arrays, single elements, negative values).

### Exports

| Function | Returns | Description |
|----------|---------|-------------|
| `median(data)` | `number` | Median of a sorted numeric array. Handles odd/even length, empty (NaN), single-element. |
| `iqr(data)` | `IqrResult` | First quartile, third quartile, and IQR using exclusive method. |
| `gini(data)` | `number` | Gini coefficient (0 = perfect equality, 1 = perfect inequality). Throws on negatives. |
| `hhi(shares)` | `number` | Herfindahl-Hirschman Index (0–10000). Sums of squared shares × 10000. |
| `confidenceInterval(data, z)` | `ConfidenceIntervalResult` | { lower, upper, marginOfError } for given z-score. |

### Types

```ts
interface IqrResult { q1: number; q3: number; iqr: number }
interface ConfidenceIntervalResult { lower: number; upper: number; marginOfError: number }
```

### Examples

```ts
median([1, 3, 5]);              // 3
iqr([1, 2, 3, 4, 5]);           // { q1: 1.5, q3: 4.5, iqr: 3 }
gini([1, 1, 1]);                 // 0 (perfect equality)
hhi([0.5, 0.3, 0.2]);           // 3800 (2500 + 900 + 400)
confidenceInterval([0,1,1,1,0], 1.96); // { lower, upper, marginOfError }
```

---

## `engine/card-metrics.ts` {#engine-card-metrics}

Per-card micro metrics (M1–M7). Each function accepts a card ID and an array of `MonteCarloRunSummary` objects (which may include Phase 1 extended fields). Functions depending on Phase 1 data return `null` when the required field is absent.

### Exports

| Function | Returns | Description |
|----------|---------|-------------|
| `computePickRate(cardId, runs)` | `PickRateResult \| null` | M1: purchases / market appearances. |
| `computeWinRateDelta(cardId, runs)` | `WinRateDeltaResult \| null` | M2: winRate(owned) − winRate(not owned). |
| `computeCostToIncomeRatio(input)` | `number` | M3: cost / baseIncome. Infinity for zero income. |
| `computeSynergyUtilization(cardId, runs)` | `SynergyUtilizationResult \| null` | M4: actual synergy / max possible synergy. |
| `computeUpgradeAdoption(upgradeId, parentId, runs)` | `UpgradeAdoptionResult \| null` | M5: upgrades / parent purchases. |
| `computeEventImpactScore(cardId, runs, fallback?)` | `EventImpactResult` | M6: avg(coinDelta + repDelta × 5). |
| `computeSurvivalRate(cardId, runs)` | `SurvivalRateResult \| null` | M7: wins(owned) / runs(owned). |

### Types

```ts
interface PickRateResult { value: number; purchases: number; appearances: number }
interface WinRateDeltaResult { value: number; winRateWhenOwned: number; winRateWhenNotOwned: number; ownedRuns: number; notOwnedRuns: number }
interface CostToIncomeInput { cost: number; baseIncome: number }
interface SynergyUtilizationResult { value: number; actualBonuses: number; maxPossibleBonuses: number }
interface UpgradeAdoptionResult { value: number; parentPurchases: number; upgrades: number }
interface EventImpactResult { value: number; occurrences: number; reputationWeight: number }
interface SurvivalRateResult { value: number; ownedRuns: number; wins: number }
interface CardDeltas { coinDelta: number; reputationDelta: number }
```

### Phase 1 Dependencies

| Metric | Required Field | Behaviour When Absent |
|--------|---------------|----------------------|
| M1 (Pick Rate) | `marketOffers` | Returns `null` |
| M2 (Win-Rate Delta) | `cardsOwned` | Returns `null` |
| M4 (Synergy Util.) | `incomeBreakdown` | Returns `null` |
| M5 (Upgrade Adopt.) | `cardsOwned` | Returns `null` |
| M7 (Survival Rate) | `cardsOwned` | Returns `null` |
| M3, M6 | None (static / fallback) | Always works |

### Examples

```ts
import { computePickRate } from '../../scripts/balance/engine';

const runs: MonteCarloRunSummary[] = [
  { seed: 's1', result: 'win', ..., cardsOwned: ['biz-bakery'], marketOffers: ['biz-bakery', 'biz-cafe'] },
  { seed: 's2', result: 'loss', ..., cardsOwned: ['biz-cafe'], marketOffers: ['biz-bakery', 'biz-cafe'] },
];

const pr = computePickRate('biz-bakery', runs);
// { value: 0.5, purchases: 1, appearances: 2 }

const delta = computeWinRateDelta('biz-bakery', runs);
// { value: 0.5, winRateWhenOwned: 1, winRateWhenNotOwned: 0.5, ownedRuns: 1, notOwnedRuns: 1 }
```

---

## `engine/global-metrics.ts` {#engine-global-metrics}

Macro-level global metrics (G1–G8). Functions depending on Phase 1 data return `null` when required fields are absent. Static metrics (G1, G2, G5) work immediately.

### Exports

| Function | Returns | Description |
|----------|---------|-------------|
| `computeWinRateByStrategyDifficulty(runs, labels)` | `WinRateMatrixEntry` | G1: Win rate for a strategy × difficulty cell. |
| `computeScoreDistribution(runs)` | `ScoreDistributionResult` | G2: Full score statistics (median, mean, Q1, Q3, IQR, stdDev, min, max). |
| `computeEconomyHealth(runs)` | `EconomyHealthResult \| null` | G3: avgCoins/turn, bankruptcy rate, tightness index. |
| `computeSynergyDiversity(runs, typeMap)` | `SynergyDiversityResult \| null` | G4: HHI of synergy type shares across final grids. |
| `computeLossModeDecomposition(runs)` | `LossModeDecompositionResult` | G5: bankruptcy/reputation/timeout shares. |
| `computeCardUsageDiversity(runs)` | `CardUsageDiversityResult \| null` | G6: Gini coefficient of card frequencies in won runs. |
| `computeTurnByTurnSnapshots(runs)` | `TurnByTurnSnapshotsResult \| null` | G7: avg coins/rep/score per turn trajectory. |
| `computeTrapCardPrevalence(cardMetrics)` | `TrapCardPrevalenceResult \| null` | G8: cards with winRateDelta < −10% AND pickRate > 20%. |

### Types

```ts
interface WinRateMatrixEntry { strategy: string; difficulty: string; winRate: number; wins: number; totalRuns: number }
interface ScoreDistributionResult { median: number; mean: number; q1: number; q3: number; iqr: number; min: number; max: number; stdDev: number }
interface EconomyHealthResult { avgCoinsPerTurn: number; bankruptcyRate: number; economyTightnessIndex: number }
interface SynergyDiversityResult { hhi: number; synergyTypeShares: Record<string, number> }
interface LossModeDecompositionResult { totalLosses: number; shares: { bankruptcy: number; reputation_collapse: number; turn_exhaustion: number }; counts: {...} }
interface CardUsageDiversityResult { value: number; wonRuns: number; uniqueCards: number }
interface TurnSnapshot { turn: number; avgCoins: number; avgReputation: number; avgScore: number; sampleSize: number }
interface TurnByTurnSnapshotsResult { averages: TurnSnapshot[] }
interface CardMetricSummary { cardId: string; winRateDelta: number | null; pickRate: number | null }
interface TrapCardPrevalenceResult { trapCardCount: number; trapCardIds: string[]; trapCardImpact: number }
```

### Examples

```ts
const runs = [
  { seed: 's1', result: 'win', finalScore: 180, ... },
  { seed: 's2', result: 'loss', finalScore: 80, endReason: 'bankruptcy', ... },
];

// G1
const wr = computeWinRateByStrategyDifficulty(runs, { strategy: 'greedy', difficulty: 'medium' });
// { strategy: 'greedy', difficulty: 'medium', winRate: 0.5, wins: 1, totalRuns: 2 }

// G2
const sd = computeScoreDistribution(runs);
// { median: 130, mean: 130, min: 80, max: 180, ... }

// G5
const lm = computeLossModeDecomposition(runs);
// { totalLosses: 1, shares: { bankruptcy: 1, reputation_collapse: 0, turn_exhaustion: 0 }, counts: {...} }
```

---

## `engine/comparison.ts` {#engine-comparison}

Diff/comparison engine that compares current computed metrics against a committed baseline, computes absolute and percentage deltas, evaluates each against guardrail thresholds, and produces a structured JSON report.

### Exports

| Function | Returns | Description |
|----------|---------|-------------|
| `compareMetrics(current, baseline, thresholds?)` | `ComparisonReport` | Compare current vs baseline metrics with guardrail evaluation. |

### Types

```ts
interface ComparisonEntry {
  metric: string;
  label: string;
  current: number;
  baseline: number;
  delta: number;
  deltaPct: number;
  status: 'pass' | 'flag' | 'fail';
  severity: string;
}
interface ComparisonSummary { passed: number; flagged: number; failed: number; overall: 'pass' | 'flag' | 'fail' }
interface ComparisonMeta { timestamp: string; currentCount: number; baselineCount: number }
interface ComparisonReport { meta: ComparisonMeta; summary: ComparisonSummary; comparisons: ComparisonEntry[] }
```

### Edge Cases

- **Zero baseline:** `deltaPct` returns `Infinity` (positive delta) or `-Infinity` (negative delta).
- **Both zero:** `deltaPct` returns `0`.
- **Empty inputs:** Returns an empty report (`overall: 'pass'`) rather than crashing.
- **Non-overlapping keys:** Only metrics present in both `current` and `baseline` are compared.
- **Unknown metrics:** Metrics not found in thresholds get `status: 'pass'` with `severity: 'info'`.

### Example

```ts
const current = { winRate_greedy_medium: 50, medianScore_greedy_medium: 140 };
const baseline = { winRate_greedy_medium: 45, medianScore_greedy_medium: 130 };
const report = compareMetrics(current, baseline);
// {
//   meta: { timestamp: '...', currentCount: 2, baselineCount: 2 },
//   summary: { passed: 2, flagged: 0, failed: 0, overall: 'pass' },
//   comparisons: [
//     { metric: 'winRate_greedy_medium', current: 50, baseline: 45, delta: 5, deltaPct: 11.11, status: 'pass', ... },
//     { metric: 'medianScore_greedy_medium', current: 140, baseline: 130, delta: 10, deltaPct: 7.69, status: 'pass', ... },
//   ]
// }
```

---

## `engine/baseline.ts` {#engine-baseline}

Baseline capture, validation, and loading utilities. A baseline is a committed snapshot of Monte Carlo results representing the "known good" balance state.

### Exports

| Function | Returns | Description |
|----------|---------|-------------|
| `captureBaseline(metrics, runs, metadata)` | `Baseline` | Creates a typed baseline from Monte Carlo results. |
| `loadBaseline(json)` | `LoadBaselineResult` | Parses and validates a JSON string into a `Baseline`. |
| `validateBaseline(value)` | `value is Baseline` | Structural type guard for baseline shape. |

### Types

```ts
interface BaselineMetadata { strategy: string; difficulty: string }
interface Baseline {
  tag: string;
  timestamp: string;
  strategy: string;
  difficulty: string;
  metrics: MonteCarloMetrics;
  runs: MonteCarloRunSummary[];
}
type LoadBaselineResult = { success: true; baseline: Baseline } | { success: false; error: string };
```

### Example

```ts
const baseline = captureBaseline(metrics, runs, {
  strategy: 'greedy', difficulty: 'medium', tag: 'v1.0',
});
const json = JSON.stringify(baseline, null, 2);
// Saved to docs/main-street/baselines/v1.0.json

// Later...
const loaded = loadBaseline(json);
if (loaded.success) {
  console.log(loaded.baseline.tag); // 'v1.0'
}
```

---

## `guards/thresholds.ts` {#guards-thresholds}

Guardrail threshold definitions and evaluation engine. Defines the balance guardrails from PRD §3.3 and provides a function to evaluate a set of computed metrics against these thresholds.

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `GUARDRAIL_THRESHOLDS` | `Record<string, GuardrailThreshold>` | Built-in threshold definitions for all strategy × difficulty combinations. |
| `evaluateGuardrails(metrics, thresholds?)` | `GuardrailResult` | Evaluates metrics against thresholds, returns per-metric status and overall assessment. |

### Types

```ts
type ThresholdSeverity = 'critical' | 'warning' | 'info';
type GuardrailStatus = 'pass' | 'flag' | 'fail';

interface GuardrailThreshold {
  metric: string;
  label: string;
  min: number;
  max: number;
  severity: ThresholdSeverity;
}

interface PerMetricGuardrailResult {
  metric: string; label: string;
  value: number; min: number; max: number;
  severity: ThresholdSeverity;
  status: GuardrailStatus;
  breached: boolean;
}

interface GuardrailResult {
  passed: number; flagged: number; failed: number;
  overall: 'pass' | 'flag' | 'fail';
  perMetric: PerMetricGuardrailResult[];
}
```

### Severity Model

| Severity | Breach Behaviour | Overall Impact |
|----------|-----------------|----------------|
| `critical` | Status `fail` | Overall `fail` |
| `warning` | Status `flag` | Overall `flag` |
| `info` | Status `flag` | Overall `flag` |

### Example

```ts
import { evaluateGuardrails, GUARDRAIL_THRESHOLDS } from '../../scripts/balance/guards/thresholds';

const result = evaluateGuardrails({
  winRate_greedy_medium: 55,  // within 30-60 → pass
  medianScore_greedy_medium: 110, // below 120 → flag (warning)
});
// { passed: 1, flagged: 1, failed: 0, overall: 'flag', ... }
```

---

## Index of All Public Exports

| Module | Exports |
|--------|---------|
| `engine/statistics` | `median`, `iqr`, `gini`, `hhi`, `confidenceInterval` |
| | `IqrResult`, `ConfidenceIntervalResult` |
| `engine/card-metrics` | `computePickRate`, `computeWinRateDelta`, `computeCostToIncomeRatio`, `computeSynergyUtilization`, `computeUpgradeAdoption`, `computeEventImpactScore`, `computeSurvivalRate` |
| | `PickRateResult`, `WinRateDeltaResult`, `CostToIncomeInput`, `SynergyUtilizationResult`, `UpgradeAdoptionResult`, `EventImpactResult`, `SurvivalRateResult`, `CardDeltas` |
| `engine/global-metrics` | `computeWinRateByStrategyDifficulty`, `computeScoreDistribution`, `computeEconomyHealth`, `computeSynergyDiversity`, `computeLossModeDecomposition`, `computeCardUsageDiversity`, `computeTurnByTurnSnapshots`, `computeTrapCardPrevalence` |
| | `WinRateMatrixEntry`, `ScoreDistributionResult`, `EconomyHealthResult`, `SynergyDiversityResult`, `LossModeDecompositionResult`, `CardUsageDiversityResult`, `TurnByTurnSnapshotsResult`, `TrapCardPrevalenceResult`, `CardMetricSummary` |
| `engine/comparison` | `compareMetrics` |
| | `ComparisonEntry`, `ComparisonSummary`, `ComparisonMeta`, `ComparisonReport` |
| `engine/baseline` | `captureBaseline`, `loadBaseline`, `validateBaseline` |
| | `Baseline`, `BaselineMetadata`, `LoadBaselineResult` |
| `guards/thresholds` | `evaluateGuardrails`, `GUARDRAIL_THRESHOLDS` |
| | `GuardrailThreshold`, `GuardrailStatus`, `GuardrailResult`, `PerMetricGuardrailResult`, `ThresholdSeverity` |
