# Main Street: AI Strategy and Hint System

## Summary

Write the AI and player assistance section of The Build's Game Design Document covering AI strategy design for auto‑play, hint systems, and any tutorial/onboarding guidance.

## User Story

As a game designer, I want The Build's AI behaviour and player assistance systems documented so that we can deliver smart hints and compelling auto‑play from an early milestone.

## Sections

1. **AI Strategy Overview** – What does the AI need to do in The Build? (Auto‑play for testing/demo, hint generation, difficulty simulation)
2. **Strategy Tiers** – Define 2‑3 AI strategy levels:
   - **Random/Naive** – Makes valid moves randomly (baseline, useful for Monte Carlo testing)
   - **Heuristic/Greedy** – Follows simple priority rules (e.g. always craft if possible, prefer high‑value actions)
   - **Lookahead/Smart** (optional) – Considers future consequences of moves
3. **Hint System** – How are hints generated? Single best move? Multiple suggestions? Progressive hints (vague to specific)?
4. **Move Evaluation Heuristics** – What makes a move "good" in The Build? Priority ordering of actions. Scoring function for comparing moves.
5. **Tutorial / Onboarding** – Is there a tutorial? How does The Build teach the player its mechanics? Guided first game? Tooltip‑based learning?
6. **Difficulty Adjustment** (if applicable) – Does the AI assist in difficulty? Dynamic difficulty? Selectable difficulty levels that change deal generation or available content?

## Banking-Aware Action Hoarding (CG-0MT3JMGA60091J8W — Action Banking)

Since the action-banking mechanic (see `action-banking.test.ts`, `ai-banking-strategy.test.ts`) lets unused base actions persist across days (capped at 2), the AI should consider **banking** as a strategic option alongside spending. Without banking awareness the AI flushes every action each day, forfeiting its hoarded reserve and leaving banking as a human-only feature.

### Additive strategy split (AC1)

Banking-aware behaviour lives in a **new** `BankingGreedyStrategy` (`MainStreetAiStrategy.ts`); `GreedyStrategy` and `RandomStrategy` are left unchanged so existing balance baselines remain valid:

| Strategy | Name (selectable) | Behaviour |
|----------|-------------------|-----------|
| `GreedyStrategy` | `Greedy` / `greedy` | Pure PRD M3 priority chain (upgrade → business → event → acquisitions → … → end-turn). **Never banks** while actions remain. |
| `BankingGreedyStrategy` | `BankingGreedy` / `banking-greedy` | Runs the same greedy chain, but first evaluates the *bank option* — ending the turn early with actions remaining to hoard them for a future high-value play. Delegates to the shared greedy chain when spending is better. |
| `RandomStrategy` | `Random` / `random` | Unchanged — uniform random legal pick. |

`BankingGreedyStrategy` is registered as a distinct `banking-greedy` variant in the Monte Carlo harness (`MainStreetMonteCarlo.ts`), so runs can compare baseline `greedy` vs. banking-aware side by side (AC5). The existing `greedy`/`random` baselines are not replaced.

### Hybrid heuristic: `scoreBankOption(state, difficulty?)` (AC3)

Scores the implicit "bank actions" option — the expected value of ending the turn early with `actionsRemaining > 0`. It is **hybrid**:

- **(a) Visible targets** — the best *unaffordable* high-value card in hand or in the market row, valued with the same income/synergy horizon heuristic as the spending path.
- **(b) Pipeline look-ahead** — the best *unaffordable* card among the next `lookAheadDepth` cards of each drawable deck (business, community-space, upgrade, event), decayed by queue position (the next card drawn counts for more) and halved (`PIPELINE_TARGET_WEIGHT = 0.5`) because a deck target is less certain than a visible one.

Both target types factor in:
- **Closeness** — `1 - gap/cost`; targets almost in reach score higher than distant ones.
- **Planning horizon** — normalised `horizon / cap` via `aiPlanningHorizon()` (CG-0MSN1A71G005AF7W): banking is worth more early when future income compounds over more turns.
- **Bank headroom** — `(cap - banked)/cap`; an emptier bank benefits more from a deposit. At cap (2) the score is 0, so the cap needs no special case (AC4).

