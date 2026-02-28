# The Build: Ideation Session -- Game Concepts

**Date:** 2026-02-27
**Purpose:** Generate 6 distinct game concepts for "The Build" in the buildy/crafty/simulation card game genre, drawing on the genre research and engine capabilities audit.
**Prerequisites:** Genre Research (CG-0MM4RAHP40H5OTZI), Engine Audit (CG-0MM4RAT5L12FHWKP)

---

## Concept 1: "Hearth & Home"

### Elevator Pitch
Build your dream cottage room by room, placing cards on a grid where adjacent rooms create synergy bonuses, while playing solitaire cascades to gather the building materials you need.

### Theme/Setting
A cozy countryside setting. You're a homesteader constructing your ideal cottage from the ground up -- kitchen, bedroom, workshop, garden, pantry, library. The visual style is warm, hand-drawn, and inviting. Think Stardew Valley meets Regency Solitaire.

### Player Fantasy
The master homebuilder. You're designing and building your own personal space, room by room, making it uniquely yours. Every room you place is a deliberate choice that shapes both the house and your strategy.

### Core Loop
1. **Gather Phase:** Play a tri-peaks solitaire round to collect resource cards (Wood, Stone, Glass, Iron). Longer combos yield rarer resources and bonus materials.
2. **Build Phase:** Spend collected resources to "buy" room cards from a market row of 4 visible options. Place the purchased room card onto your 4x5 cottage grid.
3. **Activate Phase:** All placed rooms activate based on adjacency -- a Kitchen next to a Pantry produces bonus food points; a Workshop next to a Storage Room produces bonus craft points.
4. **Season Advance:** After every 3 gather/build cycles, a season changes, altering which resources the solitaire round yields and triggering seasonal scoring bonuses (e.g., Garden rooms score extra in Spring).

### Buildy/Crafty Hook
The cottage grid IS the thing you're building. Each room card placed is a visible, permanent addition. The grid fills up over a session, and adjacency synergies mean the placement order and spatial arrangement matter deeply. By session's end, you have a unique, recognizable cottage layout.

### Win/Loss Condition
- **Win:** Fill the cottage grid (20 rooms) before running out of seasons (8 seasons = ~24 solitaire rounds). Score is based on room synergies, completed room "sets" (e.g., full kitchen wing), and seasonal bonuses.
- **Loss:** If you can't afford any room in the market for 3 consecutive build phases, or if 8 seasons pass without filling the grid.
- **Degrees of victory:** Star ratings (1-3 stars) based on total score thresholds.

### Session Length
15-20 minutes per game.

### Unique Selling Point
Combines the universally familiar tri-peaks solitaire with spatial grid building, creating a "play cards to earn materials to build a visible house" loop that no existing game offers. The adjacency synergy system means the house you build IS your strategy.

### Engine Implications

| Component | Status | Notes |
|-----------|--------|-------|
| Card System (custom room cards) | Minor extension | Need custom card types beyond standard playing cards (already proven by Sushi Go, Feudalism) |
| Standard deck for solitaire | Existing | `createStandardDeck()`, `shuffleArray()`, `rankValue()` |
| Seeded RNG | Existing | `createSeededRng()` |
| Grid/spatial placement | **NEW** | Need a `Grid<T>` abstraction for the cottage layout |
| Adjacency evaluation | **NEW** | Need adjacency-based synergy resolver |
| Resource tracking | Minor extension | Generalize Feudalism's `ResourceTokens` into `ResourceBank` |
| Market row | **NEW** | Need reusable `Market<T>` component |
| Seasonal/round timer | Minor extension | `PhaseManager` can handle this with some extension |
| Scoring system | Game-specific | Build on existing patterns |
| Drag-and-drop placement | Minor extension | Extract from Beleaguered Castle |
| Undo/Redo | Existing | `UndoRedoManager` |
| Scene/UI base | Existing | `CardGameScene`, overlays, help/settings panels |

