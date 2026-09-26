# Main Street: Content Design and Progression

---

## 1. Card Pool / Content Inventory

The **Main Street** game uses three distinct card families. Below is the current inventory of cards used in the prototype. The list is intentionally small for rapid iteration; additional cards can be added as the design evolves.

### 1.1 Business Cards
| Name | Cost (coins) | Base Income (coins/turn) | Synergy Types | Upgrade Path | Description |
|------|--------------|--------------------------|----------------|--------------|-------------|
| Bakery | 300 | 230 | Food | Bakery → Patisserie | Provides warm pastries. Gains 50% of base income per adjacent Food business. |
| Diner | 300 | 230 | Food | Diner → Bistro | Serves quick meals. Gains 50% of base income per adjacent Food business. |
| Bookshop | 300 | 230 | Culture | Bookshop → Reader's Café | Sells books. Gains 50% of base income per adjacent Culture business. |
| Park | 2 | 1 | Entertainment | Park → Garden | Offers leisure. Gains 50% of base income per adjacent Entertainment business or community space. *(Culture→Entertainment retag, CG-0MT3IPFSF005KEFB; Park itself now lives in §1.2b as a community space.)* |
| Hardware Store | 300 | 230 | Service | Hardware Store → Home Improvement | Supplies tools. Gains 50% of base income per adjacent Service business. *(Commerce→Service retag, CG-0MT3IPFSF005KEFB — tool supply is a Service, gives T2 a second type.)* |
| Juice Bar | 500 | 350 | Food, Health | — | Fresh juices and smoothies. Bridges Food and Health synergies. *(Group A: first Health bridge.)* |
| Yoga Studio | 800 | 580 | Culture, Health | — | Calm practice space for mind and body. Bridges Culture and Health synergies. *(Group A.)* |
| Physiotherapy | 1000 | 700 | Health, Service | — | Recovery and rehabilitation care. Bridges Health and Service synergies; +10 rep/turn. *(Group A.)* |
| Tailor | 500 | 375 | Service | — | Custom tailoring and repairs. Gains 50% of base income per adjacent Service business. *(Group A.)* |
| Gym | 800 | 580 | Health | — | Fitness training for the whole street. Gains 50% of base income per adjacent Health business. *(Group A.)* |
| Dentist | 1200 | 870 | Health | — | Smiles for the whole street. Gains 50% of base income per adjacent Health business. *(Group A.)* |
| Toy Store | 500 | 375 | Commerce | — | Toys and games for young shoppers. Gains 50% of base income per adjacent Commerce business. *(Group A.)* |
| Music Store | 800 | 580 | Entertainment | — | Records and instruments for every taste. Gains 50% of base income per adjacent Entertainment business. *(Group A.)* |
| Delicatessen | 500 | 375 | Food | — | Fine meats and cheeses. Gains 50% of base income per adjacent Food business. *(Group A.)* |
| Craft Shop | 500 | 375 | Culture | — | Handmade goods by local makers. Gains 50% of base income per adjacent Culture business. *(Group A.)* |
| Grand Hotel | 1600 | 1210 | Service | — | Premier lodging on Main Street. Gains 50% of base income per adjacent Service business; +10 rep/turn. *(Group A T5 flagship.)* |
| Teahouse | 700 | 495 | Food, Culture | — | Loose-leaf teas and quiet corners. Bridges Food and Culture synergies. *(Group A.)* |

### 1.2 Event Cards

Event cards are split into two trigger types:

- **Investment** events are purchased from the Investments market row, held by the player, and played (or auto-resolved) during the turn. They are generally positive.
- **Incident** events populate a hidden face-down incident deck and resolve automatically (top card revealed) during the end-of-turn Incident Phase. They are generally negative or disruptive.

