# Main Street PRD Milestone 6: Engine Component Extraction and Refactoring

**Work Item:** CG-0MM4RG1GM0SRVENC  
**Parent Epic:** Main Street (CG-0MM4R9UJF1DGI0ZF)  
**Author:** pi (agent)  
**Date:** 2026-05-09  
**Status:** DRAFT — ready for producer review

---

## 1. Goal

Extract reusable systems from Main Street into shared engine modules so future games can reuse proven mechanics without copying game-specific code.

### Success criteria

1. A component inventory exists with extraction priority, ownership boundary, and public API sketch.
2. Every extraction candidate includes TypeScript API definitions and usage examples.
3. A migration plan lists concrete file moves/edits and validation checks.
4. Test requirements are defined for unit, integration, and replay/regression coverage.
5. Documentation updates are defined for engine API consumers.

---

## 2. Scope boundaries

### In scope

- Design-level extraction plan and APIs for reusable components.
- File-level migration plan from `example-games/main-street/` to `src/*`.
- Test and documentation deliverables required for implementation follow-up work.

### Out of scope

- Full implementation of all extractions in this work item.
- Rebalancing Main Street gameplay.
- New game content/cards/challenges.

---

## 3. Existing implementation details (baseline for reuse)

The following reusable foundations already exist and should be reused, not re-invented:

- `src/core-engine/SpatialRules.ts` (documented in `docs/core-engine/spatial-rules.md`) provides grid, neighbor, adjacency, and pathfinding primitives.
- `src/core-engine/TranscriptRecorder.ts` provides `TranscriptRecorderBase<T>`.
- `src/core-engine/UndoRedoManager.ts` provides `Command`, `CompoundCommand`, and `UndoRedoManager`.
- `src/core-engine/SaveLoad.ts` + `src/core-engine/TranscriptStore.ts` provide persistence primitives.
- `src/ui/` already contains reusable scene/animation/help/settings helpers.

Main Street files likely containing extraction candidates:

- `example-games/main-street/MainStreetEngine.ts`
- `example-games/main-street/MainStreetMarket.ts`
- `example-games/main-street/MainStreetCommands.ts`
- `example-games/main-street/MainStreetHint.ts`
- `example-games/main-street/MainStreetSaveLoad.ts`
- `example-games/main-street/MainStreetTranscript.ts`
- `example-games/main-street/MainStreetAdjacency.ts`

---

## 4. Component inventory and extraction priority

| Priority | Candidate component | Current source | Proposed destination | Why reusable |
|---|---|---|---|---|
| P1 | Market Offer Engine | `MainStreetMarket.ts` | `src/card-system/MarketOfferEngine.ts` | Any tableau game with row-based offers + refresh/lock rules |
| P1 | Economy Ledger + Cost/Reward Resolution | `MainStreetEngine.ts` | `src/rule-engine/EconomyLedger.ts` | Shared currency/reputation/resource mutation patterns |
| P1 | Action Command Adapter | `MainStreetCommands.ts` | `src/core-engine/ActionCommands.ts` | Normalized command wrappers around reversible actions |
| P2 | Generic Hint Scoring Harness | `MainStreetHint.ts` | `src/ai/HintEngine.ts` | Reusable move scoring/ranking + explanation formatting |
| P2 | Save Domain Adapter for Runs | `MainStreetSaveLoad.ts` | `src/core-engine/GameRunSave.ts` | Common schema-versioned run persistence lifecycle |
| P2 | Transcript Event Mapper | `MainStreetTranscript.ts` | `src/core-engine/EventTranscript.ts` | Shared event-to-transcript recording helpers |
| P3 | Street/Grid Mapping Adapter | `MainStreetAdjacency.ts` | `src/core-engine/GridIndexAdapter.ts` | Row-major index <-> 2D coordinate helpers |
| P3 | Difficulty Preset Binding Pattern | `MainStreetDifficulty.ts` | `src/core-engine` docs + utilities | Reusable preset loading/validation pattern |

