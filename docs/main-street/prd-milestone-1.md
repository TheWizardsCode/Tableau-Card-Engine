# Main Street: PRD Milestone 1 -- Playable Core Loop (Walking Skeleton)

**Work Item:** CG-0MM4RDYAU1DY4OG8
**Status:** DRAFT -- Awaiting Producer Review
**Author:** opencode
**Date:** 2026-03-01

> **Status update (CG-0MSLXJCHH001DLIO):** This historical PRD describes the
> original 20-turn design. Default difficulty presets no longer impose a
> turn limit — games end via score threshold, all challenges, bankruptcy,
> or reputation collapse; a turn limit is opt-in via an explicit
> `maxTurns` config. See `docs/main-street/core-rules-and-mechanics.md`
> for the current rules.

---

## Executive Summary

Milestone 1 delivers the minimum playable version of **Main Street** -- a single-player, turn-based tableau card game where the player revitalises a 10-slot linear street by purchasing and placing business cards, earning income through adjacency synergies, and surviving 20 turns to reach a score threshold. This walking skeleton proves the core loop (buy, place, earn, survive) is functional and evaluable for fun before investing in polish, full content, or advanced features. The milestone reuses existing Tableau Card Engine modules (seeded RNG, card system, `Pile<T>`, `PhaseManager`, `CardGameScene`, event system) and introduces new game-specific types for the street grid, market, resource bank, and adjacency resolution.

---

## 1. Goal and Success Criteria

### Goal

Deliver a playable walking skeleton of Main Street that a human player can complete from start to finish in a single session (10-15 minutes), using placeholder art and a minimal card pool.

### Success Criteria

| # | Criterion | Measurement |
|---|-----------|-------------|
| SC-1 | A player can complete a full 20-turn session | Manual playthrough from DayStart turn 1 to game-end |
| SC-2 | Core loop is identifiable: buy -> place -> earn -> survive | Playtest checklist confirms all four verbs are exercised each turn |
| SC-3 | Win and loss conditions trigger correctly | Unit tests for score threshold win, bankruptcy loss, reputation collapse, and turn exhaustion |
| SC-4 | Adjacency synergies produce observable income differences | Unit test comparing income with/without adjacent matching businesses |
| SC-5 | Deterministic replay: same seed produces identical outcomes | Integration test running two games with the same seed, asserting state equality |
| SC-6 | All tests pass and build succeeds | `npm test` and `npm run build` pass with zero errors |

---

## 2. Scope

### IN Scope

