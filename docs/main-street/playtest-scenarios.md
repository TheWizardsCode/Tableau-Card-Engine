# Main Street: Playtest Scenarios

> **Work item:** CG-0MMJCMVMQ1TGTM0R (Playtest Scenarios & Balance Tasks)
> **Last updated:** M2 Expanded Card Pool + Tutorial Scenario (CG-0MM5ZGB8U02S0BFO)

This document defines curated playtest scenarios for validating the M2 expanded card pool. Each scenario uses a deterministic seed so results are exactly reproducible. Designers can run these scenarios to verify balance expectations after any card or rule changes.

## Running Scenarios

```bash
# Run the canonical smoke-test scenario (seed: smoke-1)
npx vitest run --project unit tests/main-street/smoke-scenario.test.ts

# Run all 5 curated scenarios and compare results
npx tsx scripts/playtest-scenarios.ts

# Run the Monte Carlo sweep (200 seeds, in test suite)
npx vitest run --project unit -t "Monte Carlo"

# Run the dedicated Monte Carlo harness (JSON + CSV output)
npm run monte-carlo
```

---

## Scenario 0: "Tutorial Smoke" (seed: `smoke-1`)  ← **CI Smoke Seed**

**Category:** Loss -- Bankruptcy  
**Expected outcome:** Loss on turn 4 (bankruptcy)  
**Score:** 43 | **Turns:** 4  
**Difficulty used in test:** Medium (greedy strategy baseline); Easy for Tutorial scenario UI

### What happens

The player purchases a Florist and a Block Party investment on turn 1, then faces a Tax Audit incident. The tight coin reserve leads to bankruptcy by turn 4.

### Smoke test

This seed is wired to `tests/main-street/smoke-scenario.test.ts` (included in `npm test`):

```bash
# Run smoke test directly
npx vitest run --project unit tests/main-street/smoke-scenario.test.ts
```

**Assertions made by the smoke test:**
- Run completes without errors
- All required summary fields present (`game`, `version`, `seed`, `totalTurns`, `result`, `endReason`, `finalScore`, `turns`)
- Run is deterministic (two runs with the same seed produce identical output)
- Each turn record has the expected fields

**Tutorial scenario (Easy):** The same seed with Easy difficulty will produce a different outcome since Easy provides more starting coins and a lower win threshold (default presets impose no turn limit — CG-0MSLXJCHH001DLIO). This is tested in the `smoke-scenario.test.ts` as the "Tutorial scenario baseline" suite.

### Adding or updating tutorial text

Tutorial steps are defined in `example-games/main-street/TutorialFlow.ts` in the `UNIFIED_TUTORIAL_STEPS` array. There are currently 23 steps (T1–T23), each with:
- `titleKey` — i18n key for the short heading shown in bold
- `bodyKey` — i18n key for the body text
- `highlightZone` — zone identifier for the area to highlight (resolved via the tutorial layout system), or `'centerModal'`/`'completionModal'` for centered overlays
- `gate` — `'confirm'` for informational steps, `'action'` for action-gated steps
- `requiredAction` — (only for action-gated steps) the in-game action required to advance

All step text lives in the English locale bundle (`example-games/main-street/i18n/tutorial-en.ts`) with card facts resolved from `card-data.csv` via `{cardName}`/`{cost}`/`{bonus}` placeholders. See `docs/main-street/tutorial-localization.md` for the editorial rules (≤3 sentences per box, one point per box) and the T1–T23 step-flow table.

---

## Scenario 1: "Quick Bankruptcy" (seed: `sweep-63`)

**Category:** Loss -- Bankruptcy
**Expected outcome:** Loss on turn 1 (bankruptcy)
**Score:** 14 | **Turns:** 1

### What happens

The player buys an Art Gallery (cost 4) and Block Party investment (cost 4), spending all 6 starting coins (Medium preset, re-tuned by CG-0MSP26Q5N002EH8P) plus income reserve. The Tax Audit incident then hits for -3 coins, pushing the balance to -1. Bankruptcy is declared immediately.

### Balance observations

- This demonstrates the "greed trap" -- spending everything on turn 1 with no reserve leaves the player fully exposed to any negative incident.
- The greedy strategy has no concept of risk management; a smarter player would hold 3+ coins as a buffer.
- **Pass criteria:** Loss occurs. Score < 20.

### Turn log

