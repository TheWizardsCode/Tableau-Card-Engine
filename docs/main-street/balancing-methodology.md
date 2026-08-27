# Main Street Balancing Methodology

## Overview

This document describes the automated balancing methodology used by the `run-balance-cards` CLI tool to perform a data-driven balancing pass on the Main Street card data CSV. The tool implements a **hybrid approach** combining curve-fitting and tier-band analysis.

## Algorithm Approach

The tool uses two complementary techniques:

### 1. Curve-Fitting

Each card family has a family-specific expected cost function that models cost as a function of card stats:

| Family | Input Variables | Formula |
|--------|----------------|---------|
| **Business / Community Space** | baseIncome, synergyTypes, synergyCoinBonus, synergyRepBonus, reputationPerTurn, incomeBonus, tier | `tier * 2 + 2 + baseIncome * 4 + synergyCount * 3 + bonuses` |
| **Investment Events** | coinDelta, reputationDelta, targetSynergy, tier | `tier * 1.5 + 0.5 + coinDelta * 1.5 + repDelta * 2` | 
| **Upgrades** | incomeBonus, synergyRangeBonus, requiredLevel, reputationBonus, tier | `tier * 1.5 + 1 + incomeBonus * 3 + synergyRange * 3 + repBonus * 10` |
| **Staff** | ongoingCost, handSlotsAdded | `ongoingCost * 5 + handSlotsAdded * 5` |

### 2. Tier Band Analysis

Expected costs are mapped to cost bands using percentile-based assignment:

| Band | Percentile | Cost Range | Label |
|------|-----------|------------|-------|
| **Budget** | 0–20% | 0–3 | Basic, affordable cards |
| **Economy** | 20–40% | 4–5 | Entry-level value |
| **Standard** | 40–60% | 6–7 | Mid-range cards |
| **Premium** | 60–80% | 8–9 | High-value cards |
| **Flagship** | 80–100% | 10–14 | Premium, high-impact cards |

The algorithm ensures each band has representation by computing percentile position within each family's cost distribution.

### 3. Cost Spread Enforcement

After tier band assignment, a post-processing pass ensures no single cost value exceeds **1/3 of the cards** in any family. Excess cards at a clustered cost value are spread to adjacent values (±1, ±2) to improve strategic differentiation.

### 4. Reward Spread

When a card's cost changes, its reward fields (baseIncome, coinDelta, synergy bonuses, etc.) are adjusted proportionally:

- **Cost increase of >10%**: Rewards scaled up proportionally (costRatio × 0.7)
- **Cost decrease of >10%**: Rewards scaled down proportionally
- **Premium/Flagship cards (cost ≥ 8)**: Awarded synergyCoinBonus and synergyRepBonus if missing

### 5. Exclusion Rules

| Rule | Cards Affected | Rationale |
|------|---------------|-----------|
| **Incidents remain free** | All 24 Incident-trigger events | Incidents are negative events; cost would make them purchaseable, changing game balance |

### 6. Special Cases

| Card | Handling |
|------|----------|
| **Pawn Shop** | No synergy bonuses; cost reduced by 2 from curve estimate |
| **Clinic** | reputationPerTurn = +0.2 factored into cost calculation (weight × 30) |
| **Library (`cs-library`)** | Community-space curve formula **excludes `ongoingCost`**. The Library's 0.25 coins/turn running cost is not part of the cost formula; its cost was hand-set to the tier-1 formula result (4 base + 0.1 rep × 30 = 7, Standard band) per planning Q6. The Library participates in Culture synergy with default rates (empty `synergyCoinBonus` → 0.5 coin rate, `synergyRepBonus` → 0, Park model) — it contributes to adjacent Culture businesses' synergy and can receive rep synergy from rep-bonus neighbours (reversed from synergy-neutral by CG-0MSKS963N000ZSTU). Community spaces with a running cost may need manual review. |

## Per-Family Strategy

### Business (30 cards) and Community Space (2 cards)

