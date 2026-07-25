# The Build: Concept Evaluation and Selection

**Date:** 2026-02-27
**Work Item:** CG-0MM4RBOUS10PJ64E
**Prerequisites:** Ideation Session (CG-0MM4RHCEL0MEJ8HL), Genre Research (CG-0MM4RAHP40H5OTZI), Engine Audit (CG-0MM4RAT5L12FHWKP)

---

## 1. Evaluation Rubric

Each concept is scored 1-5 on seven dimensions. The scoring criteria are:

| Score | Meaning |
|-------|---------|
| 5 | Exceptional -- best-in-class on this dimension |
| 4 | Strong -- clearly above average |
| 3 | Adequate -- meets expectations |
| 2 | Weak -- notable concerns |
| 1 | Poor -- fundamental problems |

### Dimension Definitions

1. **Fun Factor** -- How engaging is the core loop? Does it create interesting, meaningful decisions every turn? Is there a "just one more turn" pull?
2. **Theme Resonance** -- Is the theme compelling, well-integrated with mechanics (not pasted on), and aligned with the genre research recommendation of constructive/peaceful themes?
3. **Feasibility** -- Can it be built with the current TCE engine + reasonable extensions? Are the technical risks manageable?
4. **Engine Value** -- How much does building this game push the engine forward with broadly reusable components? Does it address the high-priority gaps from the engine audit?
5. **Scope Manageability** -- Can it be delivered incrementally? Is the MVP clearly separable from the full vision? Is the core loop testable early?
6. **Differentiation** -- How distinct is it from existing games in the market? Does it fill an identified gap from genre research?
7. **Replayability** -- Does procedural variation, combinatorial depth, or progression systems give it long-term legs?

### Weighting

All dimensions are weighted equally (1x) except:
- **Fun Factor** at 1.5x -- a game that isn't fun fails regardless of other merits
- **Feasibility** at 1.25x -- we must be able to actually build it
- **Engine Value** at 1.25x -- the primary purpose of example games is to push the engine forward

---

## 2. Scoring Matrix

### 2.1 Hearth & Home (Solitaire + Spatial Grid Building)

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Fun Factor | 4 | Tri-peaks solitaire is proven addictive (Regency Solitaire). Dual-phase loop (gather then build) creates satisfying rhythm. Risk: the two halves might feel disconnected. |
| Theme Resonance | 5 | Cozy cottage building is peak constructive theme. Matches genre research recommendation #8 perfectly. Strong emotional hook -- "my cottage." Seasons add narrative arc. |
| Feasibility | 3 | Requires new grid system, adjacency resolver, market row, AND a full solitaire implementation. The solitaire half is essentially a second game system. Most technically demanding after Forge & Fortune. |
| Engine Value | 4 | Grid system, adjacency resolver, market row, and resource bank are all high-priority reusable components. Solitaire mechanics are less reusable for non-solitaire games. |
| Scope Manageability | 3 | MVP could be "solitaire generates random resources, spend to place rooms on grid with scoring." But two separate game systems (solitaire + builder) makes incremental delivery harder. Which half do you build first? |
| Differentiation | 5 | No existing game combines solitaire resource-gathering with spatial grid building. Directly fills Gap #1 and Gap #3 from genre research. |
| Replayability | 4 | Solitaire deal variation + room card shuffling + adjacency puzzle creates good combinatorial depth. Seasonal scoring adds variety. Missing: meta-progression / unlock system (could be added). |

**Weighted Total: 4x1.5 + 5x1 + 3x1.25 + 4x1.25 + 3x1 + 5x1 + 4x1 = 6 + 5 + 3.75 + 5 + 3 + 5 + 4 = 31.75**

