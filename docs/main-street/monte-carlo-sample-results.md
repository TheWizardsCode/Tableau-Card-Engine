# Main Street: Monte Carlo Sample Results

This page records a baseline output from the Main Street Monte Carlo harness for balance discussions and regression review.

## Harness command

```bash
npm run monte-carlo
```

Equivalent explicit command:

```bash
npx vite-node scripts/monte-carlo.ts --runs 200 --seed-prefix mc-balance --max-turns 25 --strategy market-greedy --out results/main-street-monte-carlo.json --csv-out results/main-street-monte-carlo.csv
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
npx vite-node scripts/monte-carlo.ts --sweep --runs 100 --seed-prefix mc-balance --max-turns 25 --out results/sweep.json

# Filter to specific strategies and/or difficulties
npx vite-node scripts/monte-carlo.ts --sweep --runs 100 --sweep-strategies greedy,random --sweep-difficulties medium,hard --out results/sweep-filtered.json
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

## Per-Action Challenge Evaluation Re-Run (CG-0MU8N8B52003HCJ5)

After challenges began evaluating after every action rather than only at
end of turn (CG-0MU37CKRR008252I, producer decision Q2=A), the canonical
greedy profile was re-run and compared against
`docs/main-street/monte-carlo-baseline.json` (generated 2026-09-12).

```bash
npx vite-node scripts/monte-carlo.ts --seeds 200 --seed-prefix mc-balance \
  --maxTurns 60 --strategy greedy --out /tmp/mc-after-greedy.json
```

| Metric | Baseline (2026-09-12) | Per-action re-run | Delta | Relative |
|---|---|---|---|---|
| winRate | 0.830 | 0.635 | -0.195 | -23.5% |
| averageCoinsPerTurn | 639.60 | 656.36 | +16.76 | +2.6% |
| medianScore | 13177.5 | 12547 | -630.5 | -4.8% |

Loss reasons in the re-run: `reputation_collapse` 61/73, `bankruptcy` 12/73.
The coin economy is stable (well within the +/-30% guardrail), but the
win-rate move exceeds the >5% re-baselining threshold, so a follow-up
analysis work item was filed (**CG-0MUE03DGQ005KPZ7**) to attribute the
drift (cumulative balance changes since 2026-09-12 vs. per-action
completion timing) and either regenerate the baseline or fix a regression.
The guardrail test (`tests/main-street/monte-carlo-guardrails.test.ts`)
still passes (win-rate tolerance +/-0.25). The baseline JSON was
intentionally **not** regenerated — the drift-report-then-ask workflow
requires operator approval before a baseline change.

## See Also

- **[Balance Process & Tooling PRD](prd-balance-process-and-tooling.md)** — Defines the structured balance review process, micro/macro metrics, and baseline management strategy that build on these Monte Carlo results.
- **[Balancing Methodology](balancing-methodology.md)** — Technical description of the `run-balance-cards` balancing algorithm.
- **[Playtest Scenarios](playtest-scenarios.md)** — Curated deterministic seeds for manual balance validation.