**New engine components required:** Grid system, adjacency resolver, market row, resource bank.

---

## Concept 2: "Forge & Fortune"

### Elevator Pitch
Run a medieval blacksmith's workshop where you combine raw material cards through multi-step crafting recipes, fulfilling customer orders before they expire, building up your forge with better equipment that unlocks more complex recipes.

### Theme/Setting
A bustling medieval town. You're the town blacksmith, taking raw iron, wood, and leather and transforming them through a visible crafting pipeline into swords, shields, horseshoes, and ornate armor. The workshop itself upgrades as you succeed.

### Player Fantasy
The master craftsperson. The satisfaction of transforming raw materials through a multi-step process into a finished product. You're not just placing cards -- you're watching raw iron become a gleaming sword through your deliberate actions.

### Core Loop
1. **Supply Phase:** Draw 3-5 material cards from the supply deck (Iron Ore, Timber, Leather, Coal, Gemstones). Some materials are common, some rare.
2. **Work Phase:** Place material cards onto "workstation" slots (Forge, Anvil, Workbench, Enchanting Table). Each workstation transforms inputs into intermediate products (Iron Ore + Coal on Forge = Steel Bar). You have 3 action points per turn.
3. **Craft Phase:** When a workstation has all required intermediate products, it automatically produces the finished item. Place the finished item in your display case.
4. **Customer Phase:** A queue of 3 customer order cards is visible. Each order requires specific items and has a deadline (turns remaining). Fulfilling orders earns gold and reputation. Expired orders cost reputation.
5. **Upgrade Phase:** Spend gold to upgrade workstations (Forge I -> Forge II = processes faster) or buy new workstation cards.

### Buildy/Crafty Hook
The crafting pipeline is the core mechanic. Cards physically move through workstations: raw material -> intermediate -> finished product. The workshop itself grows as you add and upgrade workstations. The "building" is both the products you create AND the workshop you develop.

### Win/Loss Condition
- **Win:** Reach Master Blacksmith rank (reputation threshold) within 30 turns. Score based on reputation, gold earned, workshop value, and rare items crafted.
- **Loss:** Reputation drops below zero (too many failed orders).
- **Bonus:** Fulfill the "Legendary Order" (a special order requiring the most complex recipe chain) for a major score bonus.

### Session Length
20-25 minutes per game.

### Unique Selling Point
The multi-step visible crafting pipeline where you watch materials physically transform through workstations. Gap #5 from genre research: "process-focused crafting where the journey IS the gameplay." No card game makes the transformation process this visible and interactive.

### Engine Implications

| Component | Status | Notes |
|-----------|--------|-------|
| Custom card types (materials, products, workstations, orders) | Minor extension | Multiple custom card types needed |
| Recipe/crafting system | **NEW** | Core requirement: `Recipe` type, `ProductionResolver` |
| Workstation slots (verb-slot inspired) | **NEW** | Processing stations that accept card inputs and produce outputs |
| Resource tracking (gold, reputation) | Minor extension | `ResourceBank` |
| Customer order queue with deadlines | **NEW** | Timer-based card queue |
| Upgrade system | **NEW** | Card evolution/leveling |
| Action point economy | Game-specific | Simple counter per turn |
| Undo/Redo | Existing | `UndoRedoManager` |
| Scene/UI base | Existing | `CardGameScene` + overlays |

**New engine components required:** Recipe/crafting system, workstation processing slots, upgrade system, order queue.

---

## Concept 3: "Canopy"

### Elevator Pitch
Grow a thriving forest ecosystem by playing nature cards into a layered canopy -- ground cover, understory, and canopy layers -- where each layer supports the one above and the whole forest generates biodiversity points through emergent ecological interactions.

### Theme/Setting
A temperate forest ecosystem. You're a conservation ecologist restoring a degraded landscape. Plant species, introduce wildlife, manage water flow, and watch a barren plot transform into a vibrant, layered forest over the course of four seasons.