| Name | Trigger | Effect |
|------|---------|--------|
| Local Festival | Investment | +200 coins to all Culture businesses and +100 reputation. |
| Health Carnival | Investment | +200 coins to all Health businesses and +100 reputation. |
| Food Tasting Tour | Investment | +200 coins to all Food businesses and +100 reputation. |
| Art Sale | Investment | +200 coins to all Culture businesses and +100 reputation. |
| Shopping Spree | Investment | +250 coins to all Commerce businesses. |
| Summer Fest | Investment | +200 coins to all Entertainment businesses and +100 reputation. |
| Service Week | Investment | +200 coins to all Service businesses and +100 reputation. |
| Tourist Season | Investment (duration) | All businesses generate 115% income for 3 turns. |
| Community Renovation | Investment (duration) | All reputation income boosted to 120% for 4 turns. |
| Graffiti | Incident | -100 coin to all businesses and -100 reputation. |
| Graffiti Art | Incident | +100 reputation. |
| Water Main Break | Incident | -200 coins per Service business. |
| Parking Enforcement | Incident | -100 coin per Commerce business. |
| Labor Shortage | Incident (duration) | All businesses generate 90% income for 3 turns. |
| Movie Premiere | Incident | +100 coin per Entertainment business and +100 reputation. |
| Free Health Screening | Incident | +100 reputation. |
| Farmers Market Day | Incident | +100 coin per Food business and +100 reputation. |
| Children's Story Hour | Incident | +100 reputation from a beloved story hour. |
| Street Cleaning | Incident | No effect. |
| Neighborhood Watch | Incident | -100 coin but +100 reputation. |
| Tax Audit | Incident | Lose 45% of your banked coins. |
| Rainy Day | Incident | -100 coin to all Food businesses this turn. |
| Community Award | Incident | Gain 200 reputation from community recognition. |
| Health Inspection | Incident | -200 coins per Food business and -100 reputation. |

**Deck composition:** 5 event templates × 3 copies = 15 cards total (3 Investment, 12 Incident). At game start, the Investments market row draws 1 Investment event and the incident deck is built from the Incident-trigger events, constraint-ordered so repeat-spacing/streak limits hold across the draw sequence (CG-0MSTOATDP000JNHH).

### 1.2b Community Space Cards

Community-space cards are placed on the street grid like businesses but generate **reputation per turn** instead of income (some carry a small ongoing coin cost). They appear in the Development market row alongside businesses. *(Group B, CG-0MSQJ210I00491ZZ, grew this family from 2 to 8 cards.)*

