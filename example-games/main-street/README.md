# Main Street

Main Street now uses the shared **Screen Layout Language (SLL)** as its canonical layout source.

The street is a 10-slot grid rendered as **2 rows × 5 columns**; synergy adjacency is **8-way (Chebyshev)** — orthogonally *and* diagonally adjacent slots count as neighbors (CG-0MSP1HCAS00785MP).

## Community Favour (CG-0MSTOATDQ005XDET)

Main Street has a **Community Favour** resource exchange available once per turn during the market phase (a **FREE** action — it does **not** consume `actionsRemaining`):

- **coins → reputation:** spend `favourCoinsToRepCost` (default **2**) coins for **+1** reputation.
- **reputation → coins:** spend `favourRepToCoinsRepCost` (default **2**) reputation for `favourRepToCoinsCoinGain` (default **3**) coins.

Rules:
- **Once per turn:** `state.favourUsedThisTurn` gates the exchange; reset at each `DayStart`.
- **MarketPhase only:** rejected outside the market phase.
- **Lossy round-trip:** 2 coins → 1 rep → 1.5 coins (2→3 rate), so the exchange cannot be arbitraged.
- **Configurable:** the three rates live on `GameConfig` and are tuned per-difficulty in `MainStreetDifficulty.ts` (defaults on all three presets).
- **UI:** two SLL-positioned buttons in the market-phase action bar (`favourCoinsToRepButton` / `favourRepToCoinsButton` zones; rendered in `MainStreetRenderer.refreshActionButtons`), disabled when the input resource is insufficient or the gate is spent.
- **AI:** `enumerateLegalActions` includes the action when affordable and unused; `GreedyStrategy` uses it only when genuinely stalled (cannot afford the cheapest market card) with a reputation buffer, so it never dominates normal purchases.
- **Tutorial:** T13 teaches the rep→coins exchange, which speeds up the $7 Library purchase under the 12-coin scenario budget; the tutorial starts with 12 coins so the exchange is available from the first day (the tutorial's two-turn plan-ahead flow budgets it, but it is not strictly required — the budget table comments in `TutorialScenario.ts` show the Library remains affordable without it).
- **Persistence:** `favourUsedThisTurn` is serialized with legacy-save backfill to `false`.

## Layout files and adapter

- Canonical layout JSON: `example-games/main-street/layouts/main-street.layout.json`
- Tutorial layout JSON: `example-games/main-street/layouts/main-street-tutorial.layout.json`
  - Defines 7 bounding-box zones for tutorial highlight areas (HUD, market, street, etc.)
  - Uses optional `w`/`h` dimensions on `NormalizedRect` for zone extents
  - Composed with the base layout via `composeResolvedLayouts()` in the tutorial system
- Scene adapter: `example-games/main-street/scenes/MainStreetLayoutAdapter.ts`
- Renderer entrypoint: `example-games/main-street/scenes/MainStreetRenderer.ts`

`MainStreetRenderer.computeLayout()` computes legacy layout metrics first, then applies SLL zone overrides through `computeMainStreetLayoutWithSll(...)`.

## Migration behavior and fallback

Main Street uses `adaptLayoutWithFallback(...)` to keep migration safe:

- If SLL layout parsing/mapping succeeds, SLL-derived zone coordinates are used.
- If layout is missing/invalid or mapping fails, legacy `computeLayout` values are used.

This keeps existing gameplay and regression tests stable during rollout.

## Testing layout behavior

```bash
# Schema and mapping contracts
npx vitest run tests/ui/screen-layout-schema.test.ts tests/ui/screen-layout-mapping.test.ts --project unit

# Main Street browser/layout coverage
npx vitest run tests/main-street/MainStreetLayoutAnchors.browser.test.ts --project browser
npx vitest run tests/main-street/MainStreetScene.browser.test.ts --project browser

# Replay-based canonical resolution assertion
npx vitest run tests/e2e/replay-main-street.e2e.test.ts --project unit
```

## Hand layout prediction (single source of truth)

The player hand is rendered by a **single merged `HandView`** configured in
`MainStreetRenderer.createContainers`. One horizontal row holds any mix of
business and event cards up to `maxHandSize` total (starting at 2, growable via
staff upgrade cards' `handSlotsAdded`). Event cards are no longer held in a
separate slot — a purchased Investment event simply joins the shared hand and
is played by clicking it during the Market phase.

- `handView` — the merged hand (centred on `handCenterX`, spacing `handCardW + 8`).
  `renderCard` dispatches on `card.family`: business cards render upgrade
  overlays and support the placing-from-hand flow; event cards show a tooltip
  and a play-event click (market phase only).

Market→hand buy-transfer animations target the **exact resting position** of the
purchased card via `HandView.getInsertionPosition(insertIndex)` — the single
source of truth for hand-layout prediction. This ensures the flying card lands
precisely where it will be rendered (the hand is re-centred on `handCenterX`
every time the hand size changes), instead of the old left-edge slot estimate
that caused a visible sideways snap when the hand re-rendered.

- `MainStreetScene.getBusinessHandInsertionPosition(insertIndex)` delegates to `handView`
  (`MainStreetTurnController.onBusinessCardClick` uses it with the append index = current hand length).
- `MainStreetScene.getEventHandInsertionPosition(insertIndex)` delegates to the same `handView`
  (`MainStreetTurnController.onEventCardClick` uses it with the append index = current hand length —
  events append to the shared hand like any other card).
- `MainStreetAnimator.getHandCardCenter()` is kept for backward compatibility only; buy transfers no
  longer use it.

Unit tests: `tests/main-street/buy-transfer-destination.test.ts` (destination equality for both buy
paths) and `tests/ui/handView.test.ts` (`getInsertionPosition` matches the rendered/computed layout).

## Card Data CSV

All card template data is defined in a single CSV file:

- **File:** `example-games/main-street/card-data.csv`

### How it works

The CSV is loaded at build time via Vite's `?raw` import suffix and parsed by
`@core-engine/CsvLoader` (`parseCsv`). The import and parsing happen in
`MainStreetCards.ts` at module load time:

```typescript
import cardDataRaw from './card-data.csv?raw';
import { parseCsv } from '@core-engine/CsvLoader';
const csvRows = parseCsv(cardDataRaw);
```

The parsed rows are then mapped into typed card template arrays (`BusinessCard`,
`CommunitySpaceCard`, `EventCard`/`DurationEventCard`, `UpgradeCard`, `StaffCard`)
with the appropriate field coercions (e.g. string → number for cost, pipe-separated
strings → `SynergyType[]` for synergy types).

### CSV column reference

The first row is the header. Columns common to all card families:

| Column | Type | Description |
|--------|------|-------------|
| `family` | string | Card family: `business`, `community-space`, `event`, `upgrade`, `staff` |
| `id` | string | Unique card template ID (e.g. `biz-bakery`, `evt-festival`) |
| `name` | string | Display name shown in-game |
| `description` | string | Flavour / effect description |
| `tier` | string | Progression tier: `1`–`12` (all families, including staff, are tier-assigned). Tier assignments are consumed by `MainStreetTiers.ts` to build `TIER_DEFINITIONS` arrays. |

#### Family-specific columns

**Business / Community Space** (`business`, `community-space`):

| Column | Type | Description |
|--------|------|-------------|
| `cost` | number | Coin cost to acquire |
| `baseIncome` | number | Base income per turn |
| `synergyTypes` | string | Pipe-separated synergy types: `Food | Culture | Commerce | Service | Entertainment | Health` |
| `upgradePath` | string | Upgrade family name (e.g. `Bakery`) or empty if unupgradeable |
| `maxLevel` | number | Maximum upgrade level (0 = unupgradeable) |
| `reputationPerTurn` | number | Reputation generated per turn (e.g. `0.2` for Clinic) |
| `synergyCoinBonus` | number | Coin synergy per matching neighbor as a fraction of base income (defaults to `0.5`, i.e. 50%; set `0` to exclude) |
| `synergyRepBonus` | number | Reputation synergy per matching neighbor (defaults to `0`) |

**Event** (`event`):

| Column | Type | Description |
|--------|------|-------------|
| `cost` | number | Purchase cost; `0` for Incident events (drawn automatically) |
| `trigger` | string | `Investment` (player-chosen) or `Incident` (automatic) |
| `target` | string | `All`, `SpecificSynergy`, or `RandomBusiness` |
| `targetSynergy` | string | Synergy type when `target` is `SpecificSynergy` |
| `coinDelta` | number | Coin change when the event resolves |
| `reputationDelta` | number | Reputation change when the event resolves |
| `effect` | string | Human-readable effect description |

Duration events (e.g. Flu Outbreak) also use:

| Column | Type | Description |
|--------|------|-------------|
| `duration` | number | Number of turns the effect lasts |
| `effectType` | string | Discriminator (e.g. `income-multiplier`) |
| `multiplier` | number | Scalar applied each turn (e.g. `0.8` for 80% income) |

**Upgrade** (`upgrade`):

| Column | Type | Description |
|--------|------|-------------|
| `cost` | number | Coin cost to apply the upgrade |
| `targetBusiness` | string | Name of the business this upgrade applies to |
| `incomeBonus` | number | Additional income per turn |
| `synergyRangeBonus` | number | Additional synergy range |
| `requiredLevel` | number | Minimum business level required (0 = base business) |
| `reputationBonus` | number | Additional reputation per turn |

**Staff** (`staff`):

| Column | Type | Description |
|--------|------|-------------|
| `cost` | number | Coin cost to acquire |
| `ongoingCost` | number | Per-turn coin cost after hiring |
| `handSlotsAdded` | number | Additional hand slots provided |

### Editing the CSV

To add, remove, or modify cards, edit `card-data.csv` directly. The CSV is
re-parsed automatically during development (Vite HMR) when `MainStreetCards.ts`
is re-evaluated. After editing, verify with:

```bash
npm test
```

### CSV conventions

- Columns not applicable to a given card family are left empty.
- Multiple synergy types use pipe (`|`) as a separator.
- Multi-level upgrade chains are supported: set `requiredLevel` to the
  business level needed before the upgrade can be applied.
- Branching upgrades are supported: multiple `upgrade` rows may share the
  same `targetBusiness` and `requiredLevel`, giving the player a choice.
- Positive Incident events (events where `coinDelta + reputationDelta > 0`)
  receive more copies in the deck based on the `positiveIncidentMultiplier`
  parameter passed to `createEventDeck()`.

## Follow-up work

The tutorial overlay system (`MainStreetTutorialHints.ts`) currently uses `zoneToAnchor()` with
per-zone pixel-math to compute highlight bounding boxes. A follow-up work item tracks migrating
this to resolve zones directly through the composed SLL layout:

- **Adapt tutorial system to use layout description (CG-0MP7IZ4RK008065O)**
  - Will refactor `zoneToAnchor()` to use `composeResolvedLayouts(baseLayout, tutorialLayout)`
  - Replaces hardcoded pixel-math with SLL-resolved bounding boxes
  - Zone names align with those in `main-street-tutorial.layout.json`

## Milestone 5: Tutorial, Onboarding, and Game Selector Integration

Main Street Milestone 5 (CG-0MOY5TOJK008JFJM) adds a first-time player onboarding experience:

### Tutorial State and Persistence

- **Module:** `TutorialState.ts` — typed schema (`MainStreetTutorialStateV1`), localStorage persistence, eligibility logic.
- **Storage key:** `tce-main-street-tutorial-state`
- **Statuses:** `not_seen`, `skipped`, `completed`
- **Legacy bridge:** compatible with existing `campaign.tutorialSeen` flag.

### Tutorial Offer Modal

- **Module:** `scenes/TutorialOfferModal.ts` — first-launch modal with Start/Skip options.
- Blocks gameplay until player chooses Start or Skip.
- Replay mode and test harnesses can suppress via `disableTutorial` or `replayMode` flags.

### Action-Gated Tutorial Flow

- **Module:** `TutorialFlow.ts` — T1-T23 step definitions with pure progression controller.
- Each step gates on a specific player action (confirm, select-business, place-business, end-turn, etc.)
- Invalid actions show: "Complete the highlighted step first."

### Help/Rules Panel

- Updated to 6 PRD-required sections: How to Play, Card Types, Synergy and Placement, Turn Flow, Win/Loss Conditions, Tools.
- Each section has <= 8 lines of concise English-only copy.

### Game Selector Integration

- Main Street registered with PRD-specified metadata in `main.ts` GAMES array.
- Tested via `tests/main-street/game-selector-integration.test.ts`.

### Deferred

- Optional statistics tracking deferred to future milestone (CG-0MPLR9E10003L6K6).
