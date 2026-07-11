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
| **Incidents remain free** | All 23 Incident-trigger events | Incidents are negative events; cost would make them purchaseable, changing game balance |

### 6. Special Cases

| Card | Handling |
|------|----------|
| **Pawn Shop** | No synergy bonuses; cost reduced by 2 from curve estimate |
| **Clinic** | reputationPerTurn = +0.2 factored into cost calculation (weight × 30) |

## Per-Family Strategy

### Business (18 cards) and Community Space (2 cards)

- **Goal**: Wider cost spread (target: range increase ≥ 30%)
- **Inputs**: baseIncome, synergyCount, synergy bonuses, reputation, tier
- **Algorithm**: Curve-fitted cost + tier-driven base → clamped to tier bands → spread enforcement

### Investment Events (13 of 36 events)

- **Goal**: Cost range wider than current 2–4 (target: range ≥ 3)
- **Inputs**: coinDelta, reputationDelta, target scope (All vs SpecificSynergy)
- **Scope multiplier**: All = 1.0×, SpecificSynergy = 1.2×

### Incidents (23 of 36 events)

- **Not adjusted** — all remain at cost 0

### Upgrades (27 cards)

- **Goal**: Wider cost spread (target: range ≥ 6)
- **Inputs**: incomeBonus, synergyRangeBonus, requiredLevel, reputationBonus, tier
- **Minimum cost**: 2

### Staff (3 cards)

- **Goal**: Cost spread maintained (target: range ≥ 9)
- **Inputs**: ongoingCost, handSlotsAdded
- **Ongoing cost adjusted proportionally**: Higher purchase cost → proportionally higher ongoing cost

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