| Turn | Coins | Rep | Score | Grid | Actions | Incident |
|------|-------|-----|-------|------|---------|----------|
| 1 | -1 | 3 | 14 | 1/10 | buy Art Gallery, buy Block Party | Tax Audit |

---

## Scenario 2: "Reputation Collapse" (seed: `sweep-75`)

**Category:** Loss -- Reputation collapse
**Expected outcome:** Loss on turn 5 (reputation hits 0)
**Score:** 13 | **Turns:** 5

### What happens

The player builds a street of low-cost businesses (Food Trucks, Cafe, Diner) but faces a barrage of reputation-damaging incidents: Noise Complaint (-1 rep), Vandalism (-1 rep), and Health Inspection (-1 rep) over turns 3-5. Reputation drops from 3 to 0.

### Balance observations

- Demonstrates that reputation is a real loss vector, not just a scoring bonus.
- Entertainment and Food businesses are especially vulnerable when paired with Noise Complaint + Health Inspection sequences.
- The greedy strategy never prioritises reputation-building investments (Charity Drive, Block Party) which could have prevented collapse.
- **Pass criteria:** Loss by reputation_collapse. Turns <= 6.

### Turn log

| Turn | Coins | Rep | Score | Grid | Actions | Incident |
|------|-------|-----|-------|------|---------|----------|
| 1 | 2 | 3 | 17 | 1/10 | buy Food Truck, buy Grand Opening | Tax Audit |
| 2 | 3 | 3 | 18 | 2/10 | buy Food Truck | Road Construction |
| 3 | 6 | 2 | 16 | 3/10 | buy Cafe | Noise Complaint |
| 4 | 14 | 1 | 19 | 4/10 | buy Diner | Vandalism |
| 5 | 13 | 0 | 13 | 5/10 | buy Bookshop, buy Block Party | Health Inspection |

---

## Scenario 3: "Slow Grind" (seed: `sweep-14`)

**Category:** Win -- Late threshold (turn 17 of 20)
**Expected outcome:** Win, barely, with tight economy through mid-game
**Score:** 155 | **Turns:** 17

### What happens

The player opens with Florist (cost 2) and invests in Block Party but then faces two turns of inactivity (no affordable actions). Income is very low until turn 8-9 when Service synergies finally kick in with Pawn Shop + Laundromat + Barbershop. The win doesn't arrive until turn 17 -- a slow build that would previously have been close to the 20-turn limit; with no turn limit by default the game continues until the score threshold, all challenges, bankruptcy, or reputation collapse (CG-0MSLXJCHH001DLIO).

### Balance observations

- This is a "near-miss" scenario -- any additional negative incident could push it into a time-out loss.
- Demonstrates that low-cost openings (Florist at $2, Food Truck at $2) produce slower income curves.
- The grid fills by turn 15 and the final turns are pure income accumulation with no purchases.
- Service synergy cluster (Laundromat + Barbershop) provides steady mid-game income.
- **Pass criteria:** Win. Score in range 150-165. Turns >= 15.

---

## Scenario 4: "Comfortable Win" (seed: `Scenario-FoodFocus`)

**Category:** Win -- Mid-game threshold (turn 13)
**Expected outcome:** Solid win with mixed synergy strategy
**Score:** 158 | **Turns:** 13

### What happens

The player builds a diverse street: Park, Food Truck, Park, Bakery, Pawn Shop, Bookshop, Florist, Pawn Shop, Laundromat, Bookshop. Bridge cards (Food Truck, Florist) connect Culture and Commerce clusters. Income ramps steadily after turn 7 when the grid passes 50% capacity.

### Balance observations

- Bridge cards (Food Truck: Food+Entertainment, Florist: Commerce+Culture) provide adjacency bonuses from multiple synergy types.
- Two Parks provide cheap Culture filler that boosts Bookshop adjacency.
- The player absorbs several negative incidents (Shoplifting, Power Outage, Health Inspection) without crisis.
- **Pass criteria:** Win. Score in range 150-170. Turns in range 10-15.

---

## Scenario 5: "Bridge Synergy Powerhouse" (seed: `Bridge-Master-7`)

**Category:** Win -- Fast threshold (turn 10)
**Expected outcome:** Dominant win driven by multi-synergy bridge cards
**Score:** 169 | **Turns:** 10

### What happens

