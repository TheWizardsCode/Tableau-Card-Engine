# Video Series Outline — How the Tableau Card Engine Was Built

A written outline for a video series documenting the build of the **Tableau Card Engine (TCE)**, a modular, spike-driven game engine for single-player tableau card games. Each ~15-minute episode covers a major development phase, mapped to actual git-history milestones, and closes with a lesson learned that other engine builders can apply to their own projects.

## How This Outline Was Derived

- **Source of truth:** the repository's git history (1,675 commits, 240 first-parent merges, Feb 18 – Aug 12, 2026) plus the Worklog (wl) work-item trail that drove every change.
- **Chronological anchors:** first-parent merge commits and the 12 tagged releases (`v0.1.1` – `v0.1.12`, Jun 17 – Aug 12, 2026) mark the phases below.
- **Parallel work:** development was not strictly linear — Sushi Go!, Feudalism, and Lost Cities were built on parallel branches while Golf and Beleaguered Castle were still landing. Episodes note where this happened and why it matters.
- **Moving target:** the project is still active. This outline covers the project lifespan to date and may be extended as development continues.
- **Review note:** this outline was drafted from git history and work items alone; core contributors should review it before any production work.

## The Series at a Glance

| # | Episode | Date range | Phase |
|---|---------|------------|-------|
| 1 | From Zero to Playable: Bootstrapping the Engine | Feb 18, 2026 | Project setup |
| 2 | Core Abstractions: Card, Deck, Pile, and Turns | Feb 19, 2026 | Core engine |
| 3 | First Game Spike: Golf | Feb 19–23, 2026 | Spike #1 |
| 4 | Testing the Playable: From Smoke Tests to Headless Browser Tests | Feb 20–23, 2026 | Test infrastructure |
| 5 | Shared UX Primitives: Help, Undo/Redo, Single-Player | Feb 23, 2026 | Shared components |
| 6 | Second Spike: Beleaguered Castle | Feb 23–26, 2026 | Spike #2 |
| 7 | Productization: Game Selector, Deployment, Events, and Replay | Feb 26 – Mar 1, 2026 | Product & observability |
| 8 | Audio, Settings, and Polish | Mar 1–9, 2026 | Feedback & polish |
| 9 | Scaling to a Multi-Game Engine: Sushi Go!, Feudalism, Lost Cities | Feb 20 – Mar 15, 2026 | Parallel scaling |
| 10 | The Complex Game: Main Street | Mar 1 – Jun 17, 2026 | Complex features |
| 11 | Architecture Consolidation: SLL, Shared Renderer, and the Gym | May 18 – Jul 2026 | Consolidation |
| 12 | AI Evolution, Developer Tooling, and the Road Ahead | Jun – Aug 2026 | AI & tooling |

---

## Episode 1 — From Zero to Playable: Bootstrapping the Engine

**Date range:** Feb 18, 2026 · **Git anchors:** initial commit `481d0b16`; toolchain commits `44a13c75` (package.json/Vite/TypeScript), `fca5fd91` (Vitest + smoke test), `6e438bc5` (Hello-World Phaser scene); work item CG-0MLSFU7300TLFCBH.

The very first day established the entire project skeleton: `git init` with a comprehensive `.gitignore`, the package.json/Vite/TypeScript toolchain, a placeholder module layout mirroring the future engine architecture (`src/core-engine`, `src/card-system`, `src/rule-engine`, `src/ui`), a Hello-World Phaser scene, and a single Vitest smoke test — before any real game or engine code existed. The same commit stream also wrote `AGENTS.md` and `README.md`, baking in the spike-driven philosophy ("build games first, extract reusable components") and a Worklog-based workflow as guardrails for every subsequent change. **Lesson learned:** engineer the workflow before the game — a working build → test → dev loop plus written conventions cost one day up front but made six months of disciplined, reversible development possible; the directory skeleton was a bet that the engine's module boundaries were worth committing to from hour one.

## Episode 2 — Core Abstractions: Card, Deck, Pile, and Turns

**Date range:** Feb 19, 2026 · **Git anchors:** `f368bb35` / `63446b62` (card-system module, CG-0MLSPHOWY1HSCIDX); `9b476f97` / `e9d158ac` (core-engine GameState + TurnSequencer, CG-0MLSPHU1C02RAGE0).

