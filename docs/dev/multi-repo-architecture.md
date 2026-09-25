# TCE Multi-Repo Architecture & Extraction (F1)

**Status:** Accepted
**Epic:** [CG-0MTR7DLMY008CK17](../README.md) — *REFACTOR: break out core engine and individual games into their own projects*
**Feature:** CG-0MTRO6P18003AZIZ — *Design architecture & extraction script with history*
**Audience:** Engine maintainers, game developers, distribution builders

This document is the architecture decision record for decomposing the Tableau
Card Engine (TCE) monorepo into one **core-engine** repository plus one
repository per example game, composed back together with **git submodules**.
It records *what moves where*, *how history is preserved*, and *how assets are
partitioned*.

The machine-readable form of every decision here lives in
[`scripts/configs/repo-layout.json`](../../scripts/configs/repo-layout.json) —
that file is the single source of truth consumed by both the extraction script
(`scripts/extract-repos.sh`, this feature) and the distribution builds
(`configs/*.json` presets + Vite discovery plugin, F3).

---

## 1. Target repository layout

```
<parent>/
├── tableau-card-engine-core/     # the engine + Gym + launcher shell
├── tce-golf/                     # one repo per game …
├── tce-beleaguered-castle/
├── tce-blackjack/
├── tce-sushi-go/
├── tce-feudalism/
├── tce-lost-cities/
├── tce-main-street/
└── tce-coloretto/                # … 8 games in total
```

Repos are checked out as **siblings**. A game repo pulls the engine in as a git
submodule at `./core`, so a `game + engine` checkout is itself a minimal TCE
distribution with exactly one game. The main `Tableau-Card-Engine` repository
becomes the **launcher/distribution**: it composes the engine with any subset
of game submodules.

### Decision table — what stays in core

| Area | Path | Owner |
|---|---|---|
| Game loop, state, RNG, transcripts, save/load | `src/core-engine/**` | core |
| Card / Deck / Hand / Pile abstractions | `src/card-system/**` | core |
| Rules, turn logic, `EconomyLedger` | `src/rule-engine/**` | core |
| Reusable UI components, SLL, HUD, overlays | `src/ui/**` | core |
| AI strategy abstractions | `src/ai/**` | core |
| Balance-card tooling | `src/balance-cards/**` | core |
| **Gym** — canonical engine feature demonstrator | `example-games/gym/**` | core |
| Launcher shell — game selector, game bootstrap | `src/ui/GameSelectorScene.ts`, `src/ui/createCardGame.ts` | core |
| Electron launcher host | `electron/**` | core |
| Shared configs | `package.json`, `tsconfig.json`, `vite.config.ts` | core |
| Entry HTML | `index.html` | core |
| Shared assets | `public/assets/**` (subset — see §3) | core |

