# Main Street: Card Catalog

> **Source of truth:** `example-games/main-street/card-data.csv` (CSV) — loaded by `MainStreetCards.ts` at build time (work item CG-0MR6ZR23J006ZDNZ)
> **Last updated:** CSV externalisation (work item CG-0MR6ZR23J006ZDNZ)

This document lists every card template in the Main Street card pool, organised by family (Business, Event, Upgrade, Community Space, Staff). Each entry includes all gameplay-relevant fields and a short design rationale.

Card templates are stored as rows in `card-data.csv` and parsed at build time by `MainStreetCards.ts`. To add cards, edit the CSV and regenerate metadata (see guidance below).

**Deck sizes (default copies):**

| Family        | Templates | Copies each | Total cards |
|---------------|-----------|-------------|-------------|
| Business      | 30        | 3           | 90          |
| Event         | 56        | 3           | 168         |
| Upgrade       | 39        | 2           | 78          |
| Community Space | 8       | 3           | 24          |
| Staff         | 7         | 3           | 21          |

**Synergy types:** Food, Culture, Commerce, Service (M2), Entertainment (M2), Health (M2)

## Expansion summary (baseline vs current)

| Snapshot | Business | Event | Upgrade | Community Space | Staff | Total templates |
|---|---:|---:|---:|---:|---:|---:|
| Tier 1 baseline (`docs/main-street/card-catalog-baseline.json`) | 4 | 4 | 4 | 2 | 1 | 15 |
| Current catalog (`card-data.csv`) | 30 | 56 | 39 | 8 | 9 | 142 |
| Net increase | +26 | +52 | +35 | +6 | +8 | +127 |

- 2x target from baseline: `>= 30` templates
- Current total: `142` templates (`9.5x` baseline)
- Business family grew from 18 to 30 with the Group A expansion (CG-0MSQJ1XIB0004QVN):
  12 new cards including the first Health bridge cards (Juice Bar, Yoga Studio,
  Physiotherapy), mid-tier (T2/T3) singles, and the T5 Grand Hotel flagship.
- Community Space grew from 2 to 8 with the Group B expansion (CG-0MSQJ210I00491ZZ):
  6 new reputation assets across five synergies (Playground, Community Garden,
  Town Fountain, Health Kiosk, Community Shelter, Public Art), including the
  first ongoing-cost community-space bridge card (Public Art).
- Event family grew from 37 to 45 with the Group C expansion (CG-0MSQJ244M0055X7S):
  8 new Investment events (investment events 13 → 21) covering every synergy,
  plus two NEW duration effect types — positive `income-multiplier` (Tourist
  Season 1.15×/3 turns) and `rep-multiplier` (Community Renovation 1.2×/4 turns).
- Incident events grew from 24 to 34 with the Group D expansion (CG-0MSQJ7QLM0076FTD),
  10 new incidents (4 good / 3 bad / 3 neutral under the streak system's net-delta
  formula) covering under-served synergies, including the duration incident
  Labor Shortage (income-multiplier 0.9×/3 turns).
- Graffiti Art (evt-graffiti-art, CG-0MSRC9UR9006FBXC) adds a good incident —
  the exact reverse of Graffiti (+1 coin to all businesses and
  +1 reputation), raising incidents to 35 and event templates to 56.
- Upgrades grew from 27 to 39 with the Group E expansion (CG-0MSQJ7SYD008U3EE):
  12 new upgrades covering every Group A business and Group B community space
  (targets raised to maxLevel 1 so the upgrades are applicable), including
  reputation-bonus upgrade variants (Tea Lounge, Adventure Park, Orchard,
  Grand Fountain, Health Center).
- Staff grew from 3 to 7 with the Group F expansion (CG-0MSQJ7VL9009JHF4):
  Apprentice (budget) and Executive (+4 slots premium) cost points, plus two
  NEW ability mechanics — the Socialite's +0.1 rep/turn and the Accountant's
  market-refresh discount of 1 (StaffCard optional ability fields).