### Player Fantasy
The patient gardener and ecosystem builder. The satisfaction of watching something grow and come alive through your careful choices. Each card placed adds to a living, breathing system.

### Core Loop
1. **Draw Phase:** Draw 3 cards from the Nature deck (plants, fungi, insects, birds, mammals, water features) plus 1 Season Event card that affects the current round.
2. **Plant Phase:** Play up to 2 nature cards from your hand into one of three layers on your 5-column forest grid:
   - **Ground Layer** (bottom row): Ferns, mosses, fungi, ground cover
   - **Understory Layer** (middle row): Shrubs, saplings, small trees, nests
   - **Canopy Layer** (top row): Tall trees, canopy birds, climbing vines
   - Constraint: Canopy cards require an Understory card below them; Understory requires Ground Cover below.
3. **Grow Phase:** All placed cards "grow" -- they activate their effects based on neighbors and the layer they're in. A Mushroom next to a Dead Tree produces spore tokens; an Oak Tree above a Fern provides shade bonus.
4. **Score Phase:** Biodiversity points are tallied based on species variety, food chain completeness, and ecological balance.

### Buildy/Crafty Hook
The layered grid creates a visual forest that grows upward and outward. The building constraint (canopy needs understory needs ground cover) creates natural progression. The forest you build is unique every game based on card availability and placement choices.

### Win/Loss Condition
- **Win:** Achieve a target biodiversity score before the 4th winter ends (16 rounds). Higher scores earn more stars.
- **Loss:** If ecosystem health drops to zero (e.g., from unchecked invasive species, drought events, or imbalanced layers).
- **Scoring:** Species variety multiplier x food chain bonus x habitat completeness.

### Session Length
12-18 minutes per game.

### Unique Selling Point
Vertical layered building with ecological dependency rules. No card game has a "layers must support each other" spatial mechanic combined with ecological theme. Inspired by Wingspan's row-based engine building but with vertical dependency and a nature-restoration narrative.

### Engine Implications

| Component | Status | Notes |
|-----------|--------|-------|
| Custom nature cards | Minor extension | Custom card types with layer, species, effects |
| Layered grid (3 rows x 5 cols with constraints) | **NEW** | Grid with vertical dependency rules |
| Layer constraint validation | **NEW** | Rule engine: cards can only be placed if support exists below |
| Ecological effect resolver | **NEW** | Adjacency + layer-based effect activation |
| Season event system | Minor extension | `PhaseManager` + event card queue |
| Scoring: biodiversity calculator | Game-specific | Multi-factor scoring |
| Card text/tooltip | Minor extension | Tooltip component from Sushi Go |
| Scene/UI base | Existing | `CardGameScene` + standard UI |

**New engine components required:** Layered grid with dependency constraints, ecological effect resolver, season event system.

---

## Concept 4: "Main Street"

### Elevator Pitch
Revitalize a small town's main street by placing shop, service, and community building cards along a single row where neighboring businesses boost each other, managing a simple economy of customers, money, and reputation across day/night cycles.

### Theme/Setting
A charming small-town main street, circa 1950s Americana. You're the town planner bringing an empty street back to life -- bakery, bookshop, hardware store, diner, post office, park. Each business is a card with character.

### Player Fantasy
The town revitalizer. The satisfaction of transforming a dead street into a bustling community, one shop at a time. Each business you place brings the street closer to thriving.

