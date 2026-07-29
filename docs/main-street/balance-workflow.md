# Main Street — Full Game Balancing Run

This guide walks through the **complete balancing workflow**: static card balancing, Monte Carlo simulation, guardrail review, and decision gate. Run this whenever you change `card-data.csv`, add/remove cards, or modify game rules.

## Overview

```
Stage 1: Static Card Balancing  →  Stage 2: Monte Carlo Simulation  →  Stage 3: Guardrail Review  →  Decision Gate
   (npm run balance-cards)         (npm run monte-carlo-sweep)          (compare vs thresholds)      (Pass/Flag/Fail)
```

---

## Stage 1: Static Card Balancing

Adjust card costs and rewards using a hybrid curve-fitting + tier band analysis. This is a **deterministic** pass on `card-data.csv` — no simulation needed.

```bash
npm run balance-cards
```

**What it does:**

| Family | Method | Cards Affected |
|--------|--------|----------------|
| Business / Community Space | Curve-fit: `tier*2 + 2 + baseIncome*4 + synergyCount*3 + bonuses` | 20 cards |
| Investment Events | Curve-fit: `tier*1.5 + 0.5 + coinDelta*1.5 + repDelta*2` | 13 events |
| Upgrades | Curve-fit: `tier*1.5 + 1 + incomeBonus*3 + synergyRange*3 + repBonus*10` | 27 cards |
| Staff | Curve-fit: `ongoingCost*5 + handSlotsAdded*5` | 3 cards |
| Incidents | **Excluded** — all remain at cost 0 | 23 events |

**Post-processing:** Cost spread enforcement ensures no single cost value exceeds 1/3 of cards in any family. Excess cards at a clustered value are spread to adjacent values.

**Output:** Updated `card-data.csv` (original preserved via rotating backups) + a summary table printed to stdout showing all adjustments with rationale codes.

```bash
# Custom paths if needed
npm run balance-cards -- --input path/to/input.csv --output path/to/output.csv
```

> **Reference:** [`balancing-methodology.md`](balancing-methodology.md) — Full algorithm details

---

## Stage 2: Monte Carlo Simulation Validation

Play thousands of simulated games to validate that the balancing changes produce healthy gameplay outcomes.

### Single Strategy Run

```bash
npm run monte-carlo
```

This runs 200 seeds with the `greedy` strategy, 25 max turns. Output goes to `results/main-street-monte-carlo.json` and `results/main-street-monte-carlo.csv`.

### Full Sweep (Recommended)

Run all 4 strategies × 3 difficulty combinations (12 combos):

```bash
npm run monte-carlo-sweep
```

This writes per-combination output files:
- `results/sweep-market-greedy-easy.json`
- `results/sweep-greedy-medium.json`
- `results/sweep-random-hard.json`
- etc.

### Key Options

| Flag | Purpose |
|------|---------|
| `--seeds <N>` | Number of seeds per combo (default: 200; 100 for sweep) |
| `--strategy <name>` | Single run strategy: `greedy`, `market-greedy`, `demo-greedy`, `random` |
| `--maxTurns <N>` | Max turns per run (default: 25) |
| `--sweep` | Run all strategy × difficulty combinations |
| `--sweep-strategies <list>` | Filter sweep to specific strategies (comma-separated) |
| `--sweep-difficulties <list>` | Filter sweep to specific difficulties (e.g. `medium,hard`) |
| `--seed-file <path>` | Use predetermined seeds from a file (for reproducible runs) |

### Example: Quick Check

```bash
# Quick validation: 50 seeds, medium only, both greedy and random
npm run monte-carlo-sweep -- --seeds 50 --sweep-strategies greedy,random --sweep-difficulties medium
```

> **Reference:** [`monte-carlo-sample-results.md`](monte-carlo-sample-results.md) — Sample results interpretation

---

## Stage 3: Guardrail Review

Compare the Monte Carlo results against the guardrail thresholds to determine whether the game is in a healthy balance state.

### Critical Guardrails

| Metric | Strategy | Difficulty | Range | If Breached |
|--------|----------|------------|-------|-------------|
| Win rate | Greedy | Medium | **30–60%** | ❌ **FAIL** — block release |
| Win rate | Greedy | Easy | **60–85%** | ⚠️ Flag (warning) |
| Win rate | Greedy | Hard | **15–40%** | ⚠️ Flag (warning) |
| Win rate | Random | Medium | **5–20%** | ⚠️ Flag (warning) |
| Median score | Greedy | Medium | **120–180** | ⚠️ Flag (warning) |

### Informational Guardrails

| Metric | Strategy | Difficulty | Target Range | Notes |
|--------|----------|------------|--------------|-------|
| Avg turns | Greedy | Medium | 14–22 | Games should feel like a full session |
| Bankruptcy rate | Greedy | Medium | 40–70% of losses | Should be the primary loss mode |
| Reputation collapse rate | Greedy | Medium | 20–40% of losses | Secondary failure mode |
| Timeout rate | Greedy | Medium | < 15% of losses | Timeouts indicate stalled games |
| Gini coefficient (card usage) | Greedy | Medium | 0.3–0.6 | Healthy card pool diversity |

### How to Check

The Monte Carlo JSON output contains the metrics you need. Key fields to check per strategy/difficulty combo:

```json
{
  "metrics": {
    "winRate": 0.45,
    "medianScore": 152,
    "averageTurns": 16.2,
    "lossReasons": {
      "bankruptcy": 55,
      "reputationCollapse": 32,
      "turnExhaustion": 13
    }
  }
}
```

> **Note:** The full CLI comparison tools (`balance-report`, `balance-check`, etc.) are documented in the PRD but not yet implemented. For now, review the JSON output manually against the guardrail table above.

> **Reference:** [`prd-balance-process-and-tooling.md`](prd-balance-process-and-tooling.md#33-guardrail-thresholds) — Full guardrail specification

---

## Decision Gate

Once you've reviewed the results, classify the balance state:

| Decision | Meaning | Action |
|----------|---------|--------|
| ✅ **PASS** | All critical + warning guardrails satisfied. Game is in a healthy balance state. | Update baseline commit results |
| ⚠️ **FLAG** | Warning guardrails breached, but cause is understood and documented (e.g. intentional rebalancing). | Document rationale, update baseline |
| ❌ **FAIL** | Critical guardrail breached, or warning guardrails breached without explanation. | Block release create tuning work items, iterate |

---

## Complete Command Sequence

```bash
# 1. Static card balancing
npm run balance-cards

# 2. Verify nothing broke
npm run build
npm test

# 3. Run full Monte Carlo sweep
npm run monte-carlo-sweep

# 4. Review results in results/sweep-*.json
# 5. Check guardrails and decide: PASS / FLAG / FAIL
# 6. If PASS or FLAG, commit the baseline
```

## See Also

| Document | Covers |
|----------|--------|
| [`balancing-methodology.md`](balancing-methodology.md) | Static card balancing algorithm in detail |
| [`prd-balance-process-and-tooling.md`](prd-balance-process-and-tooling.md) | Full PRD — micro/macro metrics, guardrails, baseline management |
| [`balance-analysis-api.md`](balance-analysis-api.md) | API reference for `scripts/balance/` library |
| [`monte-carlo-sample-results.md`](monte-carlo-sample-results.md) | Sample Monte Carlo output interpretation |
| [`playtest-scenarios.md`](playtest-scenarios.md) | Curated deterministic seeds for manual validation |