Targets with `closeness < 0.05` are discarded as too distant; any final score below 1 is treated as noise (no bank).

### Difficulty scaling (Q1c + Q6)

Look-ahead depth and aggressiveness are gated by `state.config.difficultyName` via `BANKING_DIFFICULTY_PROFILES`:

| Difficulty | Look-ahead depth (cards/deck) | Aggressiveness multiplier | Effect |
|------------|------------------------------|---------------------------|--------|
| Easy | 0 (visible only) | 0.5 | Under-banks; only clearly-visible, nearly-affordable targets justify a hoard. |
| Medium | 1 | 1.0 | Balanced; peeks the next card of each deck at face value. |
| Hard | 2 | 1.5 | Hoards hardest and looks two cards deep into each deck. |

Tuning table must stay in sync with `BANKING_DIFFICULTY_PROFILES` in `MainStreetAiStrategy.ts` — changing one without the other changes observable AI behaviour.

### Decision (AC2)

At the top of `BankingGreedyStrategy.chooseAction` (after free same-day composite plays, which consume no action), `scoreBankOption(state)` is compared against the best `scoreAction` across all non-`end-turn` spends. When the bank value **exceeds** the best spend, the AI deliberately returns `end-turn` with actions remaining — the engine's `processEndOfTurn` then banks the unused portion. Otherwise it delegates to the pure greedy chain.

### Guarantees

- Never over-hoards at cap (bank score 0 at `bankedActions == 2`).
- Never prefers banking when a high-value affordable spend exists (bank score < best spend).
- Respects the action budget (the existing `enumerateLegalActions` budget gate is unchanged).
- Deterministic: same seed + same state → same decision (validated in `ai-banking-strategy.test.ts`).
- Difficulty scaling: Easy hoards less than Hard on identical states (validated).
- Balanced: within win-rate ±0.25 and coins ±30% of the banking-greedy regression snapshot (validated in `monte-carlo-guardrails.test.ts`).

### Guardrails (AC5)

The banking-aware variant is guarded like any other strategy, **additively** — the greedy baseline is never replaced:

- **Snapshot.** `docs/main-street/monte-carlo-baseline.json` carries an additive `bankingGreedy` block, recorded on the same canonical 200-seed / 60-turn profile as the greedy block (`mc-balance-` seed prefix). The top-level `strategy` stays `greedy`; the banking snapshot lives beside it.
- **Regression guardrail.** `tests/main-street/monte-carlo-guardrails.test.ts` runs `banking-greedy` across Easy/Medium/Hard and asserts its Medium metrics and per-difficulty matrix stay within **winRate ±0.25** and **coins ±30%** of that snapshot — the same tolerances the greedy guardrail uses. A drift in `banking-greedy` can therefore never mask (or be masked by) a greedy/random regression.
- **Drift is reported, never silently accepted** (policy CG-0MT4ZHRP5002QMS2). When the banking-greedy guardrail trips: run `npx vite-node scripts/balance/drift-report.ts --strategy=banking-greedy` (or `npm run balance:drift-report -- --strategy=banking-greedy`) to get the structured per-difficulty delta report, present it to the producer, and only regenerate the snapshot via `scripts/generate-main-street-monte-baseline.ts` when the shift is an intended balance change (the generator emits both the greedy and banking-greedy blocks). Without `--strategy` the drift report compares against the top-level greedy baseline, as before.

- **Bank consumption fix (CG-0MTCP7F9S009HARC):** This behaviour depends on the bank consumption fix that decrements `bankedActions` on every `consumeAction` call, so the hoarded reserve actually depletes as the AI spends.

## Expected Output

A formal GDD section covering The Build's AI design with enough detail for an engineer to implement the strategy classes using the engine's existing AI abstractions.

## Acceptance Criteria

- At least 2 AI strategy tiers are fully specified with decision logic.
- Hint system design documented with player‑facing behaviour.
- Move evaluation heuristics defined and prioritised.
- Tutorial/onboarding approach documented.
- Design references existing engine AI abstractions (AiStrategyBase, AiPlayer, pickRandom, pickBest).
- Document reviewed and approved by the producer.