On day two, the engine's first shared modules landed: the Card System (`Card`, `Deck`, `Pile`) and the Core Engine (`GameState`, `TurnSequencer`). These were deliberately tiny — a vocabulary of objects that every tableau card game needs, with no game-specific logic attached. The key design decision was restraint: the abstractions captured what the team already knew every game would share (cards live in decks and piles; turns sequence through a state machine) and nothing more, so games could be built on top without fighting the engine. **Lesson learned:** start with the smallest shared domain model that survives contact with a real game — a handful of well-named, well-tested primitives beat a speculative framework; the engine's lasting architecture (including the flat monorepo with a single `package.json`) was visible in these first two modules.

## Episode 3 — First Game Spike: Golf

**Date range:** Feb 19–23, 2026 · **Git anchors:** Golf rules/scoring/grid (CG-0MLSPI9YQ083H8LO), card asset pipeline `5e80dbf8` (52-card SVG deck, CG-0MLSPHIDD19PBDOZ), AI player `2060bd01` (Random/Greedy strategies, CG-0MLSPIGPM0HRCCYE), transcript recording `abeda3ed` (CG-0MLSPIQ1516DJNQL), Golf Phaser UI `00d4217d` (CG-0MLSPJ9EW1WGHKLX).

Golf — a 9-card grid game against an AI — was the first full spike: rules and scoring in the engine, a real 52-card SVG deck pipeline, two AI strategies (random and greedy), game-transcript recording, and a complete Phaser UI, all built in about four days. This was the moment the spike-driven approach paid its first dividend: building a real game forced the engine APIs to be exercised end-to-end, and several patterns that would become engine-wide were born here — the `AiStrategyBase` + `AiPlayer` pairing, the `TranscriptRecorderBase` event log, and the single-player turn loop. **Lesson learned:** a game spike is the truest API review — every abstraction that survived Golf became core engine, and the ones that had to be changed taught the team to design for the *next* game, not just the current one.

## Episode 4 — Testing the Playable: From Smoke Tests to Headless Browser Tests

**Date range:** Feb 20–23, 2026 · **Git anchors:** integration tests + docs (CG-0MLSPJFWL14OQNJ5), Vitest browser mode with Playwright (CG-0MLSUJIE30K54IUO), Golf UI layout fix + interaction browser tests (CG-0MLSW8TKZ0YHXJR2).

Within days of the first playable Golf UI, the team invested in a two-tier test strategy: fast Node unit/integration tests for game logic, and Vitest **browser mode** driving real Phaser scenes in headless Chromium via Playwright for UI/interaction coverage. The first browser tests immediately earned their keep by catching a broken Golf UI layout that unit tests could never have seen, and the infrastructure (the `--project unit` / `--project browser` split that still runs today) was established in this window. **Lesson learned:** for a rendering-heavy game engine, "the build passes" is not enough — headless browser tests are the only way to catch layout, input, and animation regressions, and they pay for themselves the first time they find a bug; investing in test infrastructure during the first spike, not after, keeps every later game (and the engine itself) safe to refactor.

## Episode 5 — Shared UX Primitives: Help, Undo/Redo, Single-Player

**Date range:** Feb 23, 2026 · **Git anchors:** HelpPanel/HelpButton + keyboard shortcut (CG-0MLT0PM000TQRIXT), blank-panel fix (CG-0MLTCHTQV00N4L9R), single-player support (CG-0MLTFBTE41EVGNKA), UndoRedoManager command pattern (CG-0MLTFC94Z00K32ZI), AI turn visibility (CG-0MLTCUK500GZUJ6N).

With one game done, the team extracted the first cross-game UX components: a reusable `HelpPanel`/`HelpButton` with scrolling and input blocking, an `UndoRedoManager` built on the command pattern (with compound commands for grouping whole turns), explicit single-player support in the core engine, and a pause-before-AI-move so the player can see what the AI did. These were not engine abstractions in the Card/Deck/Pile sense — they were *player-experience* abstractions, and every later game inherited them. **Lesson learned:** shared components are not just for game mechanics — help, undo, and readable AI turns are features every game needs, so extracting them into the engine after the first game (rather than re-implementing per game) is where the "reusable engine" promise actually starts to compound.

## Episode 6 — Second Spike: Beleaguered Castle

**Date range:** Feb 23–26, 2026 · **Git anchors:** BC game logic (CG-0MLTFCTNK10RQ41T), Phaser scene (CG-0MLTFDAYD0J6KLY3), drag-and-drop (CG-0MLTFDTMT0G2I0ZT), auto-move to foundations (CG-0MLTFEN5A0DG3P0M), click-to-move (CG-0MLTFE68N1TONFIE), win/loss + new game (CG-0MLTFF2R70UXJD2T), auto-complete animation (CG-0MLTFFGBH1CEPC7J), transcript + help + tests (CG-0MLTFG3RI1ULI5TT).

