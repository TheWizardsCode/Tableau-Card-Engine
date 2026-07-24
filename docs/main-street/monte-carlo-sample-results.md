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