### Core Loop
1. **Morning Phase:** Draw income from existing businesses (each open shop generates coins based on foot traffic, which is determined by neighboring shops).
2. **Market Phase:** Browse 4 available business cards in a rotating market. Each has a purchase cost, a foot-traffic modifier, and neighbor synergies (e.g., Bakery attracts +2 foot traffic; Bookshop gives +1 culture to neighbors).
3. **Build Phase:** Purchase and place a business card at any empty slot on your 8-slot Main Street row. Placement is permanent -- choose carefully.
4. **Evening Phase:** Random event card (Festival, Health Inspector, Competition from Big Box Store, Local Celebrity Visit) affects specific business types positively or negatively.
5. **Score at Week's End:** Every 7 turns (1 week), tally reputation based on street diversity, customer satisfaction, and special synergy bonuses (e.g., "Cultural District" bonus for 3+ cultural businesses adjacent).

### Buildy/Crafty Hook
The single-row layout makes the "street" immediately readable and visually satisfying. Adjacency synergies between businesses create the puzzle. The street fills up left to right (or wherever you choose), and each addition visibly transforms the scene.

### Win/Loss Condition
- **Win:** Reach "Thriving Town" reputation level within 4 weeks (28 turns). Score based on street diversity, total income generated, and synergy bonuses achieved.
- **Loss:** If 3 businesses close (income drops below maintenance cost for 3 consecutive turns per business), you lose.
- **Bonus challenges:** Specific street compositions for bonus stars (e.g., "The Foodie Street" -- 3+ food businesses all adjacent).

### Session Length
10-15 minutes per game.

### Unique Selling Point
The single-row constraint makes this the most accessible concept while still offering meaningful spatial decisions. It's Luck be a Landlord's adjacency synergies applied to a tangible, charming small-town setting with a narrative wrapper. Shortest session length makes it ideal for mobile and quick-play.

### Engine Implications

| Component | Status | Notes |
|-----------|--------|-------|
| Custom business cards | Minor extension | Custom card type with cost, income, synergy tags |
| Single-row layout (1x8 grid) | Minor extension | Simplified version of grid system |
| Adjacency synergy resolver | **NEW** | Simpler than grid -- only left/right neighbors |
| Resource tracking (coins, reputation) | Minor extension | `ResourceBank` |
| Market row | **NEW** | Reusable `Market<T>` component |
| Event card system | Minor extension | Simple random event per turn |
| Foot traffic calculation | Game-specific | Propagation algorithm along the row |
| Scene/UI base | Existing | `CardGameScene` + standard UI |

**New engine components required:** Adjacency resolver (simplified), market row. Lightest engine investment of all concepts.

---

## Concept 5: "Expedition Blueprint"

### Elevator Pitch
Design and equip an expedition vessel (ship, airship, or rover) card by card, balancing structural integrity, crew quarters, cargo, and specialized equipment, then launch it against escalating exploration challenges that test your build.

### Theme/Setting
Victorian-era exploration. You're an expedition planner outfitting a vessel for a dangerous journey to uncharted territories. Each card represents a component of your vessel -- hull plates, crew quarters, navigation equipment, cargo holds, weapons, scientific instruments.

### Player Fantasy
The expedition engineer. The satisfaction of designing a vehicle optimized for a specific challenge, then watching your design succeed (or fail) against the unknown. Every component matters; every placement is an engineering decision.

### Core Loop
1. **Blueprint Phase:** Your vessel is a 3x4 grid. Draw 4 component cards from the supply. Each component has weight, cost, structural requirements (e.g., Engine must be adjacent to Fuel Tank), and stat bonuses (Speed, Durability, Science, Comfort).
2. **Install Phase:** Place 1-2 components onto your vessel grid, paying their resource cost from your budget. Components snap into place and visually build up the vessel.
3. **Inspect Phase:** Your vessel's current stats are calculated from all placed components + adjacency bonuses. Structural integrity is checked (unbalanced vessels lose durability).
4. **Challenge Phase:** Every 3 turns, an Exploration Challenge card is revealed (Storm, Uncharted Reef, Hostile Wildlife, Scientific Discovery). Your vessel's stats are tested against the challenge requirements. Success earns Discovery Points and bonus resources; failure costs crew morale or structural damage.
5. **Refit Phase:** Between challenges, you can remove and replace components (at a cost), adapting your build to anticipated challenges.

