---
name: tce-game-dev
description: "Tableau Card Engine (TCE) game-development best practices. Design the architecture for new example games, review existing game implementations for compliance with TCE conventions, and identify missing features and integration points. Trigger on queries like: 'design a new game for TCE', 'review this game against TCE conventions', 'add a new scene to the Gym', 'what patterns does TCE use?'"
---

# TCE Game Development — Agent Skill

A slim, agent-facing reference. The full narrative lives in the canonical
[`docs/dev/creating-a-new-game.md`](../../../docs/dev/creating-a-new-game.md)
end-to-end guide and in [`docs/DEVELOPER.md`](../../../docs/DEVELOPER.md).
This skill gives you the **when-to-use framing**, a **link index**, the
**common pitfalls**, and the single authoritative **definition-of-done
checklist**.

## 1. When to use this skill

Use it when you are:

- **Designing** the initial architecture for a new example game.
- **Reviewing** an existing game for compliance with TCE conventions.
- **Identifying** missing integration points (SLL, transcript, save/load,
  replay, settings/help panels, accessibility, testing).
- **Adding a new Gym scene** to demonstrate an engine feature.

Do **not** use it to restate conventions — point at the canonical docs below.
The always-loaded [`AGENTS.md`](../../../AGENTS.md) already carries the project
rules and the "Game Architecture Best Practices" patterns.

## 2. Canonical references (link index)

| Topic | Authoritative source |
|-------|----------------------|
| End-to-end new-game lifecycle | `docs/dev/creating-a-new-game.md` |
| Multi-repo layout (sibling game repos + `./core`) | `docs/dev/multi-repo-architecture.md` |
| Config-driven catalogue (`GAME_INFO` + `configs/*.json`) | `docs/dev/game-configuration.md` |
| Per-game `src/` layout & import contract | `docs/dev/per-game-src-layout-decision.md` |
| SLL, HUD, hand/pile, audio/SFX, testing, plugins | `docs/DEVELOPER.md` |
| Gym scene → API mapping | `docs/gym/GYM_INDEX.md` |
| Project rules & architecture patterns | `AGENTS.md` |

### Multi-repo facts (current model)

- The engine + Gym + launcher shell live in the **merged core repo**
  (`Tableau-Card-Engine`); the core carries **no games at HEAD**.
- Each game is its **own repo** (`tce-<game>`) with source at repo-root `src/`,
  composed as a **sibling** (`../tce-<game>`) that pulls the core in as a
  `./core` git submodule. The core never submodules games.
- Games are discovered from **`GAME_INFO`** exported by the game's scene module
  and selected through **`configs/*.json` presets** (`GAMES_CONFIG=<game-id>`).
  There is no central scene-registration array to edit.
- A game repo runs the core toolchain against `./core`:
  `CORE_ROOT=./core npm run dev` / `npm run build` / `npm run test`.
- Push to **`dev` only — never `main`**; the `ship` skill promotes `dev`.

## 16. Common Pitfalls

1. **Missing `super.create()`** in scene `create()` — breaks the event system,
   HUD, menu button and replay detection.
2. **Not parenting overlay elements into `hudContainer`** — UI renders behind
   the overlay box and is invisible (the most common modal-dialog bug).
3. **Hardcoded pixel positions** instead of SLL zones/anchors — fails the SLL
   requirement and breaks responsive layouts.
4. **Double-playing SFX** — mapping card-movement events to sounds while the
   animator already plays them.
5. **Non-seeded randomness in tests or logic** — always use
   `createSeededRng(seed)` for reproducible deals and AI picks.
6. **AI peeking at hidden state** — strategies must receive only filtered
   state projections.
7. **Stale display-object arrays on scene restart** — reset them in `create()`.
8. **Missing `shutdownBase()`** in `shutdown()` — leaks sound, panels and HUD.
9. **Unversioned serialization** — use `serializeWithVersion()` /
   `deserializeWithVersion()` so version mismatches throw.
10. **Ignoring reduced motion** — animations must be skippable/shortenable
    (`reducedMotion` override plus SettingsStore and the media query).
11. **Editing `CHANGELOG.md`** — the release pipeline manages it.
12. **Pushing to `main`** — push to `dev`; the `ship` skill promotes to `main`.
13. **Zero-assertion or self-referential tests** — every test must assert
    observable behaviour via the public API.
14. **Reusing one browser context for sequential Phaser games** — use one
    project/browser instance per game.
15. **Assuming an in-tree game tree** — a game now lives in its own sibling
    `tce-<game>` repo; add a Gym demo to `example-games/gym/` (registered in
    `GymRegistry.ts`) when you only need to demonstrate an engine feature.
16. **Integrating graphics features without a feasibility spike** — evaluate
    shaders/lighting in an isolated spike with documented findings and a
    graceful fallback.

## 17. Definition of done checklist

This is the **single source of truth** for declaring a new game compliant. The
canonical guide links here and does not duplicate the list. It replaces the
former "completeness verification" narrative (2026-10-08 consolidation,
CG-0MUZFNOE1007T57S).

### Architecture
- [ ] Scene extends `CardGameScene` and calls `super.create()` first.
- [ ] Pure game logic (rules/state/scoring) lives outside `scenes/`.
- [ ] Complex scenes split into Renderer / Animator / TurnController
      (+ AiController / ReplayController as needed).
- [ ] State collections use `Pile<T>`; deterministic deals via
      `createSeededRng()` + `shuffleArray()`.
- [ ] AI extends `AiStrategyBase` / `AiPlayer<TStrategy>` and receives only
      visible-state projections.
- [ ] Graphics features (shaders, lighting) validated in an isolated spike with
      documented findings and a graceful fallback.

### SLL layout
- [ ] Layout JSON exists at `src/layouts/<game>.layout.json`.
- [ ] Parsed once at module load with `parseScreenLayoutDocument()`; an invalid
      layout throws a clear error.
- [ ] `resolveXxxAnchor()` helpers provide fallback positions; **no** hardcoded
      pixel positions for UI elements.
- [ ] `*LayoutAdapter.ts` maps SLL zones to the game layout (if spatial).

### Lifecycle, HUD, audio, accessibility
- [ ] `preload()` loads card assets and audio (`audioPathWithFallback()`).
- [ ] `shutdown()` calls `shutdownBase()`.
- [ ] Replay mode handled (`?mode=replay`, `loadBoardState`,
      `state-settled`) if applicable.
- [ ] Help and Settings panels initialised; sound system wired with
      namespace-scoped keys and no double-play.
- [ ] Reduced motion respected (SettingsStore toggle plus
      `prefers-reduced-motion`).

### Persistence / transcripts
- [ ] Transcript recorder extends `TranscriptRecorderBase` and auto-saves via
      `autoSaveTranscript()`.
- [ ] Save/load (if applicable) uses `SaveLoadStore` +
      `serializeWithVersion()`.
- [ ] Checkpoint autosave + resume (if applicable) via `CheckpointManager`.

### Testing / CI / registration
- [ ] Unit tests under `tests/<game>/` with deterministic seeds.
- [ ] Browser smoke test asserts the scene boots and renders (if scene-level).
- [ ] `npm run build` succeeds and the appropriate test profile is green.
- [ ] `GAME_INFO` exported from the scene module; preset entries added to
      `configs/*.json`.

### Docs / assets
- [ ] `docs/DEVELOPER.md` game reference table updated.
- [ ] Assets attributed in `public/assets/CREDITS.md`.
- [ ] `help-content.json` present and accurate.