| Name | Cost (coins) | Ongoing/turn | Synergy | Tier | Rep/turn | Description |
|------|--------------|--------------|---------|------|----------|-------------|
| Park | 300 | 0 | Entertainment | 1 | 0 | Offers leisure space. Full Entertainment synergy participation. *(Culture→Entertainment retag, CG-0MT3IPFSF005KEFB.)* |
| Playground | 400 | 0 | Entertainment | 3 | 5 | A safe place for kids to play. *(Group B.)* |
| Community Garden | 500 | 10 | Food | 4 | 10 | A shared garden plot for the neighbourhood. *(Group B.)* |
| Town Fountain | 500 | 0 | Culture | 5 | 10 | A gathering spot around the fountain. *(Group B.)* |
| Health Kiosk | 600 | 15 | Health | 8 | 15 | A walk-up health advice kiosk. *(Group B.)* |
| Community Shelter | 600 | 0 | Service | 3 | 15 | A warm shelter for those in need. *(Group B; retiered T6→T3 (CG-0MT5VZJLS000B8KI) as the neighbourhood amenity anchoring T3's Service leg.)* |
| Library | 700 | 25 | Culture | 1 | 10 | Quiet community space for reading and learning. |
| Public Art | 800 | 25 | Culture, Entertainment | 12 | 20 | A vibrant public sculpture. Bridges Culture and Entertainment community spaces. *(Group B.)* |

> 12-tier expansion (CG-0MT3C744B009DS84): community-space cards are spread across 6 of the 12 tiers (8 cards cannot cover every tier; the Community Shelter retiered T6→T3, CG-0MT5VZJLS000B8KI); Park and Library are Tier-1 because the tutorial requires them in the tier-1 card pool.

> **Per-tier synergy balance (CG-0MT3IPFSF005KEFB):** across business + community-space cards, every tier spans ≥ 2 distinct synergy types, and no type's assignment count within a tier exceeds 2× any other type's count (bridge cards count once per type they carry). The three sparse tiers were stretched without new cards: T1 Park Culture→Entertainment, T2 Hardware Store Commerce→Service, T3 Arcade stays Entertainment with the Community Shelter retiered 6→3 (CG-0MT5VZJLS000B8KI) → Entertainment 2 / Service 1. See `card-catalog.md` "Synergy Type Coverage" and `tests/main-street/tier-synergy-balance.test.ts`.

### 1.3 Upgrade Cards
| Name | Target Business | Cost (coins) | Income Bonus | Synergy Range Bonus | Description |
|------|----------------|--------------|--------------|----------------------|-------------|
| Upgrade to Patisserie | Bakery | 300 | +100 | +1 | Turns a Bakery into a Patisserie, increasing income and allowing synergy with businesses two slots away. |
| Upgrade to Bistro | Diner | 300 | +100 | +1 | Turns a Diner into a Bistro with higher foot‑traffic. |
| Upgrade to Reader's Café | Bookshop | 300 | +100 | 0 | Transforms the Bookshop into a Reader's Café, blending books with café culture for +10 reputation per turn. |
| Upgrade to Smoothie Bar | Juice Bar | 400 | +100 | 0 | Turns a Juice Bar into a Smoothie Bar. *(Group E.)* |
| Upgrade to Wellness Retreat | Yoga Studio | 500 | +150 | +1 | Expands the Yoga Studio into a Wellness Retreat. *(Group E.)* |
| Upgrade to Fitness Center | Gym | 500 | +150 | +1 | Expands the Gym into a Fitness Center. *(Group E.)* |
| Upgrade to Dental Clinic | Dentist | 700 | +200 | +1 | Expands the Dentist into a Dental Clinic. *(Group E.)* |
| Upgrade to Bespoke Tailor | Tailor | 400 | +100 | 0 | Elevates the Tailor into a Bespoke Tailor. *(Group E.)* |
| Upgrade to Toy Warehouse | Toy Store | 400 | +100 | +1 | Scales the Toy Store into a Toy Warehouse. *(Group E.)* |
| Upgrade to Tea Lounge | Teahouse | 400 | +100 | 0 | Tea Lounge variant with +10 rep/turn. *(Group E.)* |
| Upgrade to Gourmet Deli | Delicatessen | 400 | +150 | 0 | Elevates the Delicatessen into a Gourmet Deli. *(Group E.)* |
| Upgrade to Adventure Park | Playground | 300 | 0 | 0 | Community-space upgrade; +5 rep/turn. *(Group E.)* |
| Upgrade to Orchard | Community Garden | 300 | 0 | 0 | Community-space upgrade; +5 rep/turn. *(Group E.)* |
| Upgrade to Grand Fountain | Town Fountain | 300 | 0 | 0 | Community-space upgrade; +5 rep/turn. *(Group E.)* |
| Upgrade to Health Center | Health Kiosk | 400 | 0 | 0 | Community-space upgrade; +5 rep/turn. *(Group E.)* |

---

### 1.4 Staff Cards

Staff cards expand hand capacity at an ongoing per-turn coin cost. *(Group F, CG-0MSQJ7VL9009JHF4, grew this family from 3 to 7 cards.)*

| Name | Cost | Ongoing/turn | Slots+ | Tier | Ability | Description |
|------|------|--------------|--------|------|---------|-------------|
| Apprentice | 200 | 50 | +1 | 1 | — | A budget hire who frees up a hand slot. *(Group F.)* |
| Assistant | 300 | 100 | +1 | 2 | — | Hire an assistant to help manage your hand. |
| Manager | 700 | 250 | +2 | 3 | — | A skilled manager keeps things organised. |
| Socialite | 800 | 150 | +1 | 4 | +10 rep/turn | A charming socialite adds hand capacity and reputation. *(Group F.)* |
| Accountant | 800 | 150 | +1 | 6 | refresh −1; tax 25% | Makes market refreshes cost 1 less and reduces Tax Audit losses to 25%. *(Group F; CG-0MTQ7W0ZX0059R3J.)* |
| Lookout | 1000 | 200 | +1 | 7 | peek once/turn | Peek at the top incident-deck card once per turn. *(CG-0MSXOW6GN008ZSMN.)* |
| Director | 1400 | 400 | +3 | 9 | — | An experienced director oversees your operations. |
| Executive | 2000 | 500 | +4 | 10 | — | An experienced executive adds major hand capacity. *(Group F.)* |
| General Manager | 2000 | 500 | +4 | 12 | +1 action/turn | Grants an extra action per week while employed. *(CG-0MSTOF1N5005PK2R.)* |

> 12-tier expansion (CG-0MT3C744B009DS84): staff cards are spread across 9 of the 12 tiers (9 cards cannot cover every tier); the tier tracks the cost ladder 200→2000.

## 2. Recipes / Blueprints

Main Street does **not** feature crafting or combination mechanics. The game revolves around purchasing, placing, and upgrading business cards. Therefore, the **Recipes / Blueprints** section is **N/A** for this title.

---

## 3. Resource Economy

The core economic loop consists of two primary resources:

1. **Coins** – the spendable currency used to purchase Business, Event, and Upgrade cards from the market.
2. **Reputation** – a plain score count increased by completing challenges or by positive events. Reputation counts 1:1 at final‑score calculation (`finalScore = coins + reputation + challengeBonuses`).

**Flow of Resources**:
- At the start of each **WeekStart**, the player may spend coins to acquire cards.
- During the **Income Phase**, each placed Business generates `effectiveBase + synergyBonus` coins. Synergy is computed as a percentage of base income per matching adjacent Business sharing a Synergy Type: `synergyBonus = effectiveBase * synergyCoinBonus * bonusPerNeighbor * matchingNeighborCount`, where `synergyCoinBonus` defaults to 0.5 (50%) and `bonusPerNeighbor` is the difficulty preset multiplier (0.5 Easy / 0.35 Medium / 0.25 Hard, re-tuned by CG-0MSP26Q5N002EH8P).
- **Event Cards** may grant or remove coins/reputation immediately.
- **Upgrade Cards** increase future income and may extend synergy range.
- At the end of each turn, the player's **coin balance** and **reputation** are persisted in the **ResourceBank**.

---

## 4. Difficulty and Balance

The balancing methodology and targets for Main Street have been consolidated into a dedicated document. See [balancing-methodology.md](balancing-methodology.md) for the full methodology.

> **Migrated content**: Section 4 (Difficulty and Balance), 4.1 (Provisional Numeric Balance Targets), and 4.2 (Tuning Levers) have been moved to `balancing-methodology.md`. This section now serves as a cross-reference.

---

## 5. Scoring System

The final score is calculated at the end of the **week end** using the formula:

```
finalScore = resourceBank.coins + resourceBank.reputation + challengeBonus
```

- **Coins** contribute directly.
- **Reputation** counts 1:1 toward the final score.
- **Challenge Bonus** adds `10` points per completed challenge (e.g., *Foodie Row*, *Cultural District*).

Victory conditions (see Core Rules) require `finalScore >= winThreshold` (100 Easy / 120 Medium / 150 Hard) **or** all primary challenges completed.

---

## 6. Progression / Unlockables

Main Street features both **in‑run progression** and **meta‑progression** across runs.

### 6.1 In‑run Progression
- **Business Upgrades**: Spend coins to transform a Business (e.g., Bakery → Patisserie) increasing income and synergy range.
- **Challenges**: Dynamic objectives such as “Build a Foodie Row” provide immediate bonus points when satisfied.

### 6.2 Meta‑progression (Run‑to‑Run)
- After each run, players unlock new Business types from a larger pool, expanding the strategic palette for subsequent runs.
- Reputation carries over as a **persistent unlock tier**; reaching certain reputation milestones unlocks special Upgrade cards.
- A **Roguelike run structure** (one street per run) encourages repeated play to discover new combinations and improve the final score.

---

## 7. Replayability Hooks

To encourage multiple play‑throughs, Main Street incorporates:

- **Themed Street Challenges** (e.g., *Foodie Row*, *Cultural District*) that vary each run.
- **Event Cards with Meaningful Choices** (e.g., choose between a Festival that boosts Culture or a Market Fair that boosts Food).
- **Randomized Market** each turn, ensuring different acquisition opportunities.
- **Meta‑progression Unlocks** that gradually increase the card pool and upgrade options.

These hooks create emergent strategies while keeping the core loop short and satisfying.

---

*Document status*: AWAITING PRODUCER REVIEW.

*Prepared by*: `opencode` – implementation of work item **CG-0MM4RCE861AQ7PGW**.