### Buildy/Crafty Hook
The vessel grid is the core build. Each component placed visually adds to the vessel diagram. The build-then-test cycle creates tension: you're building something that will be put under stress. The refit mechanic means your vessel evolves over the session.

### Win/Loss Condition
- **Win:** Complete 5 Exploration Challenges and reach the Destination. Score based on Discovery Points, crew morale, vessel condition, and budget remaining.
- **Loss:** Structural integrity reaches zero (vessel destroyed) or crew morale reaches zero (mutiny).
- **Bonus:** Discover the "Legendary Artifact" by having specific stat thresholds during the final challenge.

### Session Length
20-25 minutes per game.

### Unique Selling Point
The build-then-test cycle is unique in card games. You're not just building -- you're building FOR something, and then immediately seeing your build tested. Combines spatial card placement with a tower-defense-like "will my design hold?" tension. Gap #2 from genre research: building up individual components AND using them together.

### Engine Implications

| Component | Status | Notes |
|-----------|--------|-------|
| Custom component cards | Minor extension | Card type with stats, cost, requirements |
| Vessel grid (3x4) | **NEW** | Grid with structural constraint rules |
| Stat aggregation system | **NEW** | Sum stats across all placed components + adjacency bonuses |
| Structural integrity rules | **NEW** | Declarative rule engine for placement constraints |
| Challenge resolution | **NEW** | Stat-check system: vessel stats vs challenge requirements |
| Resource tracking (budget, morale, integrity) | Minor extension | `ResourceBank` |
| Component removal/refit | Minor extension | UndoRedoManager adaptation for refit actions |
| Scene/UI base | Existing | `CardGameScene` + overlays |

**New engine components required:** Grid system, stat aggregation, structural constraint rules, challenge resolution system.

---

## Concept 6: "Alchemist's Almanac"

### Elevator Pitch
Manage an alchemist's workshop where you combine ingredient cards on a central workbench using a match-3-like reaction system, discovering recipes through experimentation, and brewing potions to fulfill orders from a queue of increasingly demanding customers.

### Theme/Setting
A cozy-mysterious alchemist's workshop in a fantasy village. Shelves lined with bottles, a bubbling cauldron, a well-worn workbench. Customers arrive at your door with ailments and needs. The aesthetic is warm and whimsical, not dark.

### Player Fantasy
The experimental alchemist. The thrill of discovery -- combining ingredients and seeing what happens. Each new recipe discovered is a eureka moment. You're both a scientist and a shopkeeper.

### Core Loop
1. **Forage Phase:** Draw 4 ingredient cards from the Wilds deck (Moonpetal, Firewort, Crystalmoss, Shadowroot, Spring Water, etc.). Each ingredient has an Element (Fire, Water, Earth, Air) and a Potency level (1-3).
2. **Brew Phase:** Place ingredients onto your 3x3 workbench grid. When 3+ ingredients of the same Element are adjacent (horizontal, vertical, or L-shaped), they "react" and are consumed, producing a Potion card based on the element and total potency. Unknown combinations produce "Mystery Potion" -- which may be valuable or useless.
3. **Serve Phase:** Match produced potions to customer orders in the queue. Each customer has a specific potion need and patience (turns before they leave). Fulfilled orders earn gold and unlock recipe knowledge (the mystery is revealed and added to your Recipe Book).
4. **Improve Phase:** Spend gold on workshop upgrades (Bigger Cauldron = 4x4 grid, Distillery = converts low-potency ingredients to high, Herb Garden = draw 5 instead of 4).

### Buildy/Crafty Hook
The workbench grid is a persistent puzzle space where you arrange ingredients for optimal reactions. The Recipe Book grows as you discover new combinations. The workshop upgrades make you more capable over time. You're building knowledge, capability, and a thriving business simultaneously.

