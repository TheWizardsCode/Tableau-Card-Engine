# Main Street: Card Catalog

> **Source of truth:** `example-games/main-street/MainStreetCards.ts`
> **Last updated:** Expanded pool verification (work item CG-0MOKJPBOX006UQDO)

This document lists every card template in the Main Street card pool, organised by family (Business, Event, Upgrade). Each entry includes all gameplay-relevant fields and a short design rationale.

**Deck sizes (default copies):**

| Family   | Templates | Copies each | Total cards |
|----------|-----------|-------------|-------------|
| Business | 17        | 3           | 51          |
| Event    | 17        | 3           | 51          |
| Upgrade  | 25        | 2           | 50          |

**Synergy types:** Food, Culture, Commerce, Service (M2), Entertainment (M2)

## Expansion summary (baseline vs current)

| Snapshot | Business | Event | Upgrade | Total templates |
|---|---:|---:|---:|---:|
| Tier 1 baseline (`docs/main-street/card-catalog-baseline.json`) | 7 | 6 | 5 | 18 |
| Current catalog (`MainStreetCards.ts`) | 17 | 17 | 25 | 59 |
| Net increase | +10 | +11 | +20 | +41 |

- 2x target from baseline: `>= 36` templates
- Current total: `59` templates (`3.28x` baseline)
- Non-baseline card IDs are tracked in `docs/main-street/expanded-card-manifest.json`

### Guidance: adding more cards safely

1. Add card templates in `example-games/main-street/MainStreetCards.ts`.
2. Regenerate metadata artifacts:
   - `npx tsx scripts/generate-main-street-catalog-baseline.ts`
   - `npx tsx scripts/generate-main-street-expanded-card-manifest.ts`
3. Regenerate placeholder art:
   - `node scripts/generate-main-street-card-svgs.mjs`
4. Run regression tests:
   - `npx vitest run --project unit tests/main-street/expanded-card-pool.test.ts`
   - `npx vitest run --project unit tests/main-street/card-manifest.test.ts tests/main-street/card-svg-coverage.test.ts`

---

## Business Cards

Business cards are placed on the 10-slot street grid. Each generates base income plus synergy bonuses from adjacent businesses sharing a synergy type.

### M1 Business Templates (5)

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-bakery` | Bakery | 3 | 2 | Food | Bakery | Warm pastries. +1/adj Food. | Affordable Food starter. |
| `biz-diner` | Diner | 4 | 3 | Food | Diner | Quick meals. +1/adj Food. | Higher-cost, higher-income Food option. |
| `biz-bookshop` | Bookshop | 4 | 2 | Culture | Bookshop | Sells books. +1/adj Culture. | Mid-cost Culture business. |
| `biz-park` | Park | 2 | 1 | Culture | Park | Leisure space. +1/adj Culture. | Cheapest card in M1; synergy filler. |
| `biz-hardware` | Hardware Store | 5 | 3 | Commerce | Hardware Store | Supplies tools. +1/adj Commerce. | M1's only Commerce card; expensive but strong income. |

### M2 Business Templates (12)

#### Commerce (filling the gap)

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-pawnshop` | Pawn Shop | 3 | 2 | Commerce | Pawn Shop | Second-hand goods. +1/adj Commerce. | Budget Commerce option; makes Commerce synergies viable. |
| `biz-boutique` | Boutique | 4 | 2 | Commerce | Boutique | Curated fashion. +1/adj Commerce. | Mid-tier Commerce; distinct flavour from Hardware Store. |

#### Service (new synergy type)

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-laundromat` | Laundromat | 3 | 2 | Service | Laundromat | Self-serve laundry. +1/adj Service. | Budget Service entry point. |
| `biz-barbershop` | Barbershop | 3 | 2 | Service | Barbershop | Classic cuts. +1/adj Service. | Pairs with Laundromat for early Service cluster. |
| `biz-clinic` | Clinic | 5 | 3 | Service | Clinic | Walk-in medical care. +1/adj Service. | Premium Service; high cost/income mirrors Hardware Store. |

#### Entertainment (new synergy type)

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-arcade` | Arcade | 4 | 2 | Entertainment | Arcade | Retro fun. +1/adj Entertainment. | Mid-cost Entertainment starter. |
| `biz-cinema` | Cinema | 5 | 3 | Entertainment | Cinema | Latest films. +1/adj Entertainment. | Premium Entertainment; anchors the type. |

