# Main Street: Content Design and Progression

---

## 1. Card Pool / Content Inventory

The **Main Street** game uses three distinct card families. Below is the current inventory of cards used in the prototype. The list is intentionally small for rapid iteration; additional cards can be added as the design evolves.

### 1.1 Business Cards
| Name | Cost (coins) | Base Income (coins/turn) | Synergy Types | Upgrade Path | Description |
|------|--------------|--------------------------|----------------|--------------|-------------|
| Bakery | 3 | 2 | Food | Bakery → Patisserie | Provides warm pastries. Gains 50% of base income per adjacent Food business. |
| Diner | 4 | 3 | Food | Diner → Bistro | Serves quick meals. Gains 50% of base income per adjacent Food business. |
| Bookshop | 4 | 2 | Culture | Bookshop → Reader's Café | Sells books. Gains 50% of base income per adjacent Culture business. |
| Park | 2 | 1 | Culture | Park → Garden | Offers leisure. Gains 50% of base income per adjacent Culture business or community space. |
| Hardware Store | 5 | 3 | Commerce | Hardware Store → Home Improvement | Supplies tools. Gains 50% of base income per adjacent Commerce business. |
| Juice Bar | 5 | 0.5 | Food, Health | — | Fresh juices and smoothies. Bridges Food and Health synergies. *(Group A: first Health bridge.)* |
| Yoga Studio | 8 | 1 | Culture, Health | — | Calm practice space for mind and body. Bridges Culture and Health synergies. *(Group A.)* |
| Physiotherapy | 10 | 1 | Health, Service | — | Recovery and rehabilitation care. Bridges Health and Service synergies; +0.1 rep/turn. *(Group A.)* |
| Tailor | 5 | 0.75 | Service | — | Custom tailoring and repairs. Gains 50% of base income per adjacent Service business. *(Group A.)* |
| Gym | 8 | 1 | Health | — | Fitness training for the whole street. Gains 50% of base income per adjacent Health business. *(Group A.)* |
| Dentist | 12 | 1.5 | Health | — | Smiles for the whole street. Gains 50% of base income per adjacent Health business. *(Group A.)* |
| Toy Store | 5 | 0.75 | Commerce | — | Toys and games for young shoppers. Gains 50% of base income per adjacent Commerce business. *(Group A.)* |
| Music Store | 8 | 1 | Entertainment | — | Records and instruments for every taste. Gains 50% of base income per adjacent Entertainment business. *(Group A.)* |
| Delicatessen | 5 | 0.75 | Food | — | Fine meats and cheeses. Gains 50% of base income per adjacent Food business. *(Group A.)* |
| Craft Shop | 5 | 0.75 | Culture | — | Handmade goods by local makers. Gains 50% of base income per adjacent Culture business. *(Group A.)* |
| Grand Hotel | 16 | 2.5 | Service | — | Premier lodging on Main Street. Gains 50% of base income per adjacent Service business; +0.1 rep/turn. *(Group A T5 flagship.)* |
| Teahouse | 7 | 0.75 | Food, Culture | — | Loose-leaf teas and quiet corners. Bridges Food and Culture synergies. *(Group A.)* |

### 1.2 Event Cards

Event cards are split into two trigger types:

- **Investment** events are purchased from the Investments market row, held by the player, and played (or auto-resolved) during the turn. They are generally positive.
- **Incident** events populate a visible FIFO queue and resolve automatically at the start of each turn's Incident Phase. They are generally negative or disruptive.

