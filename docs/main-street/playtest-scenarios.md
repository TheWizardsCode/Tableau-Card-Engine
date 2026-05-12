# Main Street: Playtest Scenarios

> **Work item:** CG-0MMJCMVMQ1TGTM0R (Playtest Scenarios & Balance Tasks)
> **Last updated:** M2 Expanded Card Pool + Tutorial Scenario (CG-0MM5ZGB8U02S0BFO)

This document defines curated playtest scenarios for validating the M2 expanded card pool. Each scenario uses a deterministic seed so results are exactly reproducible. Designers can run these scenarios to verify balance expectations after any card or rule changes.

## Running Scenarios

```bash
# Run a single scenario by seed
npx tsx scripts/demo-main-street.ts --seed "sweep-63"

# Run the canonical smoke-test scenario (seed: smoke-1)
npx tsx scripts/demo-main-street.ts --seed "smoke-1"

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

# Run via CLI demo (JSON output)
npx tsx scripts/demo-main-street.ts --seed "smoke-1"
```

**Assertions made by the smoke test:**
- Run completes without errors
- All required summary fields present (`game`, `version`, `seed`, `totalTurns`, `result`, `endReason`, `finalScore`, `turns`)
- Run is deterministic (two runs with the same seed produce identical output)
- Each turn record has the expected fields

**Tutorial scenario (Easy):** The same seed with Easy difficulty will produce a different outcome since Easy provides more starting coins and 25 turns. This is tested in the `smoke-scenario.test.ts` as the "Tutorial scenario baseline" suite.

### Adding or updating tutorial text

Tutorial steps are defined in `example-games/main-street/scenes/MainStreetTutorialOverlayManager.ts` in the `TUTORIAL_STEPS` array. Each step has:
- `title` — short heading shown in bold
- `body` — multi-line description text
- `anchor` — function that returns the `{x, y, w, h}` bounding box to highlight, or `null` for centred

To add a step, append a new `TutorialStep` object to `TUTORIAL_STEPS`. To change copy, edit the `title` and `body` strings. All strings are localizable by replacing the string literals with i18n key lookups when i18n support is added.

---

## Scenario 1: "Quick Bankruptcy" (seed: `sweep-63`)

**Category:** Loss -- Bankruptcy
**Expected outcome:** Loss on turn 1 (bankruptcy)
**Score:** 14 | **Turns:** 1

### What happens

The player buys an Art Gallery (cost 4) and Block Party investment (cost 4), spending all 8 starting coins. The Tax Audit incident then hits for -3 coins, pushing the balance to -1. Bankruptcy is declared immediately.

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

The player opens with Florist (cost 2) and invests in Block Party but then faces two turns of inactivity (no affordable actions). Income is very low until turn 8-9 when Service synergies finally kick in with Pawn Shop + Laundromat + Barbershop. The win doesn't arrive until turn 17 -- dangerously close to the 20-turn limit.

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

Use these heuristics when evaluating card changes or rule adjustments:

### Win Rate

- **Target:** Greedy strategy should win 90-97% of games (currently ~96.5% over 200 seeds).
- **If win rate drops below 85%:** Negative incidents may be too harsh; reduce coin penalties or incident frequency.
- **If win rate exceeds 99%:** Consider increasing difficulty (lower starting coins, higher win threshold, more incidents).

### Loss Vectors

- **Bankruptcy** should account for ~50-60% of losses (currently ~57%).
- **Reputation collapse** should account for ~30-40% of losses (currently ~29%).
- **Timeout** (turn 20 without reaching 150) should be rare (~10% of losses).

### Score Distribution

- **Median score:** 160-170 range (with greedy strategy).
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

To run a batch of seeds with full transcripts:

```bash
for i in $(seq 0 49); do
  npx tsx scripts/demo-main-street.ts --seed "batch-$i" > "transcripts/batch-$i.json" 2>/dev/null
done
```

Then analyse transcripts with standard JSON tools (`jq`, Python, etc.) to extract aggregate statistics.