The player opens with two Parks and two Cafes (Food+Culture bridges), creating a dense Culture adjacency cluster. By turn 5, the base income from synergies alone is substantial. Art Gallery (Culture+Entertainment) and Boutique (Commerce) round out the grid. The 150-point threshold is hit by turn 10 with 129 coins.

### Balance observations

- This is the highest-scoring curated scenario, showing the upper bound of the greedy strategy with favourable draws.
- Multi-synergy bridge cards are the star: Cafe bridges Food+Culture, creating double adjacency potential.
- The Culture-heavy cluster (Park, Park, Cafe, Cafe, Bookshop, Bookshop, Art Gallery) generates massive synergy income.
- **Pass criteria:** Win. Score >= 165. Turns <= 12.

---

## Balance Heuristics Checklist

> **Updated 2026-08-13 (CG-0MSRKN325004ELH2).** This checklist predates the
> difficulty presets; the win-rate/median-score heuristics below are superseded
> by the per-difficulty design-intent bands enforced in the guardrail suite
> (see [balance-guardrail-recommendations.md](balance-guardrail-recommendations.md)
> and PRD §3.3).

Use these heuristics when evaluating card changes or rule adjustments:

### Win Rate

- **Target (design intent, greedy AI):** Easy 60-90%, Medium 45-75%, Hard 15-40%. Measured (200 seeds, 60 turns): Easy ~83.5%, Medium ~62%, Hard ~22%.
- **If Medium drops below 45%** (or Hard below 15%): negative incidents may be too harsh; reduce coin penalties or incident frequency.
- **If Easy exceeds 90%** (or Medium exceeds 75%): consider increasing difficulty (lower starting coins, higher win threshold, more incidents).

### Loss Vectors

- **Bankruptcy** should dominate losses (~50-60%+ of losses; currently ~100% of greedy/Medium losses).
- **Reputation collapse** should account for a meaningful share on harder presets (~30-40% target on Hard; currently ~8%).
- **Timeout** (harness 60-turn cap) should be rare (< 15% of losses); currently 0% at 60 turns.
  Note: turn limits are opt-in (CG-0MSLXJCHH001DLIO); presets impose no turn limit.

### Score Distribution

- **Median score (greedy/Medium):** 120-180 band (PRD §3.3); measured ~153.
- **Fast wins** (turn <= 10): ~30% of wins -- indicates strong early draws.
- **Late wins** (turn >= 15): ~15% of wins -- indicates tough early game.

### Synergy Balance

- No single synergy type should dominate >40% of wins.
- Bridge cards should appear in >50% of winning strategies (by grid composition).
- All 5 synergy types should appear in the grid at least occasionally (>20% of runs).

### Economy Curve

- Players should have at least 2 turns of "can't afford anything" per run on average.
- Grid should reach 50% capacity (5/10) by turn 7-9 on average.
- Grid should fill (10/10) by turn 12-15 on average.

---

## Running Custom Sweeps

For more thorough balance testing, use the Monte Carlo test:

```bash
# Run the 200-seed sweep
npx vitest run --project unit -t "Monte Carlo"
```

For deterministic balance reports with persisted artifacts:

```bash
# Default harness run (200 seeds, market-greedy strategy)
npm run monte-carlo

# Custom run size and output files
npx tsx scripts/monte-carlo.ts --runs 100 --seed-prefix "mc-balance" --max-turns 25 --strategy market-greedy --out results/main-street-monte-carlo-100.json --csv-out results/main-street-monte-carlo-100.csv
```

Latest baseline interpretation is tracked in `docs/main-street/monte-carlo-sample-results.md`.

For custom sweep sizes, modify the `SEED_COUNT` constant in `tests/main-street/market.integration.test.ts`.

To run a batch of seeds with full transcripts, use the Monte Carlo harness:

```bash
npm run monte-carlo -- --seeds 50 --seed-prefix batch --maxTurns 60 --strategy greedy
```

Then analyse transcripts with standard JSON tools (`jq`, Python, etc.) to extract aggregate statistics.

## See Also

- **[Balance Process & Tooling PRD](prd-balance-process-and-tooling.md)** — Defines the structured balance review process and CLI tools that integrate with these playtest scenarios.
- **[Balancing Methodology](balancing-methodology.md)** — Technical description of the `run-balance-cards` balancing algorithm.
- **[Monte Carlo Sample Results](monte-carlo-sample-results.md)** — Example output from the Monte Carlo simulation harness.