### 2.2 Forge & Fortune (Multi-Step Recipe Crafting Pipeline)

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Fun Factor | 4 | Multi-step crafting pipelines create genuine "factory optimization" satisfaction. Customer deadlines add tension. Risk: could feel like logistics homework if not juiced well. |
| Theme Resonance | 4 | Medieval blacksmith is compelling and thematic. "Watch raw iron become a sword" is viscerally satisfying. Slightly less universal appeal than cottage or nature themes. |
| Feasibility | 2 | Heaviest engine investment. Needs recipe system, workstation processing, upgrade system, order queue -- all new. Multi-step pipeline with intermediate products is the most complex state management of all concepts. |
| Engine Value | 4 | Recipe/crafting system and production pipeline are highly reusable for future crafting games. Upgrade system and order queue also useful. But the complexity means more risk of game-specific solutions. |
| Scope Manageability | 2 | Hard to create a satisfying MVP. A single-step recipe isn't interesting; the fun IS the multi-step pipeline. Cutting scope risks cutting the core appeal. |
| Differentiation | 4 | Fills Gap #5 (process-focused crafting). Several digital games do crafting (Factorio, Shapez), but few card games make the process visible and interactive. |
| Replayability | 3 | Customer order variation and recipe discovery provide some variety. But once recipes are memorized, optimization becomes routine. Needs roguelike elements to stay fresh. |

**Weighted Total: 4x1.5 + 4x1 + 2x1.25 + 4x1.25 + 2x1 + 4x1 + 3x1 = 6 + 4 + 2.5 + 5 + 2 + 4 + 3 = 26.5**

### 2.3 Canopy (Layered Vertical Ecosystem Building)

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Fun Factor | 3 | Ecological layering is intellectually interesting but risk of feeling passive. "Play nature cards, watch them score" may lack the active decision tension of solitaire or crafting. The constraint (canopy needs understory needs ground) could feel limiting rather than empowering. |
| Theme Resonance | 5 | Nature restoration is universally appealing, constructive, peaceful. Perfectly aligns with genre research #8. Wingspan proved ecological themes have massive audience. |
| Feasibility | 3 | Layered grid with dependency constraints is a specialized version of the grid system. Effect resolver is moderately complex. Seasonal events are manageable. Overall moderate-to-challenging. |
| Engine Value | 3 | Layered grid is a niche variant -- less broadly reusable than a general grid. Ecological effect resolver is game-specific. Contributes less to the general engine than other concepts. |
| Scope Manageability | 4 | Clear MVP: 3x5 grid, single card type per layer, simple adjacency scoring. Layer dependency is one clean rule. Easy to add complexity incrementally (more species, events, food chains). |
| Differentiation | 4 | Vertical layered dependency is novel. But overlaps with Wingspan's row-based engine building and Ark Nova's conservation theme. Not as unique as Hearth & Home or Main Street. |
| Replayability | 3 | Card draw variation provides some variety. But ecological interactions may settle into "always plant Oak above Fern" patterns quickly. Needs more discovery mechanics. |

**Weighted Total: 3x1.5 + 5x1 + 3x1.25 + 3x1.25 + 4x1 + 4x1 + 3x1 = 4.5 + 5 + 3.75 + 3.75 + 4 + 4 + 3 = 28.0**

### 2.4 Main Street (Single-Row Adjacency Synergies)

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Fun Factor | 4 | Adjacency synergies in a single row create tight, readable decisions. Proven by Luck be a Landlord. "Where do I place the bakery?" is immediately graspable. Day/night cycle adds rhythm. Event cards add surprise. Risk: 8 slots might feel too constrained for a full session. |
| Theme Resonance | 5 | Small-town Americana main street is charming, constructive, universally appealing. Everyone has a mental model of "the perfect main street." Strong emotional connection to place-making. |
| Feasibility | 5 | Lightest engine investment of all concepts. Single-row is a degenerate grid (1xN). Adjacency is left/right only. Market row is needed but simpler. Resource tracking is straightforward coins + reputation. |
| Engine Value | 3 | Simplified adjacency resolver and market row are useful but limited. Doesn't push the engine as hard as concepts needing full grids, crafting systems, or complex state. The simplicity that makes it feasible also limits engine contribution. |
| Scope Manageability | 5 | Clearest MVP of all concepts: 8-slot row, 10 business cards, left/right synergies, coin economy. Playable prototype in days. Full vision adds events, challenges, themed streets, meta-progression. |
| Differentiation | 3 | Adjacency synergies in a row exist in Luck be a Landlord (slot machine variant) and similar games. The town-building theme wrapper adds charm but the mechanic isn't novel. Less differentiated than other concepts. |
| Replayability | 3 | Market shuffle and event variety provide some replay. But 8 slots and simple synergies may lead to "solved" optimal strategies quickly. Needs larger card pool or roguelike structure to have legs. |