| Area | Details |
|------|---------|
| **Game State Model** | TypeScript types/interfaces for `MainStreetState` including street grid (10 slots), resource bank (coins + reputation), market, deck state, turn counter, day/night phase, and challenges completed. |
| **Card Types** | 5 Business cards (Bakery, Diner, Bookshop, Park, Hardware Store), 5 Event cards (Local Festival, Rainy Day, Tax Audit, Community Award, Health Inspection), 3 Upgrade cards (Patisserie, Bistro, Reader's Café). Defined as typed JSON fixtures. |
| **Turn Structure** | 6-phase day cycle: DayStart -> MarketPhase -> InvestmentResolution -> IncomePhase -> IncidentPhase -> EndCheck. Implemented via `PhaseManager`. |
| **Core Actions** | Buy Business, Buy Upgrade, Buy Event, Place Business, End Turn. All with legality validation returning `LegalityResult`. |
| **Win/Loss Detection** | Score threshold (>= winThreshold: 100 Easy / 120 Medium / 150 Hard), all-challenges-complete, turn-limit victory (turn 20 with reputation > 0 and coins >= 0). Loss: bankruptcy (coins < 0), reputation collapse (reputation <= 0), turn exhaustion without victory. |
| **Adjacency & Income** | `AdjacencyResolver` computing synergy bonuses for the linear 1x10 grid. `computeIncome()` summing base income + synergy bonuses. Upgrades extending adjacency range. |
| **Minimal UI** | Phaser scene with: 10-slot street grid, market display (business row + investments row), incident queue area (2 face-up incidents), resource bank display (coins, reputation, turn, score), player hand area (any mix of business + event cards), buy/place/upgrade click flow, end-turn button, game-over overlay. Placeholder art (colored rectangles with text labels). Responsive layout for desktop and mobile. |
| **Seeded RNG** | Deterministic randomness using `createSeededRng()` from `@core-engine`. Seed displayed on title screen and usable for reproducible games. |
| **Test Suite** | Unit tests for: game state creation, adjacency/synergy, income calculation, buy/place/upgrade legality, event resolution, win/loss detection, deterministic replay. Integration test for a full scripted turn. |
| **Transcript Recording** | Game transcript using `TranscriptRecorderBase<T>` recording all actions and state transitions for replay and debugging. |

### OUT of Scope (Deferred to Future Milestones)

| Area | Reason |
|------|--------|
| Meta-progression / unlocks | Requires Save/Load infrastructure (engine gap 4.5) |
| Full card pool expansion | Content milestone; walking skeleton uses minimal 11-card pool |
| AI opponent / auto-play | Requires AI strategy design (GDD section not yet written) |
| Hint system | Depends on AI strategy |
| Sound effects / music | Polish milestone; UX/Audio GDD section not yet written |
| Drag-and-drop interaction | Click/tap sufficient for walking skeleton; drag-drop is an engine minor extension (3.6) |
| Save/Load mid-game | Engine gap 4.5; not needed for 10-15 min sessions |
| Challenge generation variety | Fixed set of challenges for MVP; dynamic generation deferred |
| Declarative rule engine | Engine gap 4.2; walking skeleton uses game-specific validation functions |
| Card-effect / modifier pipeline | Engine gap 4.6; events are resolved with direct state mutation for MVP |
| Tooltips / info popovers | Polish; card info is displayed directly on cards |
| Campaign mode | Requires persistence infrastructure |

---

## 3. User Stories

### US-1: Start a New Game

**As a** player,
**I want to** start a new Main Street game with a random or specified seed,
**so that** I can begin building my street and optionally replay specific scenarios.

**Acceptance Criteria:**
- [ ] AC-1.1: Game initialises with turn 1, Day phase, 8 coins, 3 reputation, empty 10-slot street grid, and a 2-card incident queue.
- [ ] AC-1.2: Market displays up to 4 Business cards and 3 Investments (2 Upgrade + 1 Investment event). Incident queue shows 2 face-up Incident cards.
- [ ] AC-1.3: Seed is displayed on the game screen.
- [ ] AC-1.4: Providing the same seed produces an identical initial market and deck order.
- [ ] AC-1.5: Game appears in the Game Selector landing page alongside existing example games.

### US-2: Purchase and Place a Business Card

**As a** player,
**I want to** buy a business card from the market and place it on an empty street slot,
**so that** I can start generating income.

**Acceptance Criteria:**
- [ ] AC-2.1: Clicking a Business card in the market highlights it and shows its cost.
- [ ] AC-2.2: If the player has sufficient coins, clicking an empty slot places the card and deducts the cost.
- [ ] AC-2.3: If the player has insufficient coins, the purchase is rejected with a visible error indicator (shake animation + reason text).
- [ ] AC-2.4: If no empty slots exist, the purchase is rejected.
- [ ] AC-2.5: The market replenishes the purchased slot from the Business deck.
- [ ] AC-2.6: Placed business is visible in the street grid with its name and synergy type.

### US-3: Earn Income Through Adjacency Synergies

**As a** player,
**I want to** see my businesses earn income based on their base income and adjacency bonuses,
**so that** I can make strategic placement decisions.

**Acceptance Criteria:**
- [ ] AC-3.1: During the Income Phase, each placed business generates `baseIncome + synergyBonus` coins.
- [ ] AC-3.2: Synergy bonus is a percentage of the business's effective base income per adjacent business sharing at least one Synergy Type (default per-card rate 50%, scaled by the difficulty preset multiplier).
- [ ] AC-3.3: Adjacency considers only immediately adjacent slots (index +/- 1) by default.
- [ ] AC-3.4: Upgraded businesses with `synergyRangeBonus` consider slots within extended range.
- [ ] AC-3.5: Total income earned is displayed to the player after the Income Phase.

### US-4: Purchase and Apply an Upgrade Card

**As a** player,
**I want to** buy an upgrade card and apply it to a matching business on my street,
**so that** I can increase that business's income and synergy range.

**Acceptance Criteria:**
- [ ] AC-4.1: Upgrade cards in the market display their target business name and cost.
- [ ] AC-4.2: Clicking an Upgrade card highlights eligible businesses on the street.
- [ ] AC-4.3: If the player has sufficient coins and the target business is placed, the upgrade is applied.
- [ ] AC-4.4: After upgrade, the business's income and/or synergy range are increased per the Upgrade card's values.
- [ ] AC-4.5: If no matching business is placed, the upgrade purchase is rejected.

### US-5: Experience Events

**As a** player,
**I want** event cards to trigger effects that alter my resources,
**so that** the game has variety and I must adapt my strategy.

**Acceptance Criteria:**
- [ ] AC-5.1: Investment events purchased from the market are held and can be played during MarketPhase, or auto-resolve during InvestmentResolution phase.
- [ ] AC-5.2: Incident events resolve automatically each turn from the visible FIFO incident queue (front card resolves, replacement drawn from deck).
- [ ] AC-5.3: Event effects modify coins and/or reputation as described on the card.
- [ ] AC-5.4: Event resolution is visible to the player (effect text displayed briefly).

### US-6: Win or Lose the Game

**As a** player,
**I want** the game to detect when I've won or lost,
**so that** I know when my session is complete and can see my final score.

**Acceptance Criteria:**
- [ ] AC-6.1: Win triggers when `finalScore >= winThreshold` (100 Easy / 120 Medium / 150 Hard) at end of Night Phase.
- [ ] AC-6.2: Win triggers when all primary challenges are completed.
- [ ] AC-6.3: Loss triggers immediately when coins < 0 (bankruptcy).
- [ ] AC-6.4: Loss triggers immediately when reputation <= 0 (reputation collapse).
- [ ] AC-6.5: Loss triggers at turn 20 if win conditions are not met (turn exhaustion).
- [ ] AC-6.6: Game-over overlay displays win/loss status, final score breakdown, and a "Play Again" button.
- [ ] AC-6.7: Final score formula: `coins + reputation + (challengesCompleted * challengeBonusPoints)`.

### US-7: Deterministic Replay

**As a** developer,
**I want** games with the same seed to produce identical outcomes for identical action sequences,
**so that** I can write reproducible tests and debug issues.

**Acceptance Criteria:**
- [ ] AC-7.1: Two games started with the same seed have identical deck orders and market draws.
- [ ] AC-7.2: Given the same seed and the same sequence of player actions, the final state is identical.
- [ ] AC-7.3: Game transcript records all actions and can be used to verify determinism.

### US-8: Navigate to Main Street from Game Selector

**As a** player,
**I want to** see Main Street in the game selector menu,
**so that** I can choose to play it alongside other example games.

**Acceptance Criteria:**
- [ ] AC-8.1: Main Street appears in the Game Selector scene with title and description.
- [ ] AC-8.2: Clicking Main Street in the selector launches the game setup (seed entry or random).
- [ ] AC-8.3: A "Back to Menu" button returns to the Game Selector.

---

## 4. Technical Design Notes

### 4.1 Engine Modules Used

| Module | Exports Used | Purpose |
|--------|-------------|---------|
| `@core-engine` | `createSeededRng`, `GameEventEmitter`, `TranscriptRecorderBase`, `BaseSetupOptions`, `resolveBaseSetupOptions`, `GamePhase`, `isGameOver`, `isPlaying` | RNG, events, transcript, setup, state predicates |
| `@card-system` | `Pile<T>`, `shuffleArray` | Deck management, shuffle |
| `@rule-engine` | `LegalityResult` | Move validation return type |
| `@ui` | `CardGameScene`, `PhaseManager`, `createCardGame`, `createSceneHeader`, `HelpPanel`, `SettingsPanel`, `HelpButton`, `SettingsButton`, overlay helpers, layout helpers | Scene base, phase management, UI chrome |

### 4.2 New Files (example-games/main-street/)

```
example-games/main-street/
├── main.ts                        # Entry point, registers with Game Selector
├── createMainStreetGame.ts        # Factory function (matches existing pattern)
├── MainStreetState.ts             # Game state types and initial state factory
├── MainStreetCards.ts             # Card type definitions and fixture data
├── MainStreetRules.ts             # Legality checks for all actions
├── MainStreetEngine.ts            # Turn sequencer, action handlers, income/scoring
├── AdjacencyResolver.ts           # Linear grid adjacency and synergy computation
├── GameTranscript.ts              # Transcript recorder extending TranscriptRecorderBase
├── help-content.json              # Help panel content
├── scenes/
│   └── MainStreetScene.ts         # Phaser scene with game UI
```

### 4.3 Game State Type (MainStreetState)

```ts
// Card type definitions
type SynergyType = 'Food' | 'Culture' | 'Commerce';
type EventTrigger = 'Investment' | 'Incident';
type EventTarget = 'All' | 'SpecificSynergy' | 'RandomBusiness';

interface BusinessCard {
  id: string;
  name: string;
  cost: number;
  baseIncome: number;
  synergyTypes: SynergyType[];
  upgradePath?: string;
  level: number;
  maxLevel: number;
  description: string;
  // Applied upgrades modify these at runtime:
  incomeBonus: number;
  synergyRangeBonus: number;
}

interface EventCard {
  id: string;
  name: string;
  trigger: EventTrigger;
  effect: string;       // Human-readable effect description
  target: EventTarget;
  targetSynergy?: SynergyType;
  coinDelta: number;     // Direct coin change (+/-)
  reputationDelta: number;
}

interface UpgradeCard {
  id: string;
  name: string;
  targetBusiness: string;
  cost: number;
  incomeBonus: number;
  synergyRangeBonus: number;
  description: string;
}

type AnyCard = BusinessCard | EventCard | UpgradeCard;

type DayPhase =
  | 'DayStart'
  | 'MarketPhase'
  | 'ActionPhase'
  | 'InvestmentResolution'
  | 'IncomePhase'
  | 'ReputationPhase'
  | 'NightStart'
  | 'IncidentPhase'
  | 'NightIncome'
  | 'EndCheck';

interface MarketState {
  business: BusinessCard[];                   // Up to 4 face-up
  investments: (UpgradeCard | EventCard)[];   // 2 upgrades + 1 investment event = 3 slots
}

interface ResourceBank {
  coins: number;      // Starting: 8
  reputation: number; // Starting: 3
}

interface MainStreetState {
  turn: number;                            // 1-based, max 20
  phase: DayPhase;
  streetGrid: (BusinessCard | null)[];     // Length 10
  market: MarketState;
  resourceBank: ResourceBank;
  decks: {
    business: BusinessCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
  };
  challengesCompleted: string[];
  hand: (BusinessCard | EventCard)[]; // merged hand: any mix, up to maxHandSize
  maxHandSize: number;                 // starts at 2, growable via staff upgrade cards
  incidentQueue: EventCard[];               // Visible FIFO queue of upcoming Incidents (size 2)
  gameResult: 'playing' | 'win' | 'loss';
  finalScore: number;
  seed: string;
}
```

### 4.4 Constants

```ts
const GRID_SIZE = 10;
const MAX_TURNS = 20;
const WIN_THRESHOLD = 150;
const STARTING_COINS = 8;
const STARTING_REPUTATION = 3;
const MARKET_BUSINESS_SLOTS = 4;
const MARKET_INVESTMENT_SLOTS = 3;       // Total investment row slots
const MARKET_INVESTMENT_UPGRADE_COUNT = 2; // Upgrades in investment row
const MARKET_INVESTMENT_EVENT_COUNT = 1;   // Investment events in investment row
const INCIDENT_QUEUE_SIZE = 2;           // Visible FIFO incident queue size
const SYNERGY_BONUS_PER_NEIGHBOR = 1;
const CHALLENGE_BONUS_POINTS = 10;
```

### 4.5 Adjacency Resolution

The street grid is a 1D array of 10 slots (indices 0-9). Adjacency is computed as:

```ts
function getNeighborIndices(index: number, range: number = 1): number[] {
  const neighbors: number[] = [];
  for (let offset = -range; offset <= range; offset++) {
    if (offset === 0) continue;
    const ni = index + offset;
    if (ni >= 0 && ni < GRID_SIZE) neighbors.push(ni);
  }
  return neighbors;
}

function computeSynergyBonus(grid: (BusinessCard | null)[], index: number): number {
  const card = grid[index];
  if (!card) return 0;
  const range = 1 + card.synergyRangeBonus;
  const neighbors = getNeighborIndices(index, range);
  let bonus = 0;
  for (const ni of neighbors) {
    const neighbor = grid[ni];
    if (neighbor && card.synergyTypes.some(st => neighbor.synergyTypes.includes(st))) {
      bonus += SYNERGY_BONUS_PER_NEIGHBOR;
    }
  }
  return bonus;
}
```

### 4.6 Simplified Turn Flow for Walking Skeleton

The walking skeleton simplifies the 10-phase GDD turn structure to reduce implementation complexity while preserving the core loop:

1. **DayStart** -- Increment turn, replenish market.
2. **MarketPhase / ActionPhase** (combined) -- Player buys/places/upgrades. Market shows 4 Business + 3 Investments (2 Upgrades + 1 Investment event). Multiple purchases allowed per turn. Player clicks "End Turn" when done.
3. **InvestmentResolution** -- Reserved phase; Investment events are **not** auto-resolved here. Unplayed events persist in the hand until the player plays them during a later MarketPhase.
4. **IncomePhase** -- Compute and add income from all placed businesses.
5. **IncidentPhase** -- Resolve the front Incident from the visible FIFO queue. Draw a replacement from the event deck to the back of the queue.
6. **EndCheck** -- Evaluate win/loss conditions.

The ReputationPhase and NightIncome phases are folded into InvestmentResolution and IncidentPhase respectively, since reputation changes and night income modifiers are event-driven effects in the current card pool.

---

## 5. Asset Requirements (Placeholder Art)

All placeholder art uses simple geometric shapes rendered in Phaser:

| Asset | Spec |
|-------|------|
| **Business Card** | 80x110 rectangle, colored by synergy type: Food = orange, Culture = blue, Commerce = green. White text: name, cost, income. |
| **Event Card** | 80x110 rectangle, yellow fill. White text: name, effect. |
| **Upgrade Card** | 80x110 rectangle, purple fill. White text: name, target, cost, bonus. |
| **Street Slot (empty)** | 80x110 dashed rectangle, dark gray. |
| **Street Slot (occupied)** | Displays the placed Business card. |
| **Resource Bank** | Text display: "Coins: X | Reputation: Y | Turn: Z/20 | Score: S". |
| **End Turn Button** | Standard overlay button (reuse `createOverlayButton` from `@ui`). |

No external image assets are required for Milestone 1. All visuals are programmatically rendered.

---

## 6. UI Wireframe (ASCII)

### Desktop Layout (1280x720)

```
+--------------------------------------------------------------------+
| Main Street                          Seed: abc123    [?] [S] [Menu] |
+--------------------------------------------------------------------+
|                                                                      |
|  MARKET                                                              |
|  Business:    [Card1] [Card2] [Card3] [Card4]                       |
|  Investments: [Upg1]  [Upg2]  [Evt1]     Upg: N  Evt: M            |
|                                                                      |
+--------------------------------------------------------------------+
|                                                                      |
|  INCIDENT QUEUE (upcoming)                                           |
|  [Incident1] [Incident2]                                            |
|                                                                      |
+--------------------------------------------------------------------+
|                                                                      |
|  YOUR STREET                                                        |
|  [Slot0] [Slot1] [Slot2] [Slot3] [Slot4]                          |
|  [Slot5] [Slot6] [Slot7] [Slot8] [Slot9]                          |
|                                                                      |
+--------------------------------------------------------------------+
|                                                                      |
|  [Held Event]  Coins: 8 | Rep: 3 | Turn: 1/20 | Score: 0 [End Turn]|
|                                                                      |
+--------------------------------------------------------------------+
```

### Mobile Layout (Portrait, ~400px width)

The layout stacks vertically: Market on top (business row + investments row), incident queue below, street grid in middle (2 rows of 5), player hand area (any mix of business + event cards) and resource bank with End Turn button at bottom. Cards scale down proportionally.

---

## 7. Test Plan

### 7.1 Unit Tests (`tests/main-street/`)

| Test File | Coverage |
|-----------|----------|
| `game-state.test.ts` | Initial state creation, field defaults, seed determinism |
| `adjacency.test.ts` | Neighbor indices at edges/center, synergy bonus with/without matches, extended range |
| `income.test.ts` | Base income only, income + synergy, income after upgrade, income with empty grid |
| `market.test.ts` | Market replenishment, purchase removes card, refill from deck, deck exhaustion |
| `rules.test.ts` | Buy business legality (enough coins, has slot), buy upgrade legality (target exists), buy event legality, place business legality |
| `events.test.ts` | Investment event hold/play/auto-resolve, Incident event draw and resolution, event coin/reputation effects |
| `win-loss.test.ts` | Score threshold win, all-challenges win, turn-limit victory, bankruptcy loss, reputation collapse loss, turn exhaustion loss |
| `determinism.test.ts` | Same seed + same actions = same final state |

### 7.2 Integration Tests

| Test | Description |
|------|-------------|
| `full-turn.test.ts` | Simulate one complete turn (buy, place, income, night event, end check) and verify state transitions |
| `full-game.test.ts` | Run a scripted 20-turn game to victory/loss and verify transcript correctness |

### 7.3 Smoke Test

`tests/main-street/smoke-scenario.test.ts` -- Runs a headless deterministic game with a fixed seed (e.g. `smoke-1`), executes a greedy strategy, and validates the transcript output. Included in `npm test`.

### 7.4 Playtest Checklist

| # | Item | Pass/Fail |
|---|------|-----------|
| PT-1 | Can start a new game and see the market with cards | |
| PT-2 | Can buy a business and place it on an empty slot | |
| PT-3 | Can see income increase after placing adjacent matching businesses | |
| PT-4 | Can buy an upgrade and see income/range change | |
| PT-5 | Can experience a night event that changes coins | |
| PT-6 | Game ends in victory when score threshold is reached | |
| PT-7 | Game ends in loss when coins drop below 0 | |

### 7.5 Approval

All tests must pass (`npm test`), build must succeed (`npm run build`), and the playtest checklist must be completed by the Producer before this milestone is considered done.

---

## 8. Estimated Effort

Using three-point estimation (Optimistic / Most Likely / Pessimistic):

| Work Item | O | ML | P | Expected |
|-----------|---|-----|---|----------|
| Game State Types & Seeded RNG (CG-0MM7IA81Q12OLJB0) | 2h | 4h | 6h | 4h |
| Minimal Card System & Market (CG-0MM7IA8UB0BOEXZ5) | 3h | 5h | 8h | 5h |
| Turn Flow & Core Actions Engine (CG-0MM7IA9QH054QKK3) | 4h | 6h | 10h | 6.3h |
| Adjacency / Income Calculation (CG-0MM7IAARD1ST2ILP) | 2h | 3h | 5h | 3.2h |
| Minimal Responsive UI (CG-0MM7IABRS0YJ6M3N) | 6h | 10h | 16h | 10.3h |
| Tests, Demo Script & Playtest Checklist (CG-0MM7IACIB1IU2YNA) | 3h | 5h | 8h | 5.2h |
| **Total** | **20h** | **33h** | **53h** | **34h** |

**Risk-adjusted estimate:** ~34 engineering hours (4-5 working days for a single developer).

---

## 9. Dependencies and Risks

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| GDD: Core Rules and Mechanics (CG-0MM4RC1K81JU4U5D) | Prerequisite | Completed |
| GDD: Content Design and Progression (CG-0MM4RCE861AQ7PGW) | Prerequisite | Completed |
| GDD: Review and Consolidation (CG-0MM4RDIMT1HLP2DE) | Prerequisite | Completed |
| Engine Capabilities Audit (CG-0MM4RAT5L12FHWKP) | Reference | Completed |
| `@core-engine` seeded RNG | Engine feature | Available |
| `@card-system` Pile and shuffle | Engine feature | Available |
| `@rule-engine` LegalityResult | Engine feature | Available |
| `@ui` CardGameScene, PhaseManager | Engine feature | Available |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GDD turn structure too complex for walking skeleton | Medium | Medium | Simplify to 6 phases (Section 4.6); defer Incident-specific income to event effects |
| Balance issues make game unwinnable or trivially easy | Medium | Low | Use fixed seed for playtest; tune constants after first playtest; all constants are configurable |
| Engine `PhaseManager` doesn't support 10+ phases cleanly | Low | Medium | Walking skeleton uses 6 phases; can extend later |
| Placeholder art insufficient for evaluating fun factor | Medium | Medium | Ensure card labels are clear; synergy colors are distinct; income feedback is immediate and visible |
| Rule engine too minimal (only `LegalityResult`) | Low | Low | Game-specific validation functions return `LegalityResult`; no dependency on declarative rules |

---

## 10. How to Run the Walking Skeleton

```bash
# Install dependencies (if not already done)
npm install

# Start dev server with hot-reload
npm run dev
# Open browser to http://localhost:3000
# Click "Main Street" in the Game Selector

# Run tests (includes smoke test)
npm test

# Run smoke test directly
npx vitest run --project unit tests/main-street/smoke-scenario.test.ts

# Production build
npm run build
npm run preview
```

---

## 11. Telemetry Events

The walking skeleton emits the following events through the `GameEventEmitter` for debugging and future analytics:

| Event | Payload | When |
|-------|---------|------|
| `market.view` | `{ turn, businessCount, investmentCount, incidentQueueSize }` | Market is displayed |
| `market.purchase` | `{ turn, cardType, cardName, cost }` | Player purchases a card |
| `action.place` | `{ turn, cardName, slotIndex, synergyTypes }` | Business placed on street |
| `income.compute` | `{ turn, totalIncome, businessCount, synergyBonusTotal }` | Income phase completes |
| `turn.start` | `{ turn, phase }` | New turn begins |
| `turn.phase_change` | `{ turn, fromPhase, toPhase }` | Phase transition |
| `game.end` | `{ result, finalScore, turns, seed }` | Game ends (win or loss) |
| `game.seeded_run` | `{ seed }` | Game setup completes |

---

## Appendix A: Card Fixture Data

### Business Cards

| ID | Name | Cost | Base Income | Synergy Types | Upgrade Path |
|----|------|------|-------------|---------------|--------------|
| `biz-bakery` | Bakery | 3 | 2 | Food | Bakery -> Patisserie |
| `biz-diner` | Diner | 4 | 3 | Food | Diner -> Bistro |
| `biz-bookshop` | Bookshop | 4 | 2 | Culture | Bookshop -> Reader's Café |
| `biz-park` | Park | 2 | 1 | Culture | Park -> Garden |
| `biz-hardware` | Hardware Store | 5 | 3 | Commerce | Hardware Store -> Home Improvement |

### Event Cards

| ID | Name | Trigger | Effect | Target | Coin Delta | Rep Delta |
|----|------|---------|--------|--------|-----------|-----------|
| `evt-festival` | Local Festival | Investment | +2 coins per Culture business and +1 reputation | SpecificSynergy (Culture) | +2 per Culture biz | +1 |
| `evt-rainy` | Rainy Day | Incident | -1 coin per Food business | SpecificSynergy (Food) | -1 per Food biz | 0 |
| `evt-tax` | Tax Audit | Incident | Lose 3 coins | All | -3 | 0 |
| `evt-award` | Community Award | Incident | +2 reputation from community recognition | All | 0 | +2 |
| `evt-inspection` | Health Inspection | Incident | -2 coins per Food business and -1 reputation | SpecificSynergy (Food) | -2 per Food biz | -1 |

### Upgrade Cards

| ID | Name | Target | Cost | Income Bonus | Synergy Range Bonus | Reputation Bonus |
|----|------|--------|------|-------------|-------------------|------------------|
| `upg-patisserie` | Upgrade to Patisserie | Bakery | 4 | +1 | +1 | 0 |
| `upg-bistro` | Upgrade to Bistro | Diner | 4 | +1 | +1 | 0 |
| `upg-readers-cafe` | Upgrade to Reader's Café | Bookshop | 3 | +1 | 0 | +0.1 |

### Deck Composition (for shuffling)

To ensure adequate supply for 20 turns, each Business card appears **3 times** in the Business deck (15 cards total), each Event card appears **3 times** in the Event deck (15 cards total: 3 Investment + 12 Incident), and each Upgrade card appears **2 times** in the Upgrade deck (6 cards total). At game start, the incident queue draws 2 Incidents and the Investments row draws 1 Investment event from the event deck.

---

## Appendix B: Scoring Example

**Scenario:** Turn 15, player has:
- Street: Bakery (slot 2), Diner (slot 3), Bookshop (slot 5), Park (slot 6), Hardware Store (slot 0)
- Coins: 42
- Reputation: 8
- Challenges completed: "Foodie Row" (Bakery + Diner adjacent)

**Score:** 42 + (8 * 5) + (1 * 10) = 42 + 40 + 10 = **92** (not yet winning)

---

*Document status*: DRAFT -- AWAITING PRODUCER REVIEW.

*Prepared by*: `opencode` -- implementation of work item **CG-0MM4RDYAU1DY4OG8** / **CG-0MM7IA79W0HRM8HE**.
