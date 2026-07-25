# Main Street: Monte Carlo Sample Results

This page records a baseline output from the Main Street Monte Carlo harness for balance discussions and regression review.

## Harness command

```bash
npm run monte-carlo
```

Equivalent explicit command:

```bash
npx tsx scripts/monte-carlo.ts --runs 200 --seed-prefix mc-balance --max-turns 25 --strategy market-greedy --out results/main-street-monte-carlo.json --csv-out results/main-street-monte-carlo.csv
```

## Sample output snapshot

Run date: 2026-03-10

| Metric | Value |
|---|---:|
| Runs | 200 |
| Win rate | 86.5% |
| Median final score | 158 |
| Average final score | 144.7 |
| Average turns | 10.68 |
| Average no-action turns | 1.26 |
| Avg turn reaching 5/10 grid | 5.05 |
| Avg turn reaching 10/10 grid | 10.05 |
| Dominant loss reason | reputation_collapse (100% of losses) |

## Interpretation

- The baseline sits inside the CI guardrail thresholds documented in tests.
- The run profile confirms an early-to-mid game street fill and meaningful affordability pressure.
- Losses concentrate in one failure mode (`reputation_collapse`), which makes balance drift easy to spot in later runs.

## Sweep Mode (`--sweep`)

The harness now supports a `--sweep` flag that runs all 12 strategy×difficulty combinations and writes per-combination JSON (and optionally CSV) output files:

```bash
# Run all 12 combinations with 100 seeds each
npx tsx scripts/monte-carlo.ts --sweep --runs 100 --seed-prefix mc-balance --max-turns 25 --out results/sweep.json

# Filter to specific strategies and/or difficulties
npx tsx scripts/monte-carlo.ts --sweep --runs 100 --sweep-strategies greedy,random --sweep-difficulties medium,hard --out results/sweep-filtered.json
```

Output files are named with a strategy-difficulty slug, e.g.:
- `results/sweep-market-greedy-easy.json`
- `results/sweep-greedy-medium.json`
- `results/sweep-random-hard.json`

Each per-combination file includes the same fields as single-mode output plus `difficulty`.

## Extension Fields in Run Summaries

Each `MonteCarloRunSummary` now includes the following additional fields:

| Field | Type | Description |
|-------|------|-------------|
| `cardsOwned` | `string[]` | Card IDs purchased during the run (business, event, and upgrade cards). |
| `marketOffers` | `string[]` | Card IDs that appeared in the market across all turns. |
| `economyHistory` | `{turn, coins, reputation, score}[]` | Turn-by-turn economy snapshot recorded after each economy mutation. |

These fields enable per-card micro metrics (pick rate, win-rate delta, survival rate) and economy health analysis (G3, G7) described in the Balance Process & Tooling PRD.

## See Also

- **[Balance Process & Tooling PRD](prd-balance-process-and-tooling.md)** — Defines the structured balance review process, micro/macro metrics, and baseline management strategy that build on these Monte Carlo results.
- **[Balancing Methodology](balancing-methodology.md)** — Technical description of the `run-balance-cards` balancing algorithm.
- **[Playtest Scenarios](playtest-scenarios.md)** — Curated deterministic seeds for manual balance validation.