| Name | Trigger | Effect |
|------|---------|--------|
| Local Festival | Investment | +2 coins per Culture business and +1 reputation. |
| Health Carnival | Investment | +2 coins to all Health businesses and +1 reputation. *(Group C.)* |
| Food Tasting Tour | Investment | +2 coins to all Food businesses and +1 reputation. *(Group C.)* |
| Art Sale | Investment | +2 coins to all Culture businesses and +1 reputation. *(Group C.)* |
| Shopping Spree | Investment | +2.5 coins to all Commerce businesses. *(Group C.)* |
| Summer Fest | Investment | +2 coins to all Entertainment businesses and +1 reputation. *(Group C.)* |
| Service Week | Investment | +2 coins to all Service businesses and +1 reputation. *(Group C.)* |
| Tourist Season | Investment (duration) | All businesses generate 115% income for 3 turns. *(Group C — new positive income-multiplier.)* |
| Community Renovation | Investment (duration) | All reputation income boosted to 120% for 4 turns. *(Group C — new rep-multiplier.)* |
| Graffiti | Incident | -1 coin to all businesses and -1 reputation. *(Group D.)* |
| Graffiti Art | Incident | +1 coin to all businesses and +1 reputation. *(Good reverse of Graffiti, CG-0MSRC9UR9006FBXC.)* |
| Water Main Break | Incident | -2 coins per Service business. *(Group D.)* |
| Parking Enforcement | Incident | -1 coin per Commerce business. *(Group D.)* |
| Labor Shortage | Incident (duration) | All businesses generate 90% income for 3 turns. *(Group D.)* |
| Movie Premiere | Incident | +1 coin per Entertainment business and +1 reputation. *(Group D.)* |
| Free Health Screening | Incident | +1 reputation. *(Group D.)* |
| Farmers Market Day | Incident | +1 coin per Food business and +1 reputation. *(Group D.)* |
| Children's Story Hour | Incident | +1 reputation. *(Group D.)* |
| Street Cleaning | Incident | No effect (streak breaker). *(Group D.)* |
| Neighborhood Watch | Incident | -1 coin but +1 reputation (net-0, streak breaker). *(Group D.)* |
| Tax Audit | Incident | Lose 3 coins. |
| Rainy Day | Incident | -1 coin per Food business this turn. |
| Community Award | Incident | +2 reputation from community recognition. |
| Health Inspection | Incident | -2 coins per Food business and -1 reputation. |

**Deck composition:** 5 event templates × 3 copies = 15 cards total (3 Investment, 12 Incident). At game start, the Investments market row draws 1 Investment event and the incident queue draws 2 Incidents from the shuffled event deck.

### 1.2b Community Space Cards

Community-space cards are placed on the street grid like businesses but generate **reputation per turn** instead of income (some carry a small ongoing coin cost). They appear in the Development market row alongside businesses. *(Group B, CG-0MSQJ210I00491ZZ, grew this family from 2 to 8 cards.)*

| Name | Cost (coins) | Ongoing/turn | Synergy | Tier | Rep/turn | Description |
|------|--------------|--------------|---------|------|----------|-------------|
| Park | 3 | 0 | Culture | 1 | 0 | Offers leisure space. Full Culture synergy participation. |
| Playground | 4 | 0 | Entertainment | 1 | 0.05 | A safe place for kids to play. *(Group B.)* |
| Community Garden | 5 | 0.1 | Food | 2 | 0.1 | A shared garden plot for the neighbourhood. *(Group B.)* |
| Town Fountain | 5 | 0 | Culture | 2 | 0.1 | A gathering spot around the fountain. *(Group B.)* |
| Health Kiosk | 6 | 0.15 | Health | 3 | 0.15 | A walk-up health advice kiosk. *(Group B.)* |
| Community Shelter | 6 | 0 | Service | 3 | 0.15 | A warm shelter for those in need. *(Group B.)* |
| Library | 7 | 0.25 | Culture | 1 | 0.1 | Quiet community space for reading and learning. |
| Public Art | 8 | 0.25 | Culture, Entertainment | 4 | 0.2 | A vibrant public sculpture. Bridges Culture and Entertainment community spaces. *(Group B.)* |