Per-game repos own `example-games/<game>/**` plus that game's tests
(`tests/<game>/**`, or the game's root-level test files) and its docs.

**Rationale for keeping the Gym in core:** the Gym is the authoritative,
executable specification of core-engine features (see `docs/gym/GYM_INDEX.md`).
It must move in lock-step with the engine, so it cannot live in a game repo.
Consequently the Gym may **only** reference core-owned assets — see the
cross-boundary fixes in §3.

### History preservation

Full history preservation is required (producer decision). The chosen tool is
**`git filter-repo`**:

```bash
# For each target repo, on a fresh clone of the monorepo:
git clone --no-local <monorepo> <target>
git -C <target> filter-repo --force --path <path> [--path <path> …]
```

`--path` preserves the commits that touched the selected paths, so every moved
file keeps its full blame/log history. Extraction therefore never rewrites the
source monorepo — it always filters a **clone**.

`git subtree` was considered and rejected: it splits a subdirectory into a new
history but is awkward to drive for ~9 targets, does not handle per-file asset
selection, and is materially slower on this repository's history.

**Installation requirement.** `git filter-repo` is not part of git itself and
is not present on all hosts. It is available via pip or apt:

```bash
pip install git-filter-repo           # or: apt-get install git-filter-repo
git config --global --add safe.directory '*'   # for in-place rewrites
```

`scripts/extract-repos.sh` detects the tool and, when it is missing, prints
this remediation and exits non-zero for real runs (a `--dry-run` still plans,
so the layout can be reviewed on any host).

---

## 2. Extraction script

`scripts/extract-repos.sh` drives the extraction from
`scripts/configs/repo-layout.json`:

```bash
scripts/extract-repos.sh --list                  # target names, one per line
scripts/extract-repos.sh --dry-run               # print the full plan, no writes
scripts/extract-repos.sh --target golf           # extract one target
scripts/extract-repos.sh --target core
scripts/extract-repos.sh --out-dir ../tce-repos  # where repos are created
scripts/extract-repos.sh                         # extract all 9 repos
```

Verified end-to-end against this repository: **852 commits** retained in the
core repo, and 23–995 commits retained per game repo (largest: main-street).
Unselected paths are absent from each result, and a contaminated tree cannot
occur because filtering starts from a clean clone.

---

## 3. Asset ownership (AC3)

Every directory under `public/assets/` is classified in
`repo-layout.json → assetDecisionTable` with an owner (`core` or a game name)
and a written rationale. The audit is reproduced here:

| Asset path | Owner | Why |
|---|---|---|
| `CREDITS.md` | core | Attribution index covering shared **and** game-owned assets; extended as games move out. |
| `cards/*.svg` (53) + `cards/card_back.svg` | core | Canonical 52-card deck (SVGCards *Vertical2*, Public Domain) + back; shared by Gym, Golf, Blackjack and Card System tests. |
| `cards/alternative/` (`webisso/`, 53) | core | Webisso MIT "Modern" deck — a core-provided alternative design, not owned by any game. |
| `cards/lost-cities/` (121) | lost-cities | Expedition-specific SVGs from `scripts/generate-lost-cities-cards.ts`; used only by Lost Cities. |
| `audio/*.wav` (8 at root) | core | Legacy root-level shared SFX referenced directly as `assets/audio/<name>.wav`. |
| `audio/default/` (11) | core | Shared default SFX incl. `game-win`, `game-lost`, `illegal-move`; referenced by Gym, Golf, Beleaguered Castle, Lost Cities, Main Street, Coloretto. |
| `audio/beleaguered-castle/` (15) | beleaguered-castle | Castle-themed SFX from `generate-castle-sfx.mjs`. |
| `audio/blackjack/` (9) | blackjack | Referenced only by Blackjack. |
| `audio/coloretto/` (5) | coloretto | Referenced only by Coloretto. |
| `audio/feudalism/` (6) | feudalism | Referenced only by Feudalism. |
| `audio/golf/` (10) | golf | From `scripts/generate-sfx.mjs`. |
| `audio/lost-cities/` (12) | lost-cities | From `scripts/generate-lost-cities-sfx.mjs`. |
| `audio/sushi-go/` (6) | sushi-go | Referenced only by Sushi Go. |
| `games/<game>/thumbnail.png` | `<game>` | Game Selector thumbnails, generated per game. |
| `games/main-street/` (190) | main-street | Card SVGs, icons and game audio for Main Street. |
| `sushi-go/` (14 icons + `STYLE.md`, `preview.html`) | sushi-go | In-house Sushi Go icons. |

### Why shared assets are enumerated as files, not directories

`git filter-repo` **directory includes re-include their children**: passing
`--path cards/` always brings `cards/lost-cities/` back, and a
`--path '!cards/lost-cities/'` exclusion does *not* subtract it. Globs are no
escape either — `*` crosses `/`, so `--path-glob 'audio/*.wav'` pulls in
`audio/golf/*.wav`.

The layout therefore never declares a broad parent of a game-owned child.
Instead it enumerates:

- the **disjoint shared subtrees** (`cards/alternative/`, `audio/default/`),
- the **shared files** (`cards/*.svg`, the root `audio/*.wav`), and
- the **game-owned subtrees** in their game's repo.

Game-owned subdirectories are simply absent from core's rules. (In the
monorepo these shared files are generated into the layout by
`repo-layout.json → sharedAssets`; the extraction test suite asserts no
game-owned asset directory is reachable from core's rules.)

### Cross-boundary fixes required before extraction

The asset audit surfaced two Gym references to assets it will not own once the
Gym lives in the core repo:

1. `example-games/gym/scenes/GymTokenPileViewScene.ts` loads
   `assets/cards/classic-vector/back.png`, which **does not exist** in
   `public/assets/` (it is the only reference in the repo and is absent from
   `CREDITS.md`). Retarget it to the shared
   `assets/cards/card_back.svg`.
2. `example-games/gym/scenes/GymSvgHelpersScene.ts` loads
   `assets/sushi-go/icon-tempura.svg` — a **game-owned** asset. Retarget the
   demo to a core-owned SVG.

Both are recorded in `repo-layout.json → notes.crossBoundaryFixes` so the F2
(core repo) work item applies them when the Gym becomes the core's property.

---

## 4. Core/game coupling resolution (F2)

Making the core repo build standalone required removing every dependency from
core code on game code. The couplings found and how each was resolved:

| Coupling | Resolution |
|---|---|
| `src/ui/debug/{MarketCardCheat,StaffApplicantCheat}Overlay.ts` imported Main Street | Moved to `example-games/main-street/debug/` |
| `scripts/balance/**` + `tests/balance/**` imported Main Street | Moved to `example-games/main-street/scripts/balance/` and `tests/main-street/balance/` |
| Game-specific `scripts/*` (card generators, monte-carlo, playtest, save-load-smoke, transcript generators, SFX generators) | Moved to `example-games/<game>/scripts/` |
| `scripts/adapters/*ReplayAdapter.ts` (per-game) | Moved to `example-games/<game>/scripts/adapters/`; the framework (`AdapterRegistry`, `ReplayAdapter`) stays in core |
| `scripts/adapters/index.ts` registered all adapters | Now a pure core module; `registerConfiguredAdapters()` loads adapters named by the active preset's `adapterPath` |
| `example-games/gym/GymCardIndex{Scene,}.ts` imported Main Street card data | Moved to `example-games/main-street/gym/` (it browses the Main Street card pool, not a core feature) |
| Core tests importing game fixtures (`I18n`, `LegalityResult`, `EconomyLedger`, `screen-layout-*`, `HelpPanel`, `ListenerLeaks`, undo/redo, hud-layer-contract) | Moved to their owning game's test tree |
| `tests/replay/adapters.test.ts` used real game adapters | Split: framework tests stay in core with `tests/helpers/FakeReplayAdapter.ts`; per-game adapter tests moved to golf and beleaguered-castle |
| `tests/replay/replay.test.ts` drove golf replay | Moved to `tests/golf/` |
| Per-game transcript/layout fixtures under `tests/fixtures/` | Moved to `example-games/<game>/tests/fixtures/` |
| `vite.config.ts` smoke/dev lists hardcoded game test paths | Filtered through `selectedGameIds()` so a core-only checkout runs only core + Gym |
| `tests/core-engine/no-runtime-synthesis.test.ts` flagged moved SFX generators | Walk now skips any `scripts/` directory (build-time tooling is not runtime code) |
| Launcher/agent-infra tests (`.pi/` tracking, Main Street asset-deletion guard) | Kept out of core; they guard the launcher repo |

**Core-owned and unchanged:** `src/balance-cards/**` (the algorithm library itself
is game-agnostic — only the `scripts/balance/**` consumers were Main Street
coupled) and the `scripts/adapters/{AdapterRegistry,ReplayAdapter}.ts`
framework.

**Verified standalone core** (extracted via `scripts/extract-repos.sh
--target core`): `tsc --noEmit` clean, `npm run build` and `npm run
build:electron` succeed (283 modules, core-only), the unit suite passes (114
files / 1840 tests) and the Gym smoke profile boots (2 files / 20 tests).

---

## 5. Per-game repo scaffold (F4)

> **Superseded layout (F9 / Option C).** The `example-games/<game>/` +
> `src -> <core>/src` symlink layout described in this section is reworked by
> feature F9 (CG-0MUH0NTRG007GDME): per-game repos use a flat repo-root `src/`
> with alias-only engine imports. The deciding record — per-game root shape,
> non-source tree placement, symlink disposition, import contract and the
> `scenePath` contract — is
> [`per-game-src-layout-decision.md`](./per-game-src-layout-decision.md).
> This section remains accurate for the F4 baseline it describes.

`scripts/extract-repos.sh` (F1) splits a game's tree out of the monorepo but
leaves it unbuildable: a game repo has no `package.json`, `vite.config.ts`,
`tsconfig.json`, `main.ts` or `index.html`. `scripts/game-repo-scaffold.ts`
adds them, turning an extracted checkout into a runnable **single-game
launcher** that composes the sibling core (`../tableau-card-engine-core`).

```bash
# One game, next to an extracted checkout:
tsx scripts/game-repo-scaffold.ts \
  --game golf --game-repo-root ../tce-golf \
  --core-root ../tableau-card-engine-core

# Every game in scripts/configs/repo-layout.json:
npm run scaffold:games
```

What it writes into the game repo:

- **`package.json`** — name `tce-<game>`, the core's dependencies and
devDependencies, and the core toolchain scripts (`save-load-smoke`,
`monte-carlo`, `replay`, …) with the repo entry points (`dev`, `build`,
`build:electron`, `test`) overridden.
- **`vite.config.ts`** — imports `gameDiscoveryPlugin` and `resolveCoreAliases`
from the sibling core and reads `configs/game.json` (Gym + this one game) by
default; `GAMES_CONFIG` can still override for an ad-hoc build.
- **`tsconfig.json`** — the core aliases (`@core-engine`, `@card-system`,
`@rule-engine`, `@ui`, `@ai`, `@balance-cards`, `@core-scripts`,
`@core-tests`, `@core-gym`) point at the sibling core; `src/**` and `tests/**`
are included; browser/E2E tests are excluded from the type-check (they belong
to the launcher distribution).
- **`main.ts`, `env.d.ts`, `index.html`** — the entry point and its
virtual-module types.
- **`configs/game.json`** — a single-game preset whose `scenePath` is
`src/scenes/<Game>Scene.ts`.

### Option C layout — flat `src/`, no compatibility symlinks (F9)

The F4 layout above (game at `example-games/<game>/`, `src -> <core>/src`)
is reworked by feature **F9** into **Option C**: the game's source lives at
repo-root `src/` and every engine import goes through a path alias. The
deciding record is
[`per-game-src-layout-decision.md`](./per-game-src-layout-decision.md).

`scripts/extract-repos.sh` now renames each game's tree during extraction,
history-preservingly:

```
example-games/<game>/  ->  src/        (git filter-repo --path-rename)
```

The game's own `tests/` and `scripts/` trees travel with it, so they live at
`src/tests/` and `src/scripts/`. The game's **unit/browser tests** stay at
`tests/<game>/`; the scaffold rewrites the `example-games/<game>/` segment of
those tests to `src/` (so a test at `tests/<game>/…` reaches the source with
`../../src/…`), including runtime fixture paths. Only one directory link
remains — `core` (the engine checkout, a git submodule once the remotes exist).
The old `src`, `scripts`, `example-games/gym` and `tests/helpers` symlinks are
gone, replaced by aliases:

| Old F4 symlink | Option C replacement |
|---|---|
| `src -> <core>/src` | game source occupies `src/`; engine imports use `@core-engine/*` etc. |
| `scripts -> <core>/scripts` | `@core-scripts/*` (replay-adapter framework) |
| `example-games/gym -> <core>/example-games/gym` | `@core-gym/*` (game-owned Gym-backed scenes) |
| `tests/helpers -> <core>/tests/helpers` | `@core-tests/*` (shared test helpers) |
| `core -> <core>` | kept (git submodule) |
| `public/assets/<shared>` | kept (assets are not code) |

### Verifying a scaffolded game repo

```bash
npx tsc --noEmit && npm run build && npm run build:electron
npm test          # vitest run --project unit
```

Verified end to end for **golf** and **main-street** against a core checkout:
`tsc --noEmit` and `vite build` both succeed with the game source at `src/`
and no `src` symlink (F9/C3). The full build + test gate for the composed
launcher is F7.

### GitHub remotes are not created in this phase

The scaffold writes local checkouts only. Creating the nine GitHub repositories
and pushing the extracted history was **not authorised** in this phase (producer
decision), so the `tce-<game>` remotes recorded in
`scripts/configs/repo-layout.json` are documented but not yet created. The
scaffold wires the local composition that F5 (launcher distribution) and F7
(integration verification) consume.

## 6. Follow-on work (not in this feature)

- **F2** creates the core-engine repository from this script's `core` target.
- **F3** adds config-driven game discovery: a Vite plugin plus per-game
  `GAME_INFO` and `configs/*.json` presets, so the Game Selector enumerates
  only the checked-out games (currently `main.ts` statically imports all 8).
- **F4** creates the 8 game repos and their `./core` submodule wiring.
- **F5** makes the launcher assemble 1..n games for web + Electron builds.
- **F6** updates `README.md`, `docs/DEVELOPER.md` and `AGENTS.md`.
- **F7** runs the full build + test gate.

Feature **F9** (CG-0MUH0NTRG007GDME) then reworks the per-game layout to a flat
repo-root `src/` with alias-only engine imports; see
[`per-game-src-layout-decision.md`](./per-game-src-layout-decision.md).

Verification for this feature is the unit suite
[`tests/scripts/extract-repos.test.ts`](../../tests/scripts/extract-repos.test.ts)
plus the end-to-end extraction evidence recorded on the work item.
