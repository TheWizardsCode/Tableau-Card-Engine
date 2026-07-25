# Main Street: Game Balance Process & Tooling PRD

**Work Item:** CG-0MRBDPFPH009Y8M0
**Status:** IMPLEMENTED (Phase 2: Core Analysis Library)
**Date:** 2026-07-23
**Last Updated:** 2026-07-25 (Phase 2 implementation complete)

> **Implementation Status:** Phase 2 (Core Analysis Library) is complete. The balance analysis library lives at `scripts/balance/` with the full API documented at `docs/main-street/balance-analysis-api.md`. See §10 for updated file paths.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement & Goals](#2-problem-statement--goals)
3. [Balance Review Process](#3-balance-review-process)
4. [Micro-Level Metrics Specification](#4-micro-level-metrics-specification)
5. [Macro-Level Metrics Specification](#5-macro-level-metrics-specification)
6. [CLI Tool Architecture Specification](#6-cli-tool-architecture-specification)
7. [Integration with Existing Infrastructure](#7-integration-with-existing-infrastructure)
8. [Baseline Management](#8-baseline-management)
9. [Recommendations & Out-of-Scope](#9-recommendations--out-of-scope)
10. [Implementation Roadmap](#10-implementation-roadmap)
11. [Appendix: Existing Infrastructure Survey](#11-appendix-existing-infrastructure-survey)
12. [Appendix: Metric Feasibility Assessment](#12-appendix-metric-feasibility-assessment)

---

## 1. Executive Summary

Main Street has grown to 86 card templates across 5 card families, supported by a Monte Carlo simulation harness running 200+ seeds with multiple AI strategies. However, there is currently **no structured process** or **dedicated tooling** to correlate card data from `card-data.csv` with gameplay metrics from Monte Carlo runs. Designers edit the CSV without a feedback loop to understand how individual card changes affect win rates, synergy viability, or economy health.

This PRD defines:

- A **structured balance review process** with triggers, decision gates, and interpretation guidance.
- **Micro-level per-card metrics** (7 specified) and **macro-level global metrics** (8 specified) with formulas, data sources, and interpretation.
- A **CLI tool architecture** for scripts that ingest `card-data.csv` + Monte Carlo JSON output and produce structured balance reports.
- **Baseline management** for regression comparison.
- **Integration points** with the existing Monte Carlo harness, playtest scenarios, CI pipeline, difficulty presets, and AI strategies.

**Scope:** This document is a PRD only. Tool implementation is deferred to follow-up work items.

---

## 2. Problem Statement & Goals

### 2.1 Problem Statement

The Main Street card pool has expanded from 18 to 86 templates. The `run-balance-cards` algorithm provides static cost-and-reward balancing against curve-fitted models, but there is no automated feedback loop connecting card-data changes to actual gameplay outcomes. Designers cannot answer:

- "Did increasing the Bakery's cost make it less attractive, or is it still picked in 80% of runs?"
- "Are Entertainment-synergy cards winning more often than Food-synergy cards?"
- "Which cards are 'traps' — purchased frequently but correlated with losses?"
- "Has the overall economy shifted toward bankruptcy versus reputation collapse?"

### 2.2 Design Goals

1. **Actionable insight:** Balance reports must lead directly to tuning decisions (increase cost, reduce income, swap synergy type).
2. **Regression awareness:** Any card or rule change should be compareable against a known-good baseline.
3. **CI integration:** A `balance-check` npm script should pass/fail based on guardrail thresholds, running alongside the existing test suite.
4. **Designer-friendly output:** Reports should be readable in a terminal and as markdown, with JSON for downstream consumption.
5. **Extensible metric framework:** New metrics should be addable without restructuring existing code.

### 2.3 Primary Use Cases (from stakeholders)

| Use Case | Stakeholder | Question Answered |
|----------|-------------|------------------|
| UC-1 | Game Designer | "I changed the Bakery's cost from 3 to 4. How did pick rate, win-rate delta, and synergy utilization change?" |
| UC-2 | Game Designer | "Is there a synergy type (Food, Culture, etc.) that significantly under- or over-performs?" |
| UC-3 | Game Designer | "Which cards are 'traps' — purchased frequently but hurt win rate?" |
| UC-4 | Developer | "I added a new metric to the Monte Carlo harness. Does the balance report pick it up correctly?" |
| UC-5 | QA / Tester | "After the latest changes, does the global win rate on Medium/Greedy still fall within guardrails?" |

---

## 3. Balance Review Process

### 3.1 Trigger Events

A structured balance review should be triggered by any of the following:

| Trigger | Priority | Description |
|---------|----------|-------------|
| **Card data change** | High | Any edit to `card-data.csv` (cost, income, synergy type, tier, etc.) |
| **Card addition/removal** | High | Adding or removing card templates from the CSV |
| **Rule change** | High | Changes to game rules (synergy calculation, difficulty presets, income formula, turn limit) |
| **New AI strategy** | Medium | Adding or modifying an AI strategy that becomes a balance reference |
| **Scheduled review** | Low | Bi-weekly (or per-sprint) review even with no changes, to catch baseline drift |
| **CI guardrail breach** | Critical | `npm run balance-check` fails — immediate investigation required |

### 3.2 Review Workflow

```
[Trigger Event]
     |
     v
[1. Run Monte Carlo Sweep]
     |  - 200 seeds, all 4 strategies, 3 difficulties
     |  - Output: results/latest.json + results/latest.csv
     v
[2. Generate Balance Reports]
     |  - Micro report (per-card metrics)
     |  - Macro report (global metrics)
     |  - Comparison report (vs committed baseline)
     v
[3. Interpret Results]
     |  - Check guardrail thresholds (see §3.3)
     |  - Identify outliers, traps, drift
     v
[4. Decision Gate]
     |  - PASS: All metrics within guardrails → baseline may be updated
     |  - FLAG: Metrics outside guardrails but explained by change → document rationale, update baseline
     |  - FAIL: Metrics outside guardrails with no clear explanation → create tuning work items
     v
[5. Take Action or Document]
     |  - If PASS: Update baseline (`npm run balance-capture-baseline`), commit
     |  - If FLAG: Document rationale in work item, update baseline
     |  - If FAIL: Create tuning work items, iterate
     v
[6. Commit Baseline Snapshot]
     - Tag baseline commit (e.g., `balance-baseline-2026-07-23`)
     - Push results to `dev`
```

### 3.3 Guardrail Thresholds

The following guardrails define normal operating ranges. Values outside these ranges trigger a FLAG or FAIL decision.

| Metric | Strategy | Difficulty | Guardrail Range | Severity |
|--------|----------|------------|-----------------|----------|
| Win rate | Greedy | Medium | 30–60% | Critical |
| Win rate | Greedy | Easy | 60–85% | Warning |
| Win rate | Greedy | Hard | 15–40% | Warning |
| Win rate | Random | Medium | 5–20% | Warning |
| Median score | Greedy | Medium | 120–180 | Warning |
| Avg turns | Greedy | Medium | 14–22 | Info |
| Bankruptcy rate | Greedy | Medium | 40–70% of losses | Info |
| Reputation collapse rate | Greedy | Medium | 20–40% of losses | Info |
| Timeout rate | Greedy | Medium | < 15% of losses | Warning |
| Gini coefficient (card usage) | Greedy | Medium | 0.3–0.6 | Info |

### 3.4 Decision Gate Definitions

| Decision | Meaning | Action |
|----------|---------|--------|
| **PASS** | All critical + warning guardrails satisfied. The game is in a healthy balance state. | Update baseline snapshot; commit results. |
| **FLAG** | One or more warning guardrails breached, but the cause is understood and documented (e.g., intentional rebalancing). | Flag with rationale; update baseline after documenting. |
| **FAIL** | Critical guardrail breached, or warning guardrails breached without explanation. | Block release; create tuning work items. |

### 3.5 Roles & Responsibilities

| Role | Balance Responsibility |
|------|----------------------|
| **Game Designer** | Interpret micro-level metrics; propose card parameter changes; validate changes with reports |
| **Developer** | Maintain CLI tools; add new metrics; ensure Monte Carlo harness output is compatible |
| **QA / Tester** | Run `balance-check` before releases; investigate guardrail breaches; maintain playtest scenarios |
| **Producer** | Sign off on baseline updates; make pass/flag/fail decisions for releases |

---

## 4. Micro-Level Metrics Specification

Seven micro-level (per-card) metrics are specified below. Each includes a clear formula, data source, and interpretation guidance.

### M1. Pick Rate

**Purpose:** Measures how often a card is purchased when it appears in the market.

**Formula:**
```
pickRate = timesPurchased / timesAvailableInMarket
```

**Data Sources:**
- `timesPurchased`: Per-run action log (buy-business, buy-event, buy-upgrade actions)
- `timesAvailableInMarket`: Per-run market offer log (which cards appeared and when)

**Interpretation:**
| Range | Meaning |
|-------|---------|
| > 80% | Essential or underpriced — likely too attractive |
| 40–80% | Healthy demand |
| 10–40% | Situational — may be niche or overpriced |
| < 10% | Likely overpriced, weak, or redundant |

**Required harness extension:** Per-run market offer tracking (currently not recorded in `MonteCarloRunSummary`).

### M2. Win-Rate Delta

**Purpose:** Measures whether purchasing a card correlates with winning or losing. A negative delta may indicate a "trap" card.

**Formula:**
```
winRateDelta = winRateWhenOwned - winRateWhenNotOwned
```

Where:
- `winRateWhenOwned` = runs where card was purchased and player won / total runs where card was purchased at any point
- `winRateWhenNotOwned` = runs where card never appeared in player's possession and player won / total runs where card was never owned

**Data Sources:**
- Per-run summary (result, finalScore, seed)
- Per-run card ownership log (which cards were purchased/upgraded during the run)

**Interpretation:**
| Range | Meaning |
|-------|---------|
| > +15% | Strong positive contributor — possibly overpowered |
| +5% to +15% | Good value card |
| -5% to +5% | Neutral — doesn't significantly affect outcome |
| < -5% | Negative contributor — potential "trap" card |
| < -15% | Strong trap — needs buff or cost reduction |

**Required harness extension:** Per-run card ownership tracking (currently not in `MonteCarloRunSummary`).

### M3. Cost-to-Income Ratio

**Purpose:** Measures the number of turns required for a card to pay back its purchase cost through base income.

**Formula:**
```
costToIncomeRatio = cardCost / baseIncomePerTurn
```

For cards with zero base income (e.g., Florist, Clinic), use the effective income including synergy bonuses from optimal placement, documented separately.

**Data Sources:**
- `cardCost` from `card-data.csv` (cost column)
- `baseIncome` from `card-data.csv` (baseIncome column)

**Interpretation:**
| Ratio | Meaning |
|-------|---------|
| < 3 | Fast payback — strong economic card |
| 3–6 | Moderate payback |
| 7–12 | Slow payback — requires long game to be worthwhile |
| > 12 | Very slow — likely only valuable for synergy or end-game scoring |

**This metric can be computed statically from `card-data.csv` alone** — no Monte Carlo run needed.

### M4. Synergy Utilization Rate

**Purpose:** Measures how effectively a card's synergy potential is realised in actual play.

**Formula:**
```
synergyUtilization = actualAdjacencyBonusesReceived / maxPossibleAdjacencyBonuses
```

Where:
- `actualAdjacencyBonusesReceived`: Number of adjacency bonus triggers actually received per run (from the income log)
- `maxPossibleAdjacencyBonuses`: For a given card, the maximum number of adjacency bonuses possible given its synergy types and surrounding slots (e.g., 8 adjacent slots in a 4×3 grid)

**Data Sources:**
- Per-run income log (which bonuses were triggered per turn)
- Card synergy types from `card-data.csv`
- Grid placement log (which card was placed in which slot each turn)

**Interpretation:**
| Rate | Meaning |
|------|---------|
| > 75% | Well-integrated card — players consistently place it for synergy value |
| 40–75% | Moderate synergy use — some potential unrealised |
| < 40% | Poor synergy integration — card may be placed in suboptimal positions or synergy types may be hard to match |

**Required harness extension:** Per-run income breakdown showing source of each coin (base vs synergy bonus vs event).

### M5. Upgrade Adoption Rate (Business Cards with Upgrade Path)

**Purpose:** For business cards that have an upgrade path, measures how often players invest in the upgrade.

**Formula:**
```
upgradeAdoptionRate = timesUpgraded / timesParentBusinessPurchased
```

Where:
- `timesUpgraded`: Number of runs where the upgrade card was bought AND applied to a matching business
- `timesParentBusinessPurchased`: Number of runs where the parent business card was purchased at any point (even if later upgraded)

**Data Sources:**
- Per-run action log (buy-upgrade actions with targetSlot)
- Per-run card ownership log

**Interpretation:**
| Rate | Meaning |
|------|---------|
| > 60% | Upgrade is highly desired — or parent business only useful when upgraded |
| 25–60% | Healthy upgrade adoption |
| 10–25% | Upgrade is rarely worth the cost — consider buff or cost reduction |
| < 10% | Upgrade is essentially unused — investigate if still needed |

**Required harness extension:** Per-run card ownership tracking (including upgrade application).

### M6. Event Impact Score (Event Cards)

**Purpose:** For event cards, measures the average net economic impact when the event occurs.

**Formula:**
```math
eventImpactScore = average(coinDelta + reputationDelta × reputationWeight)
```

Where:
- `coinDelta`: Net coin change from the event (from the per-run action log)
- `reputationDelta`: Net reputation change from the event
- `reputationWeight`: A conversion factor representing the economic value of 1 reputation. Default = 5 (based on typical score contribution of reputation).

For incidents (cost 0), this measures pure negative impact. For investments, it measures ROI.

**Data Sources:**
- Per-run event log (which events triggered, at what turn, with what delta values)
- `coinDelta`, `reputationDelta` from `card-data.csv`

**Interpretation:**
| Score (for investments) | Meaning |
|------------------------|---------|
| > +10 | Very strong investment — possibly too strong |
| +4 to +10 | Good investment |
| < +4 | Weak investment — may not be worth the purchase cost |

| Score (for incidents) | Meaning |
|----------------------|---------|
| < -8 | Devastating incident — consider nerf |
| -4 to -8 | Significant incident — meaningful negative impact |
| > -4 | Mild incident — acceptable |

**This metric can be computed statically from `card-data.csv` with Monte Carlo frequency weighting** — requires event trigger frequency from runs.

### M7. Survival Rate (Card-Specific)

**Purpose:** Given that a card was purchased, what is the probability the player still won? Different from win-rate delta — this measures correlation strength rather than lift.

**Formula:**
```
survivalRate = runsWhereCardOwnedAndPlayerWon / runsWhereCardOwned
```

**Data Sources:**
- Per-run card ownership log
- Per-run result (win/loss)

**Interpretation:**
| Rate | Meaning |
|------|---------|
| > 70% | Card is associated with winning — likely strong |
| 40–70% | Card is neutral — neither strong nor weak |
| < 40% | Card is associated with losing — potential trap |

**Required harness extension:** Per-run card ownership tracking.

### Summary Table

| ID | Metric | Formula | Data Sources | Static or Dynamic |
|----|--------|---------|-------------|-------------------|
| M1 | Pick Rate | purchases / availability | Action log + market offer log | Dynamic |
| M2 | Win-Rate Delta | winRate(owned) - winRate(not owned) | Ownership log + run results | Dynamic |
| M3 | Cost-to-Income Ratio | cost / baseIncome | `card-data.csv` | Static |
| M4 | Synergy Utilization | actualBonuses / maxBonuses | Income breakdown + placement log | Dynamic |
| M5 | Upgrade Adoption | upgrades / purchases of parent | Action log + ownership log | Dynamic |
| M6 | Event Impact Score | avg(coinDelta + repDelta × 5) | Event log + `card-data.csv` | Hybrid |
| M7 | Survival Rate | wins(owned) / runs(owned) | Ownership log + run results | Dynamic |

---

## 5. Macro-Level Metrics Specification

Eight macro-level (global) metrics are specified below.

### G1. Win Rate by Strategy × Difficulty

**Purpose:** Core health metric showing the win rate matrix across all 12 (4 strategies × 3 difficulties) combinations.

**Formula:**
```
winRateMatrix[s][d] = winsAcrossAllRuns(s, d) / totalRuns(s, d)
```

For each strategy `s` in `{market-greedy, demo-greedy, greedy, random}` and difficulty `d` in `{Easy, Medium, Hard}`.

**Data Sources:** Monte Carlo metrics output (already available in `MonteCarloMetrics.winRate`).

**Interpretation:**
- Greedy on Medium should be 30–60% (CI guardrail).
- Greedy on Easy should be 60–85%.
- Greedy on Hard should be 15–40%.
- Random should always be lower than Greedy (validates strategy quality).
- If two strategies converge, the heuristic-based strategy may be degenerate.

**Feasibility:** Already supported by Monte Carlo harness. Just needs a strategy×difficulty sweep runner.

### G2. Score Distribution

**Purpose:** Understand central tendency, spread, and shape of final scores.

**Formula:**
```
metrics: median, mean, Q1, Q3, IQR, skewness, min, max, standardDeviation
```

**Data Sources:** Per-run final score (already in `MonteCarloRunSummary.finalScore`).

**Interpretation:**
- Wide IQR (> 80 points) suggests high variance — strategy quality or card draw luck dominates.
- Narrow IQR (< 40 points) suggests deterministic gameplay — tuning matters more than luck.
- Positive skew (tail to the right) means a few blowout wins; negative skew means frequent near-wins with occasional collapses.
- Median score for Greedy/Medium should be 120–180.

**Feasibility:** Already available from existing Monte Carlo output. Just need distribution computation.

### G3. Economy Health Indicators

**Purpose:** Track whether the economy is in a healthy state — players should have spending decisions to make, not be permanently broke or flush.

**Metrics:**

| Sub-Metric | Formula | Data Source |
|------------|---------|-------------|
| Average coins per turn | totalCoinsEarned / totalTurns | Per-run coin log |
| Coin growth rate | linear regression slope of coins across turns | Per-run turn-by-turn snapshot |
| Bankruptcy rate by turn | bankruptciesAtTurnT / totalRuns | Loss reason + turn count |
| Turns below minimum spend | count of turns where coins < cheapest affordable card | Per-run coin log + market offers |
| Economy tightness index | (avg coins per turn / avg card cost) × 100 | Coin log + card catalog |

**Data Sources:** Economy Ledger (`src/rule-engine/EconomyLedger.ts`) — per-run coin and reputation history.

**Interpretation:**
- Average coins per turn for Greedy/Medium: target range 4–8.
- Bankruptcy rate should decline after turn 5 (early game is hardest).
- At least 2 turns per run should have "can't afford anything" (decision tension).
- Economy tightness index < 50 means players are cash-constrained most turns.

**Required harness extension:** Per-run turn-by-turn coin/reputation snapshots (not currently in `MonteCarloRunSummary`).

### G4. Synergy Diversity Index

**Purpose:** Measure whether all synergy types are competitively represented in winning boards.

**Formula (Herfindahl-Hirschman Index):**
```
HHI = sum(synergyTypeShare[i]^2) for i in {Food, Culture, Commerce, Service, Entertainment, Health}
```

Where `synergyTypeShare[i]` = proportion of total synergy instances in winning boards that are of type `i`.

Alternative: Gini coefficient of synergy type frequency.

**Data Sources:** Per-run final grid composition (which cards placed, their synergy types).

**Interpretation:**
| HHI Value | Meaning |
|-----------|---------|
| < 2000 | Healthy diversity — no single synergy dominates |
| 2000–4000 | Moderate concentration — one or two types lead |
| > 4000 | Dominant synergy — significant rebalancing needed |

**Required harness extension:** Per-run final grid composition with synergy type counts.

### G5. Loss Mode Decomposition

**Purpose:** Understand what causes losses and whether the distribution shifts after balance changes.

**Formula:**
```
lossModeShare[l] = lossesByMode[l] / totalLosses
```

For `l` in `{bankruptcy, reputation_collapse, turn_exhaustion}`.

**Data Sources:** Already available in `MonteCarloMetrics.lossReasons`.

| Target Distribution (Greedy/Medium) | Share |
|--------------------------------------|-------|
| Bankruptcy | 50–60% |
| Reputation collapse | 30–40% |
| Turn exhaustion (timeout) | < 15% |

**Feasibility:** Fully supported by existing Monte Carlo output.

### G6. Card Usage Diversity (Gini Coefficient)

**Purpose:** Measure whether runs are using diverse card pools or converging on the same few cards.

**Formula:**
```
gini = Gini coefficient of card appearance frequencies across all won runs
```

Where appearance frequency = number of won runs in which a card appears in the final grid (for business cards) or was purchased (for events/upgrades).

**Data Sources:** Per-run final grid composition and purchase log.

**Interpretation:**
| Gini | Meaning |
|------|---------|
| < 0.3 | Very diverse card usage — healthy card pool |
| 0.3–0.6 | Moderate concentration — some staple cards |
| > 0.6 | Highly concentrated — meta is solved; many cards effectively unused |

**Required harness extension:** Per-run final grid composition.

### G7. Turn-by-Turn Economy Snapshots

**Purpose:** Track the average economy trajectory across the whole run population, monitoring for mid-game economic cliffs or runaway growth.

**Metrics (averaged across all runs):**

| Metric | Description |
|--------|-------------|
| Average coins at turn N | Mean coin balance at each turn |
| Average reputation at turn N | Mean reputation at each turn |
| Average income at turn N | Mean income generated at each turn |
| Average expenses at turn N | Mean expenses (purchases + incidents) at each turn |
| Grid fill percentage at turn N | Mean proportion of grid filled at each turn |

**Data Sources:** Per-run turn-by-turn snapshot (needs harness extension).

**Interpretation:**
- If average coins consistently drop below starting coins in early turns, the economy is too harsh.
- If average income growth stalls after turn 10, late-game progression may need tuning.
- Grid fill should reach 50% by turn 7–9 and 100% by turn 12–15 on average.

**Required harness extension:** Per-run turn-by-turn snapshots.

### G8. Trap Card Prevalence

**Purpose:** Identify cards that are frequently purchased but negatively correlate with winning, aggregated to a global metric.

**Formula:**
```
trapCardCount = number of cards with winRateDelta < -10% AND pickRate > 20%
trapCardImpact = average(winRateDelta) for identified trap cards
```

**Data Sources:** Micro metric M2 (win-rate delta) per card, per sweep.

**Interpretation:**
- 0 trap cards = ideal.
- 1–2 trap cards = acceptable; cards may be situational.
- 3+ trap cards = systemic balance issue requiring investigation.

**Required harness extension:** Same as M2 (per-run card ownership tracking).

### Summary Table

| ID | Metric | Data Availability | Harness Extension Needed? |
|----|--------|-----------------|--------------------------|
| G1 | Win Rate by Strategy × Difficulty | Existing | No (runner needed) |
| G2 | Score Distribution | Existing | No (aggregation needed) |
| G3 | Economy Health Indicators | Partial | Yes — per-run turn-by-turn snapshots |
| G4 | Synergy Diversity Index | Partial | Yes — per-run final grid composition |
| G5 | Loss Mode Decomposition | Existing | No |
| G6 | Card Usage Diversity | Partial | Yes — per-run final grid composition |
| G7 | Turn-by-Turn Snapshots | None | Yes — per-run turn-by-turn economy log |
| G8 | Trap Card Prevalence | None | Yes — per-run card ownership tracking |

---

## 6. CLI Tool Architecture Specification

### 6.1 Design Principles

1. **CLI-first:** All balance tools are CLI scripts producing JSON (for CI/automation) and human-readable terminal output (for designers).
2. **Pipeline-compatible:** Tools should compose via pipes and accept both file paths and stdin.
3. **Deterministic:** Same input → same output. No random noise.
4. **Minimal dependencies:** Rely on existing TypeScript/Node.js toolchain (vitest for assertions, native JSON/CSV parsing).
5. **Extensible:** New metrics should be addable as independent modules without restructuring core code.

### 6.2 Tool Inventory

The following tools are specified. Implementation is deferred to follow-up work items.

---

#### T1: `npm run balance-report` — Comparison Report

**Purpose:** Compare current Monte Carlo results against a committed baseline and report statistically significant deviations.

**Usage:**
```bash
npm run balance-report -- --current results/latest.json --baseline results/baseline.json
npm run balance-report -- --current results/latest.json --baseline results/baseline.json --format markdown
```

**Arguments:**

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--current` | Path | Required | Path to current Monte Carlo JSON output |
| `--baseline` | Path | Required | Path to baseline Monte Carlo JSON output |
| `--format` | `json` \| `markdown` \| `terminal` | `terminal` | Output format |
| `--threshold` | Number | `5` | Percentage change threshold for flagging |
| `--ci` | Flag | `false` | Exit with non-zero code if any critical guardrail breached |

**Output:**

- **JSON:** `{comparisons: [{metric, baseline, current, deltaPct, flagged}], guardrails: [{name, value, threshold, passed}], overall: 'pass' | 'fail'}`
- **Markdown:** Tabular report suitable for posting as a PR comment or work item note.
- **Terminal:** Coloured diff output highlighting regressions in red, improvements in green.

**Key comparisons:**
- Win rate by strategy × difficulty
- Score distribution (median, IQR, skew)
- Loss mode decomposition
- Average turns, no-action turns, grid fill timing

---

#### T2: `npm run balance-cards` — Per-Card Micro Report

**Purpose:** Produce micro-level metrics for each card, optionally filtered by family or tier.

**Usage:**
```bash
npm run balance-cards -- --input card-data.csv --runs results/latest.json
npm run balance-cards -- --input card-data.csv --runs results/latest.json --family business
npm run balance-cards -- --input card-data.csv --runs results/latest.json --tier 1 --format json
```

**Arguments:**

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--input` | Path | Required | Path to `card-data.csv` |
| `--runs` | Path | Required | Path to Monte Carlo JSON output |
| `--family` | String | All | Filter by card family (`business`, `event`, `upgrade`, `community-space`, `staff`) |
| `--tier` | Number | All | Filter by tier number |
| `--format` | `json` \| `markdown` \| `terminal` | `terminal` | Output format |

**Metrics reported per card:** M1–M7 (as defined in §4), with feasibility notes for metrics not yet computable.

**Output:**

- **JSON:** `{cards: [{id, name, family, metrics: {pickRate, winRateDelta, ...}}]}`
- **Markdown:** Table with per-card rows and metric columns, with colour-coded outliers.

---

#### T3: `npm run balance-global` — Macro Report

**Purpose:** Compute and display all macro-level metrics for a given Monte Carlo run.

**Usage:**
```bash
npm run balance-global -- --runs results/latest.json
npm run balance-global -- --runs results/latest.json --format json
npm run balance-global -- --runs results/latest.json --difficulty medium
```

**Arguments:**

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--runs` | Path | Required | Path to Monte Carlo JSON output |
| `--difficulty` | String | All | Filter by difficulty (`easy`, `medium`, `hard`) |
| `--format` | `json` \| `markdown` \| `terminal` | `terminal` | Output format |

**Metrics reported:** G1–G8 (as defined in §5), with feasibility notes.

**Output:**

- **JSON:** `{winRateMatrix, scoreDistribution, economyHealth, synergyDiversity, lossModeDecomposition, cardUsageDiversity, turnByTurnSnapshots, trapCardPrevalence}`
- **Markdown:** Sectioned report with tables and interpretation guidance.

---

#### T4: `npm run balance-capture-baseline` — Baseline Capture

**Purpose:** Run a full Monte Carlo sweep and save the results as a new baseline snapshot.

**Usage:**
```bash
npm run balance-capture-baseline
npm run balance-capture-baseline -- --tag "pre-v0.2.0"
npm run balance-capture-baseline -- --runs 500
```

**Arguments:**

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--tag` | String | Auto-generated date stamp | Tag for the baseline commit |
| `--runs` | Number | `200` | Number of seeds per strategy/difficulty |
| `--out` | Path | `results/baseline/` | Output directory |

**Behaviour:**
1. Runs Monte Carlo sweeps for all 4 strategies × 3 difficulties (12 combos).
2. Saves output to `results/baseline/<tag>/`.
3. Generates a summary report.
4. Reminds the user to commit the baseline (does not commit automatically).

---

#### T5: `npm run balance-check` — CI Guardrail Check

**Purpose:** Run a full balance check and exit with non-zero if critical guardrails are breached. Designed for CI pipeline integration.

**Usage:**
```bash
npm run balance-check
npm run balance-check -- --baseline results/baseline/latest.json
```

**Arguments:**

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--baseline` | Path | `results/baseline/latest.json` | Baseline to compare against |
| `--threshold` | Number | `5` | Percentage change threshold |
| `--ci` | Flag | `true` | Exit with non-zero on critical failure |

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | All critical guardrails pass |
| 1 | Critical guardrail breached — blocking |
| 2 | Warning guardrails breached — non-blocking |

### 6.3 Architecture Diagram (Proposed)

```
                 +------------------+
                 |  card-data.csv    |
                 |  (source of truth) |
                 +--------+---------+
                          |
                          v
+------------------+    +-------------------------------+
| Monte Carlo      |--->| Balance Analysis Engine        |
| Harness          |    | (shared core library)          |
| (scripts/monte-  |    +-------------------------------+
|  carlo.ts)       |    |  - CardMetrics (M1-M7)        |
+-------+----------+    |  - GlobalMetrics (G1-G8)       |
        |               |  - ComparisonEngine            |
        v               |  - BaselineManager             |
+------------------+    +-------------------------------+
| runs/latest.json  |         |        |        |
| runs/latest.csv   |         v        v        v
+------------------+    +--------+ +--------+ +--------+
                        | Report | | Card   | | Global |
                        | T1     | | Report | | Report |
                        | compare| | T2     | | T3     |
                        +--------+ +--------+ +--------+
```

### 6.4 Shared Library Structure (Proposed)

```
scripts/balance/
├── index.ts              # CLI entry point (dispatches to sub-commands)
├── engine/
│   ├── card-metrics.ts   # M1-M7 computation
│   ├── global-metrics.ts # G1-G8 computation
│   ├── comparison.ts     # Current vs baseline diff engine
│   └── baseline.ts       # Baseline capture and management
├── reports/
│   ├── json.ts           # JSON formatter
│   ├── markdown.ts       # Markdown report generator
│   └── terminal.ts       # Terminal/ANSI formatter
├── guards/
│   └── thresholds.ts     # Guardrail definitions and evaluation
└── utils/
    ├── csv.ts            # CSV parsing helpers
    └── statistics.ts     # Helper functions (median, IQR, Gini, HHI)
```

### 6.5 Output Format Specification

#### JSON Summary Format (Machine-Readable)

```json
{
  "meta": {
    "tool": "balance-report",
    "version": "1.0.0",
    "timestamp": "2026-07-23T00:00:00Z",
    "source": {
      "cardDataCsv": "example-games/main-street/card-data.csv",
      "monteCarloResults": "results/latest.json",
      "baseline": "results/baseline-2026-07-01.json"
    }
  },
  "summary": {
    "guardrails": {
      "passed": 6,
      "flagged": 1,
      "failed": 0,
      "overall": "pass"
    }
  },
  "comparisons": [
    {
      "metric": "winRate_greedy_medium",
      "baseline": 45.2,
      "current": 42.8,
      "delta": -2.4,
      "deltaPct": -5.31,
      "flagged": false,
      "threshold": 5.0
    }
  ],
  "microMetrics": { ... },
  "macroMetrics": { ... }
}
```

#### CSV Per-Run Detail Format

```
seed,strategy,difficulty,result,endReason,score,coins,turns,grid50Turn,grid100Turn,noActionTurns
mc-balance-001,greedy,medium,win,score_threshold,158,42,13,5,10,1
mc-balance-002,greedy,medium,loss,bankruptcy,67,0,7,4,7,0
...
```

---

## 7. Integration with Existing Infrastructure

### 7.1 Monte Carlo Harness (`MainStreetMonteCarlo.ts`, `scripts/monte-carlo.ts`)

**Current capabilities:**
- Runs N seeds (default 200) with configurable AI strategy and max turns
- Outputs `MonteCarloMetrics` (win rate, median/average score, loss reasons, grid fill timing) + per-run CSV
- Supports 4 strategies (`market-greedy`, `demo-greedy`, `greedy`, `random`)
- Supports 3 difficulties via `MainStreetDifficulty` presets

**Required extensions for balance tooling:**
1. **Strategy × Difficulty sweep runner** — currently must be invoked separately for each combination. A batch runner that iterates all 12 combos is needed for the baseline capture tool.
2. **Per-run card ownership tracking** — `MonteCarloRunSummary` needs a `cardsOwned: string[]` field listing card IDs purchased during the run.
3. **Per-run market offer tracking** — `MonteCarloRunSummary` needs a `marketOffers: string[]` field listing card IDs that appeared in the market.
4. **Per-run turn-by-turn snapshots** — Optionally, an `economyHistory: {turn, coins, rep, score, income, expenses}[]` field for economy health and turn-by-turn metrics.
5. **Per-run income breakdown** — Optionally, a breakdown of income sources (base vs synergy vs event) for synergy utilization calculation.

**Extension philosophy:** Extend the harness incrementally. Items 1–3 are high-priority for the first implementation wave. Items 4–5 are secondary.

### 7.2 Playtest Scenarios (`docs/main-street/playtest-scenarios.md`)

**Current capabilities:**
- 7 curated deterministic seeds with expected outcomes
- Wired to CI via `smoke-scenario.test.ts`
- Used for manual validation and regression detection

**Integration:**
- Playtest seeds should be re-run as part of balance validation: `npm run balance-playtest-seeds` could compare results against documented expectations.
- New curated scenarios should be added when a new balance-sensitive feature is added.
- The balance-check tool should include playtest seed validation as a lightweight pre-check before the full Monte Carlo sweep.

### 7.3 CI Pipeline (GitHub Actions — `.github/workflows/`)

**Current capabilities:**
- `pr-checks.yml`: Runs test suite on PRs; includes Monte Carlo guardrail tests (`mont​e-carlo-guardrails.test.ts`)
- `deploy.yml`: Builds and deploys on push to main

**Integration:**
1. Add `npm run balance-check` as a CI step after tests pass.
2. Configure it with `--ci` flag so a critical guardrail breach blocks PR merge.
3. Baseline snapshots should be committed to `results/baseline/` and version-controlled.
4. The baseline comparison step should be a CI-only check (not run on every local build).

### 7.4 Difficulty Presets (`MainStreetDifficulty.ts`)

**Current capabilities:**
- Easy: 12 starting coins, 25 max turns, 100 win threshold
- Medium: 8 starting coins, 25 max turns, 150 win threshold
- Hard: 5 starting coins, 20 max turns, 175 win threshold

**Integration:**
- Balance reports should be filterable by difficulty.
- Default reports should show Medium difficulty (the primary balance target).
- Easy and Hard should be shown as secondary matrices.

### 7.5 AI Strategies (`MainStreetAiStrategy.ts`)

**Current capabilities:**
- `market-greedy`: Buys cheapest business only (M2 baseline)
- `demo-greedy`: Business + events + upgrades (M2 baseline)
- `greedy`: Heuristic-scored full action space (M3 primary)
- `random`: Uniform random valid actions

**Integration:**
- All 4 strategies should be included in balance reports.
- `greedy` on Medium is the primary balance reference strategy/difficulty.
- Strategy comparison is a key analysis dimension (G1).

### 7.6 Economy Ledger (`src/rule-engine/EconomyLedger.ts`)

**Current capabilities:**
- Tracks coins, reputation, score
- Optional constraints (min/max values)
- Logging interface for coin/reputation changes

**Integration:**
- The Economy Ledger's logging capability can provide the per-turn snapshots needed for G3 and G7.
- Extend EconomyLedger with a `getHistory()` method that returns the full turn-by-turn log for a run.
- This is a minimal harness extension.

### 7.7 Existing Card Data (`card-data.csv`)

**Current capabilities:**
- 86 card templates across 5 families
- Fields: family, id, name, cost, baseIncome, synergyTypes, upgradePath, tier, trigger, effect type, target, targetSynergy, coinDelta, reputationDelta, etc.

**Integration:**
- Balance tools read `card-data.csv` as the card parameter source.
- No CSV schema changes are required — all proposed metrics can be computed from existing fields.
- Recommendations for future CSV extensions are documented in §9.

### 7.8 Related CSV Initiatives

| Initiative | Work Item | Integration |
|------------|-----------|-------------|
| Move tier definitions into CSV | CG-0MR91VLA6009V1XG | When tier definitions are in CSV, balance tools can perform tier-based analysis (e.g., "are Tier 3 cards correctly costed relative to Tier 2?"). |
| Generalize Flu logic into CSV | CG-0MR91VWHG005Q2E7 | When event card effects are parameterised in CSV, the Event Impact Score (M6) can directly read effect parameters from the data source. |
| Move CSV validation into test suite | CG-0MR91XOW4007NAMG | Balance reports should validate CSV data integrity as a prerequisite — invalid rows should be flagged before metric computation. |

---

## 8. Baseline Management

### 8.1 What Is a Baseline?

A **balance baseline** is a committed snapshot of Monte Carlo results representing the "known good" balance state. It serves as the reference point for regression detection.

### 8.2 Baseline Capture Procedure

1. **Trigger:** After a balance review PASS or documented FLAG decision.
2. **Command:** `npm run balance-capture-baseline -- --tag "pre-v0.2.0"`
3. **Output:** Saved to `results/baseline/<tag>/` with:
   - `metrics.json` — Combined Monte Carlo results (all strategies × difficulties)
   - `summary.json` — Computed micro and macro metrics
4. **Commit:** Manually commit and tag:
   ```bash
   git add results/baseline/
   git commit -m "chore: capture balance baseline pre-v0.2.0"
   git tag balance-baseline-2026-07-23
   ```

### 8.3 Baseline Versioning

| Tag Pattern | Example | Purpose |
|-------------|---------|---------|
| `balance-baseline-<date>` | `balance-baseline-2026-07-23` | Standard dated baseline |
| `balance-baseline-pre-<version>` | `balance-baseline-pre-v0.2.0` | Pre-release baseline |
| `balance-baseline-release-<version>` | `balance-baseline-release-v0.2.0` | Release-approved baseline |

### 8.4 Handling Stochastic Variance

Monte Carlo results are stochastic (200 seeds provide ~7% margin of error for win rate at 95% confidence). Baseline comparison should use:

1. **Percentage change thresholds** — Flag only changes > 5% (configurable via `--threshold`).
2. **Confidence intervals** — Report win rate as `value ± marginOfError` (e.g., `45% ± 3.5%`).
3. **Rolling baselines** — A single baseline is sufficient. If seasonal drift is suspected, maintain a rolling baseline of the last 3 captures.

### 8.5 Regression Comparison Flow

```
   Baseline (committed)          Current (uncommitted)
         |                              |
         v                              v
   +----------------------------------------+
   | Comparison Engine                       |
   | - Win rate: 45.2% -> 42.8% (-5.3%)     |
   | - Median score: 158 -> 152 (-3.8%)     |
   | - Bankruptcy share: 57% -> 62% (+8.8%) |
   +----------------------------------------+
         |
         v
   +----------------------------------------+
   | Decision Gate                           |
   | - All critical guardrails: PASS         |
   | - Bankruptcy share flagged (+8.8%)      |
   | - Overall: FLAG (document rationale)    |
   +----------------------------------------+
```

---

## 9. Recommendations & Out-of-Scope

### 9.1 CSV Schema Recommendations (Non-Blocking)

The current CSV schema is sufficient for all proposed metrics. The following changes would **enable richer analysis** but are not required:

1. **Add `rarity` column** — Distinguish common/uncommon/rare cards within a tier for pick-rate normalisation.
2. **Add `tags` column** — Comma-separated tags for cross-cutting card groups (e.g., "early-game", "combo-piece", "risk-mitigation").
3. **Add `deckLimit` column** — Maximum copies per deck (currently implicit: 3 for most, 2 for upgrades).
4. **Standardise `trigger` values** — Currently free-text. A controlled vocabulary (incident, investment, permanent) would improve automated classification.

### 9.2 Out-of-Scope Features (Future Work Items)

| Feature | Rationale | Suggested Work Item Title |
|---------|-----------|--------------------------|
| **Dashboard UI** | CLI-first was specified; a web dashboard is aspirational | "Balance Dashboard: Web UI for visualising balance metrics over time" |
| **Automated tuning** | The PRD defines analysis tools, not auto-tuning | "Automated Card Tuning: Script that suggests parameter changes from balance metric drift" |
| **Human playtest data ingestion** | AI metrics may not reflect human play | "Playtest Data Pipeline: Ingest human playtest transcripts and compare against AI baselines" |
| **Historical trend analysis** | Comparing across multiple baselines over time | "Balance Trend Visualisation: Track metrics across release history" |
| **CI auto-baselining** | Automatically update baseline after each release | "Auto-Baseline: Automatically capture and commit balance baseline on release" |

---

## 10. Implementation Roadmap

### Phase 1: Harness Extensions (1–2 sprints)

| Task | Description | Est. Effort |
|------|-------------|-------------|
| E-1 | Add per-run card ownership tracking to `MonteCarloRunSummary` | 2 days |
| E-2 | Add strategy × difficulty batch runner to Monte Carlo harness | 2 days |
| E-3 | Add per-run market offer tracking | 1 day |
| E-4 | Add `getHistory()` to EconomyLedger | 1 day |

### Phase 2: Core Analysis Library (Complete)

| Task | Description | Actual File(s) | Est. Effort |
|------|-------------|----------------|-------------|
| C-1 | Implement statistics helpers (median, IQR, Gini, HHI) | `scripts/balance/engine/statistics.ts`, `tests/balance/statistics.test.ts` | 1 day |
| C-2 | Implement card metrics engine (M1–M7) | `scripts/balance/engine/card-metrics.ts`, `tests/balance/card-metrics.test.ts` | 3 days |
| C-3 | Implement global metrics engine (G1–G8) | `scripts/balance/engine/global-metrics.ts`, `tests/balance/global-metrics.test.ts` | 3 days |
| C-4 | Implement comparison engine with guardrail evaluation | `scripts/balance/engine/comparison.ts`, `tests/balance/comparison.test.ts` | 2 days |
| C-5 | Scaffolding, guardrail thresholds, baseline module | `scripts/balance/guards/thresholds.ts`, `scripts/balance/engine/baseline.ts`, `tests/balance/thresholds.test.ts`, `tests/balance/baseline.test.ts` | 2 days |
| C-6 | Documentation & integration tests | `docs/main-street/balance-analysis-api.md`, `tests/balance/integration.test.ts` | 1 day |

> **Implementation Note:** Phase 2 implementation differs from the PRD spec in the following ways:
> - C-5 was reordered relative to C-2/C-3 (done earlier to unblock scaffold-dependent work).
> - Guardrail thresholds are defined in `scripts/balance/guards/thresholds.ts` with `evaluateGuardrails()` rather than a dedicated `ThresholdSet` class. The `GUARDRAIL_THRESHOLDS` constant mirrors PRD §3.3 values exactly.
> - Baseline module lives in `scripts/balance/engine/baseline.ts` (engine sub-module) rather than a top-level `baseline/` directory.
> - All statistics functions are in a single `statistics.ts` file rather than separate files per function.
> - Phase 1 harness extensions (`economyHistory`, `cardsOwned`, `marketOffers`) are expected to be added to `MonteCarloRunSummary` but metrics gracefully degrade to `null` when absent.

### Phase 3: CLI Tools (2 sprints)

| Task | Description | Est. Effort |
|------|-------------|-------------|
| T1-1 | Implement `balance-report` (comparison tool) | 2 days |
| T1-2 | Implement report formatters (JSON, markdown, terminal) | 2 days |
| T2-1 | Implement `balance-cards` (per-card report) | 2 days |
| T3-1 | Implement `balance-global` (macro report) | 2 days |
| T4-1 | Implement `balance-capture-baseline` | 1 day |
| T5-1 | Implement `balance-check` (CI guardrail check) | 1 day |

### Phase 4: CI Integration (1 sprint)

| Task | Description | Est. Effort |
|------|-------------|-------------|
| CI-1 | Add `balance-check` to CI pipeline | 1 day |
| CI-2 | Document baseline management in contributing guide | 1 day |
| CI-3 | Add balance report generation to release checklist | 1 day |

---

## 11. Appendix: Existing Infrastructure Survey

### 11.1 Monte Carlo Harness

| File | Purpose | Key Interfaces |
|------|---------|---------------|
| `example-games/main-street/MainStreetMonteCarlo.ts` | Core harness | `MonteCarloMetrics`, `MonteCarloRunSummary`, `MonteCarloResult`, `monteCarloStrategy` |
| `scripts/monte-carlo.ts` | CLI entry point | `--runs`, `--seed-prefix`, `--strategy`, `--max-turns`, `--out`, `--csv-out` |
| `tests/main-street/monte-carlo-guardrails.test.ts` | CI guardrail test | Asserts win rate for greedy/Medium within 30–60% range |
| `docs/main-street/monte-carlo-sample-results.md` | Docs | Sample results interpretation |

### 11.2 Card Data

| File | Purpose |
|------|---------|
| `example-games/main-street/card-data.csv` | Source of truth for all card templates |
| `src/core-engine/CsvLoader.ts` | CSV parsing utility (used at build time) |
| `scripts/balance-cards/` | Existing `run-balance-cards` balancing algorithm |

### 11.3 Playtest Scenarios

| File | Purpose |
|------|---------|
| `docs/main-street/playtest-scenarios.md` | 7 curated deterministic seeds with expected outcomes |
| `tests/main-street/smoke-scenario.test.ts` | CI smoke test referencing playtest seed |

### 11.4 Balancing Algorithm

| File | Purpose |
|------|---------|
| `scripts/balance-cards/algorithm.ts` | Core balancing algorithm (curve-fitting + tier band analysis) |
| `scripts/run-balance-cards.ts` | CLI entry point for the balancing pass |
| `docs/main-street/balancing-methodology.md` | Full documentation of the balancing algorithm |

### 11.5 Economy Tracking

| File | Purpose |
|------|---------|
| `src/rule-engine/EconomyLedger.ts` | Resource tracking (coins, reputation, score) |
| `docs/rule-engine/economy-ledger.md` | Economy Ledger documentation |

### 11.6 CI Guardrails

| File | Purpose |
|------|---------|
| `tests/main-street/monte-carlo-guardrails.test.ts` | CI guardrail test (win rate range assertions) |
| `tests/main-street/smoke-scenario.test.ts` | Smoke test with deterministic seed |

---

## 12. Appendix: Metric Feasibility Assessment

| Metric | Status | Gap | Mitigation |
|--------|--------|-----|------------|
| M1: Pick Rate | ❌ Not feasible | No market offer log | Add `marketOffers` to `MonteCarloRunSummary` (smallest extension) |
| M2: Win-Rate Delta | ❌ Not feasible | No card ownership tracking | Add `cardsOwned` to `MonteCarloRunSummary` |
| M3: Cost-to-Income Ratio | ✅ Feasible | None — static from CSV | No extension needed |
| M4: Synergy Utilization | ❌ Not feasible | No income breakdown per source | Add income breakdown to log; estimate with slot-based model as fallback |
| M5: Upgrade Adoption | ❌ Not feasible | No card ownership tracking | Same as M2 fix |
| M6: Event Impact Score | ⚠️ Partial | Event frequency from runs; delta from CSV | Frequency weighted by run data; static delta from CSV |
| M7: Survival Rate | ❌ Not feasible | No card ownership tracking | Same as M2 fix |
| G1: Win Rate × Strategy × Difficulty | ✅ Feasible | Runner needed (not data) | Batch sweep runner — no data extension needed |
| G2: Score Distribution | ✅ Feasible | Existing data | Aggregation function only |
| G3: Economy Health | ⚠️ Partial | Per-run turn snapshots missing | Extend EconomyLedger with `getHistory()` |
| G4: Synergy Diversity | ❌ Not feasible | No grid composition per run | Add `finalGridCardIds` to `MonteCarloRunSummary` |
| G5: Loss Mode Decomposition | ✅ Feasible | Existing data | Already in `MonteCarloMetrics` |
| G6: Card Usage Diversity | ❌ Not feasible | No grid composition per run | Same as G4 fix |
| G7: Turn-by-Turn Snapshots | ❌ Not feasible | No economy history per run | Extend harness with `economyHistory` logging |
| G8: Trap Card Prevalence | ❌ Not feasible | No card ownership tracking | Same as M2 fix |

**Harness extension priority:**

| Priority | Extension | Enables |
|----------|-----------|---------|
| P0 | Per-run `cardsOwned` tracking | M2, M5, M7, G8 |
| P1 | Strategy × Difficulty batch runner | G1, T4, T5 |
| P2 | Per-run final grid composition | G4, G6 |
| P3 | EconomyLedger `getHistory()` | G3, G7 |
| P4 | Per-run market offer tracking | M1 |
| P5 | Per-run income breakdown | M4 |

---

## Document History

| Date | Change | Author |
|------|--------|--------|
| 2026-07-23 | Initial draft | Map |