### 1.3 Upgrade Cards
| Name | Target Business | Cost (coins) | Income Bonus | Synergy Range Bonus | Description |
|------|----------------|--------------|--------------|----------------------|-------------|
| Upgrade to Patisserie | Bakery | 4 | +1 | +1 (adjacency range) | Turns a Bakery into a Patisserie, increasing income and allowing synergy with businesses two slots away. |
| Upgrade to Bistro | Diner | 4 | +1 | +1 | Turns a Diner into a Bistro with higher foot‑traffic. |
| Upgrade to Reader's Café | Bookshop | 3 | +1 | 0 | Transforms the Bookshop into a Reader's Café, blending books with café culture for +0.1 reputation per turn. |
| Upgrade to Smoothie Bar | Juice Bar | 4 | +1 | 0 | Turns a Juice Bar into a Smoothie Bar. *(Group E.)* |
| Upgrade to Wellness Retreat | Yoga Studio | 5 | +1.5 | +1 | Expands the Yoga Studio into a Wellness Retreat. *(Group E.)* |
| Upgrade to Fitness Center | Gym | 5 | +1.5 | +1 | Expands the Gym into a Fitness Center. *(Group E.)* |
| Upgrade to Dental Clinic | Dentist | 7 | +2 | +1 | Expands the Dentist into a Dental Clinic. *(Group E.)* |
| Upgrade to Bespoke Tailor | Tailor | 4 | +1 | 0 | Elevates the Tailor into a Bespoke Tailor. *(Group E.)* |
| Upgrade to Toy Warehouse | Toy Store | 4 | +1 | +1 | Scales the Toy Store into a Toy Warehouse. *(Group E.)* |
| Upgrade to Tea Lounge | Teahouse | 4 | +1 | 0 | Tea Lounge variant with +0.1 rep/turn. *(Group E.)* |
| Upgrade to Gourmet Deli | Delicatessen | 4 | +1.5 | 0 | Elevates the Delicatessen into a Gourmet Deli. *(Group E.)* |
| Upgrade to Adventure Park | Playground | 3 | 0 | 0 | Community-space upgrade; +0.05 rep/turn. *(Group E.)* |
| Upgrade to Orchard | Community Garden | 3 | 0 | 0 | Community-space upgrade; +0.05 rep/turn. *(Group E.)* |
| Upgrade to Grand Fountain | Town Fountain | 3 | 0 | 0 | Community-space upgrade; +0.05 rep/turn. *(Group E.)* |
| Upgrade to Health Center | Health Kiosk | 4 | 0 | 0 | Community-space upgrade; +0.05 rep/turn. *(Group E.)* |

---

### 1.4 Staff Cards

Staff cards expand hand capacity at an ongoing per-turn coin cost. *(Group F, CG-0MSQJ7VL9009JHF4, grew this family from 3 to 7 cards.)*

| Name | Cost | Ongoing/turn | Slots+ | Ability | Description |
|------|------|--------------|--------|---------|-------------|
| Apprentice | 2 | 0.5 | +1 | — | A budget hire who frees up a hand slot. *(Group F.)* |
| Assistant | 3 | 1 | +1 | — | Hire an assistant to help manage your hand. |
| Manager | 7 | 2.5 | +2 | — | A skilled manager keeps things organised. |
| Socialite | 8 | 1.5 | +1 | +0.1 rep/turn | A charming socialite adds hand capacity and reputation. *(Group F.)* |
| Accountant | 8 | 1.5 | +1 | refresh −1 | Makes market refreshes cost 1 less. *(Group F.)* |
| Director | 14 | 4 | +3 | — | An experienced director oversees your operations. |
| Executive | 20 | 5 | +4 | — | An experienced executive adds major hand capacity. *(Group F.)* |

## 2. Recipes / Blueprints

Main Street does **not** feature crafting or combination mechanics. The game revolves around purchasing, placing, and upgrading business cards. Therefore, the **Recipes / Blueprints** section is **N/A** for this title.

---

## 3. Resource Economy

The core economic loop consists of two primary resources:

1. **Coins** – the spendable currency used to purchase Business, Event, and Upgrade cards from the market.
2. **Reputation** – a score multiplier that is increased by completing challenges or by positive events. Reputation is applied at final‑score calculation (`finalScore = coins + reputation * 5 + challengeBonuses`).

**Flow of Resources**:
- At the start of each **Day Phase**, the player may spend coins to acquire cards.
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

The final score is calculated at the end of the **Night Phase** using the formula:

```
finalScore = resourceBank.coins + (resourceBank.reputation * 5) + challengeBonus
```

- **Coins** contribute directly.
- **Reputation** is multiplied by 5 to give it meaningful weight.
- **Challenge Bonus** adds `10` points per completed challenge (e.g., *Foodie Row*, *Cultural District*).

Victory conditions (see Core Rules) require `finalScore >= 150` **or** all primary challenges completed.

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
