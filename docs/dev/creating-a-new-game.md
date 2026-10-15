# Creating a New Game — End-to-End Guide

This is the **canonical, end-to-end guide** for adding a new example game to
the Tableau Card Engine (TCE): from "should this be a game?" through to a
shipped, registered title. It is deliberately a **navigation layer** — every
stage links to the authoritative deep-dive document rather than restating it,
so this guide stays correct as the engine evolves.

> **Definition of done.** The single authoritative compliance checklist for a
> new game is §17 of the
> [`tce-game-dev` skill](../../.pi/skills/tce-game-dev/SKILL.md#17-definition-of-done-checklist).
> Treat that checklist as the source of truth; this guide never duplicates it.

**Audience:** human developers and AI agents working the Worklog.

**Two rules that apply to every stage:**

- **Push to `dev` only — never `main`.** The `ship` skill promotes `dev` to
  `main`; every repository (core and each `tce-<game>`) follows the same rule.
- **Cross-repo changes are expected.** The engine + Gym live in the merged core
  repo (`Tableau-Card-Engine`); each game is its own `tce-<game>` repo composed
  as a sibling that pulls the core in as a `./core` git submodule. A core change
  may require a matching change in a sibling game repo — make it in the same
  effort, on that repo's `dev` branch. See
  [Multi-Repo Architecture](multi-repo-architecture.md).

## Stages at a glance

1. [Concept and ideation](#1-concept-and-ideation)
2. [Intake and planning](#2-intake-and-planning)
3. [Repository scaffold and multi-repo setup](#3-repository-scaffold-and-multi-repo-setup)
4. [Architecture and implementation](#4-architecture-and-implementation)
5. [Testing profiles](#5-testing-profiles)
6. [CI and release](#6-ci-and-release)
7. [Game registration](#7-game-registration)
8. [Assets and licensing](#8-assets-and-licensing)
9. [Documentation update](#9-documentation-update)
10. [Publication](#10-publication)

---

## Definition of done

Before declaring a game (or a scene) complete, run the §17 checklist in the
[`tce-game-dev` skill](../../.pi/skills/tce-game-dev/SKILL.md#17-definition-of-done-checklist).
It covers architecture, SLL, lifecycle, HUD/audio/accessibility, persistence,
testing/CI and docs, and is the single source of truth that reviewers and
producers use.

---

## 1. Concept and ideation

Start with the project's pre-intake **"The Build"** process. Evaluate the idea
against the engine's existing capabilities *before* writing any Worklog intake,
so you can tell whether the concept needs new engine features (a spike) or can
compose what already exists.

- [Ideation concepts](../the-build/ideation-concepts.md)
- [Genre research](../the-build/genre-research.md)
- [Engine-capabilities audit](../the-build/engine-capabilities-audit.md)
- [Concept-evaluation rubric](../the-build/concept-evaluation.md)
- [Audio design](../the-build/audio.md) / [ToneForge output](../the-build/audio-tf-output.md)

**Exit artifact:** a short concept note plus an engine-capability gap list. If
the concept needs a new engine capability, raise an isolated **feasibility
spike** — evaluate it in a Gym spike scene with documented findings and a
graceful fallback — before committing to full implementation (see §17 of the
[`tce-game-dev` skill](../../.pi/skills/tce-game-dev/SKILL.md#17-definition-of-done-checklist)).

---

## 2. Intake and planning

Every change is tracked with Worklog. Create the work item, then run the intake
and plan skills so scope, acceptance criteria, risk and effort are explicit.

```bash
wl create --title "My Game — new example game" --issue-type epic --priority high --json
wl show <id> --children --json
```

- Run `/skill:intake <id>` to produce the intake brief (goal, users, scope,
  acceptance criteria, risks).
- Run `/skill:plan <id>` to decompose the work into implementable children.
- Record effort/risk via the
  [effort-and-risk skill](../DEVELOPER.md#work-item-tracking) (run automatically
  by the implement skill when estimates are missing).

See [Work-Item Tracking](../DEVELOPER.md#work-item-tracking) for the full
convention. Do **not** start implementation until the intake/plan stages are
complete and the acceptance criteria are testable.

---

## 3. Repository scaffold and multi-repo setup

A new game gets its **own repository** (`tce-<game>`) with its source at
repo-root `src/` and the merged core as a `./core` git submodule. The core repo
carries **no games at HEAD**, so a game is discovered **sibling-only**
(`../tce-<game>`).

The authoritative references are:

- [Multi-Repo Architecture](multi-repo-architecture.md) — repo layout, asset
  ownership and the scaffold.
- [Per-game `src/` layout & import contract](per-game-src-layout-decision.md) —
  the Option C flat `src/` layout and path aliases.
- [Merged-core decision](merged-core-decision.md) — why the engine + Gym +
  launcher share one repo.

Bootstrap the checkout and scaffold the game repo:

```bash
# Full distribution: sibling clones of the core + every game repo
npm run setup:distribution -- --dir ..

# Scaffold a single existing game checkout against a sibling core
npm run scaffold:game -- --game my-game \
  --game-repo-root ../tce-my-game --core-root ../Tableau-Card-Engine

# …or scaffold every game declared in scripts/configs/repo-layout.json
npm run scaffold:games
```

The scaffold writes `package.json`, `vite.config.ts`, `tsconfig.json`,
`main.ts`, `env.d.ts`, `configs/game.json`, the `./core` link and the shared
root app-icon/public assets. Engine imports resolve through the path aliases
(`@core-engine/*`, `@card-system/*`, `@rule-engine/*`, `@ui/*`, `@ai/*`, …)
against `./core`.

---

## 4. Architecture and implementation

Follow the established scene/architecture conventions rather than inventing new
ones. The `tce-game-dev` skill (§17) is the checklist; these deep dives are the
authoritative "how":

- **Layout — Screen Layout Language (SLL) is mandatory** for new games (no
  hardcoded pixel positions): see
  [Screen Layout Language (SLL)](../DEVELOPER.md#screen-layout-language-sll).
- **HUD and UI components:**
  [Shared HUD Components](../DEVELOPER.md#shared-hud-components).
- **Card hands and piles** render through `HandView` / `PileView`:
  [Hand & Pile Rendering](../DEVELOPER.md#hand--pile-rendering).
- **Animation + SFX** for every player and AI action:
  [Animation & Sound Feedback for Player and AI Actions](../DEVELOPER.md#animation--sound-feedback-for-player-and-ai-actions).
- **Scene/base class and lifecycle:** `CardGameScene` plus the
  [Game Architecture patterns](../../AGENTS.md).

Development loop inside the game repo (the core toolchain runs against `./core`):

```bash
CORE_ROOT=./core npm run dev      # HMR dev server
CORE_ROOT=./core npm run build    # production build (tsc --noEmit && vite build)
```

### Optional systems

These are additive and support feature-flagged graceful degradation:

- **Accessibility / reduced motion.** Respect the SettingsStore toggle and the
  browser `prefers-reduced-motion` media query; animation helpers accept a
  `reducedMotion` override. See
  [Accessibility](../DEVELOPER.md#animation--sound-feedback-for-player-and-ai-actions).
- **Steam achievements (optional).** Declare a game challenge → achievement id
  mapping and wire the engine-generic
  [AchievementSystem](../DEVELOPER.md#steam-achievements-steamworks); the game
  never imports the Steam SDK. Manifest and manual QA:
  [steam-achievements-qa.md](steam-achievements-qa.md).
- **Runtime game plugins / artifacts (optional).** To ship a game as a drop-in
  artifact (no launcher rebuild), follow the
  [Runtime Game Plugins](../DEVELOPER.md#runtime-game-plugins) contract and the
  [runtime-game-plugins-runbook.md](runtime-game-plugins-runbook.md).

---

## 5. Testing profiles

Every game ships its own tests; the engine has comprehensive core coverage. Run
the **unit** profile during implementation, the **smoke/dev** profiles while
iterating, and the **full** suite before release.

```bash
npx vitest run --project unit tests/<game>/      # minimum during implementation
npm run test:smoke                               # quick validation
npm run test:dev                                 # pre-audit / pre-commit
npm test                                         # full suite (release gate)
```

See [Testing](../DEVELOPER.md#testing),
[Skill-integrated test profiles](../DEVELOPER.md#skill-integrated-test-profiles),
[Smoke Tests](../DEVELOPER.md#smoke-tests) and
[Dev Tests](../DEVELOPER.md#dev-tests). Every test must assert observable
behaviour via the public API — the
[test-writing guidelines](../DEVELOPER.md#test-suite-review-value-audit) list
the six anti-patterns to avoid.

---

## 6. CI and release

`npm run build` must succeed and the test profile appropriate to the context
must be green before any push. The full suite is the **only** time the complete
test suite is required (release only).

```bash
npm run build             # TypeScript check + production Vite build
git push origin HEAD:refs/heads/dev   # dev only — never main
```

The core repo's PR CI is build-only; releases are promoted from `dev` to `main`
by the `ship` skill (`scripts/release/merge-dev-to-main.sh`). `CHANGELOG.md` is
managed by the release pipeline — do not edit it by hand. See
[RELEASE.md](../../RELEASE.md) and, for the desktop/Steam artifact,
[Electron Launcher / Desktop Packaging](../DEVELOPER.md#electron-launcher--desktop-packaging).

Game repos follow the same build → test → commit order and push to `dev` only.

---

## 7. Game registration

A game is registered through **two data-driven mechanisms** — there is no
central scene array to edit:

1. **`GAME_INFO`** exported from the game's scene module (Vite's
   game-discovery plugin reads it at build time):

   ```ts
   export const GAME_INFO = {
     sceneKey: 'MyGameScene',
     title: 'My Game',
     description: 'One or two sentences shown on the selector card.',
     thumbnail: 'games/my-game/thumbnail', // optional
   } as const;
   ```

2. **A preset entry** in `configs/*.json` (plus `configs/full.json` and a
   per-game `configs/<game-id>.json`):

   ```json
   {
     "id": "my-game",
     "path": "../tce-my-game",
     "siblingScenePath": "src/scenes/MyGameScene.ts"
   }
   ```

Build or run a single game with `GAMES_CONFIG=<game-id> npm run build` (or
`npm run dev`). The full schema, resolution order and failure modes are in the
[Config-Driven Game Catalogue](game-configuration.md). Also add a `[ Menu ]`
button in the scene that returns to `GameSelectorScene`.

---

## 8. Assets and licensing

Game-owned assets live in the game repo under `public/assets/<game-name>/`;
shared assets (canonical deck, default SFX, app icons) live in the core. All
assets must be CC0, MIT, Apache 2.0 or similarly permissive for commercial use,
and attributed in the core `public/assets/CREDITS.md`.

- [Managing Assets](../DEVELOPER.md#managing-assets) and
  [Game Thumbnails](../DEVELOPER.md#game-thumbnails)
- [CREDITS.md](../../public/assets/CREDITS.md)

```bash
./scripts/refresh-thumbnails.sh <game-name>   # generate/refresh the selector thumbnail
```

---

## 9. Documentation update

Any change that alters developer workflows must update the relevant docs in the
same commit (or create a doc-update child work item). At minimum, update the
game reference table and any new tooling/scripts. See
[Keeping Docs Up to Date](../DEVELOPER.md#keeping-docs-up-to-date) and the
doc-update policy in [`AGENTS.md`](../../AGENTS.md).

---

## 10. Publication

Repositories are created and published by `scripts/publish-repos.ts`: each
target is created public, `dev` is pushed, and `main` is seeded from `dev`.
Only `dev` and `main` are ever published.

```bash
npm run publish:repos -- --dry-run      # print the plan (runs no git/gh command)
npm run publish:repos                   # create + publish every target
npm run publish:repos -- --target golf  # a single target
```

The full contract, safety guards and fresh-clone verification are in the
[Repo publication decision](repo-publication-decision.md). After publication,
verify a recursive clone builds and tests:

```bash
git clone --recurse-submodules git@github.com:TheWizardsCode/tce-my-game.git
cd tce-my-game && npm install && npm run build && npm test -- --project unit
```

---

**Related reading:** [Multi-Repo Architecture](multi-repo-architecture.md) ·
[Config-Driven Game Catalogue](game-configuration.md) ·
[Per-game `src/` layout](per-game-src-layout-decision.md) ·
[Developer Guide](../DEVELOPER.md) ·
[`tce-game-dev` skill §17 checklist](../../.pi/skills/tce-game-dev/SKILL.md#17-definition-of-done-checklist)