**Weighted Total: 4x1.5 + 5x1 + 5x1.25 + 3x1.25 + 5x1 + 3x1 + 3x1 = 6 + 5 + 6.25 + 3.75 + 5 + 3 + 3 = 32.0**

### 2.5 Expedition Blueprint (Build-Then-Test Vessel Design)

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Fun Factor | 4 | Build-then-test creates genuine tension and payoff. "Will my design survive the storm?" is compelling. Refit mechanic adds adaptation decisions. Risk: challenge resolution could feel like a coin flip if not well-designed. |
| Theme Resonance | 3 | Victorian exploration is interesting but niche. Less universally appealing than cottage, nature, or small-town themes. Slightly conflicts with genre research #8 (constructive > destructive) -- challenges imply threat/danger. |
| Feasibility | 3 | Grid system, stat aggregation, and structural constraints are moderately complex. Challenge resolution is a new system type. Refit mechanic adds state complexity. Overall moderate difficulty. |
| Engine Value | 4 | Grid system, stat aggregation, and constraint rules are broadly reusable. Challenge resolution (stat-check system) is novel and useful for any game with "build and test" mechanics. Good engine contribution. |
| Scope Manageability | 3 | MVP could be: 3x4 grid, 8 component types, 3 challenges. But the fun depends on the interplay between building and testing -- hard to test one without the other. Both systems needed from day one. |
| Differentiation | 5 | Build-then-test cycle is genuinely unique in card games. No existing card game combines spatial component placement with challenge resolution. Fills Gap #2 distinctly. |
| Replayability | 4 | Challenge card variation, component shuffling, and the "optimize for different challenges" puzzle creates strong replay. Different vessel builds viable each run. |

**Weighted Total: 4x1.5 + 3x1 + 3x1.25 + 4x1.25 + 3x1 + 5x1 + 4x1 = 6 + 3 + 3.75 + 5 + 3 + 5 + 4 = 29.75**

### 2.6 Alchemist's Almanac (Match-3 Reactions + Recipe Discovery)

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Fun Factor | 4 | Match-3 reactions on a card grid are inherently satisfying. Recipe discovery through experimentation creates eureka moments. Customer pressure adds tension. Risk: match-3 is well-trodden territory; may feel derivative. |
| Theme Resonance | 4 | Cozy alchemist workshop is appealing and constructive. "Whimsical not dark" framing works well. Slightly less universal than cottage or nature themes but strong fantasy hook. |
| Feasibility | 2 | Heaviest new-system count: workbench grid with pattern matching, reaction system, recipe discovery, customer queue, upgrade system. Pattern detection on a card grid is algorithmically complex. Grid resizing (3x3 to 4x4) adds UI complexity. |
| Engine Value | 3 | Pattern matching on a grid and reaction system are niche -- few other card games would use match-3 mechanics. Customer queue and upgrade system are somewhat reusable. Less broadly useful than grid + adjacency. |
| Scope Manageability | 2 | Match-3 pattern detection, reaction resolution, AND recipe discovery are all required for the core loop to be satisfying. Can't easily cut any of them for MVP. Complex minimum viable product. |
| Differentiation | 4 | Match-3 in a card game context is novel. Recipe discovery through experimentation is compelling. But match-3 itself is a massively crowded genre. |
| Replayability | 4 | Recipe discovery creates a strong "I want to find them all" drive. Ingredient shuffling and customer variation add variety. Workshop upgrades provide progression. |

**Weighted Total: 4x1.5 + 4x1 + 2x1.25 + 3x1.25 + 2x1 + 4x1 + 4x1 = 6 + 4 + 2.5 + 3.75 + 2 + 4 + 4 = 26.25**

---

## 3. Scoring Summary

| Rank | Concept | Weighted Score | Strengths | Weaknesses |
|------|---------|---------------|-----------|------------|
| 1 | **Main Street** | **32.0** | Most feasible, clearest MVP, charming theme, proven mechanic | Lower engine value, less differentiated, replayability concerns |
| 2 | **Hearth & Home** | **31.75** | Most differentiated, excellent theme, strong engine value | Two separate game systems, feasibility concerns, harder incremental delivery |
| 3 | **Expedition Blueprint** | **29.75** | Unique build-then-test mechanic, good engine value, strong replay | Niche theme, both systems needed from day one |
| 4 | **Canopy** | **28.0** | Beautiful theme, good scope management | Risk of passive gameplay, lower engine value, limited differentiation |
| 5 | **Forge & Fortune** | **26.5** | Satisfying crafting pipeline, good engine value | Heaviest engine investment, worst scope management, memorization risk |
| 6 | **Alchemist's Almanac** | **26.25** | Eureka moments, recipe discovery | Complex MVP, niche engine components, match-3 is crowded genre |