Notes:
- Spatial algorithms are already extracted; Milestone 6 should avoid duplicating that work and instead align adapters with `SpatialRules`.
- `MainStreetCards.ts`, `MainStreetChallenges.ts`, and tier content remain game-specific and are not extraction priorities.

---

## 5. TypeScript API designs (draft)

### 5.1 Market Offer Engine (`src/card-system/MarketOfferEngine.ts`)

```ts
export interface MarketSlot<TCard> {
  card: TCard;
  locked?: boolean;
}

export interface MarketRow<TCard> {
  id: string;
  slots: readonly MarketSlot<TCard>[];
  refillPolicy: 'full' | 'empty-only';
}

export interface MarketOfferEngine<TCard> {
  getRows(): readonly MarketRow<TCard>[];
  canBuy(rowId: string, slotIndex: number, context: unknown): boolean;
  buy(rowId: string, slotIndex: number, context: unknown): { card: TCard; cost: number };
  refill(seed?: number): void;
}
```

Usage sketch:

```ts
const market = createMarketOfferEngine(mainStreetRows, rng);
const purchase = market.buy('businesses', 1, playerContext);
```

### 5.2 Economy Ledger (`src/rule-engine/EconomyLedger.ts`)

```ts
export interface ResourceDelta {
  coins?: number;
  reputation?: number;
  score?: number;
}

export interface EconomyLedger {
  get(resource: keyof ResourceDelta): number;
  canApply(delta: ResourceDelta): boolean;
  apply(delta: ResourceDelta, reason: string): void;
}
```

Usage sketch:

```ts
if (ledger.canApply({ coins: -cost })) {
  ledger.apply({ coins: -cost, score: bonus }, 'buy-business');
}
```

### 5.3 Action Commands (`src/core-engine/ActionCommands.ts`)

```ts
export interface ReversibleAction<TState> {
  do(state: TState): void;
  undo(state: TState): void;
  description?: string;
}

export function toCommand<TState>(state: TState, action: ReversibleAction<TState>): Command;
```

Usage sketch:

```ts
undoRedo.execute(toCommand(gameState, buyCardAction));
```

### 5.4 Hint Engine (`src/ai/HintEngine.ts`)

```ts
export interface HintCandidate<TMove> {
  move: TMove;
  score: number;
  reasons: readonly string[];
}

export interface HintEngine<TState, TMove> {
  rank(state: TState, moves: readonly TMove[]): readonly HintCandidate<TMove>[];
  best(state: TState, moves: readonly TMove[]): HintCandidate<TMove> | null;
}
```

Usage sketch:

```ts
const hint = hintEngine.best(state, legalMoves);
```

### 5.5 Game Run Save (`src/core-engine/GameRunSave.ts`)

```ts
export interface GameRunEnvelope<TState> {
  schemaVersion: number;
  gameType: string;
  updatedAt: string;
  state: TState;
}

export interface GameRunStore<TState> {
  save(run: GameRunEnvelope<TState>): void;
  load(gameType: string): GameRunEnvelope<TState> | null;
  clear(gameType: string): void;
}
```

### 5.6 Event Transcript (`src/core-engine/EventTranscript.ts`)

```ts
export interface EventRecorder<TEvent, TResult> {
  record(event: TEvent): void;
  finalize(result: TResult): void;
  snapshot(): unknown;
}
```

---

## 6. Migration plan (file-level)

### Phase 1 — Scaffold shared modules

Create new files with tests first:

- `src/card-system/MarketOfferEngine.ts`
- `src/rule-engine/EconomyLedger.ts`
- `src/core-engine/ActionCommands.ts`
- `src/ai/HintEngine.ts`
- `src/core-engine/GameRunSave.ts`
- `src/core-engine/EventTranscript.ts`

Export through barrels:

- `src/card-system/index.ts`
- `src/rule-engine/index.ts`
- `src/core-engine/index.ts`
- `src/ai/index.ts`

### Phase 2 — Adapt Main Street to consume shared APIs

Expected edit points:

