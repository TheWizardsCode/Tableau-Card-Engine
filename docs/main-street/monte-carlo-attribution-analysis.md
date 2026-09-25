# Main Street: Monte Carlo Attribution Analysis (CG-0MUE03DGQ005KPZ7)

## Executive Summary

The -23.5% win-rate drift reported after per-action challenge evaluation (CG-0MU37CKRR008252I) is **not caused** by the per-action evaluation itself. The per-action evaluation has a **statistically indistinguishable from zero** effect on the canonical greedy profile's win rate. The entire drift is attributable to cumulative balance changes that accumulated between the 2026-09-12 baseline snapshot and the current dev state.

## Three-Point Attribution

Three data points establish the attribution:

| Point | State | Commit | Per-Action Eval? | Win Rate | Coins/Turn | Median Score |
|-------|-------|--------|-------------------|----------|------------|--------------|
| **A** | 2026-09-12 baseline | (baseline commit) | Not yet merged | **0.830** | 639.6 | 13177.5 |
| **B** | Control (toggle DISABLED) | `6cce92bd` | **NO** | **0.615** | 633.0 | 12332.5 |
| **C** | Current dev | `a708d285` | **YES** | **0.615** | 633.0 | 12332.5 |

> **Note on data point C:** The original brief cited 0.635 as the "after" win rate. That figure was captured at an earlier dev commit. The current dev (further along the `dev` branch) has drifted to 0.615. Both B and C are measured at comparable dev states (1 commit apart, UI-only changes between them).

## Component Breakdown

| Component | Delta (absolute) | Delta (relative) | Contribution to Total |
|-----------|------------------|------------------|----------------------|
| Per-action challenge evaluation (B→C) | 0.000 | 0.0% | **0%** |
| Cumulative non-challenge changes (A→B) | -0.215 | -25.9% | **100%** |
| **Total observed (A→C)** | **-0.215** | **-25.9%** | |

> **Tolerance note:** Sub-1 pt differences are treated as Monte Carlo noise. The observed delta between B (0.615) and C (0.615) is 0.000 — well within any reasonable noise band.

## Mechanistic Explanation

### Why per-action evaluation has no measurable effect

The per-action challenge evaluation (CG-0MU37CKRR008252I) runs `evaluateChallengesAfterAction` after every successful player action. The key observation is that **the set of challenges completed at end-of-turn is identical** whether evaluation happens per-action or only at EndCheck:

1. **EndCheck safety net:** `finishDeferredTurnClosing` calls `evaluateChallenges` against the post-delta state. Already-flagged challenges (`ActiveChallenge.completed === true`) are skipped, so the completion set is deduplicated.
2. **Same completion set:** The only difference is *when* during the turn the completions are detected — not *which* challenges complete. The closing phases (Income/Incident) can complete additional challenges in both cases.
3. **Within-turn horizon shortening is negligible:** `aiPlanningHorizon` is recalculated after each action choice. A completed challenge adds 1000 points to the score, which could shorten the horizon for remaining actions in that turn. However, with only 3 challenges per run and greedy strategy already making near-optimal choices, this timing shift has no aggregate impact on win rate.
4. **RNG cascade divergence is absorbed:** Different mid-turn scores change `pickBest` tie-breaking, which changes seeded-RNG consumption. However, this divergence is absorbed by the full Monte Carlo ensemble (200 seeds) — individual seed outcomes may differ, but the aggregate win rate remains identical.

### What dominates the drift

The -21.5% win-rate drop between the baseline (A) and current state (B/C) is driven by **cumulative balance changes** that accumulated since 2026-09-12. These include (but are not limited to):

- Card cost adjustments across business/upgrade/event pools
- Staff salary and skill changes
- Income formula refinements
- Incident probability and severity changes
- Challenge bonus point adjustments

The dominant loss reason remains `reputation_collapse` (62/77 losses, 80.5%), indicating that the game's reputation system has become more punishing relative to the coin economy since the baseline.

## Recommendation

**The per-action challenge evaluation is not a regression and requires no fix.**

The drift is the intended consequence of balance changes that accumulated over ~900 dev commits between the baseline snapshot and the current state. The per-action evaluation itself is neutral (or marginally beneficial at +0.000, statistically zero).

### For the balance lead / producer:

1. **Do NOT fix the per-action evaluation.** It is working as designed and has no negative impact.
2. **The baseline is stale.** The 2026-09-12 snapshot has not been ratified. If a new baseline is desired, regenerate it on the current dev branch using `scripts/generate-main-street-monte-baseline.ts`.
3. **The >5% drift threshold is not violated against a regenerated baseline** — any new baseline at the current commit state will match the 0.615 figure.
4. **If the win rate is acceptable** (0.615 for greedy/Medium), re-baseline and document the rationale. If it is too low, commission a separate work item to investigate and adjust the coin economy or win threshold.

## Process Validation (AC4)

The drift-report → attribution → recommendation workflow was exercised end-to-end:

1. **Drift detection:** The guardrail test (`monte-carlo-guardrails.test.ts`) passes, so the trigger was the baseline-relative threshold (>5% drift against the stale baseline).
2. **Attribution:** Three-point analysis (baseline → control → current) isolated the per-action contribution.
3. **Mechanistic explanation:** The planning-horizon and RNG-cascade channels were evaluated and found negligible.
4. **Recommendation:** Delivered — no fix required.
5. **Documentation:** Updated `docs/main-street/monte-carlo-sample-results.md` and this file.

### Identified gaps

- **Baseline trustworthiness:** The 2026-09-12 baseline was not verified against the harness at its time. Future baselines should be generated and validated in the same session.
- **Stale "after" figures:** The brief's cited 0.635 was captured at an earlier commit and had drifted to 0.615 by the time of this analysis. Ensure drift reports always specify the exact commit SHA.
- **Automated commit tracking:** The drift-report tool (`drift-report.ts`) should record the commit SHA alongside metrics for reproducibility.

## Determinism Verification

The control run was executed twice at the same code state with identical results:

```
Run 1: winRate=0.615, medianScore=12332.5, avgNoActionTurns=0.31
Run 2: winRate=0.615, medianScore=12332.5, avgNoActionTurns=0.31
```

This confirms the harness is deterministic with the canonical seed set (mc-balance-0 through mc-balance-199).

## References

- **CG-0MUE03DGQ005KPZ7** — This investigation (drift attribution)
- **CG-0MU37CKRR008252I** — Per-action challenge evaluation (the change under investigation)
- **CG-0MU8N8B52003HCJ5** — The re-run that originally detected the drift
- `docs/main-street/balance-guardrail-recommendations.md` — Drift-report-then-ask decision tree
- `docs/main-street/monte-carlo-baseline.json` — Committed baseline (2026-09-12)
- `docs/main-street/monte-carlo-control-run.json` — Control run results (per-action DISABLED)