**Top 3 finalists:** Main Street, Hearth & Home, Expedition Blueprint

---

## 4. Deep-Dive: Top 3 Finalists

### 4.1 Main Street -- Deep Dive

#### Typical Session (Turn-by-Turn)

**Turn 1 (Morning):** Empty street. No income. Market shows: Bakery ($3), Bookshop ($4), Hardware Store ($5), Park ($2). Starting budget: $8. You buy the Bakery and place it in slot 4 (center-ish). Bakery generates base 2 foot traffic.

**Turn 2:** Bakery earns $2 income. Market refreshes, showing Diner ($4). You buy the Diner and place it in slot 5 (next to Bakery). "Food District" synergy: adjacent food businesses each get +1 foot traffic. Both now earn $3/turn.

**Turn 3:** $6 income. Market shows Flower Shop ($3). You buy it, placing in slot 3 (next to Bakery on the other side). Bakery now has two neighbors -- foot traffic is booming. Evening event: "Local Festival" -- all cultural businesses earn double this turn (you have none yet -- missed opportunity).

**Turns 4-7:** Continue filling the street, managing synergies. A "Big Box Store" event threatens to steal foot traffic from low-synergy businesses. You need to cluster synergies tightly. Week 1 scoring: decent but not thriving yet.

**Turns 8-14:** Mid-game. Street is half-full. Decisions get harder -- remaining slots must complement existing businesses. An expensive "Town Hall" ($12) appears in the market with powerful synergies for all neighbors. Can you save up?

**Turns 15-28:** Late game. Completing the street, optimizing for weekly scoring bonuses ("Cultural District," "Foodie Row," "Commerce Hub"). Event cards create drama. Final scoring tallies total reputation.

#### Biggest Design Risks

1. **Shallow decision space.** 8 slots with only left/right adjacency may not generate enough meaningful decisions for 28 turns. Mitigation: add "upgrade" actions (pay to improve an existing business), event response choices, and optional "demolish and rebuild" at a cost.
2. **Solved strategies.** Optimal placement patterns may become obvious after a few plays. Mitigation: large card pool (40+ businesses with varied synergies), market randomization, and diverse event cards that change optimal strategies.
3. **Pacing.** 28 turns at ~30 seconds each is only ~14 minutes -- may feel too light for some players but actually aligns perfectly with the 10-15 minute session target from genre research.

#### MVP vs Full Vision

**MVP (Milestone 1):**
- 8-slot street row
- 15 business cards with 3 synergy families (Food, Culture, Commerce)
- Coin economy (earn income, buy businesses)
- Left/right adjacency synergies
- Basic scoring at game end
- No events, no weekly cycles, no upgrades

**Full Vision:**
- 40+ business cards across 6+ synergy families
- Day/night cycle with different mechanics
- Weekly scoring with bonus challenges
- 20+ event cards
- Business upgrades (Bakery -> Patisserie)
- Meta-progression: unlock new business types across runs
- Themed street challenges ("Build a Foodie Street", "Build a Cultural District")
- Leaderboards per challenge

#### Engine Work Required

| Component | Effort | Reusability |
|-----------|--------|-------------|
| 1x8 grid (degenerate Grid<T>) | 1-2 days | High -- generalizes to NxM |
| Left/right adjacency resolver | 1-2 days | High -- generalizes to 4/8-directional |
| Market row (4 visible + deck) | 2-3 days | Very high -- used by most card games |
| ResourceBank (coins, reputation) | 1-2 days | Very high -- generalizes Feudalism's gems |
| Event card system | 1 day | Moderate -- game-specific but pattern is reusable |
| **Total new engine work** | **6-10 days** | |

### 4.2 Hearth & Home -- Deep Dive

#### Typical Session (Turn-by-Turn)

**Gather Round 1:** A tri-peaks solitaire layout appears. You match cards in sequence, building combos. A 5-card combo yields: 2 Wood, 1 Stone, 1 bonus Glass. Resources go to your stockpile.