- Non-baseline card IDs are tracked in `docs/main-street/expanded-card-manifest.json`

### Guidance: adding more cards safely

1. Add rows to `example-games/main-street/card-data.csv` using the correct family column value (`business`, `event`, `upgrade`, `community-space`, or `staff`).
2. Regenerate metadata artifacts:
   - `npx tsx scripts/generate-card-csv.ts` — regenerates `card-data.csv` from TS (only if editing TS directly; normally edit CSV)
   - `npx tsx scripts/generate-main-street-catalog-baseline.ts`
   - `npx vite-node scripts/generate-main-street-expanded-card-manifest.ts`
     _(uses Vite-aware ESM loader because it imports deck-building functions from `MainStreetCards.ts`)_
3. Regenerate placeholder art:
   - `node scripts/generate-main-street-card-svgs.mjs`
4. Run regression tests:
   - `npx vitest run --project unit tests/main-street/expanded-card-pool.test.ts`
   - `npx vitest run --project unit tests/main-street/card-manifest.test.ts tests/main-street/card-svg-coverage.test.ts`

---

## Business Cards

Business cards are placed on the 10-slot street grid. Each generates base income plus synergy bonuses from adjacent businesses sharing a synergy type.

### M1 Business Templates (4)

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-bakery` | Bakery | 3 | 2 | Food | Bakery | Warm pastries. Gains 50% of base income per adjacent Food business (scales with difficulty). | Affordable Food starter. |
| `biz-diner` | Diner | 4 | 3 | Food | Diner | Quick meals. Gains 50% of base income per adjacent Food business (scales with difficulty). | Higher-cost, higher-income Food option. |
| `biz-bookshop` | Bookshop | 4 | 2 | Culture | Bookshop | Sells books. Gains 50% of base income per adjacent Culture business (scales with difficulty). | Mid-cost Culture business. |
| `biz-hardware` | Hardware Store | 5 | 3 | Service | Hardware Store | Supplies tools. Gains 50% of base income per adjacent Service business (scales with difficulty). | Retagged Commerce → Service (CG-0MT3IPFSF005KEFB): tool supply is a Service; gives T2 a second synergy type (Commerce 2 / Service 1). |

Park has been reclassified as a **Community Space** card (see below).

### M2 Business Templates (12)

#### Commerce (filling the gap)

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-pawnshop` | Pawn Shop | 3 | 2 | Commerce | Pawn Shop | Second-hand goods. Does not provide or receive synergy bonuses. | Budget Commerce option; makes Commerce synergies viable. |
| `biz-boutique` | Boutique | 4 | 2 | Commerce | Boutique | Curated fashion. Gains 50% of base income per adjacent Commerce business (scales with difficulty). | Mid-tier Commerce; distinct flavour from Hardware Store. |

#### Service (new synergy type)

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-laundromat` | Laundromat | 3 | 2 | Service | Laundromat | Self-serve laundry. Gains 50% of base income per adjacent Service business (scales with difficulty). | Budget Service entry point. |
| `biz-barbershop` | Barbershop | 3 | 2 | Service | Barbershop | Classic cuts. Gains 100% of base income per adjacent Service business (scales with difficulty). | Pairs with Laundromat for early Service cluster. |

#### Health (new synergy type)

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-clinic` | Clinic | 10 | 0 (rep +0.2/turn) | Health | Clinic | Walk-in medical care. Provides +0.2 rep/turn. | Non-profit community health provider; reputation instead of income. |
| `biz-private-clinic` | Private Clinic | 8 | 2 | Health | Private Clinic | Private medical practice. Gains 50% of base income per adjacent Health business (scales with difficulty). | For-profit counterpart to Clinic; income-focused. |
| `biz-pharmacy` | Pharmacy | 6 | 1 | Health | — | Provides essential medications. Gains 50% of base income per adjacent Health business (scales with difficulty). | Standalone Health card (no upgrade). |

