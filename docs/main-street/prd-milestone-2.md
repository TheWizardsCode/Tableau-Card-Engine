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
| Upgrade (3) | Patisserie (`upg-patisserie`), Bistro (`upg-bistro`), Library (`upg-library`) |

**Total: 13 card templates (5 Business + 5 Event + 3 Upgrade)**

### 2.2 Tier 2 -- Rising Street

**Reputation Threshold:** >= 6 reputation at end-of-run

**Challenge Milestone:** Complete any 2 challenges in a single run

**New Cards Unlocked (3):**

| Type | Card | ID | Rationale |
|------|------|----|-----------|
| Business | Pawn Shop | `biz-pawnshop` | Fills the M1 Commerce gap (only Hardware Store existed). Cost 6, single-synergy Commerce. Low barrier to entry for new players. |
| Business | Laundromat | `biz-laundromat` | Introduces the Service synergy type. Cost 6, accessible. Players begin exploring the new synergy axis. |
| Event | Grand Opening Sale | `evt-grand-opening` | Investment event for Commerce synergy (+3 coins). Pairs with the newly unlocked Pawn Shop. |

**Cumulative Pool After Tier 2: 16 templates (7 Business + 6 Event + 3 Upgrade)**

### 2.3 Tier 3 -- Neighborhood

**Reputation Threshold:** >= 8 reputation at end-of-run

**Challenge Milestone:** Complete 1 synergy challenge AND 1 resource challenge in a single run

**New Cards Unlocked (3):**

| Type | Card | ID | Rationale |
|------|------|----|-----------|
| Business | Cafe | `biz-cafe` | First multi-synergy bridge card (Food + Culture). Introduces the bridge concept, rewarding strategic placement. |
| Event | Wellness Fair | `evt-wellness-fair` | Investment event for Service synergy (+2 coins/Service, +1 rep). Supports the Service business unlocked in Tier 2. |
| Upgrade | Garden | `upg-garden` | Upgrade for Park (Culture). Gives M1 Park owners a progression path and demonstrates upgrade mechanics beyond M1. |

**Cumulative Pool After Tier 3: 19 templates (8 Business + 7 Event + 4 Upgrade)**

### 2.4 Tier 4 -- District

**Reputation Threshold:** >= 10 reputation at end-of-run

**Challenge Milestone:** Complete any 3 challenges in a single run (at least 1 must be cross-cutting or placement)

**New Cards Unlocked (3):**

| Type | Card | ID | Rationale |
|------|------|----|-----------|
| Business | Arcade | `biz-arcade` | Introduces the Entertainment synergy type as a standalone business. Cost 8, anchors Entertainment strategies. |
| Event | Block Party | `evt-block-party` | Investment event for Entertainment (+2 coins/Entertainment, +2 rep). High reward, high cost (4 coins). Pairs with Arcade. |
| Upgrade | Bread Factory | `upg-bread-factory` | Branching upgrade for Bakery (alternative to Patisserie). Demonstrates the branching upgrade mechanic: +2 income, no range boost. |

**Cumulative Pool After Tier 4: 22 templates (9 Business + 8 Event + 5 Upgrade)**

### 2.5 Tier 5 -- Landmark

**Reputation Threshold:** >= 12 reputation at end-of-run

**Challenge Milestone:** Complete the "Diversified" challenge (`ch-diversified`: all 5 synergy types present) in a single run

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
| 2 | Rising Street | >= 6 | Any 2 challenges | 1 (Pawn Shop) | 1 (Grand Opening) | 0 | 16 |
| 3 | Neighborhood | >= 8 | 1 synergy + 1 resource | 1 (Cafe) | 1 (Wellness Fair) | 1 (Garden) | 19 |
| 4 | District | >= 10 | Any 3 (incl. 1 cross-cutting/placement) | 1 (Arcade) | 1 (Block Party) | 1 (Bread Factory) | 22 |
| 5 | Landmark | >= 12 | Diversified challenge | 1 (Day Spa) | 1 (Charity Drive) | 1 (Grand Bakehouse) | 25 |

**Total new cards across Tiers 2-5: 12** (4 Business + 4 Event + 4 Upgrade)

### 2.7 Remaining M2 Cards

The following M2 cards are **not tier-gated** and will be included in Tier 1 once the full M2 content milestone is complete. They are listed here for completeness and to clarify that tier-gating applies only to the 12 cards specified above.

These cards are part of the broader M2 content expansion (parent work item CG-0MM4REC2Z0GS2YKT) and will be added to Tier 1 as part of separate M2 content work items, not this meta-progression spec.

| Type | Remaining M2 Cards (added to Tier 1 pool) |
|------|--------------------------------------------|
| Business | Boutique, Barbershop, Cinema, Food Truck, Art Gallery, Florist, Clinic |
| Event | Power Outage, Shoplifting Spree, Noise Complaint, Pipe Burst, Food Critic Visit, Road Construction, Viral Review, Vandalism |
| Upgrade | Home Improvement, Vintage Shop, Designer Store, Dry Cleaners, Salon, Gaming Lounge, IMAX Theater, Roastery, Gourmet Truck, Museum, Resort Spa, Garden Center, Medical Center, Fast Food, Drive-In Theater, Restaurant, Multiplex, Luxury Retreat, Wellness Center |

> **Design note:** The tier-gated cards were selected to introduce one new mechanic or synergy type per tier (Commerce gap-fill, Service type, bridge cards, Entertainment type, multi-level upgrades). The remaining M2 cards provide breadth and variety within the existing mechanics and are available from the start of M2 content.

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
    "upg-patisserie", "upg-bistro", "upg-library"
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
    "upg-patisserie", "upg-bistro", "upg-library",
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
    "upg-patisserie", "upg-bistro", "upg-library",
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
createEventDeck(3, campaign.unlockedCardIds)
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
- Given a completed run with `reputation = 12` and only `tier-1` unlocked, then `unlockedTiers` becomes `['tier-1', 'tier-2', 'tier-3', 'tier-4', 'tier-5']`.

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
| `upg-library` | Library | Upgrade | Bookshop | 3 |

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
| 5 | Diversified challenge | Specific high-difficulty challenge requiring all 5 synergy types. Only achievable at Tier 4+ (when Entertainment is unlocked). |

> **Note:** These thresholds are initial estimates based on analysis of the current game parameters. Balance tuning is deferred to Milestone 3 (CG-0MM4REQ4C01X8C08), where AI auto-play will validate achievement rates across difficulty presets and suggest adjustments.
