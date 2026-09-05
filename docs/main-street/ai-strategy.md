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

Since the action-banking mechanic (see `action-banking.test.ts`, `ai-banking-strategy.test.ts`) lets unused base actions persist across days (capped at 2), the Greedy AI must consider **banking** as a strategic option alongside spending. Without banking awareness the AI flushes every action each day, forfeiting its hoarded reserve and leaving banking as a human-only feature.

- **Heuristic:** `scoreBankOption(state)` (`MainStreetAiStrategy.ts`) scores the implicit "bank actions" option. It scans the current hand and market for the best *unaffordable* high-value target (using the same income/synergy horizon heuristic as the spending path). No valuable unaffordable target → bank score is 0. A target is scored as `bestTargetScore * closeness * horizonFactor * bankHeadroom`, where `closeness = 1 - gap/cost` (cheap targets within one coin of affordability are near; 50-coin targets far from the wallet are distant), `horizonFactor = horizon / cap` (early game values future income more highly, late game less), and `bankHeadroom = (cap - banked)/cap` (an emptier bank benefits more from a deposit). The raw value is discarded if `closeness < 0.05` or `raw < 1`. At bank cap or with `actionsRemaining ≤ 0` the option scores 0.

- **Decision:** At the top of `GreedyStrategy.chooseAction`, `scoreBankOption(state)` is compared to the best `scoreAction` across all spend actions. When the bank option wins, the AI returns `end-turn` even though actions remain — the engine's `processEndOfTurn` then banks the unused portion.

- **Guarantees:** Never over-hoards at cap (returns 0); never prefers banking when a high-value affordable spend exists (bank score < best spend); respects the action budget (the existing `enumerateLegalActions` budget gate is unchanged).

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