#### Multi-Synergy Bridge Cards

Bridge cards belong to two synergy types simultaneously, enabling cross-type adjacency bonuses and strategic placement decisions.

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-cafe` | Cafe | 3 | 2 | Food + Culture | Cafe | Coffee and conversation. | Bridges the two most common M1 types. |
| `biz-food-truck` | Food Truck | 2 | 1 | Food + Entertainment | Food Truck | Street eats with flair. | Cheapest bridge card; low risk, low reward. |
| `biz-gallery` | Art Gallery | 4 | 2 | Culture + Entertainment | Art Gallery | Showcases local artists. | Connects M1 Culture with new Entertainment. |
| `biz-spa` | Day Spa | 5 | 3 | Service + Entertainment | Day Spa | Relaxation and pampering. | Premium bridge; high synergy potential across 2 new types. |
| `biz-florist` | Florist | 2 | 1 | Commerce + Culture | Florist | Arrangements for every occasion. | Budget bridge linking Commerce and Culture. |

---

## Event Cards

Events fall into two categories:
- **Investment** events are purchased from the market, held in the player's hand, and played voluntarily. They have a coin cost and generally positive effects.
- **Incident** events are drawn automatically into the incident queue and resolve at the end of each turn. Most are negative disruptions; a few are positive surprises.

### M1 Event Templates (5)

| ID | Name | Trigger | Cost | Target | Synergy | Coins | Rep | Effect | Rationale |
|----|------|---------|------|--------|---------|-------|-----|--------|-----------|
| `evt-festival` | Local Festival | Investment | 3 | SpecificSynergy | Culture | +2 | +1 | +2 coins to Culture biz, +1 rep. | Core positive Investment for Culture players. |
| `evt-rainy` | Rainy Day | Incident | 0 | SpecificSynergy | Food | -1 | 0 | -1 coin to Food biz. | Mild Food disruption. |
| `evt-tax` | Tax Audit | Incident | 0 | All | -- | -3 | 0 | Lose 3 coins. | Universal economic pressure. |
| `evt-award` | Community Award | Incident | 0 | All | -- | 0 | +2 | Gain 2 reputation. | Positive incident; balances negative events. |
| `evt-inspection` | Health Inspection | Incident | 0 | SpecificSynergy | Food | -2 | -1 | -2 coins/Food biz, -1 rep. | Harsh Food-specific punishment. |

### M2 Event Templates (12)

#### Investment Events (4)

| ID | Name | Trigger | Cost | Target | Synergy | Coins | Rep | Effect | Rationale |
|----|------|---------|------|--------|---------|-------|-----|--------|-----------|
| `evt-grand-opening` | Grand Opening Sale | Investment | 2 | SpecificSynergy | Commerce | +3 | 0 | +3 coins from Commerce promo. | Cheap Commerce boost; rewards Commerce-heavy builds. |
| `evt-wellness-fair` | Wellness Fair | Investment | 3 | SpecificSynergy | Service | +2 | +1 | +2 coins/Service biz, +1 rep. | Service counterpart to Local Festival. |
| `evt-block-party` | Block Party | Investment | 4 | SpecificSynergy | Entertainment | +2 | +2 | +2 coins/Ent biz, +2 rep. | Expensive but high rep payoff for Entertainment. |
| `evt-charity-drive` | Charity Drive | Investment | 2 | All | -- | 0 | +3 | +3 reputation. | Pure reputation play; universal target. |

#### Incident Events (8)

| ID | Name | Trigger | Cost | Target | Synergy | Coins | Rep | Effect | Rationale |
|----|------|---------|------|--------|---------|-------|-----|--------|-----------|
| `evt-power-outage` | Power Outage | Incident | 0 | All | -- | -2 | 0 | -2 coins from lost business. | Universal medium disruption. |
| `evt-shoplifting` | Shoplifting Spree | Incident | 0 | SpecificSynergy | Commerce | -2 | 0 | -2 coins/Commerce biz. | Commerce-specific counterpart to Health Inspection. |
| `evt-noise-complaint` | Noise Complaint | Incident | 0 | SpecificSynergy | Entertainment | -1 | -1 | -1 coin/Ent biz, -1 rep. | Entertainment tax; dual penalty. |
| `evt-pipe-burst` | Pipe Burst | Incident | 0 | SpecificSynergy | Service | -2 | 0 | -2 coins/Service biz. | Service-specific disruption. |
| `evt-food-critic` | Food Critic Visit | Incident | 0 | SpecificSynergy | Food | +1 | +1 | +1 coin/Food biz, +1 rep. | Positive incident; rewards Food players. |
| `evt-construction` | Road Construction | Incident | 0 | All | -- | -1 | 0 | -1 coin to all biz. | Mild universal disruption. |
| `evt-viral-review` | Viral Review | Incident | 0 | All | -- | +2 | +1 | +2 coins, +1 rep from online fame. | Positive windfall; universal. |
| `evt-vandalism` | Vandalism | Incident | 0 | All | -- | -1 | -1 | -1 coin, -1 rep. | Dual-penalty universal disruption. |

### Event Balance Summary

| Category | Count | Avg Coin Delta | Avg Rep Delta |
|----------|-------|---------------|---------------|
| M1 Investment | 1 | +2.0 | +1.0 |
| M2 Investment | 4 | +1.75 | +1.0 |
| M1 Incident (negative) | 3 | -2.0 | -0.33 |
| M1 Incident (positive) | 1 | 0.0 | +2.0 |
| M2 Incident (negative) | 5 | -1.4 | -0.4 |
| M2 Incident (positive) | 3 | +1.33 | +1.0 |

The M2 incident pool is more balanced than M1: 5 negative vs. 3 positive incidents (compared to M1's 3 negative vs. 1 positive). This reduces the punishing feel while maintaining strategic tension.

---

## Upgrade Cards

Each Upgrade targets a specific Business by name. Applying an upgrade increments the business's level, adds an income bonus, and optionally extends synergy range.

### M1 Upgrade Templates (3)

| ID | Name | Target | Cost | Income+ | Range+ | Description | Rationale |
|----|------|--------|------|---------|--------|-------------|-----------|
| `upg-patisserie` | Upgrade to Patisserie | Bakery | 4 | +1 | +1 | Bakery -> Patisserie. | Classic upgrade; income + range. |
| `upg-bistro` | Upgrade to Bistro | Diner | 4 | +1 | +1 | Diner -> Bistro. | Matches Patisserie in cost/power. |
| `upg-library` | Upgrade to Library | Bookshop | 3 | +1 | +0 | Bookshop -> Library. | Cheaper; income only, no range. |

### M2 Standard Upgrade Templates (14)

| ID | Name | Target | Cost | Income+ | Range+ | Description | Rationale |
|----|------|--------|------|---------|--------|-------------|-----------|
| `upg-garden` | Upgrade to Garden | Park | 3 | +1 | +1 | Park -> Garden. | Completes M1 Culture upgrade coverage. |
| `upg-home-improvement` | Upgrade to Home Improvement | Hardware Store | 4 | +1 | +1 | Hardware Store -> Home Improvement. | Completes M1 Commerce upgrade. |
| `upg-vintage-shop` | Upgrade to Vintage Shop | Pawn Shop | 3 | +1 | +0 | Pawn Shop -> Vintage Shop. | Budget upgrade; income only. |
| `upg-designer-store` | Upgrade to Designer Store | Boutique | 4 | +1 | +1 | Boutique -> Designer Store. | Premium Commerce upgrade. |
| `upg-dry-cleaners` | Upgrade to Dry Cleaners | Laundromat | 3 | +1 | +0 | Laundromat -> Dry Cleaners. | Service entry-level upgrade. |
| `upg-salon` | Upgrade to Salon | Barbershop | 3 | +1 | +1 | Barbershop -> Salon. | Service upgrade with range. |
| `upg-gaming-lounge` | Upgrade to Gaming Lounge | Arcade | 4 | +1 | +1 | Arcade -> Gaming Lounge. | Entertainment mid-tier upgrade. |
| `upg-imax` | Upgrade to IMAX Theater | Cinema | 5 | +2 | +1 | Cinema -> IMAX Theater. | Premium upgrade; highest income bonus (tied). |
| `upg-roastery` | Upgrade to Roastery | Cafe | 3 | +1 | +1 | Cafe -> Roastery. | Bridge card upgrade; maintains dual synergy. |
| `upg-gourmet-truck` | Upgrade to Gourmet Truck | Food Truck | 2 | +1 | +0 | Food Truck -> Gourmet Truck. | Cheapest upgrade in the pool. |
| `upg-museum` | Upgrade to Museum | Art Gallery | 4 | +1 | +1 | Art Gallery -> Museum. | Premium bridge upgrade. |
| `upg-resort-spa` | Upgrade to Resort Spa | Day Spa | 5 | +2 | +1 | Day Spa -> Resort Spa. | Tied with IMAX for highest cost/power. |
| `upg-garden-center` | Upgrade to Garden Center | Florist | 3 | +1 | +1 | Florist -> Garden Center. | Budget bridge upgrade with range. |
| `upg-medical-center` | Upgrade to Medical Center | Clinic | 5 | +2 | +1 | Clinic -> Medical Center. | Premium Service upgrade. |

### M2 Branching Upgrade Templates (4)

Branching upgrades offer an alternative Level-1 path for businesses that already have a standard upgrade. Where the standard upgrade typically provides balanced income + range, branching upgrades favour one stat over the other, creating meaningful upgrade decisions. All branching upgrades have `requiredLevel: 0`.

| ID | Name | Target | Cost | Income+ | Range+ | Description | Rationale |
|----|------|--------|------|---------|--------|-------------|-----------|
| `upg-bread-factory` | Upgrade to Bread Factory | Bakery | 3 | +2 | +0 | Scales into high-volume Bread Factory. More income, no range. | Volume-over-reach alternative to Patisserie (+1/+1). |
| `upg-fast-food` | Upgrade to Fast Food | Diner | 3 | +2 | +0 | Converts to a Fast Food outlet. Higher income, no range. | Volume alternative to Bistro (+1/+1). |
| `upg-drive-in` | Upgrade to Drive-In Theater | Cinema | 4 | +1 | +2 | Turns Cinema into a Drive-In with wider community reach. | Reach-over-income alternative to IMAX (+2/+1). |
| `upg-wellness-center` | Upgrade to Wellness Center | Day Spa | 4 | +1 | +2 | Expands into a Wellness Center with broader service footprint. | Reach alternative to Resort Spa (+2/+1). |

### M2 Multi-Level Upgrade Templates (4)

Multi-level upgrades require the business to already be at Level 1 (`requiredLevel: 1`). They represent a second upgrade step, available only after a Level-1 upgrade (standard or branching) has been applied. These are the most powerful upgrades in the pool and serve as late-game progression rewards.

| ID | Name | Target | Cost | Income+ | Range+ | Req Level | Description | Rationale |
|----|------|--------|------|---------|--------|-----------|-------------|-----------|
| `upg-grand-bakehouse` | Upgrade to Grand Bakehouse | Bakery | 5 | +2 | +1 | 1 | Pinnacle of baking — draws visitors from afar. | Level-2 capstone for Bakery chain. |
| `upg-restaurant` | Upgrade to Restaurant | Diner | 5 | +2 | +1 | 1 | Elevates to a full-service Restaurant. | Level-2 capstone for Diner chain. |
| `upg-multiplex` | Upgrade to Multiplex | Cinema | 6 | +3 | +1 | 1 | Massive entertainment complex — heart of Main Street. | Highest income bonus in pool (+3). |
| `upg-luxury-retreat` | Upgrade to Luxury Retreat | Day Spa | 6 | +3 | +1 | 1 | Destination Luxury Retreat — most prestigious business. | Tied with Multiplex for highest income bonus. |

### Upgrade Cost Distribution

| Cost | Count | Cards |
|------|-------|-------|
| 2 | 1 | Gourmet Truck |
| 3 | 9 | Library, Garden, Vintage Shop, Dry Cleaners, Salon, Roastery, Garden Center, Bread Factory, Fast Food |
| 4 | 7 | Patisserie, Bistro, Designer Store, Gaming Lounge, Museum, Drive-In Theater, Wellness Center |
| 5 | 6 | Home Improvement, IMAX Theater, Resort Spa, Medical Center, Grand Bakehouse, Restaurant |
| 6 | 2 | Multiplex, Luxury Retreat |

---

## Design Notes

### Multi-Synergy Bridge Cards

M2 introduces 5 bridge cards that belong to two synergy types simultaneously. The adjacency resolver (`MainStreetAdjacency.ts`) uses `some()` to check if any synergy type matches, so bridge cards earn bonuses from neighbours of either type. This creates interesting placement decisions: a Cafe (Food+Culture) placed between a Bakery and a Bookshop earns bonuses from both sides.

### Synergy Type Coverage

| Synergy | Single-type | Bridge (shared) | Total |
|---------|-------------|-----------------|-------|
| Food | 2 (Bakery, Diner) | 2 (Cafe, Food Truck) | 4 |
| Culture | 2 (Bookshop, Park) | 3 (Cafe, Art Gallery, Florist) | 5 |
| Commerce | 3 (Hardware, Pawn Shop, Boutique) | 1 (Florist) | 4 |
| Service | 3 (Laundromat, Barbershop, Clinic) | 1 (Day Spa) | 4 |
| Entertainment | 2 (Arcade, Cinema) | 3 (Food Truck, Art Gallery, Day Spa) | 5 |

Culture and Entertainment have the most bridge-card representation, making them easiest to chain synergies with. Commerce and Service rely more on dedicated single-type cards.

### Branching & Multi-Level Upgrades

M2 introduces two new upgrade mechanics that deepen progression decisions:

**Branching Upgrades** — Four businesses (Bakery, Diner, Cinema, Day Spa) now have two Level-1 upgrade options instead of one. The player must choose between them since applying one locks out the other. Each pair offers a different trade-off:

| Business | Standard Path | Branching Path | Trade-off |
|----------|--------------|----------------|-----------|
| Bakery | Patisserie (+1/+1) | Bread Factory (+2/+0) | Income vs. range |
| Diner | Bistro (+1/+1) | Fast Food (+2/+0) | Income vs. range |
| Cinema | IMAX (+2/+1) | Drive-In (+1/+2) | Income vs. range |
| Day Spa | Resort Spa (+2/+1) | Wellness Center (+1/+2) | Income vs. range |

**Multi-Level Upgrades** — Four Level-2 upgrades require the target business to already be at Level 1 (`requiredLevel: 1`). These apply after any Level-1 path (standard or branching), creating 2-step upgrade chains. The multi-level upgrades are the most expensive and powerful cards in the pool (cost 5-6, income +2 to +3).

### Running the Monte Carlo Balance Sweep

The market integration test suite (`tests/main-street/market.integration.test.ts`) includes a Monte Carlo stability test that runs 200 seeds over 25 turns each:

```bash
# Run just the Monte Carlo sweep
npx vitest run --project unit -t "Monte Carlo"

# Run all market integration tests
npx vitest run --project unit tests/main-street/market.integration.test.ts
```

The sweep verifies:
- No deck starvation (decks never run dry mid-refill)
- No duplicate cards in market slots
- Coins remain non-negative within expected bounds
- The game terminates normally for every seed

To add custom balance checks, extend the `Monte Carlo stability sweep` describe block in `market.integration.test.ts`.

For the dedicated balance harness and report outputs, use:

```bash
npm run monte-carlo
```

This writes per-run and aggregate metrics to:
- `results/main-street-monte-carlo.json`
- `results/main-street-monte-carlo.csv`