**Build Round 1:** Market shows 4 room cards: Kitchen (3 Wood, 1 Stone), Bedroom (2 Wood, 1 Glass), Workshop (2 Stone, 2 Iron), Garden (1 Wood only). You can afford the Bedroom. Place it at position (2,1) on your 4x5 cottage grid. No adjacency bonuses yet.

**Gather Round 2:** New solitaire layout (different deal). Shorter combo this time -- 1 Stone, 1 Iron, 1 Wood.

**Build Round 2:** Market refreshes. Pantry available (2 Wood, 1 Stone). Buy and place at (2,2) next to Bedroom. Bedroom + Pantry synergy: +2 comfort points.

**Rounds 3-24:** Alternating solitaire gathering and room placement. Spring season ends, Summer begins -- solitaire deck now has more Stone and Iron, less Wood. Strategy shifts. Grid fills up, adjacency combos stack. A "Kitchen Wing" (Kitchen + Pantry + Dining Room all adjacent) triggers a set bonus.

**End:** 8 seasons pass. Grid has 16/20 rooms filled (didn't quite finish -- some rooms were too expensive). Final score: room synergies (48) + set bonuses (25) + seasonal bonuses (12) = 85 points. 2 stars!

#### Biggest Design Risks

1. **Dual-system coherence.** The solitaire half and the building half are essentially two different games glued by a resource bridge. Risk of one feeling like a chore to get to the other. Mitigation: make the solitaire deeply connected to building strategy (choose WHICH tri-peaks layout to attempt based on which resources you need).
2. **Solitaire implementation scope.** A full tri-peaks solitaire engine is a significant subsystem. Risk of scope creep. Mitigation: start with the simplest solitaire variant; extract as reusable engine component.
3. **Grid complexity.** 4x5 grid with 8-directional adjacency and set bonuses is a moderately complex spatial system. Mitigation: start with 4-directional adjacency only.

#### MVP vs Full Vision

**MVP (Milestone 1):**
- Simplified resource generation (draw from shuffled resource deck instead of full solitaire)
- 3x3 cottage grid (9 rooms)
- 10 room types with simple left/right/up/down adjacency bonuses
- No seasons, no set bonuses
- Basic end-game scoring

**Full Vision:**
- Full tri-peaks solitaire resource gathering
- 4x5 cottage grid (20 rooms)
- 30+ room types across 5+ categories
- 4 seasons with resource variation and seasonal scoring
- Set bonuses (Kitchen Wing, Garden Suite, etc.)
- Room upgrades (Bedroom -> Master Suite)
- Meta-progression: unlock room types and solitaire variants

#### Engine Work Required

| Component | Effort | Reusability |
|-----------|--------|-------------|
| Grid<T> system (NxM) | 2-3 days | Very high |
| 4/8-directional adjacency resolver | 2-3 days | Very high |
| Market row | 2-3 days | Very high |
| ResourceBank | 1-2 days | Very high |
| Tri-peaks solitaire subsystem | 4-6 days | Moderate -- reusable for solitaire games only |
| Season/phase timer | 1-2 days | Moderate |
| **Total new engine work** | **12-19 days** | |

### 4.3 Expedition Blueprint -- Deep Dive

#### Typical Session (Turn-by-Turn)

**Blueprint Turn 1:** Empty 3x4 vessel grid. Draw 4 components: Hull Plate (cheap, +2 Durability), Engine (needs adjacent Fuel Tank, +3 Speed), Crew Quarters (+2 Comfort, -1 Speed due to weight), Navigation Compass (+2 Science). Budget: $20. Buy Hull Plate ($3) and place at (1,1). Vessel stats: Speed 0, Durability 2, Science 0, Comfort 0.

**Blueprint Turn 2:** Draw: Fuel Tank ($4), Cannon ($6), Laboratory ($8), Cargo Hold ($5). Buy Fuel Tank, place at (2,1). Now Engine can be installed adjacent to it next turn.

**Blueprint Turn 3:** Engine still available from a previous market. Buy and place at (2,2) next to Fuel Tank. Engine activates! Speed +3. Vessel: Speed 3, Durability 2, Science 0, Comfort 0.

**Challenge 1 (Turn 4):** "Coastal Storm" -- requires Durability 4, Speed 2. You have Speed 3 (pass!) but Durability 2 (fail!). Take 2 structural damage. Lesson learned: need more hull.

**Turns 5-6 (Refit):** Buy and place more Hull Plates. Add Crew Quarters for comfort. Vessel takes shape visually.

**Challenges 2-5:** Escalating difficulty. "Uncharted Reef" tests Durability + Navigation. "Scientific Discovery" rewards Science stat. "Hostile Wildlife" tests Speed + Durability. "The Destination" tests all stats.

**End:** Completed 4/5 challenges. Score: Discovery Points (35) + Crew Morale bonus (8) + Budget remaining (4) = 47. Missed the Legendary Artifact (needed Science 8+).

#### Biggest Design Risks

1. **Challenge resolution feel.** If challenges are pure stat checks, the "test" phase becomes a passive "did I pass?" moment rather than an active experience. Mitigation: add challenge-specific decisions ("Storm approaching: divert power from Engine to Hull? Speed -2, Durability +2 this challenge only").
2. **Theme accessibility.** Victorian exploration is less immediately appealing than cottage-building or town-building. Mitigation: lean into the visual spectacle of the vessel being constructed piece by piece.
3. **Component balance.** 12 slots on a 3x4 grid with structural constraints and stat aggregation is a complex balancing challenge. If optimal builds emerge quickly, replayability suffers. Mitigation: diverse component pool with multiple viable builds.

#### MVP vs Full Vision

**MVP (Milestone 1):**
- 3x4 vessel grid
- 12 component types (hull, engine, fuel, quarters, lab, cannon, cargo, compass, sails, armor, telescope, kitchen)
- 4 stats (Speed, Durability, Science, Comfort)
- 3 challenges with stat-check resolution
- Simple budget economy
- No refit, no structural constraints

**Full Vision:**
- 25+ component types with adjacency bonuses and structural requirements
- 5 challenge types with active decisions during resolution
- Refit mechanic between challenges
- Structural integrity system (weight balance, center of gravity)
- Multiple vessel types (Ship, Airship, Rover) with different grid shapes
- Campaign: progressive expeditions unlocking components and destinations

#### Engine Work Required

| Component | Effort | Reusability |
|-----------|--------|-------------|
| Grid<T> system (NxM) | 2-3 days | Very high |
| Stat aggregation engine | 2-3 days | High -- any game with stat-based cards |
| Structural constraint rules | 2-3 days | Moderate -- uses declarative rule engine |
| Challenge resolution system | 3-4 days | Moderate -- stat-check pattern reusable |
| ResourceBank (budget, morale) | 1-2 days | Very high |
| Market row | 2-3 days | Very high |
| **Total new engine work** | **12-18 days** | |

---

## 5. Comparative Analysis

### Engine Value Comparison

| Reusable Component | Main Street | Hearth & Home | Expedition Blueprint |
|--------------------|-------------|---------------|---------------------|
| Grid<T> system | Yes (1x8) | Yes (4x5) | Yes (3x4) |
| Adjacency resolver | Yes (L/R only) | Yes (4/8-dir) | Yes (4-dir + constraints) |
| Market row | Yes | Yes | Yes |
| ResourceBank | Yes | Yes | Yes |
| Solitaire subsystem | No | Yes (niche) | No |
| Stat aggregation | No | No | Yes |
| Challenge resolution | No | No | Yes |
| Declarative rules | Minimal | Moderate | Strong |

Main Street produces the **fewest** new engine components but with the **fastest** delivery. Hearth & Home produces the **most broadly reusable** grid system (full NxM) but adds a niche solitaire subsystem. Expedition Blueprint produces the most **novel** engine components (stat aggregation, challenge resolution) and drives the strongest investment in the declarative rule engine.

### Risk-Reward Analysis

| Factor | Main Street | Hearth & Home | Expedition Blueprint |
|--------|-------------|---------------|---------------------|
| Time to playable prototype | 1-2 weeks | 3-4 weeks | 3-4 weeks |
| Risk of "not fun enough" | Medium (may feel shallow) | Low (solitaire is proven fun) | Medium (challenge feel is uncertain) |
| Risk of scope creep | Low | High (two game systems) | Medium |
| Ceiling for depth | Medium | High | High |
| Emotional resonance | High (charming) | Very high (cozy) | Medium (niche) |

---

## 6. Recommendation

### Selected Concept: Main Street

**Main Street** is recommended as the concept to develop for The Build, with specific augmentations to address its weaknesses.

### Rationale

**Why Main Street wins:**

1. **Fastest path to playable.** The entire point of spike-driven development is to get a playable game quickly and extract engine components. Main Street can have a playable core loop in 1-2 weeks versus 3-4 weeks for the other finalists. This means faster feedback, faster iteration, faster engine extraction.

2. **Clearest MVP.** An 8-slot row with adjacency synergies and a coin economy is the most separable, testable, and deliverable MVP of all six concepts. Every subsequent feature (events, upgrades, weekly cycles) is a clean increment.

3. **Lowest technical risk.** The engine work required (simplified grid, adjacency, market, resource bank) represents the four highest-priority items from the engine audit, without any game-specific exotic systems. Every component built for Main Street directly benefits future games.

4. **Theme is a strength, not a compromise.** Small-town main street building is charming, constructive, and universally appealing. It aligns perfectly with genre research findings #8 (constructive themes) and #4 (10-15 minute sessions).

5. **Proven mechanic with room to grow.** Adjacency synergies are proven by Luck be a Landlord and similar games. The mechanic works. The question is whether Main Street adds enough depth -- and the augmentations below address that.

**Why not Hearth & Home (runner-up):**

Hearth & Home scored almost identically (31.75 vs 32.0) and has the strongest theme and differentiation. However, implementing two separate game systems (tri-peaks solitaire + grid builder) nearly doubles the scope and makes incremental delivery significantly harder. The solitaire subsystem is also less reusable for the engine's broader goals. **Hearth & Home is the recommended second game** -- after Main Street has proven out the grid system, adjacency resolver, market, and resource bank, Hearth & Home can reuse all of those and "only" needs to add the solitaire subsystem.

**Why not Expedition Blueprint (third place):**

Expedition Blueprint has the most novel mechanic (build-then-test) and strong engine value. However, the Victorian exploration theme is less accessible, and the challenge resolution system is an uncertain fun factor -- it could feel like a passive stat check rather than an active experience. It also requires both systems (building + testing) to be implemented before the core loop is testable. **Expedition Blueprint is a strong candidate for a future game** once the rule engine and stat aggregation systems are more mature.

### Proposed Augmentations for Main Street

To address the identified weaknesses (lower differentiation, replayability concerns, potential shallow decision space):

1. **Expand to 10-12 slots** (from 8) to give more room for strategic depth while keeping the single-row readability.
2. **Add business upgrades** -- spend coins to upgrade Bakery -> Patisserie, increasing synergy range and income. This adds mid-game decisions and addresses the "solved strategy" risk.
3. **Roguelike run structure** -- each "run" is one street. After each run, unlock new business types from a larger pool. This adds meta-progression (genre research finding #6).
4. **Themed street challenges** -- "Build a Foodie Row," "Build a Cultural District" -- each with different scoring objectives. This multiplies replayability.
5. **Event cards with meaningful choices** -- not just "this happens" but "choose: Festival (+$3 to food businesses) OR Art Walk (+$3 to cultural businesses)." Active decisions per event.

These augmentations move Main Street from "simple adjacency game" to "lightweight roguelike town-builder with meaningful progression" while preserving the core simplicity and fast delivery.

---

## 7. Decision Summary

| | Decision |
|---|---|
| **Selected concept** | Main Street |
| **Working title** | "The Build: Main Street" |
| **Elevator pitch** | Revitalize a small town's main street by placing shops along a single row where neighboring businesses boost each other, managing customers, money, and reputation across day/night cycles in 10-15 minute roguelike runs. |
| **Core engine components** | Grid<T>, AdjacencyResolver, Market<T>, ResourceBank |
| **Estimated engine work** | 6-10 days |
| **Estimated MVP** | 2-3 weeks |
| **Runner-up (next game)** | Hearth & Home |

---

**Status:** AWAITING PRODUCER REVIEW

The producer should review and approve (or redirect) this selection before GDD work begins. Key decision points for the producer:

1. Is Main Street the right choice, or does another concept better serve the project's goals?
2. Are the proposed augmentations (expanded slots, upgrades, roguelike structure, themed challenges) aligned with the vision?
3. Should any aspects of the runner-up concepts be incorporated?
