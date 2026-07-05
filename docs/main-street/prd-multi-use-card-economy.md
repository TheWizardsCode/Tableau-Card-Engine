# Multi-Use Card Economy — Digital Adaptation

**Feature Area:** Core Economy & Hand Management  
**Game:** Main Street  
**Status:** Implemented (v0.1.2+)  
**Related Work Items:** CG-0MQRXN2CT0076OW7 (Epic), CGD-0MQRCBDMC005MWRP (Solution Reference)

## Overview

Main Street's economy has been extended from a single-use card model (cards purchased from the market are placed directly on the tableau) to a **multi-use card economy** where every card has dual purpose — tableau placement **OR** hand-held synergy. This adds meaningful strategic trade-offs without requiring a separate currency track.

The multi-use economy is **additive** — the existing coin-based and reputation-based systems remain unchanged. All new mechanics are layered on top.

## Core Mechanics

### 1. Player Hand Management

| Property | Value |
|----------|-------|
| Initial hand size | 2 cards |
| Max hand size | 2 + staff card bonuses |
| Hand location | Below the tableau in the UI |
| Card types allowed | Business cards (face-up) |

Players may choose to place a purchased business card into their hand instead of onto the tableau. Cards in hand are held for future placement or synergy generation.

### 2. Hand Card Synergy Bonus

During the **IncomePhase**, each card held in hand contributes **`Math.floor(card.baseIncome / 3)`** coins to every tableau business that shares a synergy type with the hand card.

**Examples:**
- A Food hand card (baseIncome=3) adds +1 coin to each Food business on the tableau
- A Food+Culture hand card (baseIncome=3) adds +1 coin to each Food AND each Culture business
- Multiple hand cards of the same synergy type **stack**: 2 Food cards (baseIncome=3 each) = +2 coins per Food business
- Pawn Shop cards do **not** receive hand card synergy (special rule)

**Formula:**
```
perBusinessBonus = Math.floor(card.baseIncome / 3)
totalHandSynergy = Σ perBusinessBonus for each (handCard, tableauBusiness) synergy match
```

### 3. Card Placement & Sell

| Action | Cost/Value | Destination |
|--------|-----------|-------------|
| Place from hand to tableau | 80% of purchase cost (coins deducted) | Tableau slot |
| Sell from hand | 75% of purchase value (coins credited) | Discard pile |
| Sell from tableau | 75% of purchase value (coins credited) | Discard pile (slot freed) |

These actions replace the dedicated Sell action from the physical game design.

### 4. Market Cycling

At the end of each **MarketPhase**, all unpurchased market cards move to their respective discard piles. The market is then refilled from the decks. This ensures fresh cards are available each turn and prevents market stagnation.

- Development row cards → business/community-space discards
- Investments row cards → upgrade/event discards
- Uses existing seeded RNG for reshuffles
- Player-owned cards (hand, tableau) are unaffected

### 5. Staff Cards

Staff cards are a new card family (`family: 'staff'`) that expand the player's hand capacity at an ongoing coin cost.

#### Templates

| Card | Cost | Ongoing Cost | Slots Added | Description |
|------|------|-------------|-------------|-------------|
| Assistant | 3 | 1 | +1 | Low-cost, low upkeep |
| Manager | 6 | 2 | +2 | Mid-range balanced option |
| Director | 10 | 3 | +3 | High investment, high capacity |

#### Rules

- Staff cards **do not** occupy hand slots
- Staff cards have an **ongoing cost** deducted from coins each IncomePhase
- Staff cards can be **laid off** at any time (removed from active staff)
- Layoff removes a random selection of hand cards equal to `handSlotsAdded`
- If the hand has fewer cards than slots to remove, all hand cards are removed
- Random selection uses the game's seeded RNG for determinism
- Laid-off staff cards return to the staff card market
- Insufficient coins for ongoing cost: deducts what's available (down to 0)

#### Market

Staff cards are available for purchase from a dedicated `staffCardMarket` section. Three templates are available at game start (shuffled deterministically).

## Economy Changes Summary

| Old Mechanic | New Mechanic | Status |
|-------------|-------------|--------|
| Stock/Tuck mechanic | Replaced by multi-use economy | **Removed** (explicitly out of scope) |
| Dedicated Sell action | Card sell for 75% value | **Removed** |
| Renovate action | Replaced by card sell | **Removed** |
| Restock action | Replaced by market cycling | **Removed** |
| Open Shop action | Replaced by playing card to tableau | **Removed** |
| Single-use card purchase | Purchase to hand OR tableau | **Added** |

## Rationale: Digital vs Physical

The physical card game uses a card-discard economy where cards are single-use and immediately consumed. The digital adaptation adds a hybrid approach:

1. **No physical constraints** — Digital tracking of hands, synergy, and staff costs is effortless
2. **Deeper strategy** — Players must decide between immediate tableau income and future synergy potential
3. **Staff as strategic lever** — Ongoing costs create tension between hand capacity and net income
4. **Deterministic RNG** — All random elements use the seeded RNG for reproducibility

## Implementation Architecture

All multi-use economy features are implemented in the following files:

- `MainStreetCards.ts` — StaffCard interface, templates, `createStaffDeck()`
- `MainStreetState.ts` — `hand`, `maxHandSize`, `discardPile`, `staffCards`, `staffCardMarket`
- `MainStreetMarket.ts` — `purchaseBusinessToHand()`, `canAddToHand()`, `purchaseStaffCard()`, `cycleMarketCards()`
- `MainStreetAdjacency.ts` — `computeHandCardSynergyBonus()`, updated `computeIncome()` with hand param
- `MainStreetEngine.ts` — `applyStaffOngoingCosts()`, `layoffStaffCard()`, `BuyBusinessToHandAction`
- `MainStreetCommands.ts` — `buyBusinessToHandCommand()`
- `MainStreetRenderer.ts` — Hand card rendering, hand size indicator
- `MainStreetScene.ts` — `handBusinessContainer`, `handSizeText`

## Save/Load Compatibility

Old saved games (without hand/staff/discard fields) load correctly with defaults:
- `hand` → `[]`
- `maxHandSize` → `2`
- `discardPile` → `[]`
- `staffCards` → `[]`
- `staffCardMarket` → `[]`

## Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `MainStreetHandState.test.ts` | 22 | Hand initialization, purchase-to-hand, capacity, serialization, migration |
| `MainStreetHandSynergy.test.ts` | 17 | 1/3 synergy calculation, stacking, matching, breakdown |
| `MainStreetMarketCycling.test.ts` | 17 | Cycling, reshuffle, deterministic RNG, edge cases |
| `MainStreetStaffCards.test.ts` | 25 | Templates, purchase, stacking, costs, layoff, RNG determinism |
| `MainStreetIntegration.test.ts` | 12 | Full game loop, net income, lifecycle, migration |