- `example-games/main-street/MainStreetEngine.ts`
- `example-games/main-street/MainStreetMarket.ts`
- `example-games/main-street/MainStreetCommands.ts`
- `example-games/main-street/MainStreetHint.ts`
- `example-games/main-street/MainStreetSaveLoad.ts`
- `example-games/main-street/MainStreetTranscript.ts`

Approach:

1. Introduce adapter layer in Main Street preserving current public behavior.
2. Replace direct logic with calls into `src/*` modules incrementally.
3. Keep feature flags off; behavior parity is mandatory before cleanup.

### Phase 3 — Cleanup and hardening

- Remove duplicated helpers from Main Street once parity is verified.
- Expand docs and examples for shared modules.
- Ensure replay fixtures and Monte Carlo harness still pass.

---

## 7. Verification checklist

### Automated checks (must pass)

- `npm test`
- `npm run build`
- Main Street-specific checks:
  - `tests/main-street/**`
  - `tests/e2e/replay-main-street.e2e.test.ts`
  - `tests/main-street/monte-carlo-balance.test.ts`
  - `tests/main-street/market-extraction-parity.test.ts` — extraction parity oracle for MarketOfferEngine (57 tests, CG-0MPWZ5R1M001MZ3B)

### Manual checks

- Main Street gameplay loop remains unchanged from player perspective.
- Hint output remains available and coherent.
- Save/load works across reload.
- Tutorial/help/selector integration unaffected by extraction.

---

## 8. Deliverables for follow-up implementation work

Each follow-up feature/task should include:

1. End-to-end thin slice (code + tests + docs) for one extraction target.
2. Backward-compatibility note for Main Street integration.
3. Replay/transcript regression evidence where applicable.
4. API usage snippet in docs.

Suggested implementation sequence:

1. Market Offer Engine
2. Economy Ledger
3. Action Commands
4. Hint Engine
5. Save/Transcript adapters
6. Grid index adapter cleanup

---

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Hidden coupling in Main Street engine flow | High | Introduce adapters first, then migrate internals incrementally |
| API churn across modules | Medium | Freeze minimal API per component and avoid speculative surface area |
| Replay/Monte Carlo drift after refactor | High | Keep deterministic tests and fixture replay in acceptance gate |
| Over-extraction of game-specific logic | Medium | Keep content/challenge/card definitions in game folder |

---

## 9.1 Implementation progress

| Component | Status | Work Item | Notes |
|---|---|---|---|
| MarketOfferEngine — extraction parity tests | ✅ Done | CG-0MPWZ5R1M001MZ3B | 57 tests in `tests/main-street/market-extraction-parity.test.ts` (positive + negative paths, reshuffle behavior, integration, refill) |
| MarketOfferEngine — shared module extraction | ⏳ Pending | — | Awaiting follow-up implementation work |
| Economy Ledger | ⏳ Pending | — | — |
| Action Commands | ⏳ Pending | — | — |

## 10. Open questions

1. Should HintEngine live under `src/ai/` (strategy-centric) or `src/rule-engine/` (rule-eval-centric)?
2. Should `GameRunSave` wrap existing `SaveLoadStore` directly, or remain a thin convention documented without new code?
3. Do we require temporary compatibility wrappers in Main Street for one release cycle, or can we migrate in-place?

---

## 11. Acceptance Criteria

- [ ] PRD includes extraction inventory with priorities and rationale.
- [ ] PRD includes TypeScript API draft for each extraction candidate.
- [ ] PRD includes file-level migration steps from Main Street to shared modules.
- [ ] PRD includes explicit verification strategy and quality gates.
- [ ] PRD references existing extracted components to avoid duplicate effort.

---

## 12. References

- `docs/main-street/the-build-gdd.md`
- `docs/main-street/prd-milestone-1.md`
- `docs/main-street/prd-milestone-2.md`
- `docs/main-street/prd-milestone-3.md`
- `docs/main-street/prd-milestone-4.md`
- `docs/main-street/prd-milestone-5.md`
- `docs/core-engine/spatial-rules.md`
- Work item: CG-0MM4RG1GM0SRVENC