#### Entertainment (new synergy type)

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-arcade` | Arcade | 4 | 2 | Entertainment + Service | Arcade | Retro fun. Bridges Entertainment and Service synergies. | Entertainment→Service bridge (CG-0MT3IPFSF005KEFB) so T3 spans two types; an arcade is an entertainment service. |
| `biz-cinema` | Cinema | 5 | 3 | Entertainment | Cinema | Latest films. Gains 50% of base income per adjacent Entertainment business (scales with difficulty). | Premium Entertainment; anchors the type. |

#### Multi-Synergy Bridge Cards

Bridge cards belong to two synergy types simultaneously, enabling cross-type adjacency bonuses and strategic placement decisions.

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `biz-cafe` | Cafe | 3 | 2 | Food + Culture | Cafe | Coffee and conversation. | Bridges the two most common M1 types. |
| `biz-food-truck` | Food Truck | 2 | 1 | Food + Entertainment | Food Truck | Street eats with flair. | Cheapest bridge card; low risk, low reward. |
| `biz-gallery` | Art Gallery | 4 | 2 | Culture + Entertainment | Art Gallery | Showcases local artists. | Connects M1 Culture with new Entertainment. |
| `biz-spa` | Day Spa | 5 | 3 | Service + Entertainment | Day Spa | Relaxation and pampering. | Premium bridge; high synergy potential across 2 new types. |
| `biz-florist` | Florist | 2 | 1 | Commerce + Culture | Florist | Arrangements for every occasion. | Budget bridge linking Commerce and Culture. |

### M3 Business Templates (12) — Group A expansion (CG-0MSQJ1XIB0004QVN)

Adds the first **Health bridge cards**, mid-tier (T2/T3) singles across every synergy, and a T5 flagship.

#### Health bridges (new)

| ID | Name | Cost | Income | Synergy | Tier | Rep/turn | Description | Rationale |
|----|------|------|--------|---------|------|----------|-------------|-----------|
| `biz-juice-bar` | Juice Bar | 5 | 0.5 | Food + Health | 3 | — | Fresh juices and smoothies. Bridges Food and Health synergies. | First Health bridge; connects the existing Food cluster to Health. |
| `biz-yoga-studio` | Yoga Studio | 8 | 1 | Culture + Health | 4 | — | Calm practice space for mind and body. Bridges Culture and Health synergies. | Culture–Health bridge; mid-tier wellness option. |
| `biz-physio` | Physiotherapy | 10 | 1 | Health + Service | 4 | 0.1 | Recovery and rehabilitation care. Bridges Health and Service synergies. Provides +0.1 reputation per turn. | Health–Service bridge with a small reputation perk. |

#### Singles (mid-tier depth)

| ID | Name | Cost | Income | Synergy | Tier | Rep/turn | Description | Rationale |
|----|------|------|--------|---------|------|----------|-------------|-----------|
| `biz-tailor` | Tailor | 5 | 0.75 | Service | 2 | — | Custom tailoring and repairs. Gains 50% of base income per adjacent Service business. | Mid Service single; smooths T2. |
| `biz-gym` | Gym | 8 | 1 | Health | 5 | — | Fitness training for the whole street. Gains 50% of base income per adjacent Health business. | Health single; T5 anchor (rebalanced from T3, CG-0MT2WU0CX005Z143). |
| `biz-dentist` | Dentist | 12 | 1.5 | Health | 5 | — | Smiles for the whole street. Gains 50% of base income per adjacent Health business. | Premium Health single (rebalanced from T4). |
| `biz-toy-store` | Toy Store | 5 | 0.75 | Commerce | 3 | — | Toys and games for young shoppers. Gains 50% of base income per adjacent Commerce business. | Commerce depth at T3 (rebalanced from T2). |
| `biz-music-store` | Music Store | 8 | 1 | Entertainment | 5 | — | Records and instruments for every taste. Gains 50% of base income per adjacent Entertainment business. | Entertainment depth at T5 (rebalanced from T3). |
| `biz-delicatessen` | Delicatessen | 5 | 0.75 | Food | 2 | — | Fine meats and cheeses. Gains 50% of base income per adjacent Food business. | Food depth at T2. |
| `biz-craft-shop` | Craft Shop | 5 | 0.75 | Culture | 2 | — | Handmade goods by local makers. Gains 50% of base income per adjacent Culture business. | Culture single (only Bookshop existed before). |

#### Flagship

| ID | Name | Cost | Income | Synergy | Tier | Rep/turn | Description | Rationale |
|----|------|------|--------|---------|------|----------|-------------|-----------|
| `biz-hotel` | Grand Hotel | 16 | 2.5 | Service | 5 | 0.1 | Premier lodging on Main Street. Gains 50% of base income per adjacent Service business. Provides +0.1 reputation per turn. | T5 flagship; highest income in the pool. Cost exceeds the flagship band's 14 cap to reflect premium positioning (documented balance rationale). |
| `biz-teahouse` | Teahouse | 7 | 0.75 | Food + Culture | 3 | — | Loose-leaf teas and quiet corners. Bridges Food and Culture synergies. | Second Food–Culture bridge (alongside Cafe). |

---

## Community Space Cards

Community space cards are a separate card family (`community-space`) placed on the street grid alongside business cards.
They share the same mechanical behavior as businesses (grid placement, synergy bonuses, upgrade path, level tracking)
but are classified differently for thematic clarity. Community space cards appear in the **Development** market row
alongside business cards.

| ID | Name | Cost | Income | Synergy | Upgrade Path | Description | Rationale |
|----|------|------|--------|---------|--------------|-------------|-----------|
| `cs-park` | Park | 4 | 0 | Entertainment | Park | Offers leisure space. Gains 50% of base income per adjacent Entertainment business or community space (scales with difficulty). | Reclassified from M1 Business; retagged Culture → Entertainment (CG-0MT3IPFSF005KEFB) so T1's spread is Culture 2 / Food 2 / Service 1 / Entertainment 1; cheapest community space. |
| `cs-library` | Library | 7 | 0 | Culture | Library | Quiet community space for reading and learning. Costs 0.25 coins/turn to run; +0.1 rep/turn. | Reputation asset: no income; small running cost for steady reputation. Full Culture synergy participation (Park model) — contributes to adjacent Culture businesses' synergy and receives rep synergy from rep-bonus neighbours (reversed by CG-0MSKS963N000ZSTU). |

### M3 Community Space Templates (6) — Group B expansion (CG-0MSQJ210I00491ZZ)

Adds reputation assets across five synergies, including the family's first bridge card.

| ID | Name | Cost | Income | Ongoing | Synergy | Tier | Rep/turn | Description | Rationale |
|----|------|------|--------|---------|---------|------|----------|-------------|-----------|
| `cs-playground` | Playground | 4 | 0 | 0 | Entertainment | 2 | 0.05 | A safe place for kids to play. Provides +0.05 reputation per turn. | Cheap early reputation asset (rebalanced from T1). |
| `cs-community-garden` | Community Garden | 5 | 0 | 0.1 | Food | 2 | 0.1 | A shared garden plot for the neighbourhood. Costs 0.1 coins/turn to run; +0.1 rep/turn. | Food reputation asset with a small running cost. |
| `cs-fountain` | Town Fountain | 5 | 0 | 0 | Culture | 3 | 0.1 | A gathering spot around the fountain. Provides +0.1 reputation per turn. | Culture reputation asset (rebalanced from T2). |
| `cs-health-kiosk` | Health Kiosk | 6 | 0 | 0.15 | Health | 3 | 0.15 | A walk-up health advice kiosk. Costs 0.15 coins/turn to run; +0.15 rep/turn. | Health reputation asset; deepens the Health family. |
| `cs-shelter` | Community Shelter | 6 | 0 | 0 | Service | 4 | 0.15 | A warm shelter for those in need. Provides +0.15 reputation per turn. | Service reputation asset (rebalanced from T3). |
| `cs-public-art` | Public Art | 8 | 0 | 0.25 | Culture + Entertainment | 5 | 0.2 | A vibrant public sculpture. Costs 0.25 coins/turn to run; +0.2 rep/turn. Bridges Culture and Entertainment community spaces. | Bridge community space; highest ongoing cost and rep yield (rebalanced from T4). |

### M3 Upgrade Templates (12) — Group E expansion (CG-0MSQJ7SYD008U3EE)

Every Group A business and Group B community space gets an upgrade path (targets raised to maxLevel 1).

| ID | Name | Target | Cost | Income+ | Range+ | Req Lvl | Rep+ | Description |
|----|------|--------|------|---------|--------|--------|------|-------------|
| `upg-smoothie-bar` | Upgrade to Smoothie Bar | Juice Bar | 4 | +1 | 0 | 0 | — | Turns a Juice Bar into a Smoothie Bar with higher income. |
| `upg-wellness-retreat` | Upgrade to Wellness Retreat | Yoga Studio | 5 | +1.5 | +1 | 0 | — | Expands the Yoga Studio into a full Wellness Retreat. |
| `upg-fitness-center` | Upgrade to Fitness Center | Gym | 5 | +1.5 | +1 | 0 | — | Expands the Gym into a full Fitness Center. |
| `upg-dental-clinic` | Upgrade to Dental Clinic | Dentist | 7 | +2 | +1 | 0 | — | Expands the Dentist into a full Dental Clinic. |
| `upg-bespoke-tailor` | Upgrade to Bespoke Tailor | Tailor | 4 | +1 | 0 | 0 | — | Elevates the Tailor into a Bespoke Tailor. |
| `upg-toy-warehouse` | Upgrade to Toy Warehouse | Toy Store | 4 | +1 | +1 | 0 | — | Scales the Toy Store into a Toy Warehouse with wider reach. |
| `upg-tea-lounge` | Upgrade to Tea Lounge | Teahouse | 4 | +1 | 0 | 0 | +0.1 | Turns the Teahouse into a Tea Lounge with a reputation boost. |
| `upg-gourmet-deli` | Upgrade to Gourmet Deli | Delicatessen | 4 | +1.5 | 0 | 0 | — | Elevates the Delicatessen into a Gourmet Deli. |
| `upg-adventure-park` | Upgrade to Adventure Park | Playground | 3 | 0 | 0 | 0 | +0.05 | Community-space upgrade; +0.05 rep/turn. |
| `upg-orchard` | Upgrade to Orchard | Community Garden | 3 | 0 | 0 | 0 | +0.05 | Community-space upgrade; +0.05 rep/turn. |
| `upg-grand-fountain` | Upgrade to Grand Fountain | Town Fountain | 3 | 0 | 0 | 0 | +0.05 | Community-space upgrade; +0.05 rep/turn. |
| `upg-health-center` | Upgrade to Health Center | Health Kiosk | 4 | 0 | 0 | 0 | +0.05 | Community-space upgrade; +0.05 rep/turn. |

### Community Space Upgrades

| ID | Name | Target | Cost | Income+ | Range+ | Description | Rationale |
|----|------|--------|------|---------|--------|-------------|-----------|
| `upg-community-hub` | Upgrade to Community Hub | Library | 4 | 0 | 0 | Library -> Community Hub (+0.1 rep/turn). | Repurposed: grants +0.1 reputation/turn instead of income/range bonuses. |

---

## Event Cards

Events fall into two categories:
- **Investment** events are purchased from the market, held in the player's hand, and played voluntarily. They have a coin cost and generally positive effects.
- **Incident** events live in a hidden face-down incident deck (card back + count only, CG-0MSTOATDP000JNHH). The top card is revealed and resolved at the end of each turn. Most are negative disruptions; a few are positive surprises.

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
| `evt-flu-outbreak` | Flu Outbreak | Incident | 0 | All | -- | 0 | 0 | 80% income for 5 turns. Duration reduced by Clinic/Medical Center. | Duration-based modifier (see ActiveEffect system). |

### M3 Event Templates (8) — Group C expansion (CG-0MSQJ244M0055X7S)

Gives every synergy a mid-tier Investment option and introduces two new duration effect types.

#### Investment Events (6)

| ID | Name | Cost | Target | Coins/biz | Rep | Tier | Effect | Rationale |
|----|------|------|--------|-----------|-----|------|--------|-----------|
| `evt-health-carnival` | Health Carnival | 5 | Health | +2 | +1 | 3 | +2 coins to all Health businesses and +1 reputation. | Health counterpart to Local Festival. |
| `evt-food-tasting` | Food Tasting Tour | 5 | Food | +2 | +1 | 3 | +2 coins to all Food businesses and +1 reputation. | Food boost. |
| `evt-art-sale` | Art Sale | 5 | Culture | +2 | +1 | 3 | +2 coins to all Culture businesses and +1 reputation. | Culture boost. |
| `evt-shopping-spree` | Shopping Spree | 7 | Commerce | +2.5 | 0 | 4 | +2.5 coins to all Commerce businesses. | Commerce boost. |
| `evt-summer-fest` | Summer Fest | 7 | Entertainment | +2 | +1 | 4 | +2 coins to all Entertainment businesses and +1 reputation. | Entertainment boost. |
| `evt-service-week` | Service Week | 7 | Service | +2 | +1 | 4 | +2 coins to all Service businesses and +1 reputation. | Service boost. |

#### Duration Events (2) — new effect types

| ID | Name | Cost | Target | Tier | Duration | Effect Type | Multiplier | Effect | Rationale |
|----|------|------|--------|------|----------|-------------|-----------|--------|-----------|
| `evt-tourist-season` | Tourist Season | 10 | All | 5 | 3 | `income-multiplier` | 1.15 | All businesses generate 115% income for 3 turns. | **NEW**: positive income-multiplier (previously only negative cuts existed). |
| `evt-community-renovation` | Community Renovation | 10 | All | 5 | 4 | `rep-multiplier` | 1.2 | All reputation income boosted to 120% for 4 turns. | **NEW**: rep-multiplier effect type (scales per-turn reputation income). |

> Positive duration effects are NOT shortened by Clinic/Medical Center coverage — the reduction applies only to negative multipliers (Group C design decision, CG-0MSQJ244M0055X7S).

### Event Balance Summary

| Category | Count | Avg Coin Delta | Avg Rep Delta |
|----------|-------|---------------|---------------|
| M1 Investment | 1 | +2.0 | +1.0 |
| M2 Investment | 4 | +1.75 | +1.0 |
| M1 Incident (negative) | 3 | -2.0 | -0.33 |
| M1 Incident (positive) | 1 | 0.0 | +2.0 |
| M2 Incident (negative) | 5 | -1.4 | -0.4 |
| M2 Incident (positive) | 3 | +1.33 | +1.0 |
| M2 Incident (duration) | 1 | 0.0 | 0.0 |

> Duration-based incidents (e.g. `evt-flu-outbreak`) apply an ActiveEffect instead of a one-shot delta. Their impact is listed as 0 coin/rep delta because the effect is applied over multiple turns via an income multiplier.

The M2 incident pool is more balanced than M1: 5 negative vs. 3 positive incidents (compared to M1's 3 negative vs. 1 positive). This reduces the punishing feel while maintaining strategic tension.

---

## Upgrade Cards

Each Upgrade targets a specific Business by name. Applying an upgrade increments the business's level, adds an income bonus, and optionally extends synergy range.

### M1 Upgrade Templates (3)

| ID | Name | Target | Cost | Income+ | Range+ | Description | Rationale |
|----|------|--------|------|---------|--------|-------------|-----------|
| `upg-patisserie` | Upgrade to Patisserie | Bakery | 4 | +1 | +1 | Bakery -> Patisserie. | Classic upgrade; income + range. |
| `upg-bistro` | Upgrade to Bistro | Diner | 4 | +1 | +1 | Diner -> Bistro. | Matches Patisserie in cost/power. |
| `upg-readers-cafe` | Upgrade to Reader's Café | Bookshop | 3 | +1 | +0 | Bookshop -> Reader's Café (+0.1 rep/turn). | Cheaper; income only, no range; reputation bonus. |

### M2 Standard Upgrade Templates (14)

| ID | Name | Target | Cost | Income+ | Range+ | Description | Rationale |
|----|------|--------|------|---------|--------|-------------|-----------|
| `upg-community-hub` | Upgrade to Community Hub | Library | 4 | 0 | 0 | Library -> Community Hub (+0.1 rep/turn). | Community space upgrade for Library; reputation bonus. |
| `upg-garden` | Upgrade to Garden | Park | 3 | +1 | +1 | Park -> Garden. | Completes M1 Culture upgrade / community space upgrade coverage. |
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
| `upg-medical-center` | Upgrade to Medical Center | Clinic | 5 | 0 (rep +0.1/turn) | +1 | Clinic -> Medical Center. Provides +0.1 rep/turn. | Reputation bonus upgrade; no income. |
| `upg-private-medical-center` | Upgrade to Private Medical Center | Private Clinic | 4 | +2 | 0 | Private Clinic -> Private Medical Center. | Income-focused upgrade; no range or reputation. |

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
| 3 | 9 | Reader's Café (Bookshop upgrade), Garden, Vintage Shop, Dry Cleaners, Salon, Roastery, Garden Center, Bread Factory, Fast Food |
| 4 | 8 | Patisserie, Bistro, Designer Store, Gaming Lounge, Museum, Drive-In Theater, Wellness Center, Community Hub |
| 5 | 6 | Home Improvement, IMAX Theater, Resort Spa, Medical Center, Grand Bakehouse, Restaurant |
| 6 | 2 | Multiplex, Luxury Retreat |

---

## Design Notes

### Multi-Synergy Bridge Cards

The adjacency resolver (`MainStreetAdjacency.ts`) uses `some()` to check if any synergy type matches, so bridge cards earn bonuses from neighbours of either type — a Cafe (Food+Culture) placed between a Bakery and a Bookshop earns bonuses from both sides. Bridges are also the primary lever for spreading synergy types across sparse tiers: since a bridge counts one card toward two types, a 2-card tier can span 3–4 types (e.g. the Arcade, Entertainment|Service, stretches T3 to Entertainment 2 / Service 1, CG-0MT3IPFSF005KEFB).

### Synergy Type Coverage

| Synergy | Single-type | Bridge (shared) | Total |
|---------|-------------|-----------------|-------|
| Food | 4 (Bakery, Community Garden, Delicatessen, Diner) | 4 (Cafe, Food Truck, Juice Bar, Teahouse) | 8 |
| Culture | 4 (Bookshop, Craft Shop, Library, Town Fountain) | 6 (Art Gallery, Cafe, Florist, Public Art, Teahouse, Yoga Studio) | 10 |
| Commerce | 3 (Boutique, Pawn Shop, Toy Store) | 1 (Florist) | 4 |
| Service | 6 (Barbershop, Community Shelter, Grand Hotel, Hardware Store, Laundromat, Tailor) | 3 (Arcade, Day Spa, Physiotherapy) | 9 |
| Entertainment | 4 (Cinema, Music Store, Park, Playground) | 5 (Arcade, Art Gallery, Day Spa, Food Truck, Public Art) | 9 |
| Health | 6 (Clinic, Dentist, Gym, Health Kiosk, Pharmacy, Private Clinic) | 3 (Juice Bar, Physiotherapy, Yoga Studio) | 9 |

Service and Health now have bridge representation on a par with the other types, while Commerce remains the most single-type reliant (its only bridge is the Florist). Global totals are intentionally not balanced per type (Culture 10 vs Commerce 4) — the balance rule is defined **per tier**, mirroring the family rebalance (CG-0MT2WU0CX005Z143) along the synergy-type axis.

> **Per-tier synergy balance (CG-0MT3IPFSF005KEFB):** every tier's synergy-bearing cards (business + community-space) span ≥ 2 distinct types, and no type's assignment count within a tier exceeds 2× any other type's count in that tier (bridge cards count once per type they carry). Sparse tiers are stretched with retags/bridges rather than new cards: T1 Park Culture→Entertainment, T2 Hardware Store Commerce→Service, T3 Arcade → Entertainment|Service bridge. Enforced by `tests/main-street/tier-synergy-balance.test.ts`.

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

The market integration test suite (`tests/main-street/market.integration.test.ts`) includes a Monte Carlo stability test that runs 200 seeds over 60 turns each (harness-only termination cap — default presets impose no turn limit):

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

## See Also

- **[Balance Process & Tooling PRD](prd-balance-process-and-tooling.md)** — Defines the structured balance review process, micro/macro metrics, and CLI tool specifications that read card-data.csv alongside Monte Carlo output.
- **[Balancing Methodology](balancing-methodology.md)** — Technical description of the `run-balance-cards` balancing algorithm.
- **[Monte Carlo Sample Results](monte-carlo-sample-results.md)** — Example output from the Monte Carlo simulation harness.
- **[Playtest Scenarios](playtest-scenarios.md)** — Curated deterministic seeds for manual balance validation.


## Staff Cards

Staff cards are a separate card family (`family: 'staff'`) that expand hand capacity at an ongoing per-turn coin cost. They do not occupy hand slots and are tier-gated like every other family (rebalance CG-0MT2WU0CX005Z143; 12-tier spread CG-0MT3C744B009DS84): staff unlock as their tier is reached, so a fresh run starts with only the Tier-1 staff (Apprentice). They are purchased from the dedicated staff-card market.

| ID | Name | Cost | Ongoing/turn | Slots+ | Tier | Ability | Description | Rationale |
|----|------|------|--------------|--------|------|---------|-------------|-----------|
| `staff-apprentice` | Apprentice | 2 | 0.5 | +1 | 1 | — | A budget hire who frees up a hand slot with a small ongoing cost. | Budget entry point *(Group F).* |
| `staff-assistant` | Assistant | 3 | 1 | +1 | 2 | — | Hire an assistant to help manage your hand. | Original M2 staff. |
| `staff-manager` | Manager | 7 | 2.5 | +2 | 3 | — | A skilled manager keeps things organised. | Mid-tier capacity. |
| `staff-socialite` | Socialite | 8 | 1.5 | +1 | 4 | +0.1 rep/turn | A charming socialite adds +1 hand slot and +0.1 reputation per turn. | **NEW** reputation ability *(Group F).* |
| `staff-accountant` | Accountant | 8 | 1.5 | +1 | 6 | Refresh −1 | A meticulous accountant makes market refreshes cost 1 less. | **NEW** economy ability *(Group F).* |
| `staff-lookout` | Lookout | 10 | 2 | +1 | 7 | Peek once/turn | A sharp-eyed lookout can peek at the top card of the incident deck once per turn. | **NEW** peek ability *(CG-0MSXOW6GN008ZSMN).* |
| `staff-director` | Director | 14 | 4 | +3 | 9 | — | An experienced director oversees your operations. | Premium capacity. |
| `staff-executive` | Executive | 20 | 5 | +4 | 10 | — | An experienced executive adds major hand capacity at a high ongoing cost. | Premium slot capacity *(Group F).* |
| `staff-general-manager` | General Manager | 20 | 5 | +4 | 12 | +1 action/turn | A seasoned leader grants **+1 action per day** while employed (2 actions instead of 1). | **NEW** action-economy ability *(CG-0MSTOF1N5005PK2R).* |