> Business grew from 18 to 30 in the Group A expansion (CG-0MSQJ1XIB0004QVN):
> 12 new cards (Health bridges, T2/T3 singles, T5 Grand Hotel flagship). The
> 1/3 cost-spread rule now applies to 30 cards (threshold 10).

- **Goal**: Wider cost spread (target: range increase ≥ 30%)
- **Inputs**: baseIncome, synergyCount, synergy bonuses, reputation, tier
- **Algorithm**: Curve-fitted cost + tier-driven base → clamped to tier bands → spread enforcement

### Investment Events (21 of 45 events)

> Investment events grew from 13 to 21 in the Group C expansion
> (CG-0MSQJ244M0055X7S), adding per-synergy mid-tier options plus two new
> duration effect types (positive `income-multiplier`, `rep-multiplier`).
> Duration events carry zero one-shot deltas; their cost is curve-fitted from
> tier only.

- **Goal**: Cost range wider than current 2–4 (target: range ≥ 3)
- **Inputs**: coinDelta, reputationDelta, target scope (All vs SpecificSynergy)
- **Scope multiplier**: All = 1.0×, SpecificSynergy = 1.2×

### Incidents (24 of 45 events)

- **Not adjusted** — all remain at cost 0

### Upgrades (39 cards)

> Upgrades grew from 27 to 39 in the Group E expansion (CG-0MSQJ7SYD008U3EE),
> covering every Group A business and Group B community space.

- **Goal**: Wider cost spread (target: range ≥ 6)
- **Inputs**: incomeBonus, synergyRangeBonus, requiredLevel, reputationBonus, tier
- **Minimum cost**: 2

### Staff (7 cards)

- **Goal**: Cost spread maintained (target: range ≥ 9)
- **Inputs**: ongoingCost, handSlotsAdded
- **Ongoing cost adjusted proportionally**: Higher purchase cost → proportionally higher ongoing cost
- **`refreshCostDiscount`** (staff ability, e.g. Accountant): recognized and validated as a numeric CSV column (CG-0MSREC65T004J5SS), but **excluded from the cost curve** — like `reputationPerTurn` for staff, it is an ability field tracked outside the curve model.
- **`actionsPerTurn`** (staff ability, e.g. General Manager, CG-0MSTOF1N5005PK2R): a numeric CSV column on staff cards, **excluded from the cost curve** — the same treatment as `refreshCostDiscount` and `reputationPerTurn`. The action economy is a **game-design lever**, not part of the standard cost formula: the General Manager's +1 action/day is balanced by its high cost (20) and ongoing cost (5), and is never priced into `ongoingCost * 5 + handSlotsAdded * 5`.

## Rationale Codes

| Code | Description |
|------|-------------|
| `TIER_REASSIGN` | Cost adjusted due to tier band reassignment |
| `BAND_BALANCE` | Minor band adjustment to improve cost distribution |
| `COST_CURVE_FIT` | Cost adjusted via curve-fitting model |
| `INCOME_ADJUST` | baseIncome adjusted to reflect new cost tier |
| `SYNERGY_BONUS_ADJ` | Synergy bonus added/removed for premium cards |
| `REPUTATION_ADJ` | Reputation bonus adjusted for cost tier |
| `REWARD_SPREAD` | Reward fields widened to match new cost |
| `ONGOING_COST_ADJ` | Staff ongoing cost adjusted proportionally |
| `INCIDENT_FREE` | Incident event excluded from cost adjustment |
| `SPECIAL_CASE` | Special handling (e.g., Pawn Shop no-synergy) |

## Determinism

The tool is fully deterministic — running on the same input CSV produces identical output on every run. No random noise is used in any phase of the algorithm.

## Usage

```bash
# Run with defaults (reads card-data.csv, writes card-data.balanced.csv)
npx tsx scripts/run-balance-cards.ts

# Custom input/output paths
npx tsx scripts/run-balance-cards.ts --input path/to/input.csv --output path/to/output.csv
```

## Migration

This document consolidates all balancing methodology content previously scattered across:

