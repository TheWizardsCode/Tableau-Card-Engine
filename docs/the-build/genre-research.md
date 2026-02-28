# Genre Research: "The Build" -- Buildy/Crafty/Simulation Card Game

**Date:** 2026-02-27
**Purpose:** Comprehensive genre research to inform the design of "The Build," a single-player card game in the buildy/crafty/simulation genre, built on the Tableau Card Engine (Phaser 3, TypeScript).

---

## Table of Contents

1. [Game Survey](#game-survey)
2. [Mechanics Catalogue](#mechanics-catalogue)
3. [Theme Catalogue](#theme-catalogue)
4. [Gap Analysis](#gap-analysis)
5. [Key Takeaways for The Build](#key-takeaways-for-the-build)

---

## Game Survey

### 1. Stacklands

- **Platform:** PC (Steam), Mobile
- **Developer:** Sokpop Collective
- **Release:** April 2022
- **Reception:** Overwhelmingly Positive (95% of ~28K reviews)

**Description:** A village builder where everything is a card on a table. You drag and stack cards to collect resources, build structures, craft items, and fight creatures. Villagers are cards, resources are cards, buildings are cards -- the entire game state is a physical card tableau.

**Core Mechanics:**
- **Card stacking as interaction** -- dragging one card onto another triggers effects (Villager + Berry Bush = Berries; 2 Wood + 1 Stone + Villager = House)
- **Timed rounds ("Moons")** -- each round has a time limit during which cards produce resources; at the end, villagers must eat or starve
- **Card pack purchasing** -- sell surplus cards for coins to buy themed booster packs (Cooking, Farming, Building, etc.)
- **Idea discovery** -- finding new card combinations unlocks "Idea Cards" that serve as persistent recipes
- **Spatial organisation** -- the table is freeform; you organise production chains physically
- **Auto-combat** -- villagers bumping into enemy cards triggers automatic battles; equipment cards modify stats

**What Makes It Unique/Compelling:**
Stacklands' genius is its **literalism**: the metaphor IS the mechanic. There is no abstraction layer between "I have a village" and "I have cards on a table." Every entity is tangible, movable, stackable. The game feels like playing with physical cards on a desk. This directness is rare -- most builders use cards as UI for invisible systems, but here the cards ARE the system.

**Pros:**
- Incredibly intuitive interaction model (drag + drop = everything)
- Satisfying spatial organisation of production chains
- Deep emergent complexity from simple card-on-card rules
- Short session length (5-7 hours total; individual moons are ~3-5 minutes)
- Low cognitive overhead -- easy to learn, hard to master
- Strong sense of building something visible (your table fills up with your creation)
- Workshop support extends longevity

**Cons:**
- Late-game table management becomes cluttered and frustrating
- Combat is shallow and automated -- feels like an afterthought
- Limited strategic depth once all ideas are discovered
- No meta-progression between runs (base game)
- Difficulty spikes can feel random (getting attacked before ready)
- Freeform spatial layout lacks structure -- can feel messy rather than "built"

**Relevance to The Build:** **CRITICAL REFERENCE.** Stacklands is the closest existing game to what "The Build" could be. It proves that "cards as physical objects on a table representing a building/crafting process" works brilliantly. Key lessons: the drag-and-stack interaction is gold, but late-game organisation needs better tooling, and the sense of "building something specific" could be much stronger (Stacklands' village is emergent, not designed).

---

### 2. Solitairica

- **Platform:** PC (Steam), Mobile (iOS/Android)
- **Developer:** Righteous Hammer Games
- **Release:** May 2016
- **Reception:** Mostly Positive (78% of ~560 reviews)

**Description:** An RPG-solitaire hybrid where you clear enemy card columns using traditional solitaire matching (one above or below), but with four schools of magic (Attack, Defense, Agility, Willpower) providing spells that destroy, reveal, or manipulate cards. Each cleared column drops loot; defeated enemies yield gold for shop purchases.

**Core Mechanics:**
- **Solitaire combat** -- match cards one above/below the current card to remove enemy columns
- **Energy collection** -- matching cards generates coloured energy used to cast spells
- **Four spell schools** -- each class starts weighted toward specific energies, enabling different playstyles
- **Roguelike progression** -- permadeath runs with increasing enemy difficulty; between-run currency unlocks new classes and upgrades
- **Item/spell shop** -- between battles, spend gold on items and spells that persist for the run
- **Deck manipulation** -- Ace, King, Queen cards in your deck provide powerful one-time effects

**What Makes It Unique/Compelling:**
The insight is that solitaire's "can I clear this?" tension maps beautifully onto RPG combat's "can I survive this fight?" Both are about sequential decision-making under uncertainty. The spell system transforms passive solitaire into active problem-solving.

**Pros:**
- Familiar solitaire base makes it accessible
- Class variety provides genuine replayability
- Good difficulty curve within a run
- Spells add meaningful decisions to a traditionally luck-heavy game
- Quick sessions (individual battles ~3-5 minutes)

**Cons:**
- Luck-dependent -- bad card draws can make runs unwinnable
- Limited visual feedback for builds; hard to "see" your progress
- RNG can feel punishing rather than interesting
- No building/crafting feel -- purely combat-focused
- Art style is functional but not distinctive

**Relevance to The Build:** Moderate. Solitairica demonstrates how to layer meaningful decisions onto simple card-matching foundations, and how roguelike progression can extend simple card games. However, it has zero building/crafting feel -- it's combat through and through. The lesson is about **structure**: solitaire-like foundations + layered systems = depth.

---

### 3. Regency Solitaire

- **Platform:** PC (Steam), Mobile
- **Developer:** Grey Alien Games
- **Release:** May 2015
- **Reception:** Overwhelmingly Positive (96% of ~880 reviews)

**Description:** A narrative solitaire game set in Regency England. You play tri-peaks solitaire through 180 levels while following a romantic storyline. Currency earned from card play is spent on decorating a ballroom, which unlocks gameplay power-ups like wildcards, shuffles, and jokers.

**Core Mechanics:**
- **Tri-peaks solitaire** -- clear cascading card layouts by matching one above/below
- **Combo chains** -- consecutive matches build multiplier chains for bonus currency
- **Power-up unlocks** -- spend earned coins on ballroom decorations, each tied to a gameplay upgrade (e.g., adding a wildcard to your deck, a shuffle ability, bonus time)
- **Level progression** -- 180 hand-designed levels with escalating complexity
- **Visual building** -- the ballroom visually transforms as you unlock items
- **Narrative wrapper** -- story chapters between level sets provide motivation

**What Makes It Unique/Compelling:**
The **building-as-progression** loop is the key innovation. You're not just playing solitaire -- you're decorating a ballroom, and each decoration tangibly changes your gameplay capabilities. This creates a feedback loop where *building* improves your *card play* which earns you more *building resources*. The narrative provides surprisingly effective motivation to continue.

**Pros:**
- Extremely polished and accessible
- Building-as-progression loop is satisfying and well-paced
- Hand-designed levels are consistently interesting
- Strong aesthetic commitment (art, music, narrative all reinforce theme)
- Good session flexibility (play one level or twenty)
- Power-up system adds real strategic choice to solitaire

**Cons:**
- Limited strategic depth -- most levels have a "correct" approach
- Building choices are linear (unlock order is mostly fixed)
- No replayability once completed
- Building is cosmetic/functional but not spatial or creative
- The "building" is selecting from a menu, not designing or placing

**Relevance to The Build:** **HIGH RELEVANCE.** Regency Solitaire proves that "play cards to earn resources to build something, and the building improves your card-play" is a powerful, satisfying loop. It's the closest model for how "The Build" might structure its core loop. The gap is that Regency's building is menu-based and linear -- there's a huge opportunity for spatial, creative building with real card mechanics.

---

### 4. Card City Nights / Card City Nights 2

- **Platform:** PC (Steam), Mobile
- **Developer:** Ludosity
- **Release:** CCN1: Jan 2014; CCN2: Oct 2017
- **Reception:** CCN1: Very Positive; CCN2: Very Positive

**Description:** A single-player card game set in a quirky city where you collect and play cards on an 3x3 grid. Cards have connection arrows on their edges; linking three arrows forms a "combo" that activates the connected cards. CCN2 expanded to larger grids and added more card types.

**Core Mechanics:**
- **Grid placement** -- play cards onto a shared 3x3 (or 4x4 in CCN2) grid
- **Arrow connections** -- each card has arrows on some edges; matching arrows between adjacent cards forms links
- **Combo activation** -- connecting 3+ arrows in a chain activates all linked cards' abilities
- **Card collecting** -- explore the city, win matches, buy/trade cards
- **Attack/defend** -- some cards deal damage, some protect, some have special effects
- **Opponent AI** -- face a variety of themed opponents with different strategies

**What Makes It Unique/Compelling:**
The spatial connection mechanic is genuinely novel. It's not about card values or suit matching -- it's about physical arrangement and orientation. This creates a puzzle-like quality where you're thinking about geometry and adjacency, not probability.

**Pros:**
- Unique spatial mechanic (arrow connections) is satisfying and easy to understand
- Charming art style and world
- Collecting cards throughout the city is engaging
- Puzzle-like card play rewards spatial thinking
- Low barrier to entry

**Cons:**
- Strategic depth plateaus quickly
- Card pool is relatively small
- Single-player campaign is short
- The city exploration is thin -- it's mostly a sequence of card battles
- No building or crafting element beyond card collection
- Opponent variety is limited

**Relevance to The Build:** Moderate. The spatial placement + connection mechanic is directly relevant -- it demonstrates how card placement on a grid can create emergent interactions through adjacency. For a building game, this kind of "cards connect and interact based on physical layout" is a natural fit (e.g., rooms connecting to corridors, pipes linking to machines).

---

### 5. Mystic Vale (Digital)

- **Platform:** PC (Steam), Tabletop
- **Developer:** Nomad Games (digital); AEG (physical)
- **Release:** Digital: 2022; Physical: 2016
- **Reception:** Mixed to Positive

**Description:** A deckbuilder with a unique "card crafting" system. Instead of adding whole cards to your deck, you purchase transparent plastic "advancements" that slide into card sleeves, literally building up your cards over time. Each card can hold up to three advancement strips (top, middle, bottom).

**Core Mechanics:**
- **Card crafting** -- purchase advancement strips and physically insert them into existing cards
- **Push-your-luck draw** -- flip cards from your deck one at a time; too many "decay" symbols and you spoil (bust)
- **Mana economy** -- played cards generate mana used to buy new advancements and vale cards
- **Victory point race** -- earn VPs through card effects and purchased vale cards
- **Combo building** -- carefully crafted cards synergise their top/middle/bottom strips

**What Makes It Unique/Compelling:**
The "card crafting" is the entire hook. In most deckbuilders, you add discrete cards. In Mystic Vale, you *modify existing cards*, literally building them up with layers. This creates a much more personal connection to individual cards -- you designed each one. The push-your-luck draw adds genuine tension to every turn.

**Pros:**
- Card crafting system is genuinely innovative and deeply satisfying
- Each card feels "yours" -- personal investment in individual cards
- Push-your-luck draw creates constant tension
- Strong emergent combos from layered card construction
- Replayability from the combinatorial explosion of advancement combinations

**Cons:**
- Complexity cliff -- hard to teach, especially the digital version
- Digital version loses the tactile magic of the physical card sleeves
- Theme (nature/druid) is generic and underdeveloped
- Solo mode (vs AI) is not as compelling as multiplayer
- UI in digital version is clunky
- Late game becomes samey once optimal strategies emerge

**Relevance to The Build:** **HIGH RELEVANCE for mechanics.** Mystic Vale's card crafting proves that "building up individual cards over time" is deeply satisfying and creates personal attachment. For "The Build," this suggests a mechanic where you don't just play cards but *improve* them -- upgrading a basic Workshop card into an Advanced Workshop by adding enhancement strips/overlays. The "building the card IS building the thing" metaphor is powerful.

---

### 6. Terraforming Mars (Solo Mode / Digital)

- **Platform:** PC (Steam), Mobile, Tabletop
- **Developer:** Asmodee Digital (digital); Stronghold Games (physical)
- **Release:** Digital: Oct 2018; Physical: 2016
- **Reception:** Mixed (digital); Highly acclaimed (physical)

**Description:** A heavy engine-building card game where you play as a corporation raising Mars' temperature, oxygen, and ocean levels. Over multiple generations, you play project cards that generate resources, produce income, and increase global parameters. Solo mode gives you 14 generations to fully terraform.

**Core Mechanics:**
- **Engine building** -- play cards that generate ongoing resources each generation
- **Multi-resource economy** -- MegaCredits, Steel, Titanium, Plants, Energy, Heat -- each with distinct uses
- **Card drafting** -- purchase cards from a dealt hand each generation
- **Milestone/Award racing** -- compete for bonus VPs from specific achievements
- **Tableau building** -- played cards remain in front of you as a growing engine
- **Global parameter tracking** -- shared Mars board tracks temperature, oxygen, oceans
- **Generation timer** -- 14 generations in solo mode creates pacing pressure

**What Makes It Unique/Compelling:**
The sheer scope of the engine you build is unmatched. By late game, you have 20-30 cards in your tableau, each producing or converting resources in cascading chains. The feeling of a well-oiled economic machine is incredibly satisfying. The theme is also powerful -- you're literally watching a dead planet come alive.

**Pros:**
- Deepest engine-building in any card game -- genuinely complex economic chains
- Enormous card variety (200+ unique project cards)
- Theme is spectacular and well-integrated with mechanics
- Solo mode is genuinely good -- the 14-generation timer creates real tension
- Massive replayability from card pool and corporation variety
- Watching your tableau grow IS watching Mars transform

**Cons:**
- Very long sessions (60-90 minutes solo, longer multiplayer)
- Steep learning curve -- many interconnected systems
- Early game can feel slow (engine needs time to build)
- Digital version has clunky UI and performance issues
- Heavy luck in card draw can determine viability of strategies
- Solo mode is "beat the clock" rather than an interesting opponent

**Relevance to The Build:** High for understanding engine-building depth, but serves as a cautionary tale for session length and complexity. TM's 60-90 minute solo sessions are outside "The Build's" target range (5-30 min). The key lesson: cascading resource chains feel amazing, but need careful scoping to fit shorter sessions. The "watching something transform" satisfaction is directly relevant.

---

### 7. Wingspan (Solo Mode / Digital)

- **Platform:** PC (Steam), Mobile, Switch, Tabletop
- **Developer:** Monster Couch (digital); Stonemaier Games (physical)
- **Release:** Digital: Sep 2020; Physical: 2019
- **Reception:** Very Positive (digital)

**Description:** An engine-building card game themed around bird-watching and habitat management. You play bird cards into three habitat rows (Forest, Grassland, Wetland), where each row specialises in a different action (gain food, lay eggs, draw cards). As rows fill, actions become more powerful through the birds' abilities.

**Core Mechanics:**
- **Row-based engine building** -- three habitat rows, each growing more powerful as birds are added
- **Action selection** -- each turn, choose one of four actions (play bird, gain food, lay eggs, draw cards)
- **Cascading activation** -- when you take a row action, ALL birds in that row activate right-to-left
- **Food as cost** -- each bird requires specific food types to play
- **Egg as currency/VP** -- eggs are both a cost and victory points
- **Round bonuses** -- each of 4 rounds has a scoring objective
- **Automa (solo AI)** -- card-driven opponent that takes semi-random actions

**What Makes It Unique/Compelling:**
The "row activation cascade" is brilliant for engine building. Each bird you add to a row makes EVERY action in that row more powerful, creating satisfying compound growth. The nature theme is deeply researched and appealing -- every bird is real, with accurate art and facts. The game makes you feel like a curator building a living ecosystem.

**Pros:**
- Elegant engine-building -- each bird addition amplifies the whole row
- Theme is beautifully integrated (real birds, real habitats)
- Excellent pacing -- 4 rounds with decreasing actions creates natural arc
- Digital version is very polished
- Satisfying visual growth as habitats fill with birds
- Automa works well for solo play

**Cons:**
- Limited player interaction (even in multiplayer; solo is even more solitary)
- Strategic depth is moderate -- experienced players converge on similar strategies
- "Automa" opponent is more a pacing mechanism than a challenging adversary
- Engine can feel slow to start; round 1 is often boring
- Bird powers can be highly luck-dependent
- 45-60 minute solo sessions are on the longer side

**Relevance to The Build:** High. Wingspan's row-based engine building, where each added card amplifies the whole, is an elegant model for a building game. Imagine rows representing different aspects of a construction project (Foundation, Structure, Finishing), where each card added to a row makes all cards in that row more effective. The "fill a space and watch it come alive" satisfaction directly maps to building.

---

### 8. Cultist Simulator / Book of Hours

- **Platform:** PC (Steam)
- **Developer:** Weather Factory
- **Release:** CS: May 2018; BoH: Aug 2023
- **Reception:** CS: Very Positive; BoH: Very Positive

**Description:** Cultist Simulator is a narrative card game played on a tabletop surface where you drag cards into "verb slots" that process them over time -- studying a book yields knowledge, combining ingredients yields a ritual, sending a follower on a mission yields consequences. Book of Hours applies the same engine to running a library/occult bookshop.

**Core Mechanics:**
- **Verb slots** -- persistent processing stations on the table that accept card inputs and produce outputs after a timer
- **Card-as-everything** -- health, followers, books, ingredients, emotions, time, money are all cards
- **Real-time (pausable)** -- verbs process continuously; multiple things happen simultaneously
- **Discovery through experimentation** -- no tutorials; you learn by trying combinations
- **Narrative emergence** -- stories emerge from the intersection of mechanical card processing
- **Decay and urgency** -- some cards expire; resource management under time pressure

**What Makes It Unique/Compelling:**
The "verb slot" mechanic is revolutionary for card games. Instead of a turn structure, you have persistent processing stations that you feed cards into. This creates a feeling of running a complex workshop or laboratory where multiple things are happening at once. The lack of explicit guidance means every discovery feels earned.

**Pros:**
- Genuinely novel card interaction model (verb slots + timers)
- Incredible sense of mystery and discovery
- Rich narrative emerges from mechanical experimentation
- "Cards as everything" creates a unified, elegant system
- Book of Hours' library management is deeply satisfying crafty gameplay
- Strong atmosphere and writing

**Cons:**
- Deliberately opaque -- many players bounce off hard
- No clear fail states until too late (Cultist Simulator especially)
- Repetitive mid-game once systems are understood
- Real-time element adds stress rather than engagement for many
- Very long session length (runs are 2-10+ hours)
- Steep learning curve with no hand-holding

**Relevance to The Build:** **HIGH RELEVANCE for interaction model.** The "verb slot" concept -- persistent processing stations on a table that you feed cards into -- is a perfect fit for a building/crafting game. Imagine a Sawmill slot that takes Wood cards and produces Lumber over time, or a Forge that takes Metal + Blueprint and outputs Equipment. Book of Hours specifically shows how this works for a crafty/curating game. The key lesson is that this model needs better onboarding and shorter sessions than Weather Factory provides.

---

### 9. Luck be a Landlord

- **Platform:** PC (Steam), Mobile
- **Developer:** TrampolineTales
- **Release:** Early Access 2021, Full Release 2023
- **Reception:** Very Positive (85%+)

**Description:** A slot machine roguelike where you spin reels of symbols and try to earn enough rent to avoid eviction. Between spins, you add new symbols and items that create synergies -- e.g., a Cat adjacent to a Mouse earns bonus coins; Flowers adjacent to Bees produce Honey.

**Core Mechanics:**
- **Slot machine spins** -- symbols land randomly on a grid; adjacency and symbol type determine payouts
- **Symbol drafting** -- between spins, choose new symbols to add to the reel
- **Item purchases** -- spend coins on items that modify symbol behaviour globally
- **Adjacency synergies** -- most value comes from symbols interacting with neighbours
- **Escalating rent** -- each round's rent target increases, forcing exponential growth
- **Removal options** -- strategically remove symbols to increase density of synergies

**What Makes It Unique/Compelling:**
The slot machine metaphor is brilliant because it makes the randomness feel *thematic* rather than frustrating -- of course a slot machine is random. The synergy web between symbols becomes incredibly deep, and "building" your reel set is essentially building a machine. The escalating rent creates perfect pacing pressure.

**Pros:**
- Extremely satisfying synergy building
- Perfect session length (~15-25 minutes per run)
- Symbol interactions are learnable and deep
- "Building a machine" feel from curating your symbol set
- Strong replayability from different symbol/item combinations
- Visual feedback when synergies fire is excellent
- Low cognitive overhead, high strategic depth

**Cons:**
- Can feel like you're watching rather than playing (spin, watch, repeat)
- RNG can completely brick a run with bad symbol placement
- Theme is thin (landlord eviction is a bit grim)
- No persistent building -- each run starts from scratch
- Mid-game can feel solved once core synergy is established
- Symbol pool gets predictable after many runs

**Relevance to The Build:** High for the synergy model. LbaL demonstrates that adjacency-based synergies between elements on a grid create compelling "building" feelings even without explicit building mechanics. For "The Build," this validates the idea of a spatial card layout where adjacency matters. The rent escalation is also a good pacing model -- external pressure that forces you to build efficiently.

---

### 10. Inscryption

- **Platform:** PC (Steam), PS4/PS5, Switch
- **Developer:** Daniel Mullins Games
- **Release:** October 2021
- **Reception:** Overwhelmingly Positive (96% of ~130K reviews)

**Description:** A card-based odyssey blending deckbuilding roguelike, escape-room puzzles, and psychological horror. In Act 1 (the most relevant act), you play a Leshy-style card game where you draft woodland creature cards, sacrifice them to play stronger ones, and navigate a branching map -- but you can also stand up from the table, explore a cabin, solve puzzles, and find items that affect the card game.

**Core Mechanics:**
- **Lane-based combat** -- creatures placed in lanes attack opposing lane; damage dealt to the player tips a scale
- **Sacrifice system** -- play powerful cards by sacrificing existing ones (blood cost)
- **Card crafting** -- combine cards at specific locations to merge sigils (abilities)
- **Escape room layer** -- the card game exists within a larger puzzle-solving environment
- **Meta-narrative** -- the game itself is a mystery about the nature of the cards
- **Totem crafting** -- combine a creature type with a sigil to buff all creatures of that type
- **Map navigation** -- choose paths with card drafts, shops, or special events

**What Makes It Unique/Compelling:**
Inscryption's card crafting -- merging sigils from one card onto another at the Mycologist -- is deeply relevant to "building." You're literally constructing custom cards. The sacrifice system also creates interesting resource tension (destroy something you built to build something better). The escape room layer proves that card games can exist within a larger context.

**Pros:**
- Card crafting (sigil transfer) is deeply satisfying
- Sacrifice mechanic creates meaningful resource decisions
- Atmosphere and narrative are unmatched
- The feeling of "breaking" the card game with powerful custom cards is incredible
- Multiple card systems keep the experience fresh
- Strong visual identity

**Cons:**
- Not replayable in a traditional sense (narrative-driven)
- Card crafting is limited to specific locations (not freely available)
- Acts 2 and 3 move away from the best mechanics
- Heavy reliance on narrative means the card game alone can't stand
- Balance is intentionally broken in the player's favour (by design, but limits strategic depth)
- Session length is the full game (~8-12 hours)

**Relevance to The Build:** High for card crafting specifically. Inscryption proves that modifying/combining cards (transferring abilities, merging entities) is one of the most satisfying things you can do in a card game. For "The Build," this suggests a system where you can combine/upgrade cards -- merge two basic materials into an advanced one, or attach an enchantment card to a structure card.

---

### 11. Balatro

- **Platform:** PC, Console, Mobile
- **Developer:** LocalThunk
- **Release:** February 2024
- **Reception:** Overwhelmingly Positive (98% of ~185K reviews)

**Description:** A poker roguelike deckbuilder where you play poker hands to score chips and beat escalating blinds. Between rounds, acquire Joker cards that modify scoring rules, Tarot cards that enhance playing cards, Planet cards that level up hand types, and Vouchers that provide permanent buffs.

**Core Mechanics:**
- **Poker hand scoring** -- play standard poker hands (pair, straight, flush, etc.) with chips + multiplier
- **Joker synergy building** -- up to 5 Joker slots; each Joker modifies scoring in unique ways
- **Card enhancement** -- Tarot cards add suits, change values, add foil/holographic/polychrome modifiers
- **Hand type leveling** -- Planet cards permanently level up specific hand types
- **Escalating blinds** -- exponentially increasing score targets force exponential engine growth
- **Deck manipulation** -- add, remove, and modify your 52-card deck
- **Shop economy** -- spend earned dollars on new Jokers, packs, and vouchers

**What Makes It Unique/Compelling:**
Balatro achieves something remarkable: it makes poker feel like building a machine. The Joker synergies transform a familiar card foundation into an engine-building game. When your carefully curated set of Jokers fires off a cascade of multipliers, it produces the same satisfaction as watching a Rube Goldberg machine work. The *building* is happening in your Joker loadout, your card modifications, and your hand-type investments.

**Pros:**
- Uses universally familiar poker as foundation -- zero teaching cost for base mechanic
- Synergy depth is extraordinary; hundreds of viable builds
- Perfect session length (~20-40 minutes per run)
- Incredible "juice" -- visual/audio feedback when combos fire is phenomenal
- Meta-progression (unlock new Jokers, Decks) extends replayability enormously
- Single-player only by design -- solo experience is the primary design target
- Minimal art requirements -- pixel art + CRT aesthetic is achievable for small teams

**Cons:**
- No tangible "built thing" -- your creation exists only as a score and a Joker layout
- Heavily abstract -- the "building" is invisible system optimisation
- Some runs feel determined by early Joker availability
- Exponential scaling means late blinds can feel arbitrary
- Poker knowledge gives significant advantage (not everyone has it)
- Can feel repetitive once meta-strategies are learned

**Relevance to The Build:** **CRITICAL REFERENCE** for its design philosophy and production values, not for its mechanics directly. Balatro proves that a single-developer card game with familiar foundations, deep synergies, excellent juice, and single-player-first design can be a massive commercial hit. It also shows that "building an invisible engine" satisfies the builder impulse for many players. The lesson for "The Build": you can aim for Balatro-level polish and synergy depth, but differentiate by making the built thing *visible and tangible*.

---

### 12. Meteorfall: Krumit's Tale

- **Platform:** PC (Steam), Mobile (iOS/Android)
- **Developer:** Slothwerks
- **Release:** October 2020
- **Reception:** Very Positive

**Description:** A roguelike deckbuilder played on a 3x3 grid. Cards appear face-down and face-up on the grid; you swipe to take or discard them, managing a hand of cards that you play onto the grid to fight monsters, collect loot, and build your deck. The grid itself is the dungeon.

**Core Mechanics:**
- **Grid-as-dungeon** -- a 3x3 grid where monster cards, treasure cards, and item cards appear
- **Swipe to manage** -- swipe right to take, left to discard; hand management is key
- **Play cards onto grid** -- equipment, spells, and potions are played onto grid spaces
- **Tile-based progression** -- clearing the grid advances the dungeon
- **Simplified deckbuilding** -- small deck sizes (10-15 cards) make every card matter
- **Character abilities** -- each hero has unique mechanics (crafting, summoning, etc.)

**What Makes It Unique/Compelling:**
The grid-as-dungeon concept is clever -- the physical card layout IS the game world. Removing a monster from position (2,1) isn't just abstract combat, it's "clearing that room." The simplification of deckbuilding (tiny decks, binary take/discard decisions) keeps sessions fast and decisions meaningful.

**Pros:**
- Very fast sessions (10-15 minutes)
- Every decision matters due to small deck size
- Grid layout creates spatial awareness
- Accessible and mobile-friendly
- Character variety provides replayability

**Cons:**
- Strategic depth is limited compared to deeper deckbuilders
- Grid is small -- spatial element is minimal
- Art and presentation are functional but uninspired
- No persistent building or crafting between runs
- Can feel repetitive quickly
- Limited content

**Relevance to The Build:** Moderate. The "grid-as-world" concept is relevant -- if the grid is a building site rather than a dungeon, the same spatial logic applies. The tiny deck / fast decision model is good for mobile-friendly, short-session play. Shows that you can make a satisfying card game on a 3x3 grid.

---

### 13. Ancient Enemy (Bonus -- Grey Alien Games)

- **Platform:** PC (Steam)
- **Developer:** Grey Alien Games (same as Regency Solitaire)
- **Release:** April 2020
- **Reception:** Very Positive

**Description:** A solitaire RPG from the Regency Solitaire creators. Clear solitaire card layouts to charge combat abilities, then use those abilities to fight monsters on a parallel combat screen. Loot and experience power up your character.

**Core Mechanics:**
- **Solitaire-powers-combat** -- clearing cards charges abilities; abilities deal damage or buff
- **Dual-screen gameplay** -- solitaire tableau + RPG combat happening simultaneously
- **Skill trees** -- level up and choose between specialisations
- **Equipment loadout** -- found gear changes available abilities
- **Combo chains** -- long solitaire chains generate bonus energy

**What Makes It Unique/Compelling:**
It's the logical evolution of Regency Solitaire's "play cards to power up something else" loop, but pointed at combat instead of building. Demonstrates that the solitaire-as-resource-generator model works for multiple output types.

**Pros:**
- Polished execution of solitaire + RPG hybrid
- Skill specialisation adds build variety
- Good session pacing
- Equipment creates meaningful choices

**Cons:**
- Combat can feel disconnected from solitaire (two separate games)
- Strategic depth is limited
- Linear progression
- Theme is generic fantasy

**Relevance to The Build:** Moderate. Reinforces the Regency Solitaire lesson but with less building relevance. The "solitaire charges abilities" model could translate to "solitaire charges construction progress."

---

### 14. Luck be a Landlord (covered above as #9)

---

### Additional Notable Mentions

**Dorfromantik** (tile-laying village builder): Not a card game per se, but places hexagonal tiles to build a landscape. Extremely relevant for the "feel" of building something beautiful piece by piece. Overwhelmingly Positive (97%). Demonstrates that building without combat or narrative can be deeply satisfying if the building itself is the reward.

**Card Survival: Tropical Island**: A survival game played entirely through cards. Every action, resource, and crafting recipe is card-based. Cards represent your body, environment, tools, and food. Very clunky UI but proves cards can represent complex survival/crafting systems.

**Slay the Spire**: The genre-definer for roguelike deckbuilders. Not a building game, but its influence on every game in this survey is enormous. Key lessons: map navigation, reward pacing, synergy depth, meta-progression.

---

## Mechanics Catalogue

### Resource Mechanics

| Mechanic | Description | Games Using It | Notes |
|---|---|---|---|
| **Multi-resource economy** | Multiple distinct resource types with different uses | TM, Wingspan, Stacklands, Cultist Sim | Creates interesting conversion decisions; 3-5 resource types is the sweet spot |
| **Resource conversion chains** | Transform basic resources into advanced ones | TM, Stacklands, Cultist Sim, Card Survival | Deeply satisfying when visible; the "factory chain" feel |
| **Push-your-luck gathering** | Risk/reward resource collection | Mystic Vale, Solitairica | Adds tension to gathering phases |
| **Coins-as-meta-resource** | Universal currency to buy specific resources/cards | Stacklands, Solitairica, Balatro, LbaL | Provides a universal conversion mechanism |
| **Resource decay/consumption** | Resources expire or must be spent to maintain things | Stacklands (food), Cultist Sim (health), TM (heat) | Creates urgency and prevents hoarding |
| **Income/production cycles** | Resources generated automatically each round/turn | TM, Wingspan, Stacklands | Core engine-building mechanic; "your stuff makes stuff" |
| **Storage limits** | Caps on how much of a resource you can hold | TM (production tracks), Wingspan (egg limits) | Forces spending decisions; prevents analysis paralysis |
| **Selling/trading** | Convert unwanted resources to universal currency | Stacklands, Balatro, TM | Provides flexibility and prevents dead resources |

### Building/Crafting Mechanics

| Mechanic | Description | Games Using It | Notes |
|---|---|---|---|
| **Recipe crafting** | Combine specific inputs to produce a specific output | Stacklands, Cultist Sim, Card Survival | Most intuitive crafting model; "2 Wood + 1 Stone = House" |
| **Card crafting/modification** | Modify existing cards by adding components | Mystic Vale, Inscryption, Balatro (Tarots) | Most satisfying when the card *visually* changes |
| **Tableau building** | Permanent cards placed in front of you forming a persistent engine | TM, Wingspan, Balatro (Jokers) | The "built thing" is your tableau; needs visual payoff |
| **Spatial placement** | Where you place cards matters (adjacency, position, orientation) | CCN, LbaL, Meteorfall, Dorfromantik | Creates emergent interactions from physical arrangement |
| **Blueprint/idea system** | Recipes must be discovered before they can be used | Stacklands (Ideas), Cultist Sim | Gives sense of progression and discovery |
| **Building-as-progression** | Constructed things unlock new gameplay capabilities | Regency Solitaire, Stacklands | Powerful feedback loop: build to play better to build more |
| **Verb slot processing** | Place cards into processing stations that transform them over time | Cultist Sim, Book of Hours | Most "factory-like" mechanic; ideal for crafting games |
| **Upgrade tiers** | Cards/buildings can be upgraded through multiple levels | Regency Solitaire, TM (upgraded actions) | Provides sense of investment and growth in individual things |

### Card Flow Mechanics

| Mechanic | Description | Games Using It | Notes |
|---|---|---|---|
| **Deck draw** | Draw cards from a shuffled deck | Solitairica, Balatro, TM, Wingspan | Creates controlled randomness |
| **Booster pack purchase** | Buy themed packs of cards | Stacklands, CCN | Exciting opening moments; themed packs guide strategy |
| **Solitaire matching** | Match cards by sequential value (one above/one below) | Solitairica, Regency Solitaire, Ancient Enemy | Universally understood; good for casual audiences |
| **Hand management** | Limited hand size; choose what to play/discard | TM, Wingspan, Balatro, Meteorfall | Core tension: which cards to keep, which to let go |
| **Permanent tableau** | Played cards stay in play permanently | TM, Wingspan, Stacklands | Creates the "built thing" feeling |
| **Card sacrifice/destruction** | Destroy cards to power other effects | Inscryption, Balatro (discard for money) | Creates interesting loss-to-gain decisions |
| **Deck manipulation** | Add, remove, or modify cards in your deck | Balatro, Solitairica, Mystic Vale | Gives agency over randomness |
| **Freeform placement** | Cards placed anywhere on an open surface | Stacklands, Cultist Sim | Most physical-feeling; needs spatial organisation tools |
| **Grid placement** | Cards placed on a structured grid | CCN, LbaL, Meteorfall | More structured than freeform; easier to design adjacency rules |

### Progression Mechanics

| Mechanic | Description | Games Using It | Notes |
|---|---|---|---|
| **Roguelike runs** | Permadeath; each run starts fresh with some meta-progression | Balatro, Solitairica, Inscryption, Meteorfall, LbaL | Great for replayability; session-length-friendly |
| **Meta-unlocks** | Persistent unlocks between runs | Balatro, Solitairica, LbaL | Extends longevity; gives "one more run" motivation |
| **Campaign/chapter progression** | Linear sequence of levels with increasing difficulty | Regency Solitaire, Ancient Enemy, CCN | Good for narrative; limits replayability |
| **Discovery-as-progression** | Finding new recipes/ideas is the progression | Stacklands, Cultist Sim | Very satisfying; makes exploration rewarding |
| **Scoring systems** | Points determine success; leaderboards | All games to varying degrees | Universal motivation; enables skill expression |
| **Difficulty scaling** | Escalating challenges within or across runs | Balatro (Antes), LbaL (Rent), TM (14 gen limit) | Creates urgency and forces engine optimisation |
| **Achievement/quest systems** | Specific goals to accomplish | Stacklands (Quests), Balatro (Challenges) | Guides player attention; extends longevity |

### Time/Phase Mechanics

| Mechanic | Description | Games Using It | Notes |
|---|---|---|---|
| **Round/generation timer** | Discrete rounds with specific phases | TM, Wingspan, Stacklands (Moons) | Provides rhythm and pacing |
| **Real-time (pausable)** | Continuous time with pause option | Cultist Sim, Stacklands | Creates urgency but can stress players |
| **Turn-based** | Discrete player turns with clear action budgets | TM, Wingspan, CCN, Balatro | Most familiar; easiest to design for |
| **Seasonal/era progression** | Game divided into thematic time periods | Wingspan (4 rounds), Regency Solitaire (chapters) | Creates natural narrative arc |
| **Shrinking action budget** | Fewer actions available as game progresses | Wingspan (fewer turns each round) | Forces increasingly efficient play |
| **Event/crisis interrupts** | Periodic events that disrupt plans | Stacklands (attacks), TM (global events) | Adds variety but can feel unfair |

---

## Theme Catalogue

| Theme | Examples | Solo Card Game Fit | Notes |
|---|---|---|---|
| **Medieval village building** | Stacklands | Excellent | Universally understood; natural card-to-building mapping |
| **Nature/ecology** | Wingspan | Excellent | Peaceful, appealing, educational; works great solo |
| **Space colonisation** | TM | Good | Ambitious scope; hard to do in short sessions |
| **Regency/Historical period** | Regency Solitaire | Good | Niche but devoted audience; aesthetic differentiation |
| **Dark fantasy/occult** | Inscryption, Cultist Sim | Good | Strong atmosphere; niche appeal |
| **Workshop/crafting** | Book of Hours | Excellent | Under-explored; natural fit for card crafting |
| **Landlord/economy** | LbaL | Moderate | Thematically weak in LbaL's case; economy is better abstracted |
| **City building** | CCN (loosely) | Good | Larger scope than village; needs careful scoping |
| **Dungeon building** | (largely unexplored in this genre) | Good | Inversion of dungeon crawl; proven adjacent theme |
| **Home renovation/interior design** | (largely unexplored in card games) | Excellent | Accessible, visually satisfying, under-served |
| **Garden/farm** | Dorfromantik (adjacent) | Excellent | Relaxing, visually rewarding, seasonal cycles natural |
| **Shipbuilding/vehicle construction** | (largely unexplored) | Good | Constrained scope; clear success/failure criteria |
| **Cooking/restaurant** | (explored in non-card games) | Excellent | Recipe system maps perfectly to card crafting |

### What Works Best for Single-Player Card Games:
- **Peaceful, constructive themes** over combat/destruction (Regency Solitaire, Wingspan, Dorfromantik all have exceptional satisfaction)
- **Tangible output** -- themes where the "built thing" is visually concrete (a building, a garden, a workshop)
- **Clear scale** -- themes with a natural scope that fits 10-30 cards on a table
- **Process themes** -- themes where the *process* of building is interesting, not just the output (cooking, crafting, woodworking)

---

## Gap Analysis

### Gap 1: Visible Spatial Building with Card Mechanics
**The opportunity:** No existing game combines Stacklands-style "cards are physical objects" with structured spatial building (like Dorfromantik's tile placement). Stacklands is freeform and messy; Dorfromantik uses tiles not cards; Regency Solitaire's building is a menu. Nobody has done "place cards on a grid where each card IS a room/structure/component and adjacency creates synergies, building up a visible, recognisable thing."

**Why it's a gap:** Building games are about seeing your creation grow. Card games have superb interaction vocabulary (draw, play, discard, stack, flip). Combining these should be obvious, but almost nobody has done it with structured spatial intent.

**Target experience:** The player places a Kitchen card adjacent to a Pantry card and visually sees their building take shape on the grid, while adjacency bonuses kick in and the Kitchen becomes more productive.

### Gap 2: Card Crafting + Card Building (Meta and Object Level)
**The opportunity:** Mystic Vale has card crafting (building up individual cards). Stacklands has card building (using cards to construct things). Nobody has combined both: a game where you craft/upgrade your cards AND use those crafted cards to build structures/things on the table.

**Why it's a gap:** The most satisfying moments in this genre are (a) making a card yours through modification and (b) placing your card into a growing creation. Doing both creates double investment -- you care about each card individually AND about the overall thing you're constructing.

**Target experience:** You upgrade a basic "Wood Plank" card with a "Quality Finish" enhancement, then place it into your construction tableau where it provides better bonuses because of the enhancement.

### Gap 3: Solitaire Foundation + Crafting Output (Not Combat)
**The opportunity:** Solitairica and Ancient Enemy use solitaire to power combat. Regency Solitaire uses it to power building, but the building is linear and menu-based. Nobody has made a game where solitaire card-play directly drives a spatial, creative crafting/building system with meaningful choices.

**Why it's a gap:** Solitaire is the most widely-known single-player card game in the world. Using it as the "work" that generates resources for building is intuitive (play cards = do work = earn materials = build things). The gap is in making the output side spatial, creative, and non-linear.

**Target experience:** Clear a solitaire cascade to gather Stone, Wood, and Glass resources, then spend those resources to place structure cards on your construction grid.

### Gap 4: Short-Session Persistent Building (The "One More Level" Building Game)
**The opportunity:** Most building card games are either roguelike (reset each run: Balatro, LbaL) or campaign-based (linear: Regency Solitaire). Nobody has done short sessions (5-15 min) where your building persists across sessions and grows over days/weeks, but each session has its own self-contained challenge.

**Why it's a gap:** Mobile-style session lengths with PC-style persistent building. Animal Crossing proved this works for simulation games; nobody has applied it to card-based building.

**Target experience:** In a 10-minute session, you play a round of cards, earn resources, add 2-3 rooms to your persistent building, and face a round-specific challenge (weather event, supply shortage). Over many sessions, your building becomes increasingly complex and impressive.

### Gap 5: Process-Focused Crafting (The Journey, Not the Destination)
**The opportunity:** Most building games focus on the output (the finished building/city/village). Very few card games make the *process* of building interesting -- the sequence of operations, the workshop management, the supply chain. Cultist Simulator gets closest with its verb slots, but wraps it in obscurity and horror.

**Why it's a gap:** Real crafting (woodworking, cooking, pottery) is satisfying because of the *process*: raw material -> preparation -> assembly -> finishing. Card games are perfectly suited to model this (each step is a card play), but nobody has made the process itself the gameplay rather than a means to an end.

**Target experience:** You're building a table. You play a "Rough Cut" action on your Lumber card, transforming it into "Planks." You play "Sand" on the Planks. You play "Join" on two Sanded Plank cards to create a "Table Top." Each step is a satisfying card interaction, and watching the material transform through stages IS the game.

---

## Key Takeaways for The Build

### 1. The Core Loop Should Be: Play Cards -> Earn Resources -> Build Visible Things -> Building Improves Card Play

This loop appears in different forms across the most successful games surveyed:
- Regency Solitaire: solitaire -> coins -> ballroom upgrades -> better power-ups
- Stacklands: card stacking -> resources -> buildings -> more production
- Wingspan: actions -> birds -> row powers -> better actions

The key insight: the building must **visibly improve your card-playing capability**, not just score points. This creates a virtuous cycle that makes both the card play and the building more satisfying.

### 2. Cards Must Be Spatial, Physical, and Tangible

Stacklands and Cultist Simulator prove that cards-as-physical-objects-on-a-table is powerful. Balatro and Slay the Spire prove that abstract card play can succeed, but for a *building* game, the built thing must be *visible and spatial*.

**Recommendation:** Use a grid-based tableau where played cards form a visible structure. Each card placed should look like part of a building/creation, and the overall tableau should look like something recognisable and growing.

### 3. Familiar Foundation + Novel Application = Maximum Accessibility

Balatro uses poker. Solitairica uses solitaire. Regency Solitaire uses tri-peaks. The most successful games in this genre build on mechanics that **most people already know** and then layer novel systems on top.

**Recommendation:** Consider using a well-known solitaire variant as the resource-gathering mechanic, with the building/crafting system as the novel application layer. This gives zero-tutorial accessibility for the base mechanic while providing depth through the building system.

### 4. Session Length Must Be 10-25 Minutes

The most successful games in this survey have runs/sessions in this range:
- Balatro: 20-40 min (slightly long)
- LbaL: 15-25 min (perfect)
- Stacklands moon: 3-5 min, full game 5-7 hours
- Regency Solitaire level: 3-10 min (perfect for mobile)

Games that run long (TM at 60-90 min, Cultist Sim at 2-10 hrs) lose the "one more round" pick-up-and-play quality.

**Recommendation:** Target 10-15 minute sessions, with a natural "just one more round" cadence. Each round should deliver visible building progress and feel self-contained.

### 5. Synergy Depth Is the Replayability Engine

Balatro, LbaL, TM, and Wingspan all derive their replayability from combinatorial synergies. The card pool must be large enough and the interactions rich enough that players discover new combinations across many plays.

**Recommendation:** Design cards with 2-3 keyword/tag interactions each. Adjacency bonuses on the building grid should interact with card keywords. Target 60-100 distinct cards at launch with clear synergy families.

### 6. Meta-Progression Extends Longevity Without Bloating Session Length

Balatro's unlock system (new Jokers, Decks, Challenges) keeps players coming back. Solitairica's class unlocks do the same. Regency Solitaire's linear campaign works but limits replayability.

**Recommendation:** Use a roguelike structure with persistent unlocks. Each run adds to a persistent building/collection while also unlocking new card types, building options, and challenges. Combine Balatro's "unlock more variety" with Regency Solitaire's "build something persistent."

### 7. The "Juice" Matters Enormously

Balatro's success is 50% design, 50% polish. The CRT effects, the chip-counting animations, the sound design when combos fire -- these create the hypnotic flow state that makes the game addictive.

**Recommendation:** Invest heavily in feedback: card snap-to-grid animations, construction sound effects, visual celebration when synergies activate, satisfying resource conversion animations. The TCE engine should prioritise Phaser 3's tween and particle systems for this.

### 8. Theme Should Be Accessible, Constructive, and Visually Rewarding

The best-received games in this survey have themes that are **constructive** (building, nurturing) rather than **destructive** (combat, conquest). Wingspan (97% positive), Regency Solitaire (96% positive), Stacklands (95% positive), and Dorfromantik (97% positive) all have peaceful, constructive themes.

**Recommendation:** Choose a theme where the player builds something beautiful, useful, or impressive -- not where they fight enemies. Combat should be minimal or absent. Possible themes: home renovation, workshop/atelier, garden design, small-town main street, lighthouse keeper, bookshop curator.

### 9. Onboarding Must Be Seamless

Cultist Simulator and Mystic Vale show what happens when brilliant mechanics meet poor onboarding. Stacklands and Balatro show the opposite -- you understand the core mechanic within seconds of starting.

**Recommendation:** The first game action should teach the core mechanic. If the base is solitaire, the first move is matching a card. If the base is stacking, the first move is dragging one card onto another. Tutorial should be play, not text.

### 10. Design for Single-Player First

Balatro, Stacklands, Inscryption, and Regency Solitaire were all designed as single-player experiences from the ground up. They are not multiplayer games with a bolted-on solo mode (unlike TM and Wingspan's digital versions, which feel like a compromise).

**Recommendation:** Every mechanic, every interaction, and every progression system should be designed for a single player. No AI opponent to emulate multiplayer. The challenge comes from the building itself -- resource scarcity, time pressure, efficiency targets, and escalating complexity.
