# Main Street: PRD Milestone 2 -- Meta-Progression System

**Work Item:** CG-0MMJ8S8TJ0HE9S9M (Meta-Progression Spec)
**Parent:** CG-0MM4REC2Z0GS2YKT (Main Street: PRD Milestone 2)
**Status:** Spec only -- runtime implementation blocked on Save/Load: Engine Infrastructure (CG-0MMJ8S90S1P2HW74)
**Date:** 2026-03-11

> This document specifies Main Street's 5-tier meta-progression system. It defines the unlock framework, tier thresholds, card pool expansion, campaign persistence data model, and Save/Load integration pattern. Additional M2 PRD sections (expanded card pool, challenge system, difficulty presets, etc.) will be added as separate work items under the parent M2 epic.

---

## Table of Contents

1. [Meta-Progression System Overview](#1-meta-progression-system-overview)
2. [Tier Definitions](#2-tier-definitions)
3. [Campaign Persistence Data Model](#3-campaign-persistence-data-model)
4. [Integration with Save/Load](#4-integration-with-saveload)
5. [User Stories with Acceptance Criteria](#5-user-stories-with-acceptance-criteria)
6. [Out of Scope](#6-out-of-scope)
7. [Dependencies](#7-dependencies)
8. [Appendix A: Card Catalog by Tier](#appendix-a-card-catalog-by-tier)
9. [Appendix B: Threshold Calibration Rationale](#appendix-b-threshold-calibration-rationale)

---

## 1. Meta-Progression System Overview

### 1.1 Purpose

Meta-progression gives players a reason to play multiple runs by introducing persistent cross-run rewards. Strong performances in a single run unlock new cards for all future runs, expanding the strategic palette and rewarding mastery with additional options rather than direct power.

### 1.2 Core Concepts

**Unlock Tiers.** The progression system defines 5 tiers. Each tier is a named milestone that permanently expands the player's card pool when achieved:

| Tier | Name | Description |
|------|------|-------------|
| 1 | Foundation | The baseline M1 card pool. All players start here. |
| 2 | Rising Street | First expansion: introduces the Commerce gap-fill and a new Service business. |
| 3 | Neighborhood | Mid-tier: adds bridge cards and new synergy event types. |
| 4 | District | Advanced: unlocks Entertainment anchor and branching upgrades. |
| 5 | Landmark | Endgame: unlocks premium multi-synergy cards and multi-level upgrades. |

**Milestone Latch Model.** Tier unlocks are permanent -- once earned, never lost. A player who reaches Tier 3 will always have Tier 3 (and below) unlocked, regardless of subsequent run outcomes. There is no prestige or reset mechanism. Reputation does not accumulate numerically across runs; only the fact that a tier's threshold was crossed in a single run matters.

**Dual Trigger Paths.** Each tier (2-5) can be unlocked via either of two independent paths:

1. **Reputation Threshold:** Achieve a minimum reputation score at end-of-run (EndCheck phase). The reputation value is the per-run `resourceBank.reputation`, not the final score.
2. **Challenge Completion:** Complete a specified set of challenges within a single run. The challenges are drawn from the existing challenge pool and evaluated at EndCheck.

Either path alone is sufficient to latch the tier. Both paths are evaluated at end-of-run, after challenge evaluation but before score calculation.

**Card Pool Filtering.** At the start of each run, the deck-building functions (`createBusinessDeck`, `createEventDeck`, `createUpgradeDeck`) filter the full card template pool to include only cards from the player's unlocked tiers. Tier 1 always includes the complete M1 card pool. Each subsequent tier adds 2-3 cards (8-12 new cards total across Tiers 2-5).

### 1.3 Progression Flow

```
Run N completes
    |
    v
EndCheck phase evaluates challenges
    |
    v
Tier evaluation: check reputation threshold AND challenge milestones
    |
    v
If any new tier latched:
    - Add tier ID to campaign.unlockedTiers
    - Record milestone in campaign.milestoneHistory
    |
    v
Update campaign statistics (totalRuns, totalWins, highestScore)
    |
    v
Persist campaign progress via Save/Load API
    |
    v
Run N+1 starts with expanded card pool
```

---

## 2. Tier Definitions

### 2.1 Tier 1 -- Foundation (Baseline)

**Unlocked by default.** All new campaigns start with Tier 1.

**Card Pool (M1 baseline):**

| Type | Cards |
|------|-------|
| Business (5) | Bakery (`biz-bakery`), Diner (`biz-diner`), Bookshop (`biz-bookshop`), Park (`biz-park`), Hardware Store (`biz-hardware`) |
| Event (5) | Local Festival (`evt-festival`), Rainy Day (`evt-rainy`), Tax Audit (`evt-tax`), Community Award (`evt-award`), Health Inspection (`evt-inspection`) |
| Upgrade (3) | Patisserie (`upg-patisserie`), Bistro (`upg-bistro`), Reader's Café (`upg-readers-cafe`) |

**Total: 13 card templates (5 Business + 5 Event + 3 Upgrade)**

### 2.2 Tier 2 -- Rising Street

**Reputation Threshold:** >= 8 reputation at end-of-run

**Challenge Milestone:** Complete any 2 challenges in a single run

**New Cards Unlocked (3):**

| Type | Card | ID | Rationale |
|------|------|----|-----------|
| Business | Pawn Shop | `biz-pawnshop` | Fills the M1 Commerce gap (only Hardware Store existed). Cost 6, single-synergy Commerce. Low barrier to entry for new players. |
| Business | Laundromat | `biz-laundromat` | Introduces the Service synergy type. Cost 6, accessible. Players begin exploring the new synergy axis. |
| Event | Grand Opening Sale | `evt-grand-opening` | Investment event for Commerce synergy (+3 coins). Pairs with the newly unlocked Pawn Shop. |

**Cumulative Pool After Tier 2: 16 templates (7 Business + 6 Event + 3 Upgrade)**

### 2.3 Tier 3 -- Neighborhood

**Reputation Threshold:** >= 16 reputation at end-of-run

**Challenge Milestone:** Complete 1 synergy challenge AND 1 resource challenge in a single run

**New Cards Unlocked (3):**

| Type | Card | ID | Rationale |
|------|------|----|-----------|
| Business | Cafe | `biz-cafe` | First multi-synergy bridge card (Food + Culture). Introduces the bridge concept, rewarding strategic placement. |
| Event | Wellness Fair | `evt-wellness-fair` | Investment event for Service synergy (+2 coins/Service, +1 rep). Supports the Service business unlocked in Tier 2. |
| Upgrade | Garden | `upg-garden` | Upgrade for Park (Culture). Gives M1 Park owners a progression path and demonstrates upgrade mechanics beyond M1. |

**Cumulative Pool After Tier 3: 19 templates (8 Business + 7 Event + 4 Upgrade)**

### 2.4 Tier 4 -- District

**Reputation Threshold:** >= 32 reputation at end-of-run

**Challenge Milestone:** Complete any 3 challenges in a single run (at least 1 must be cross-cutting or placement)

**New Cards Unlocked (3):**

| Type | Card | ID | Rationale |
|------|------|----|-----------|
| Business | Arcade | `biz-arcade` | Introduces the Entertainment synergy type as a standalone business. Cost 8, anchors Entertainment strategies. |
| Event | Block Party | `evt-block-party` | Investment event for Entertainment (+2 coins/Entertainment, +2 rep). High reward, high cost (4 coins). Pairs with Arcade. |
| Upgrade | Bread Factory | `upg-bread-factory` | Branching upgrade for Bakery (alternative to Patisserie). Demonstrates the branching upgrade mechanic: +2 income, no range boost. |

**Cumulative Pool After Tier 4: 22 templates (9 Business + 8 Event + 5 Upgrade)**

### 2.5 Tier 5 -- Landmark

**Reputation Threshold:** >= 64 reputation at end-of-run

**Challenge Milestone:** Complete the "Diversified" challenge (`ch-diversified`: all 6 synergy types present) in a single run

**New Cards Unlocked (3):**

| Type | Card | ID | Rationale |
|------|------|----|-----------|
| Business | Day Spa | `biz-spa` | Premium multi-synergy bridge (Service + Entertainment), maxLevel 2. Unlocks the most complex business in the pool with full multi-level upgrade potential. |
| Event | Charity Drive | `evt-charity-drive` | Investment event (+3 rep, 0 coins). Pure reputation play. Enables high-reputation strategies at the endgame tier. |
| Upgrade | Grand Bakehouse | `upg-grand-bakehouse` | Multi-level upgrade for Bakery (requiredLevel 1). The first Level-2 upgrade in the pool, demonstrating the full upgrade chain: Bakery -> Patisserie/Bread Factory -> Grand Bakehouse. |

**Cumulative Pool After Tier 5: 25 templates (10 Business + 9 Event + 6 Upgrade)**

### 2.6 Tier Summary

| Tier | Name | Rep Threshold | Challenge Path | New Business | New Event | New Upgrade | Cumulative Templates |
|------|------|--------------|----------------|-------------|-----------|------------|---------------------|
| 1 | Foundation | -- | -- | 5 | 5 | 3 | 13 |
| 2 | Rising Street | >= 8 | Any 2 challenges | 1 (Pawn Shop) | 1 (Grand Opening) | 0 | 16 |
| 3 | Neighborhood | >= 16 | 1 synergy + 1 resource | 1 (Cafe) | 1 (Wellness Fair) | 1 (Garden) | 19 |
| 4 | District | >= 32 | Any 3 (incl. 1 cross-cutting/placement) | 1 (Arcade) | 1 (Block Party) | 1 (Bread Factory) | 22 |
| 5 | Landmark | >= 64 | Diversified challenge | 1 (Day Spa) | 1 (Charity Drive) | 1 (Grand Bakehouse) | 25 |

**Total new cards across Tiers 2-5: 41** (10 Business + 11 Event + 20 Upgrade)

> Update note: tier distribution was expanded in follow-up work item CG-0MP1VO5FM008LB5Z so campaign progression now covers the full 59-template catalog, with a 5-card expanded sample available in Tier 1.

### 2.7 Historical note (superseded)

This section originally tracked cards that were not tier-gated. It is now superseded by follow-up work item CG-0MP1VO5FM008LB5Z, which updated progression so the full expanded catalog is tier-gated and reachable through campaign unlocks.

The list below is retained as historical context for prior milestone discussions.

| Type | Remaining M2 Cards (added to Tier 1 pool) |
|------|--------------------------------------------|
| Business | Boutique, Barbershop, Cinema, Food Truck, Art Gallery, Florist, Clinic |
| Event | Power Outage, Shoplifting Spree, Noise Complaint, Pipe Burst, Food Critic Visit, Road Construction, Viral Review, Vandalism |
| Upgrade | Home Improvement, Vintage Shop, Designer Store, Dry Cleaners, Salon, Gaming Lounge, IMAX Theater, Roastery, Gourmet Truck, Museum, Resort Spa, Garden Center, Medical Center, Fast Food, Drive-In Theater, Restaurant, Multiplex, Luxury Retreat, Wellness Center |

> **Design note:** The tier-gated cards were selected to introduce one new mechanic or synergy type per tier (Commerce gap-fill, Service type, bridge cards, Entertainment type, multi-level upgrades). The remaining M2 cards provide breadth and variety within the existing mechanics and are available from the start of M2 content.

> **Synergy reclassification (Health type):** The Clinic (`biz-clinic`) was originally assigned the Service synergy type alongside Laundromat and Barbershop. It was reclassified to **Health** as part of introducing the new Health synergy type to M2. The Health type is a non-profit community health axis represented by Clinic, Private Clinic, and Pharmacy — cards that generate reputation per turn instead of (or in addition to) coin income. This reclassification affects the following cards: Clinic (cost 10, income 0, rep +0.2/turn, Health), Private Clinic (cost 8, income 2, Health), Pharmacy (cost 6, income 1, Health), and their upgrades Medical Center (rep +0.1/turn) and Private Medical Center (income +2). The Service synergy type retains Laundromat, Barbershop, and Day Spa (bridge).

---

## 3. Campaign Persistence Data Model

### 3.1 Existing Interface

The `MainStreetCampaignProgress` interface (defined in `example-games/main-street/MainStreetState.ts:217-224`) already provides the core fields:

```typescript
interface MainStreetCampaignProgress {
  unlockedTiers: string[];
  persistentReputation: number;
  highestScore: number;
  totalRuns: number;
  totalWins: number;
  lastUpdatedAt: string;
}
```

### 3.2 Extended Interface

To support the full meta-progression spec, the interface must be extended with milestone history and a schema version for forward compatibility:

```typescript
interface MainStreetCampaignProgress {
  /** Schema version for forward-compatible deserialization. */
  schemaVersion: number;

  /** List of unlocked tier IDs, e.g. ['tier-1', 'tier-2']. Always includes 'tier-1'. */
  unlockedTiers: string[];

  /** IDs of all cards unlocked via tier progression. Derived from unlockedTiers at runtime,
   *  but persisted for fast lookup and offline validation. */
  unlockedCardIds: string[];

  /**
   * History of milestone achievements. Each entry records when a tier was unlocked,
   * which trigger path was used, and the run context.
   */
  milestoneHistory: MilestoneRecord[];

  /** Highest single-run reputation achieved across all runs. Not used for tier evaluation
   *  (only the per-run value matters), but useful for player stats display. */
  persistentReputation: number;

  /** Highest final score achieved across all runs. */
  highestScore: number;

  /** Total number of completed runs (win or loss). */
  totalRuns: number;

  /** Total number of winning runs. */
  totalWins: number;

  /** ISO 8601 timestamp of the last update to this campaign data. */
  lastUpdatedAt: string;
}

interface MilestoneRecord {
  /** Tier ID that was unlocked, e.g. 'tier-3'. */
  tierId: string;

  /** Which trigger path caused the unlock. */
  triggerType: 'reputation' | 'challenge';

  /** For reputation triggers: the reputation value at end-of-run.
   *  For challenge triggers: null. */
  reputationAtUnlock: number | null;

  /** For challenge triggers: the IDs of challenges completed that satisfied the condition.
   *  For reputation triggers: null. */
  challengeIdsAtUnlock: string[] | null;

  /** The final score of the run that triggered the unlock. */
  runFinalScore: number;

  /** The seed of the run that triggered the unlock. */
  runSeed: string;

  /** ISO 8601 timestamp when the milestone was achieved. */
  unlockedAt: string;
}
```

### 3.3 JSON Schema Examples

#### 3.3.1 Default Campaign (New Player)

```json
{
  "schemaVersion": 2,
  "unlockedTiers": ["tier-1"],
  "unlockedCardIds": [
    "biz-bakery", "biz-diner", "biz-bookshop", "biz-park", "biz-hardware",
    "evt-festival", "evt-rainy", "evt-tax", "evt-award", "evt-inspection",
    "upg-patisserie", "upg-bistro", "upg-readers-cafe"
  ],
  "milestoneHistory": [],
  "persistentReputation": 0,
  "highestScore": 0,
  "totalRuns": 0,
  "totalWins": 0,
  "lastUpdatedAt": "2026-03-11T00:00:00.000Z"
}
```

#### 3.3.2 Experienced Player (Tier 3 Unlocked)

```json
{
  "schemaVersion": 2,
  "unlockedTiers": ["tier-1", "tier-2", "tier-3"],
  "unlockedCardIds": [
    "biz-bakery", "biz-diner", "biz-bookshop", "biz-park", "biz-hardware",
    "biz-pawnshop", "biz-laundromat",
    "biz-cafe",
    "evt-festival", "evt-rainy", "evt-tax", "evt-award", "evt-inspection",
    "evt-grand-opening",
    "evt-wellness-fair",
    "upg-patisserie", "upg-bistro", "upg-readers-cafe",
    "upg-garden"
  ],
  "milestoneHistory": [
    {
      "tierId": "tier-2",
      "triggerType": "reputation",
      "reputationAtUnlock": 7,
      "challengeIdsAtUnlock": null,
      "runFinalScore": 162,
      "runSeed": "alpha-run-5",
      "unlockedAt": "2026-03-11T10:30:00.000Z"
    },
    {
      "tierId": "tier-3",
      "triggerType": "challenge",
      "reputationAtUnlock": null,
      "challengeIdsAtUnlock": ["ch-foodie-row", "ch-deep-pockets"],
      "runFinalScore": 145,
      "runSeed": "alpha-run-12",
      "unlockedAt": "2026-03-11T14:15:00.000Z"
    }
  ],
  "persistentReputation": 9,
  "highestScore": 185,
  "totalRuns": 15,
  "totalWins": 11,
  "lastUpdatedAt": "2026-03-11T14:15:00.000Z"
}
```

#### 3.3.3 Completionist (All Tiers Unlocked)

```json
{
  "schemaVersion": 2,
  "unlockedTiers": ["tier-1", "tier-2", "tier-3", "tier-4", "tier-5"],
  "unlockedCardIds": [
    "biz-bakery", "biz-diner", "biz-bookshop", "biz-park", "biz-hardware",
    "biz-pawnshop", "biz-laundromat",
    "biz-cafe",
    "biz-arcade",
    "biz-spa",
    "evt-festival", "evt-rainy", "evt-tax", "evt-award", "evt-inspection",
    "evt-grand-opening",
    "evt-wellness-fair",
    "evt-block-party",
    "evt-charity-drive",
    "upg-patisserie", "upg-bistro", "upg-readers-cafe",
    "upg-garden",
    "upg-bread-factory",
    "upg-grand-bakehouse"
  ],
  "milestoneHistory": [
    {
      "tierId": "tier-2",
      "triggerType": "reputation",
      "reputationAtUnlock": 7,
      "challengeIdsAtUnlock": null,
      "runFinalScore": 162,
      "runSeed": "alpha-run-5",
      "unlockedAt": "2026-03-11T10:30:00.000Z"
    },
    {
      "tierId": "tier-3",
      "triggerType": "challenge",
      "reputationAtUnlock": null,
      "challengeIdsAtUnlock": ["ch-foodie-row", "ch-deep-pockets"],
      "runFinalScore": 145,
      "runSeed": "alpha-run-12",
      "unlockedAt": "2026-03-11T14:15:00.000Z"
    },
    {
      "tierId": "tier-4",
      "triggerType": "reputation",
      "reputationAtUnlock": 11,
      "challengeIdsAtUnlock": null,
      "runFinalScore": 198,
      "runSeed": "beta-run-3",
      "unlockedAt": "2026-03-12T09:00:00.000Z"
    },
    {
      "tierId": "tier-5",
      "triggerType": "challenge",
      "reputationAtUnlock": null,
      "challengeIdsAtUnlock": ["ch-diversified"],
      "runFinalScore": 210,
      "runSeed": "beta-run-8",
      "unlockedAt": "2026-03-12T16:45:00.000Z"
    }
  ],
  "persistentReputation": 14,
  "highestScore": 230,
  "totalRuns": 28,
  "totalWins": 22,
  "lastUpdatedAt": "2026-03-12T16:45:00.000Z"
}
```

### 3.4 Schema Versioning

The current `MAIN_STREET_CAMPAIGN_SCHEMA_VERSION` is `1`. This spec bumps it to `2` to reflect the addition of `schemaVersion`, `unlockedCardIds`, and `milestoneHistory` fields.

**Migration from v1 to v2:**
- `unlockedTiers` carries over unchanged.
- `unlockedCardIds` is derived from `unlockedTiers` using the tier definition registry.
- `milestoneHistory` defaults to `[]` (no retroactive history reconstruction).
- `schemaVersion` is set to `2`.
- All other fields carry over unchanged.

The `mainStreetCampaignSerializer.deserialize` function must detect v1 data (absence of `schemaVersion` field or `schemaVersion === 1`) and apply the migration automatically.

---

## 4. Integration with Save/Load

### 4.1 Dependency

This specification depends on Save/Load: Engine Infrastructure (CG-0MMJ8S90S1P2HW74), which provides the `SaveLoadStore` class and the `SaveSerializer<TRuntime, TSerialized>` interface. The Save/Load infrastructure is currently in review with committed code. The integration patterns below are based on the committed API.

### 4.2 Existing Persistence Pattern

The existing Save/Load integration (`example-games/main-street/MainStreetSaveLoad.ts`) already provides:

| Function | Purpose | Storage Category |
|----------|---------|-----------------|
| `saveCampaignProgress(store, progress)` | Persist campaign data | `campaign-progress` |
| `loadCampaignProgress(store)` | Load campaign data | `campaign-progress` |
| `createDefaultCampaignProgress()` | Factory for new campaigns | -- |
| `mainStreetCampaignSerializer` | Identity serializer (v1) | -- |

Campaign and run-checkpoint saves are stored independently and do not interfere with each other.

### 4.3 Required Changes

#### 4.3.1 Schema Version Bump

```typescript
// MainStreetSaveLoad.ts
export const MAIN_STREET_CAMPAIGN_SCHEMA_VERSION = 2; // was 1
```

#### 4.3.2 Updated Serializer with Migration

```typescript
export const mainStreetCampaignSerializer: SaveSerializer<
  MainStreetCampaignProgress,
  MainStreetCampaignProgress
> = {
  schemaVersion: MAIN_STREET_CAMPAIGN_SCHEMA_VERSION,
  serialize: (state) => structuredClone(state),
  deserialize: (data) => {
    // v1 -> v2 migration
    if (!data.schemaVersion || data.schemaVersion === 1) {
      return {
        ...data,
        schemaVersion: 2,
        unlockedCardIds: deriveUnlockedCardIds(data.unlockedTiers),
        milestoneHistory: [],
      };
    }
    return structuredClone(data);
  },
};
```

#### 4.3.3 Default Campaign Progress Update

```typescript
export function createDefaultCampaignProgress(): MainStreetCampaignProgress {
  return {
    schemaVersion: MAIN_STREET_CAMPAIGN_SCHEMA_VERSION,
    unlockedTiers: ['tier-1'],
    unlockedCardIds: TIER_DEFINITIONS['tier-1'].cumulativeCardIds,
    milestoneHistory: [],
    persistentReputation: 0,
    highestScore: 0,
    totalRuns: 0,
    totalWins: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}
```

#### 4.3.4 Post-Run Update Flow

A new function `updateCampaignAfterRun` should be added to process end-of-run tier evaluation and campaign statistics:

```typescript
/**
 * Evaluates tier unlocks and updates campaign progress after a completed run.
 *
 * Called after EndCheck phase determines the game result.
 * Mutates the campaign progress in place, then persists it.
 *
 * @param campaign  Current campaign progress (loaded from storage).
 * @param state     Completed game state (after EndCheck).
 * @param store     Save/Load store for persistence.
 */
export async function updateCampaignAfterRun(
  campaign: MainStreetCampaignProgress,
  state: MainStreetState,
  store: SaveLoadStore,
): Promise<MainStreetCampaignProgress> {
  const now = new Date().toISOString();

  // Update statistics
  campaign.totalRuns += 1;
  if (state.gameResult === 'win') campaign.totalWins += 1;
  if (state.finalScore > campaign.highestScore) {
    campaign.highestScore = state.finalScore;
  }
  if (state.resourceBank.reputation > campaign.persistentReputation) {
    campaign.persistentReputation = state.resourceBank.reputation;
  }

  // Evaluate tier unlocks
  for (const tierDef of ORDERED_TIER_DEFINITIONS) {
    if (campaign.unlockedTiers.includes(tierDef.id)) continue;

    const reputationMet = state.resourceBank.reputation >= tierDef.reputationThreshold;
    const challengeMet = tierDef.challengeCondition(state);

    if (reputationMet || challengeMet) {
      campaign.unlockedTiers.push(tierDef.id);
      campaign.milestoneHistory.push({
        tierId: tierDef.id,
        triggerType: reputationMet ? 'reputation' : 'challenge',
        reputationAtUnlock: reputationMet ? state.resourceBank.reputation : null,
        challengeIdsAtUnlock: challengeMet ? [...state.challengesCompleted] : null,
        runFinalScore: state.finalScore,
        runSeed: state.seed,
        unlockedAt: now,
      });
      // Derive updated card list
      campaign.unlockedCardIds = deriveUnlockedCardIds(campaign.unlockedTiers);
    }
  }

  campaign.lastUpdatedAt = now;
  await saveCampaignProgress(store, campaign);
  return campaign;
}
```

#### 4.3.5 Tier Definition Registry

A static registry maps tier IDs to their definitions. This is the authoritative source for tier thresholds and card assignments:

```typescript
interface TierDefinition {
  id: string;
  name: string;
  order: number; // 1-5, determines evaluation order
  reputationThreshold: number;
  challengeCondition: (state: MainStreetState) => boolean;
  newCardIds: string[]; // Cards added by THIS tier only
  cumulativeCardIds: string[]; // All cards available at this tier
}

const TIER_DEFINITIONS: Record<string, TierDefinition> = {
  'tier-1': { /* ... Foundation ... */ },
  'tier-2': { /* ... Rising Street ... */ },
  'tier-3': { /* ... Neighborhood ... */ },
  'tier-4': { /* ... District ... */ },
  'tier-5': { /* ... Landmark ... */ },
};

const ORDERED_TIER_DEFINITIONS: TierDefinition[] =
  Object.values(TIER_DEFINITIONS).sort((a, b) => a.order - b.order);
```

#### 4.3.6 Deck Building with Tier Filtering

The existing deck-building functions must accept an optional list of unlocked card IDs to filter templates:

```typescript
export function createBusinessDeck(
  copies: number = 3,
  unlockedCardIds?: string[],
): BusinessCard[] {
  const templates = unlockedCardIds
    ? BUSINESS_TEMPLATES.filter(t => unlockedCardIds.includes(t.id))
    : BUSINESS_TEMPLATES;

  const deck: BusinessCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of templates) {
      deck.push(makeBusiness({ ...template, id: `${template.id}-${c}` }));
    }
  }
  return deck;
}
```

The same pattern applies to `createEventDeck` and `createUpgradeDeck`. When `unlockedCardIds` is not provided (undefined), the full pool is used -- this preserves backward compatibility with existing tests and non-campaign game modes.

### 4.4 Data Flow Diagram

```
Game Start
    |
    v
loadCampaignProgress(store) -> campaign (or createDefaultCampaignProgress())
    |
    v
createBusinessDeck(3, campaign.unlockedCardIds)
createEventDeck(3, campaign.unlockedCardIds, createSeededRng(42) /* rng is required for deterministic fractional allocation; use createSeededRng(seed) in tests/runtime */)
createUpgradeDeck(2, campaign.unlockedCardIds)
    |
    v
Normal game play (20 turns or until win/loss)
    |
    v
EndCheck phase: evaluateChallenges() -> computeScore() -> determine gameResult
    |
    v
updateCampaignAfterRun(campaign, state, store)
    |
    v
Display results + any newly unlocked tiers/cards
    |
    v
Next run starts with updated campaign
```

---

## 5. User Stories with Acceptance Criteria

### US-1: Tier Evaluation at End of Run

**As a player**, I want my end-of-run reputation to be evaluated against tier thresholds **so that** strong performances unlock new content.

**Acceptance Criteria:**

1. When a run completes (win or loss), the system evaluates the player's `resourceBank.reputation` against each locked tier's reputation threshold.
2. If `reputation >= threshold` for any locked tier, that tier is added to `campaign.unlockedTiers`.
3. Multiple tiers can be unlocked in a single run (e.g., a player with reputation 12 and only Tier 1 unlocked would unlock Tiers 2, 3, 4, and 5 simultaneously).
4. Tier evaluation uses the per-run reputation value, not the final score.
5. Tier evaluation occurs after challenge evaluation but before the game-over screen is displayed.

**Testable Conditions:**
- Given a completed run with `reputation = 7` and only `tier-1` unlocked, then `tier-2` is added to `unlockedTiers`.
- Given a completed run with `reputation = 5` and only `tier-1` unlocked, then `unlockedTiers` remains `['tier-1']`.
- Given a completed run with `reputation = 64` and only `tier-1` unlocked, then `unlockedTiers` becomes `['tier-1', 'tier-2', 'tier-3', 'tier-4', 'tier-5']`.

### US-2: Challenge-Based Tier Unlock

**As a player**, I want to unlock tiers by completing specific challenge combinations **so that** I can progress through skilled play even when reputation is low.

**Acceptance Criteria:**

1. Each tier (2-5) defines a challenge-based unlock condition independent of the reputation threshold.
2. The challenge condition is evaluated against the run's `challengesCompleted` array and `activeChallenges` at EndCheck.
3. Either the reputation path or the challenge path is sufficient to unlock a tier; both are not required.
4. Challenge conditions reference challenge IDs from the existing `CHALLENGE_TEMPLATES` pool.

**Testable Conditions:**
- Given a completed run with `reputation = 4` (below Tier 2 threshold) but `challengesCompleted = ['ch-foodie-row', 'ch-deep-pockets']` (2 challenges), then `tier-2` is unlocked via the challenge path.
- Given a completed run with `reputation = 4` and `challengesCompleted = ['ch-foodie-row']` (only 1 challenge), then `tier-2` is NOT unlocked (need 2 for Tier 2 challenge path).
- Given a completed run satisfying Tier 3's challenge condition (`challengesCompleted` includes both a synergy and a resource challenge), but Tier 2 is not yet unlocked, then both Tier 2 AND Tier 3 are unlocked (tiers are evaluated independently, not sequentially).

### US-3: Milestone Latch Permanence

**As a player**, I want my tier unlocks to be permanent **so that** a bad run never takes away content I have earned.

**Acceptance Criteria:**

1. Once a tier is added to `campaign.unlockedTiers`, it is never removed by any game action.
2. A run that ends in a loss (bankruptcy, reputation collapse, turn exhaustion) does not affect previously unlocked tiers.
3. The `unlockedTiers` array only grows; there is no mechanism to shrink it.
4. The UI never indicates that a tier could be lost.

**Testable Conditions:**
- Given a campaign with `unlockedTiers = ['tier-1', 'tier-2', 'tier-3']` and a run that ends in a loss with `reputation = 0`, the campaign's `unlockedTiers` remains `['tier-1', 'tier-2', 'tier-3']` after the run.
- Given a campaign with `unlockedTiers = ['tier-1', 'tier-2']` and a run that ends in bankruptcy on turn 3, `unlockedTiers` remains unchanged.

### US-4: Card Pool Filtering by Tier

**As a player**, I want my card pool to expand as I unlock tiers **so that** each new tier feels rewarding with fresh strategic options.

**Acceptance Criteria:**

1. At game start, the deck-building functions use `campaign.unlockedCardIds` to filter the template pool.
2. Only cards from unlocked tiers appear in the Business, Event, and Upgrade decks.
3. A Tier 1-only player sees only M1 cards (13 templates).
4. A Tier 5 player sees the full tier-gated pool (25 templates) plus any non-tier-gated M2 cards.
5. Non-campaign game modes (e.g., quick play, demo scripts) continue to use the full pool by default.

**Testable Conditions:**
- Given `unlockedCardIds` containing only Tier 1 card IDs, `createBusinessDeck(3, unlockedCardIds)` returns 15 cards (5 templates x 3 copies).
- Given `unlockedCardIds` containing Tiers 1-2 card IDs, `createBusinessDeck(3, unlockedCardIds)` returns 21 cards (7 templates x 3 copies).
- Given `unlockedCardIds = undefined`, `createBusinessDeck(3)` returns the full pool (all templates x 3 copies) for backward compatibility.

### US-5: Campaign Persistence Round-Trip

**As a player**, I want my progression to persist between browser sessions **so that** I do not lose my unlocked tiers.

**Acceptance Criteria:**

1. After each run, `saveCampaignProgress` persists the updated campaign data.
2. On game start, `loadCampaignProgress` restores the campaign with all unlocked tiers intact.
3. If no saved campaign exists, `createDefaultCampaignProgress` provides Tier 1 defaults.
4. Schema migration from v1 to v2 preserves existing `unlockedTiers` and derives `unlockedCardIds`.
5. A v2 campaign round-trips through save/load with all fields intact, including `milestoneHistory`.

**Testable Conditions:**
- Save a campaign with `unlockedTiers = ['tier-1', 'tier-2']` and `milestoneHistory` containing one entry. Load it back. All fields match exactly.
- Save a v1 campaign (no `schemaVersion` field). Load it back. The result has `schemaVersion = 2`, `milestoneHistory = []`, and `unlockedCardIds` correctly derived from `unlockedTiers`.
- Save a campaign, clear the run-checkpoint storage, load the campaign. Campaign data is intact (independent of run-checkpoint storage).

### US-6: Backward-Compatible Defaults

**As a developer**, I want the meta-progression system to be backward-compatible **so that** existing tests and M1 functionality are unaffected.

**Acceptance Criteria:**

1. All existing tests (148+ from M1) continue to pass without modification.
2. Deck-building functions called without `unlockedCardIds` produce the same output as before.
3. `createDefaultCampaignProgress()` returns a valid v2 campaign with Tier 1 defaults.
4. Games started without campaign data use the full card pool (non-campaign mode).
5. The `MainStreetCampaignProgress` interface extension is additive; no existing fields are removed or renamed.

**Testable Conditions:**
- `npm test` passes with 0 failures after implementation.
- `createBusinessDeck(3)` (no second argument) returns the same card count as before the change.
- `createDefaultCampaignProgress().unlockedTiers` equals `['tier-1']`.

### US-7: Milestone History Tracking

**As a player**, I want to see a record of my milestone achievements **so that** I can remember how and when I earned each tier.

**Acceptance Criteria:**

1. Each tier unlock adds a `MilestoneRecord` to `campaign.milestoneHistory`.
2. The record captures: tier ID, trigger type (reputation or challenge), the relevant values at unlock, run final score, run seed, and timestamp.
3. Milestone history is persisted as part of campaign data and survives round-trips.
4. The milestone history is append-only; entries are never modified or removed.

**Testable Conditions:**
- Unlock Tier 2 via reputation in a run with seed "test-seed". Verify `milestoneHistory[0]` has `tierId = 'tier-2'`, `triggerType = 'reputation'`, `runSeed = 'test-seed'`, and a valid ISO timestamp.
- Unlock Tier 3 via challenges. Verify `milestoneHistory` entry has `triggerType = 'challenge'` and `challengeIdsAtUnlock` lists the completed challenge IDs.

---

## 6. Out of Scope

The following items are explicitly excluded from this spec:

| Item | Reason | Future Milestone |
|------|--------|-----------------|
| Runtime implementation | Blocked on Save/Load merge (CG-0MMJ8S90S1P2HW74) | M2 implementation phase |
| Prestige / tier reset mechanism | Not needed for initial release; complexity deferred | M5+ (if engagement data warrants) |
| Card visibility UX (greyed-out vs hidden) | UX design decision | M4 (Visual Polish) or M5 (Onboarding) |
| Balance tuning of thresholds | Requires AI auto-play testing | M3 (AI, Hints, Undo) |
| Tier-specific UI celebrations | Visual polish | M4 (Visual Polish) |
| Reputation accumulation across runs | Design decision: latch model chosen over accumulation | N/A (intentional) |
| Non-tier-gated M2 content assignment | Part of broader M2 content work items | CG-0MM4REC2Z0GS2YKT children |

---

## 7. Dependencies

| Dependency | ID | Type | Status |
|------------|-----|------|--------|
| Save/Load: Engine Infrastructure | CG-0MMJ8S90S1P2HW74 | Blocking (runtime implementation) | In review |
| Main Street: PRD Milestone 2 (parent) | CG-0MM4REC2Z0GS2YKT | Parent work item | Open |
| Tests: Meta-progression Spec | CG-0MMJ9O6UZ0ZOXRY4 | Child (test task) | Open |
| GDD: Content Design and Progression | CG-0MM4RCE861AQ7PGW | Reference (content) | Completed |
| GDD: Consolidated | CG-0MM4RDIMT1HLP2DE | Reference (design) | Completed |
| Reputation Collapse Bug Fix | CG-0MM8LRL740WJ28SD | Reference (threshold calibration) | Completed |

---

## Appendix A: Card Catalog by Tier

### Appendix A.0: Catalog growth summary

| Snapshot | Business | Event | Upgrade | Total templates |
|---|---:|---:|---:|---:|
| Tier 1 baseline | 7 | 6 | 5 | 18 |
| Current catalog | 17 | 17 | 25 | 59 |
| Net increase | +10 | +11 | +20 | +41 |

Verification artifacts:
- `docs/main-street/card-catalog-baseline.json`
- `docs/main-street/expanded-card-manifest.json`

### Tier 1 -- Foundation (13 templates)

| ID | Name | Family | Synergy | Cost |
|----|------|--------|---------|------|
| `biz-bakery` | Bakery | Business | Food | 6 |
| `biz-diner` | Diner | Business | Food | 8 |
| `biz-bookshop` | Bookshop | Business | Culture | 8 |
| `biz-park` | Park | Business | Culture | 4 |
| `biz-hardware` | Hardware Store | Business | Commerce | 10 |
| `evt-festival` | Local Festival | Event (Investment) | Culture | 3 |
| `evt-rainy` | Rainy Day | Event (Incident) | Food | 0 |
| `evt-tax` | Tax Audit | Event (Incident) | All | 0 |
| `evt-award` | Community Award | Event (Incident) | All | 0 |
| `evt-inspection` | Health Inspection | Event (Incident) | Food | 0 |
| `upg-patisserie` | Patisserie | Upgrade | Bakery | 4 |
| `upg-bistro` | Bistro | Upgrade | Diner | 4 |
| `upg-readers-cafe` | Reader's Café | Upgrade | Bookshop | 3 |

### Tier 2 -- Rising Street (+3 templates)

| ID | Name | Family | Synergy | Cost |
|----|------|--------|---------|------|
| `biz-pawnshop` | Pawn Shop | Business | Commerce | 6 |
| `biz-laundromat` | Laundromat | Business | Service | 6 |
| `evt-grand-opening` | Grand Opening Sale | Event (Investment) | Commerce | 2 |

### Tier 3 -- Neighborhood (+3 templates)

| ID | Name | Family | Synergy | Cost |
|----|------|--------|---------|------|
| `biz-cafe` | Cafe | Business | Food, Culture | 6 |
| `evt-wellness-fair` | Wellness Fair | Event (Investment) | Service | 3 |
| `upg-garden` | Garden | Upgrade | Park | 3 |

### Tier 4 -- District (+3 templates)

| ID | Name | Family | Synergy | Cost |
|----|------|--------|---------|------|
| `biz-arcade` | Arcade | Business | Entertainment | 8 |
| `evt-block-party` | Block Party | Event (Investment) | Entertainment | 4 |
| `upg-bread-factory` | Bread Factory | Upgrade (Branch) | Bakery | 3 |

### Tier 5 -- Landmark (+3 templates)

| ID | Name | Family | Synergy | Cost |
|----|------|--------|---------|------|
| `biz-spa` | Day Spa | Business | Service, Entertainment | 10 |
| `evt-charity-drive` | Charity Drive | Event (Investment) | All | 2 |
| `upg-grand-bakehouse` | Grand Bakehouse | Upgrade (Level 2) | Bakery | 5 |

---

## Appendix B: Threshold Calibration Rationale

### Reputation Range Analysis

Based on current game parameters (Medium difficulty):

- **Starting reputation:** 3
- **Reputation gains:** Community Award (+2), Local Festival (+1), Food Critic Visit (+1), Viral Review (+1), Wellness Fair (+1), Block Party (+2), Charity Drive (+3)
- **Reputation losses:** Health Inspection (-1), Noise Complaint (-1), Vandalism (-1)
- **Reputation collapse threshold:** <= 0 (immediate loss after turn 1)

Monte Carlo analysis shows:
- **Mean end-of-run reputation:** ~8-12 (Medium difficulty)
- **High-performing runs:** reputation 12-16
- **Reputation collapse:** 100% of losses are caused by reputation hitting 0

### Threshold Design Principles

1. **Tier 2 (rep >= 6):** Achievable in most winning runs. Represents "better than starting" -- the player maintained and grew reputation. Approximately 80-90% of winning runs should reach this.

2. **Tier 3 (rep >= 8):** Requires deliberate reputation management. The player invested in reputation-positive events or avoided reputation-negative incidents. Approximately 50-70% of winning runs should reach this.

3. **Tier 4 (rep >= 10):** Matches the "Beloved Mayor" challenge threshold. Requires active reputation strategy (purchasing Charity Drive or multiple reputation-positive events). Approximately 20-40% of winning runs should reach this.

4. **Tier 5 (rep >= 12):** Aspirational. Requires sustained reputation focus across the run. Approximately 5-15% of winning runs should reach this naturally. The challenge path (Diversified) provides an alternative for players who focus on breadth over reputation height.

### Challenge Path Rationale

Challenge-based unlock paths are designed to be achievable by skilled players who may not prioritize reputation:

| Tier | Challenge Condition | Rationale |
|------|-------------------|-----------|
| 2 | Any 2 challenges | Low barrier. Most winning runs complete 2+ of the 3 assigned challenges. |
| 3 | 1 synergy + 1 resource | Requires two different play dimensions. Encourages varied strategy. |
| 4 | Any 3 (incl. 1 cross-cutting/placement) | Requires completing all assigned challenges with at least one requiring spatial or diversity awareness. |
| 5 | Diversified challenge | Specific high-difficulty challenge requiring all 6 synergy types (Food, Culture, Commerce, Service, Entertainment, Health). Only achievable at Tier 4+ (when Entertainment and Health are unlocked). |

> **Note:** These thresholds are initial estimates based on analysis of the current game parameters. Balance tuning is deferred to Milestone 3 (CG-0MM4REQ4C01X8C08), where AI auto-play will validate achievement rates across difficulty presets and suggest adjustments.

---

## 8. User Stories: Expanded Card Pool

### US-8: Diverse Business Card Pool

**As a player**, I want a wider variety of Business cards with different synergy types and costs **so that** each run presents unique strategic opportunities and the street feels varied.

**Acceptance Criteria:**

1. The game includes at least 10 distinct Business card templates (up from 5 in M1).
2. Each Business template has all required fields: id, name, cost, baseIncome, synergyTypes, maxLevel, and description.
3. Every synergy type (Food, Culture, Commerce, Service, Entertainment, Health) is represented by at least 2 single-type Business cards.
4. `createBusinessDeck(3)` produces 3 copies of each template and all cards are valid BusinessCard instances.
5. The market refill logic draws from the expanded Business deck without errors or infinite loops across 200+ seeded runs.
6. All existing M1 Business cards remain in the pool with unchanged attributes.

**Testable Conditions:**

- `BUSINESS_TEMPLATES.length >= 10`.
- Given `createBusinessDeck(3)`, the resulting deck has `BUSINESS_TEMPLATES.length * 3` cards.
- Every Business template has non-empty `id`, `name`, `description`; `cost > 0`; `baseIncome >= 0`; `synergyTypes.length >= 1`.
- For each synergy type S in `['Food', 'Culture', 'Commerce', 'Service', 'Entertainment', 'Health']`, at least 2 Business templates have S in their `synergyTypes` (counting bridge cards).
- Monte Carlo sweep of 200 seeds over 25 turns completes with no deck starvation or refill errors.

### US-9: Diverse Event Card Pool

**As a player**, I want a wider variety of Events including both Investment opportunities and Incident disruptions **so that** each run feels unpredictable and rewards adaptive strategy.

**Acceptance Criteria:**

1. The game includes at least 10 distinct Event card templates (up from 5 in M1).
2. The Event pool includes both Investment (purchased, positive) and Incident (auto-drawn, mixed) event types.
3. The M2 incident pool has a healthier balance than M1: at least 25% of Incident templates are positive (coinDelta > 0 or reputationDelta > 0). The template pool intentionally skews negative because the `positiveIncidentMultiplier` in `GameConfig` boosts positive incident frequency at runtime per difficulty preset.
4. Each Event template has required fields: id, name, trigger (Investment/Incident), cost, coinDelta, reputationDelta, and description.
5. `createEventDeck(3)` produces a valid deck and market refill operates correctly with the expanded pool.
6. All existing M1 Event cards remain in the pool with unchanged attributes.

**Testable Conditions:**

- `EVENT_TEMPLATES.length >= 10`.
- `EVENT_TEMPLATES.filter(e => e.trigger === 'Investment').length >= 4` (at least 4 Investment events).
- `EVENT_TEMPLATES.filter(e => e.trigger === 'Incident').length >= 8` (at least 8 Incident events).
- Among Incident templates, at least 25% are positive (coinDelta > 0 or reputationDelta > 0), i.e. `positive.length / incidents.length >= 0.25`.
- Given `createEventDeck(3, undefined, rng)`, the resulting deck has the expected card count.
- Monte Carlo sweep of 200 seeds confirms no event-draw starvation.

### US-10: Corresponding Upgrade Cards

**As a player**, I want every Business type to have at least one Upgrade path **so that** I can invest in improving any business on my street.

**Acceptance Criteria:**

1. Every Business template with `maxLevel >= 1` has at least one Upgrade card that targets it.
2. Each Upgrade template has required fields: id, name, targetBusiness, cost, incomeBonus, synergyRangeBonus, requiredLevel, and description.
3. `createUpgradeDeck(2)` produces a valid deck with 2 copies of each Upgrade template.
4. Upgrade cards are purchasable in the market and apply correctly to their target businesses, increasing `level`, adding `incomeBonus`, and extending `synergyRangeBonus`.
5. All existing M1 Upgrade cards remain in the pool with unchanged attributes.

**Testable Conditions:**

- For every Business template B with `maxLevel >= 1`, `UPGRADE_TEMPLATES.filter(u => u.targetBusiness === B.name).length >= 1`.
- `createUpgradeDeck(2).length === UPGRADE_TEMPLATES.length * 2`.
- Given a Business at level 0 and a matching level-0 Upgrade, applying the upgrade increments business level to 1 and adds the income/range bonuses.

---

## 9. User Stories: New Synergy Types & Bridge Cards

### US-11: New Synergy Types

**As a player**, I want new synergy types beyond Food, Culture, and Commerce **so that** I have more strategic axes for building my street and creating adjacency combos.

**Acceptance Criteria:**

1. The `SynergyType` union includes at least 2 new types beyond the M1 set of Food, Culture, Commerce.
2. New synergy types are used by at least 2 dedicated single-type Business cards each.
3. The adjacency resolver correctly awards synergy bonuses when businesses of the new synergy types are placed adjacent to each other.
4. Existing M1 synergy bonuses are unaffected by the addition of new types.

**Testable Conditions:**

- `SynergyType` union includes `'Service'`, `'Entertainment'`, and `'Health'`.
- At least 2 Business templates have `synergyTypes: ['Service']` (single-type Service cards).
- At least 2 Business templates have `synergyTypes: ['Entertainment']` (single-type Entertainment cards).
- Given two adjacent Service businesses, `computeSynergyBonus()` returns `synergyBonusPerNeighbor` (1 on Medium).
- Given two adjacent Entertainment businesses, `computeSynergyBonus()` returns `synergyBonusPerNeighbor`.
- Given an M1-only street (Food, Culture, Commerce businesses), synergy bonuses are unchanged from M1 values.

### US-12: Multi-Synergy Bridge Cards

**As a player**, I want some Business cards that belong to two synergy types simultaneously **so that** I can bridge different synergy clusters and create more flexible adjacency strategies.

**Acceptance Criteria:**

1. At least 3 Business cards have 2 entries in their `synergyTypes` array (bridge cards).
2. The adjacency resolver treats bridge cards as matching either synergy type: a bridge card with `['Food', 'Culture']` earns bonuses from both Food and Culture neighbors.
3. Bridge cards earn at most one synergy bonus per neighbor, even if they share multiple synergy types with that neighbor.
4. Bridge cards are available in the market and function identically to single-type cards in all other respects (purchase, placement, upgrade).

**Testable Conditions:**

- `BUSINESS_TEMPLATES.filter(b => b.synergyTypes.length === 2).length >= 3`.
- Given a Cafe (`['Food', 'Culture']`) placed between a Bakery (`['Food']`) and a Bookshop (`['Culture']`), `computeSynergyBonus()` for the Cafe slot returns `2 * synergyBonusPerNeighbor` (bonus from each side).
- Given a Cafe placed between two Diners (both `['Food']`), `computeSynergyBonus()` for the Cafe slot returns `2 * synergyBonusPerNeighbor` (one bonus per Food neighbor, not double for shared types).
- Given a Cafe placed next to a Park (`['Culture']`), `computeSynergyBonus()` for the Cafe slot returns `synergyBonusPerNeighbor` (matches on Culture).

---

## 10. User Stories: Challenge System

### US-13: Challenge Pool and Definitions

**As a player**, I want a pool of challenge goals available each run **so that** I have meaningful secondary objectives beyond the score threshold.

**Acceptance Criteria:**

1. At least 10 challenge templates are defined, each with a unique id, title, description, category, evaluator function, and reward points.
2. Challenge categories include synergy, placement, resource, upgrade, and cross-cutting, with at least 2 challenges per category.
3. Each challenge evaluator is a pure function of `MainStreetState` that returns `true` when the challenge condition is met.
4. Every evaluator returns `false` for an empty street grid state (negative baseline).

**Testable Conditions:**

- `CHALLENGE_TEMPLATES.length >= 10`.
- For each category in `['synergy', 'placement', 'resource', 'upgrade', 'cross-cutting']`, `CHALLENGE_TEMPLATES.filter(c => c.category === cat).length >= 2`.
- Given an initial state with no businesses placed, every `CHALLENGE_TEMPLATES[i].evaluator(emptyState)` returns `false`.
- Given a state with 3 adjacent Food businesses, the `ch-foodie-row` evaluator returns `true`.
- Given a state with exactly 4 Culture businesses, the `ch-culture-district` evaluator returns `true`.

### US-14: Deterministic Challenge Selection

**As a player**, I want the same game seed to always produce the same set of challenges **so that** deterministic replays are possible and run outcomes are reproducible.

**Acceptance Criteria:**

1. `selectChallenges(templates, count, rng)` selects `count` challenges from the template pool using the seeded RNG.
2. Same seed produces the same challenge set every time (determinism).
3. When `count > templates.length`, all templates are returned.
4. When `count <= 0`, an empty array is returned.
5. Given a pool of 12 templates and 100 distinct seeds with `count=3`, every template is selected at least once (uniform distribution).

**Testable Conditions:**

- Call `selectChallenges(CHALLENGE_TEMPLATES, 3, createSeededRng('test-seed'))` twice; results are identical.
- Call `selectChallenges(CHALLENGE_TEMPLATES, 3, createSeededRng('seed-A'))` and `selectChallenges(CHALLENGE_TEMPLATES, 3, createSeededRng('seed-B'))`; results differ (with overwhelming probability).
- `selectChallenges(CHALLENGE_TEMPLATES, 0, rng).length === 0`.
- `selectChallenges(CHALLENGE_TEMPLATES, 999, rng).length === CHALLENGE_TEMPLATES.length`.

### US-15: Challenge Evaluation at EndCheck

**As a player**, I want challenges to be evaluated at the end of each turn's EndCheck phase **so that** completed challenges contribute bonus points to my score before win/loss is determined.

**Acceptance Criteria:**

1. `evaluateChallenges(activeChallenges, state)` is called during the EndCheck phase, before `checkEndConditions`.
2. When a challenge evaluator returns `true` for the current state and the challenge is not yet completed, it is marked `completed: true` and its ID is added to `state.challengesCompleted`.
3. The score formula includes `challengesCompleted.length * config.challengeBonusPoints`.
4. Completing all active challenges triggers an `'all_challenges'` win condition.

**Testable Conditions:**

- Given 3 active challenges where 1 evaluator returns `true`, after `evaluateChallenges()` exactly 1 challenge has `completed: true` and `state.challengesCompleted.length === 1`.
- Given `challengesCompleted.length = 2` and `config.challengeBonusPoints = 10`, `computeScore()` includes +20 from challenges.
- Given all active challenges completed, `checkEndConditions()` sets `state.gameResult = 'win'` and `state.endReason = 'all_challenges'`.

---

## 11. User Stories: Difficulty Presets

### US-16: Difficulty Preset Selection

**As a player**, I want to choose from at least 3 difficulty presets (Easy, Medium, Hard) **so that** I can adjust the challenge to my skill level.

**Acceptance Criteria:**

1. At least 3 named difficulty presets exist: Easy, Medium, Hard.
2. Each preset configures the game via a `GameConfig` object that adjusts: startingCoins, maxTurns, winThreshold, synergyBonusPerNeighbor, and challengesPerRun.
3. The selected preset's configuration is stored in `state.config` and used by the engine throughout the run.
4. Presets produce measurably different game experiences (e.g., Easy has more starting coins and turns than Hard).

**Testable Conditions:**

- `getPresetNames(MAIN_STREET_PRESETS)` returns an array containing `'easy'`, `'medium'`, and `'hard'`.
- `EASY_CONFIG.startingCoins > MEDIUM_CONFIG.startingCoins > HARD_CONFIG.startingCoins` (12 > 8 > 5).
- `EASY_CONFIG.maxTurns > MEDIUM_CONFIG.maxTurns > HARD_CONFIG.maxTurns` (25 > 20 > 15).
- `EASY_CONFIG.winThreshold < MEDIUM_CONFIG.winThreshold < HARD_CONFIG.winThreshold` (120 < 150 < 180).
- Given a game initialized with `difficulty: 'easy'`, `state.config.startingCoins === 12` and `state.config.maxTurns === 25`.

### US-17: Difficulty Affects Gameplay

**As a player**, I want the difficulty preset to meaningfully change the game's economy and win conditions **so that** Easy feels relaxed and Hard feels tense.

**Acceptance Criteria:**

1. Easy mode gives more starting resources (coins and reputation) and more turns than Medium.
2. Hard mode gives fewer starting resources, fewer turns, and a higher win threshold than Medium.
3. Easy mode applies a higher synergy multiplier per neighbor (1.5x vs 1.0x) and higher challenge bonus points (15 vs 10).
4. Hard mode assigns more challenges per run (4 vs 3) to increase the difficulty of the `all_challenges` win condition.
5. The game engine reads all configured values from `state.config` rather than hardcoded constants.

**Testable Conditions:**

- `EASY_CONFIG.synergyBonusPerNeighbor === 1.5`, `MEDIUM_CONFIG.synergyBonusPerNeighbor === 1`, and `HARD_CONFIG.synergyBonusPerNeighbor === 0.75`.
- `EASY_CONFIG.challengeBonusPoints === 15` and `HARD_CONFIG.challengeBonusPoints === 8`.
- `HARD_CONFIG.challengesPerRun === 4` and `EASY_CONFIG.challengesPerRun === 2`.
- Given an Easy game, `computeScore()` uses `config.reputationScoreMultiplier` (5) and `config.challengeBonusPoints` (15) -- not hardcoded values.
- Given two adjacent matching-synergy businesses on Easy, a default-rate (0.5) card's synergy rate is 75% of effective base income (not an absolute coin value).

---

## 12. User Stories: Branching & Multi-Level Upgrades

### US-18: Branching Upgrade Paths

**As a player**, I want some businesses to offer a choice between two different upgrade paths **so that** I can customize my strategy based on the current game state.

**Acceptance Criteria:**

1. At least 2 Business types have 2 different level-0 Upgrade cards targeting them (branching choice).
2. When multiple upgrade options exist for a business, the UI presents a choice modal allowing the player to select one.
3. Once one branch is chosen, the other branch remains available in the market for the same business type in another slot (branches are per-card-instance, not per-type).
4. `getUpgradeBranchesForBusiness(state, slotIndex)` returns all eligible Upgrade cards for the business at that slot.

**Testable Conditions:**

- `UPGRADE_TEMPLATES.filter(u => u.targetBusiness === 'Bakery' && (u.requiredLevel ?? 0) === 0).length >= 2` (Patisserie and Bread Factory).
- `UPGRADE_TEMPLATES.filter(u => u.targetBusiness === 'Diner' && (u.requiredLevel ?? 0) === 0).length >= 2` (Bistro and Fast Food).
- Given a market containing both Patisserie and Bread Factory upgrades, and a level-0 Bakery on the street, `getUpgradeBranchesForBusiness(state, bakerySlot)` returns both upgrade cards.
- After applying Patisserie to a Bakery (level becomes 1), `getUpgradeBranchesForBusiness(state, bakerySlot)` no longer returns level-0 upgrades.

### US-19: Multi-Level Upgrade Chains

**As a player**, I want some businesses to support multi-level upgrade chains (Level 0 -> Level 1 -> Level 2) **so that** long-term investment in a single business is rewarded.

**Acceptance Criteria:**

1. At least 2 Business types have `maxLevel >= 2`, enabling a Level 0 -> Level 1 -> Level 2 chain.
2. Level-2 Upgrade cards have `requiredLevel: 1`, preventing purchase until the business has been upgraded once.
3. `canPurchaseUpgrade()` enforces that the business's current level equals the upgrade's `requiredLevel`.
4. Applying a level-2 upgrade increments the business to level 2 and adds the appropriate bonuses.
5. A business at `maxLevel` cannot be upgraded further.

**Testable Conditions:**

- `BUSINESS_TEMPLATES.filter(b => b.maxLevel >= 2).length >= 2`.
- `UPGRADE_TEMPLATES.filter(u => u.requiredLevel === 1).length >= 2` (at least 2 level-2 upgrades).
- Given a level-0 Bakery and a Grand Bakehouse upgrade (`requiredLevel: 1`), `canPurchaseUpgrade()` returns `{ legal: false }`.
- Given a level-1 Bakery (after applying Patisserie) and a Grand Bakehouse upgrade, `canPurchaseUpgrade()` returns `{ legal: true }`.
- After applying Grand Bakehouse to the level-1 Bakery, the business is at level 2 and `canPurchaseUpgrade()` returns `{ legal: false }` for any further upgrades (at maxLevel).

---

## 13. User Stories: Economy Rebalance & Balance Targets

### US-20: Economy Supports Expanded Content

**As a player**, I want the game's economy to remain balanced with the expanded card pool **so that** new synergy types and bridge cards integrate smoothly without making the game too easy or too hard.

Economy balance is verified via a two-tier Monte Carlo approach:

- **CI guardrail** (`tests/main-street/monte-carlo-balance.test.ts`): A Vitest test that runs a configurable number of deterministic seeds with the `market-greedy` strategy over 25 turns. Seed count and win-rate thresholds are controlled via environment variables (`MONTE_SEEDS`, `MONTE_MIN_WIN_RATE`, `MONTE_MAX_WIN_RATE`). PR CI uses 20 seeds with wide bounds (0.20–0.80) for fast feedback; main branch CI uses 200 seeds with strict bounds (0.30–0.60). Detailed pacing metrics (median score, grid fill, loss-reason dominance) are only asserted for runs of 50+ seeds. It runs on every `npm test` invocation.
- **Balance harness** (`npm run monte-carlo`): A standalone script that runs 200 seeds by default (configurable via `--seeds`/`MONTE_SEEDS`) and writes detailed JSON and CSV output to `results/`. This is used for manual analysis and tuning, not enforced in CI.

**Acceptance Criteria:**

1. The CI guardrail test passes: seeds complete without errors, and all metric assertions hold.
2. The win rate on Medium difficulty (market-greedy, 25 turns) is between `MONTE_MIN_WIN_RATE` and `MONTE_MAX_WIN_RATE` (main CI: 30%–60%).
3. For runs of 50+ seeds: the median final score is within [20, 65] and pacing metrics hold.
4. No single loss reason dominates below 75% of all losses (for 50+ seed runs).
5. Grid fill pacing is stable for 50+ seed runs: average turn-when-half-full in [11, 15], average turn-when-full in [15, 19].

**Testable Conditions:**

- `npm test` runs the CI guardrail (`monte-carlo-balance.test.ts`). With `MONTE_SEEDS=200 MONTE_MIN_WIN_RATE=0.30 MONTE_MAX_WIN_RATE=0.60` (main branch CI), asserts: `winRate` in [0.30, 0.60], `medianScore` in [20, 65], dominant loss reason rate >= 0.75, average no-action turns >= 6, grid-half in [11, 15], grid-full in [15, 19].
- `npm run monte-carlo` completes without errors and writes results to `results/main-street-monte-carlo.json` and `results/main-street-monte-carlo.csv`.
- The balance harness JSON output contains `metrics.winRate`, `metrics.medianScore`, `metrics.averageScore`, `metrics.lossReasonRates` for manual review.
- The balance harness runs 200 seeds over 25 turns with no deck starvation, no infinite loops, and no coin-negative anomalies.

### US-21: Positive Incident Frequency

**As a player**, I want a healthier balance of positive and negative incidents **so that** the game feels less punishing than M1 while maintaining strategic tension.

**Acceptance Criteria:**

1. Positive incidents (coinDelta > 0 or reputationDelta > 0) make up at least 25% of the total Incident event pool.
2. The `positiveIncidentMultiplier` in `GameConfig` scales the frequency of positive incidents per difficulty preset.
3. Easy mode has a higher positive incident multiplier than Hard mode.

**Testable Conditions:**

- Among all Incident events in `EVENT_TEMPLATES`, at least 25% have positive coin or reputation effects.
- `EASY_CONFIG.positiveIncidentMultiplier > HARD_CONFIG.positiveIncidentMultiplier` (1.2 > 1.0).
- The event deck construction respects the positive incident multiplier when building Incident sub-decks.

---

## 14. User Stories: Reusable Engine Components

### US-22: Generic ChallengeSystem API

**As an engine developer**, I want a generic ChallengeSystem module in `@core-engine` **so that** future games can define, select, and evaluate challenges without reimplementing the core logic.

**Acceptance Criteria:**

1. `src/core-engine/ChallengeSystem.ts` exports a generic `ChallengeDefinition<TState>` interface parameterized over game state type.
2. `selectChallenges<TState>(templates, count, rng)` uses Fisher-Yates shuffle with a seeded RNG and is game-agnostic.
3. `evaluateChallenges<TState>(activeChallenges, state)` evaluates each challenge's evaluator against the provided state and returns newly completed challenge IDs.
4. The module contains no imports from `example-games/` or any game-specific code.
5. The module includes M6 extraction design notes documenting the intended API surface.
6. All types and functions are re-exported from `src/core-engine/index.ts`.

**Testable Conditions:**

- `import { ChallengeDefinition, selectChallenges, evaluateChallenges } from '@core-engine/ChallengeSystem'` resolves successfully.
- `ChallengeSystem.ts` contains no import paths matching `example-games/`.
- `selectChallenges` accepts a generic `TState` type parameter and compiles with any state type.
- The file contains a `## Design Notes for M6 Extraction` section.

### US-23: Generic DifficultyPresets API

**As an engine developer**, I want a generic DifficultyPresets module in `@core-engine` **so that** future games can define named presets with configurable game constants.

**Acceptance Criteria:**

1. `src/core-engine/DifficultyPresets.ts` exports a `DifficultyConfig` base interface and a `DifficultyPresetRegistry<TConfig>` type.
2. `createPresetLookup<TConfig>(registry, defaultConfig)` returns a closure that resolves preset names to configurations with a fallback default.
3. `getPresetNames<TConfig>(registry)` returns the list of available preset names for UI population.
4. The module contains no imports from `example-games/` or any game-specific code.
5. The module includes M6 extraction design notes.
6. All types and functions are re-exported from `src/core-engine/index.ts`.

**Testable Conditions:**

- `import { DifficultyConfig, createPresetLookup, getPresetNames } from '@core-engine/DifficultyPresets'` resolves successfully.
- `DifficultyPresets.ts` contains no import paths matching `example-games/`.
- `createPresetLookup(registry, default)('nonexistent')` returns the default config.
- The file contains a `## Design Notes for M6 Extraction` section.

### US-24: Save/Load Engine Infrastructure

**As an engine developer**, I want a generic Save/Load module in `@core-engine` **so that** any game can persist state with schema versioning, multiple storage backends, and domain separation.

**Acceptance Criteria:**

1. `src/core-engine/SaveLoad.ts` exports `SaveSerializer<TState, TSerialized>`, `SaveLoadStore`, and supporting types.
2. `SaveLoadStore` supports IndexedDB with localStorage fallback and graceful degradation.
3. The `saveSerialized`/`loadSerialized` pattern handles schema versioning via the serializer.
4. Domain separation (`'run-checkpoint'` vs `'campaign'`) ensures different data categories don't interfere.
5. The module contains no imports from `example-games/` or any game-specific code.
6. All types and functions are re-exported from `src/core-engine/index.ts`.

**Testable Conditions:**

- `import { SaveLoadStore, SaveSerializer } from '@core-engine/SaveLoad'` resolves successfully.
- `SaveLoad.ts` contains no import paths matching `example-games/`.
- A round-trip test: `saveSerialized(domain, type, slot, serializer, state)` followed by `loadSerialized(domain, type, slot, serializer)` returns the original state.
- Saving to `'campaign'` domain and loading from `'run-checkpoint'` domain returns `null` (domain isolation).