- `docs/main-street/content-design-and-progression.md` — Section 4 (Difficulty and Balance), 4.1 (Provisional Numeric Balance Targets), 4.2 (Tuning Levers)
- `docs/main-street/the-build-gdd.md` — Section 4 (Difficulty and Balance)
- `docs/main-street/card-catalog.md` — Event Balance Summary table, Upgrade Cost Distribution table

The origin documents now contain cross-references to this document.

## 8-Way Adjacency Re-Tune (CG-0MSP1HCAS00785MP / CG-0MSP26Q5N002EH8P)

The adjacency metric was changed from **Manhattan (orthogonal-only)** to **Chebyshev (8-way)**:
diagonally adjacent slots now count as neighbors on the 2×5 street grid. The Monte Carlo
harness (200 seeds, greedy strategy) was re-run before and after the change.

**Metric semantics (producer ruling, 2026-08-13):** the harness's `avgCoinsPerTurn`
(= finalCoins/turns, **net liquidity**) is the focus metric for the economy band, and its
target band is **0–2** (later widened — current bands in
[`balance-guardrail-recommendations.md`](balance-guardrail-recommendations.md): 0–6 after
the CG-0MSVYPEZ90085SHE ongoing-cost re-baseline). The 4–8 band in
[`prd-balance-process-and-tooling.md`](prd-balance-process-and-tooling.md) targets **gross**
income per turn (`totalCoinsEarned/totalTurns`) and is not the `avgCoinsPerTurn` target.

### Initial F3 measurement (pre-re-tune, 200 seeds / 25 turns)

| Metric | Before (Manhattan) | After (8-way / Chebyshev) |
|---|---:|---:|
| Win rate | 64.5% | 65.0% |
| Median final score | 154.4 | 157.0 |
| Avg coins/turn (liquidity) | 2.557 | 2.745 |
| Approx. income/turn (positive deltas) | 4.38 | 4.63 |

### Economy re-tune (CG-0MSP26Q5N002EH8P, 2026-08-13)

After the concurrent card-data rebalance (CG-0MSQJ7VL9009JHF4) landed on dev, the Medium/Greedy
`avgCoinsPerTurn` measured **4.118** — well above the 0–2 net-liquidity band. Per the lever
order (difficulty presets first, card data only for outliers), the `MainStreetDifficulty.ts`
presets were re-tuned:

| Preset | startingCoins before → after | synergyBonusPerNeighbor before → after |
|---|---:|---:|
| Easy | 12 → 10 | 1.5 → 0.5 |
| Medium | 8 → 6 | 1.0 → 0.35 |
| Hard | 5 → 4 | 0.75 → 0.25 |

`card-data.csv` was **not** changed (band reached with presets alone). Resulting harness
metrics (200 seeds, greedy):

| Metric | Before re-tune | After re-tune |
|---|---:|---:|
| avgCoinsPerTurn (25 turns) | 4.118 | **1.82** ✓ (0–2 band) |
| avgCoinsPerTurn (60-turn baseline) | 4.118 | **1.85** ✓ (0–2 band) |
| Win rate (25 turns) | 81.5% | 60.5% |
| Median final score (25 turns) | 168.3 | 152.5 |

Guardrail tests (`monte-carlo-guardrails`, `monte-carlo-greedy-guardrail`,
`monte-carlo-balance`) pass on the re-tuned presets; the committed baseline in
[`monte-carlo-baseline.json`](monte-carlo-baseline.json) and
`results/main-street-monte-carlo.json/.csv` were regenerated to the new values.

## See Also

- **[Balance Process & Tooling PRD](prd-balance-process-and-tooling.md)** — Defines the structured balance review process, micro/macro metrics, and CLI tool specifications that build on this balancing algorithm.
- **[Monte Carlo Sample Results](monte-carlo-sample-results.md)** — Example output from the Monte Carlo simulation harness used for balance validation.
- **[Card Catalog](card-catalog.md)** — Complete card template reference with balance-relevant stats.
- **[Playtest Scenarios](playtest-scenarios.md)** — Curated deterministic seeds for manual balance validation.