Beleaguered Castle, the second game, deliberately stressed mechanics Golf never touched: drag-and-drop card input, click-to-move, auto-move to foundations, win/loss overlays with new-game/restart, and an animated auto-complete solver that finishes the game for the player. It re-used the card system, transcripts, help panel, and undo/redo, and in doing so proved which abstractions generalized — while the drag-and-drop and auto-move logic stayed game-specific and became the raw material for a shared drag-drop module much later (Episode 12). **Lesson learned:** the second spike is the real generalization test — one game can hide game-specific hacks, but two games with different interaction models expose which engine pieces are genuinely reusable and which are still per-game; that boundary is the map for what to extract next.

## Episode 7 — Productization: Game Selector, Deployment, Events, and Replay

**Date range:** Feb 26 – Mar 1, 2026 · **Git anchors:** game selector landing page (CG-0MLTRTAWY0X0CSY4), GitHub Pages pipeline (CG-0MLTRXRKK1Q50Z0M), overlay button fix (CG-0MLTSYKYU11LEUWX), TranscriptStore with IndexedDB/localStorage (CG-0MLTFQZ6G09TVLDL), typed GameEventEmitter + PhaserEventBridge (CG-0MLTFSAOM1W4UKI8), replay tool with screenshots & state injection (CG-0MLTFTD0B0B3EL3W).

With two games in hand, the project became a product: a game-selector landing page routing between games, a GitHub Pages deployment pipeline (still the live site today), and two pieces of observability infrastructure that would shape everything after — a typed `GameEventEmitter` decoupling game logic from UI/audio, and a replay tool that re-runs recorded transcripts with Playwright screenshots and injected state. The TranscriptStore made transcripts persistent (IndexedDB/localStorage with auto-save), turning debugging and demoing into first-class workflows. **Lesson learned:** deploy early and give yourself observability — a selector page turns a collection of games into a distributable product, and a transcript/event/replay pipeline turns "I can't reproduce the bug" into "here is the exact state sequence"; both were cheap at two games and would have been expensive at eight.

## Episode 8 — Audio, Settings, and Polish

**Date range:** Mar 1–9, 2026 · **Git anchors:** SoundManager + SFX integration (CG-0MLUDH5JH05H3D9J), SettingsPanel with mute/volume (CG-0MLUH07HP1QKGS1Y), card swap/discard-and-flip animations (CG-0MLU6QN7E1EKOTOS, CG-0MLU6R1JF195YUQZ), canvas 800×600 → 1280×720 (CG-0MLVOT2VY0DG9VLF), rendering sharpening (CG-0MLVSOTFG0DH4CFV), extraction of card texture helpers, overlays/buttons, and scene scaffolding into `src/ui/` (CG-0MLU86JTG1OXPMDW, CG-0MLU874O10DAKCZZ, CG-0MLU87O440Y9ZCRU, CG-0MLU8885507HM3TJ).