### Win/Loss Condition
- **Win:** Discover all 12 base recipes and fulfill the Grand Alchemist's final order within 30 turns. Score based on recipes discovered, orders fulfilled, gold earned, and workshop upgrades acquired.
- **Loss:** Reputation reaches zero (too many customers leave unfulfilled) or you run out of ingredients with no way to forage.
- **Bonus:** Discover the 3 "Legendary Recipes" (hidden combinations not hinted at) for massive bonus points.

### Session Length
15-20 minutes per game.

### Unique Selling Point
The match-3-like reaction mechanic on a card grid is novel for a card game. The discovery/experimentation loop where you learn recipes through play (not from a menu) creates genuine eureka moments. Combines the spatial satisfaction of a puzzle game with the progression of a workshop builder. Gap #5 from genre research: process-focused crafting.

### Engine Implications

| Component | Status | Notes |
|-----------|--------|-------|
| Custom ingredient/potion cards | Minor extension | Cards with Element, Potency, visual properties |
| Workbench grid (3x3, upgradeable to 4x4) | **NEW** | Grid with match-3-like pattern detection |
| Reaction/pattern matching system | **NEW** | Detect adjacent same-element groups and resolve reactions |
| Recipe discovery system | **NEW** | Hidden recipe list revealed through experimentation |
| Customer order queue | **NEW** | Timer-based customer queue (shared need with Forge & Fortune) |
| Resource tracking (gold, reputation, ingredients) | Minor extension | `ResourceBank` |
| Workshop upgrade system | **NEW** | Persistent upgrades that modify game parameters |
| Recipe Book UI | **NEW** | Collectible/discovery UI component |
| Scene/UI base | Existing | `CardGameScene` + overlays |

**New engine components required:** Workbench grid with pattern matching, reaction system, recipe discovery, customer queue, upgrade system.

---

## Diversity Summary

| Concept | Theme | Core Mechanic | Complexity | Session Length | Primary Gap Addressed |
|---------|-------|---------------|------------|----------------|----------------------|
| Hearth & Home | Cozy cottage | Solitaire + spatial grid building | Medium | 15-20 min | Gap 1 (Visible spatial building) + Gap 3 (Solitaire + crafting) |
| Forge & Fortune | Medieval workshop | Multi-step recipe crafting pipeline | Medium-Heavy | 20-25 min | Gap 5 (Process-focused crafting) |
| Canopy | Nature/ecology | Layered vertical engine building | Medium | 12-18 min | Gap 1 variant (Layered building) |
| Main Street | Small-town Americana | Single-row adjacency synergies | Casual-Medium | 10-15 min | Gap 1 simplified (Accessible building) |
| Expedition Blueprint | Victorian exploration | Build-then-test grid design | Medium | 20-25 min | Gap 2 (Card crafting + card building) |
| Alchemist's Almanac | Fantasy workshop | Match-3 reactions + discovery | Medium | 15-20 min | Gap 5 (Process crafting) + discovery |

### Theme Diversity (6 distinct themes)
Cozy cottage, Medieval craft, Nature/ecology, Americana small-town, Victorian exploration, Fantasy alchemy

### Mechanic Diversity (6 distinct core mechanics)
Solitaire resource generation, Multi-step recipe processing, Layered vertical engine building, Single-row adjacency synergies, Build-then-stress-test, Match-3 reaction patterns

### Engine Push Assessment
All concepts require the **Grid system** and **ResourceBank** (minor extension). Beyond that:
- **Lightest engine investment:** Main Street (needs only simplified adjacency + market)
- **Moderate engine investment:** Hearth & Home, Canopy (grid + adjacency + market)
- **Heaviest engine investment:** Forge & Fortune, Alchemist's Almanac (recipe system + processing pipeline + upgrades)
- **Most novel engine requirement:** Expedition Blueprint (challenge resolution / stat-check system)