This phase added the sensory layer: a `SoundManager` with card-level SFX events, a settings panel with mute and volume controls (the seed of today's SettingsStore), and a batch of card animations (swap, discard-and-flip, movement sequencing) — alongside a canvas upgrade to 1280×720 and a sharpening pass that fixed UI overlaps across scenes. It also marks the first systematic **extraction wave**: card-texture helpers, the overlay/button system, transcript base types, and scene-scaffolding helpers were pulled out of the games into shared `src/ui/` and `src/core-engine/` modules — exactly the build-then-extract rhythm the project was founded on. **Lesson learned:** polish is a feature — audio, settings, and animation are what make a tech demo feel like a game, and packaging them as shared, event-driven components (sound on `GameEventEmitter`, settings in a store) means every future game gets them for free; the extraction wave also proved the pattern: when three codebases duplicate a helper, that helper belongs in the engine.

## Episode 9 — Scaling to a Multi-Game Engine: Sushi Go!, Feudalism, Lost Cities

**Date range:** Feb 20 – Mar 15, 2026 (parallel branches) · **Git anchors:** Sushi Go! (CG-0MLSDWSCG154TUEL), Splendor→Feudalism (CG-0MLSDX4B91DG6S1A; renamed `29e91c77`), Lost Cities (CG-0MLX1VQIP1YY1PTT et al.), The Mind (CG-0MLZSJ6XI1LA5T4R; removed `f471f01b`), seeded RNG extraction (CG-0MLYGKFJK0DXW9UN), AI strategy module extraction (CG-0MLYGKHJH1PVJJ95), TranscriptRecorderBase extraction (CG-0MLYGKJGT0SX6LM5).

While Golf and Beleaguered Castle were still landing, the team spun up parallel branches for Sushi Go! (card drafting), Splendor (later renamed Feudalism, engine-building with tokens), Lost Cities (expedition scoring), and The Mind (cooperative mechanics). This is where the engine's defining rhythm became explicit: each game spike produced a fresh extraction — `createSeededRng()` and `shuffleArray()` for deterministic deals, the shared AI strategy module in `src/ai/`, and `TranscriptRecorderBase` in core-engine — all pulled from game code into shared modules within days of the games using them. Parallel branches meant games informed each other's abstractions in real time. **Lesson learned:** parallelize spikes to accelerate API discovery, and treat every game as a probe for the engine — the seeded-RNG, AI-strategy, and transcript patterns all crystallized during this window; equally important is knowing when a spike's lesson is done — The Mind was removed in July 2026 (commit `f471f01b`) once its cooperative-mechanics findings had been harvested, proving that removing a game is a valid, deliberate outcome of spike-driven development.

## Episode 10 — The Complex Game: Main Street

**Date range:** Mar 1 – Jun 17, 2026 (first release `v0.1.1`) · **Git anchors:** first Main Street UI `4e2fafc3` (CG-0MM7IABRS0YJ6M3N), expanded card pool (CG-0MMJ8S7LE0ZGBMEL), challenge system (CG-0MMJO5XW801D11L0), difficulty presets (CG-0MMJ8S87N06Q5GP1), Monte Carlo balance harness (CG-0MMJ8S8ME1LYX4DJ), versioned save/load (CG-0MMJ8S90S1P2HW74), meta-progression (CG-0MMLTPXVR0F9K0JS), tutorial system (CG-0MPLR9CJJ006HZT4).

Main Street was the stress test: an economy game with market rows, business upgrades, reputation, an investment/incident event system, challenges, difficulty presets, and meta-progression — by far the most complex ruleset the engine had hosted. Two engineering responses stand out: a **Monte Carlo balance harness** that simulates thousands of games to catch win-rate and economy drift (the balance methodology and CI guardrails still ship with the project), and **versioned save/load** so players could persist and resume a long game across releases. A full tutorial system and first-launch flow completed the package, and on Jun 17, 2026 the project made its first tagged release (`v0.1.1`) — kicking off a release cadence that would reach `v0.1.12` by August. **Lesson learned:** complex games change the rules for engine builders — when a game is too big to balance by hand, headless simulation becomes a required tool, and when sessions outlive releases, versioned serialization becomes non-negotiable; Main Street also proved the engine could host a genuinely complex game without abandoning its modular architecture.

## Episode 11 — Architecture Consolidation: SLL, Shared Renderer, and the Gym

**Date range:** May 18 – Jul 2026 · **Git anchors:** Gym demo suite (CG-0MP3XQBL4008QK8S), SLL core + composed layouts (CG-0MPENWPN5002TNZY, CG-0MPFBF5GA001CBH9), shared Renderer API (CG-0MPOLH2U9001P7BC), TooltipManager (CG-0MODIX70W002JXQN), SVG raster helpers (CG-0MOZNXU4Y0043NR3), scene decomposition across all games (CG-0MP00BL01001RYAJ et al.), Phaser 4 migration (CG-0MODHBVM00057G2V).

With six-plus games sharing code, the team moved from extraction to consolidation: the **Screen Layout Language (SLL)** replaced hardcoded pixel positions with declarative, responsive layouts composed per scene; a **shared Renderer API** standardized how every game creates HUD text, buttons, and card sprites; `TooltipManager`, shared SVG raster helpers, and a reusable overlay system unified interaction; and every game scene was decomposed into helper classes (renderer, animator, input manager, lifecycle) to keep scenes under control. The **Gym** — a curated suite of 20+ demo scenes showcasing every engine feature — was created as living documentation, and the engine migrated to Phaser 4 RC along the way. **Lesson learned:** after N games, stop extracting and start consolidating — a shared layout language and renderer are what make the eighth game cheaper than the first, and a Gym of runnable demo scenes is worth more than any architecture document because it proves each engine feature works in isolation and shows exactly how to use it.

## Episode 12 — AI Evolution, Developer Tooling, and the Road Ahead

**Date range:** Jun – Aug 2026 (releases `v0.1.1` – `v0.1.12`) · **Git anchors:** CardMemoryTracker (CG-0MRCLYBUR002GFCZ), Golf AI skill rating (CG-0MQIOPP1L004OYYA), Beleaguered Castle AI solver + hint system (CG-0MQQIMOH6005L0PF, CG-0MQJZZKM6007FELG), Coloretto (v0.1.11, CG-0MLSDXY9F1FSGQ38), Blackjack HandView migration (CG-0MS9J4SDD002AR3E), shared drag-drop module (CG-0MSKT0NQP0018KK6), replay CLI improvements, Electron desktop launcher (CG-0MSMDYLUQ000JTHW).

The final phase shows the engine maturing on three fronts. **AI:** from the original random/greedy strategies, the engine grew `CardMemoryTracker` (an AI that remembers what cards have been seen — integrated into Lost Cities), a Golf AI skill rating that quantifies strategic card memory, and an AI **solver** powering Beleaguered Castle's hint system — turning the engine's AI layer from "an opponent" into "a teacher." **Tooling:** the replay/transcript pipeline became a full CLI with contact sheets and fast-forward, the drag-and-drop module was extracted from Beleaguered Castle into core-engine, and an Electron launcher made the web build a distributable desktop app. **Games:** Coloretto joined the roster (with animated, sound-synced actions and full rules) and Blackjack was migrated onto the shared `HandView` + `flipCard` rendering — proving the shared hand-management components finally cover every game. Twelve releases in ~2 months gave contributors a steady, auditable cadence. **Lesson learned:** AI and developer tooling are long-term investments that pay off in engine quality — memory, solvers, and hint systems turn AI from a checkbox into a feature players notice, while replay tools and packaging make the engine usable by others; and a regular release cadence is what turns a private experiment into a credible open-source engine.

---

## Where to Go Next

- **Play the games:** the live build is deployed at <https://thewizardscode.github.io/Tableau-Card-Engine/> — every game in this series, plus the Gym demo suite, runs in the browser.
- **Read the code:** the engine lives in `src/` (`core-engine`, `card-system`, `rule-engine`, `ai`, `ui`) with example games under `example-games/`; the repository is a flat monorepo with a single `package.json`.
- **Read the docs:** [`README.md`](../README.md) for the overview and quick start, [`docs/DEVELOPER.md`](../docs/DEVELOPER.md) for the deep-dive developer guide, and [`docs/gym/GYM_INDEX.md`](../docs/gym/GYM_INDEX.md) for the scene-to-API mapping behind Episode 11's Gym.
- **Contribute:** track work through Worklog items (see `AGENTS.md`), run `npm test` and `npm run build` before pushing, and follow the spike-driven pattern — build a game, extract the reusable parts, and push them into the engine.

---

## Appendix: Release Timeline

| Release | Date | Notable contents |
|---------|------|------------------|
| v0.1.1 | 2026-06-17 | First tagged release (pre-changelog; see git history for contents) |
| v0.1.2 | 2026-06-20 | Early release (pre-changelog) |
| v0.1.3 | 2026-07-05 | Early release (pre-changelog) |
| v0.1.4 | 2026-07-10 | Gym SLL migration, layout ownership runtime, shared game-over screen, CSV auto-balancing tool, generalized synergy bonuses |
| v0.1.5 | 2026-07-14 | Golf AI vertical-column consideration, Golf AI skill rating (strategic card memory) |
| v0.1.6 | 2026-07-20 | Blackjack playable with SFX, game-over overlay, and undo/redo |
| v0.1.7 | 2026-07-23 | Main Street HUD fixes, Golf stock face-up fix, synergy percentage multipliers |
| v0.1.8 | 2026-07-29 | Monte Carlo harness extensions (ownership tracking, strategy×difficulty batches, EconomyLedger history), release-readiness audits |
| v0.1.9 | 2026-07-31 | Blackjack HandView migration, Gym constants, save/load and hand-interaction fixes |
| v0.1.10 | 2026-08-06 | Synergy bonuses, i18n interpolation, replay CLI contact sheets, Beleaguered Castle AI solver + hint button |
| v0.1.11 | 2026-08-08 | Coloretto (full rules), Beleaguered Castle hint system |
| v0.1.12 | 2026-08-12 | Shared drag-drop module, Electron desktop launcher, latest Main Street work |

*Release contents are summarized from `CHANGELOG.md` (which begins at v0.1.4) and git history; see both for full detail.*
