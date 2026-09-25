# Per-game repo `src/` layout & import contract (Option C)

**Status:** Accepted
**Epic:** [CG-0MTR7DLMY008CK17](../README.md) — *REFACTOR: break out core engine and individual games into their own projects*
**Feature:** [CG-0MUH0NTRG007GDME](../README.md) — *F9: Per-game repos use `src/` source root with alias-based core imports*
**Task:** CG-0MUH0OBO300519RT — *C1: Decide per-game `src/` layout, import contract and preset resolution*
**Audience:** Game developers, engine maintainers, launcher maintainers

This is the decision record for reworking the F4 per-game repository scaffold
([`multi-repo-architecture.md` §5](./multi-repo-architecture.md#5-per-game-repo-scaffold-f4))
so that each game repo keeps its own source at the repo-root **`src/`** directory
and imports the engine exclusively through path aliases — **Option C**.

The problem being solved: the F4 scaffold nests the game at
`example-games/<game>/` and bridges the gap with a `src -> <core>/src` symlink,
so that hundreds of repository-root-relative specifiers (`../../src/…`,
`../../../src/…`) keep resolving. That is fragile (it only works because the
game sits exactly two/three levels below the repo root), non-idiomatic, and it
prevents the game's source from occupying `src/`.

Everything below is a decision to be implemented by C2–C5; the machine-readable
counterpart of the preset decision (§5) lands in the code that C4 changes.

---

## 1. Per-game root shape — **flat `src/**`**

**Decision.** A `tce-<game>` repo holds its game source directly under
repo-root `src/` (flat — no extra `src/<game>/` nesting):

```
tce-golf/
├── src/                     # golf game source (was example-games/golf/)
│   ├── GolfGame.ts
│   ├── GolfRules.ts
│   ├── scenes/GolfScene.ts
│   ├── layouts/golf.layout.json
│   ├── help-content.json
│   └── adapters/GolfReplayAdapter.ts
├── tests/                   # golf tests (unchanged location)
├── scripts/                 # golf build/dev tooling (generators, …)
├── docs/                    # golf docs
├── configs/game.json        # single-game preset
├── core/                    # engine git submodule
├── main.ts / env.d.ts / index.html
├── package.json / vite.config.ts / tsconfig.json
```

**Rationale.** *A repo contains exactly one game*, so an extra `src/<game>/`
level adds a directory whose name merely repeats the repo name. The flat form
is what a single-application front-end repo looks like, keeps import specifiers
one segment shorter, and makes `src/scenes/<Game>Scene.ts` the natural scene
path (§5). The game id is already carried by the repo name (`tce-golf`).

**Alternatives rejected.**

| Option | Why rejected |
|---|---|
| `src/<game>/**` | Redundant nesting for a one-game repo; every import gains a segment; the scene path becomes `src/<game>/scenes/…`, no more idiomatic than the monorepo's `example-games/<game>/…`. |
| Keep `example-games/<game>/` inside the game repo too | What F4 currently does; it is the thing Option C exists to remove, and it forces the `src` symlink. |
| Move `src/` *and* flatten the game's top-level files into the repo root | Pollutes the repo root with game files (`GolfGame.ts`, …) and collides with build config; no benefit. |

**Monorepo stays flat.** The launcher/monorepo keeps `example-games/<game>/`
(producer constraint). Only *per-game repos* use `src/`. C4 therefore has to
teach the discovery plugin both layouts — see §5.

---

## 2. Where the game's non-source trees live

**Decision.** The game repo separates **runtime source** (`src/`) from
**repo tooling** (`scripts/`), **tests** (`tests/`), **docs** (`docs/`) and
**config** (`configs/`). The full mapping:

| Tree (in the extracted monorepo) | New location in `tce-<game>` | Rationale |
|---|---|---|
| `example-games/<game>/**` (runtime modules, `scenes/`, `layouts/`, `help-content.json`) | `src/**` | The game's source; flat per §1. Relative JSON imports (`../layouts/…`) move with the file and keep working. |
| `example-games/<game>/scripts/adapters/<Game>ReplayAdapter.ts` | `scripts/adapters/<Game>ReplayAdapter.ts` | The replay adapter is *dev tooling* consumed by the core replay CLI, not part of the game bundle. Keeping it in `scripts/` leaves `src/` runtime-only and avoids a `src/adapters/` grab-bag. |
| `example-games/<game>/scripts/generate-*.ts`, `generate-*.mjs`, `monte-carlo.ts`, `save-load-smoke.ts`, … | `scripts/**` | Repo build/dev tooling; already outside the runtime bundle. |
| `tests/<game>/**` and stray root game tests (`tests/golf/…`, `tests/blackjack.test.ts`) | `tests/**` | Unchanged from F4. Vitest's unit profile already globs `tests/**/*.test.ts`. |
| `example-games/<game>/tests/fixtures/**` | `tests/fixtures/**` | Game-owned fixtures consolidate with the tests that read them, so test paths become `tests/fixtures/…` instead of `example-games/<game>/tests/fixtures/…`. |
| `docs/<game>/**` | `docs/**` | Game docs move with the game; no `docs/<game>/` nesting needed in a one-game repo. |
| `example-games/<game>/main.ts` (legacy standalone entry) | **dropped** | Dead code — nothing imports it (the unified core `main.ts` / the scaffolded game `main.ts` boot the game). C3 excludes it from the extraction rename. |
| shared assets (`public/assets/{cards,audio/default,…}`) | `public/assets/**` symlink to `core` for the local scaffold (unchanged) | Assets are not code; the F1 asset table already enumerates the shared subset. When remotes are created the shared assets are supplied by the `core` submodule. |

**Tests stay at `tests/`, not `src/**/*.test.ts`.** Keeping them separate
preserves the launcher's shared Vitest project config, keeps `tsc --noEmit`
free of test-only globals in the app graph, and avoids a mixed test/source
`src/` tree that would complicate the `include` list.

---

## 3. Symlink disposition — remove the code symlinks, keep `core` as a submodule

F4 creates five directory symlinks plus the shared-asset links. Option C
removes the code symlinks (they exist only to make relative imports work) and
replaces each with an alias or with the `core` submodule:

| F4 symlink | Option C disposition | Replaced by |
|---|---|---|
| `src -> <core>/src` | **Removed** | Game source occupies `src/`; all engine imports use aliases (§4). |
| `scripts -> <core>/scripts` | **Removed** | New `@core-scripts/*` alias (§4); the game's own `scripts/` becomes real. |
| `example-games/gym -> <core>/example-games/gym` | **Removed** | No game source imports Gym; the discovery plugin resolves the core-owned Gym from `coreRoot` (`<core>/example-games/gym`) directly (see `renderGameRegistryModule`). |
| `tests/helpers -> <core>/tests/helpers` | **Removed** | New `@core-tests/*` alias; game tests import `@core-tests/helpers/waitForScene`. |
| `core -> <core>` | **Kept**, but as the `core/` **git submodule** | A stable path for the aliases, the discovery plugin's `coreRoot`, and the shared assets. |
| `public/assets/<shared>` links | **Kept** | Unchanged; assets are not code. |

**Rationale.** Every removed symlink existed to prop up `../../src/**`-style
relative specifiers. Once imports go through aliases (§4), the symlinks are
redundant; removing them eliminates the path-fragility that motivated Option C
and stops the game's own `src/`/`scripts/`/`tests/` trees from colliding with
core's. `core` must remain resolvable because the aliases, the discovery plugin
and the shared assets point into it — as a submodule it is the single
composition point, matching the multi-repo architecture doc.

---

## 4. Import contract — five existing aliases + two core-framework aliases

**Decision.** Game-repo source and tests import engine code **only** through
path aliases. The five engine aliases already exist; Option C adds two for
core-owned trees that currently have no alias:

| Alias | Resolves to (game repo) | Covers |
|---|---|---|
| `@core-engine/*` | `<core>/src/core-engine/*` | game loop, state, RNG, transcripts, save/load |
| `@card-system/*` | `<core>/src/card-system/*` | Card / Deck / Hand / Pile |
| `@rule-engine/*` | `<core>/src/rule-engine/*` | rules, turn logic, `EconomyLedger` |
| `@ui/*` | `<core>/src/ui/*` | UI components, SLL, HUD, overlays |
| `@ai/*` | `<core>/src/ai/*` | AI strategy abstractions |
| **`@core-scripts/*`** *(new)* | `<core>/scripts/*` | replay-adapter framework (`adapters/ReplayAdapter`), used by `scripts/adapters/<Game>ReplayAdapter.ts` |
| **`@core-tests/*`** *(new)* | `<core>/tests/*` | shared test helpers (`helpers/waitForScene`, `helpers/MockFactory`) |

**Rationale.** The task allows either "add an alias or keep a symlink-backed
path" where no alias exists. Aliases are chosen because they are the same
mechanism the engine already uses, they work in *both* the Vite build and the
`tsx`-driven replay CLI (verified: `node --import tsx/esm` resolves
`tsconfig.json` `paths` in this repository), and they keep the per-game repo
free of symlinks. No new npm package is introduced.

**No `../../src/**` specifiers remain.** C2's codemod rewrites every
`(../)+src/<module>` specifier to the matching `@…` alias, and C2 adds a
guard test asserting the pattern is absent from game source and tests (F9
AC3). Relative imports *within* the game (`./GolfRules`, `../layouts/…`) and
relative imports of the shared `core/` tree that have no alias are unaffected.

**Mapping examples** (from the measured blast radius, §6):

| Before | After |
|---|---|
| `../../../src/core-engine/SoundManager` | `@core-engine/SoundManager` |
| `../../src/card-system/Card` | `@card-system/Card` |
| `../../../../scripts/adapters/ReplayAdapter` (adapter) | `@core-scripts/adapters/ReplayAdapter` |
| `../../../../src/core-engine/TranscriptTypes` (adapter) | `@core-engine/TranscriptTypes` |
| `../helpers/waitForScene` (game test) | `@core-tests/helpers/waitForScene` |

---

## 5. `scenePath` contract across contexts — add an explicit sibling path

**Decision.** Extend each preset game entry with an optional
**`siblingScenePath`** (and `siblingAdapterPath`), resolved by the discovery
plugin after the local path. The launcher's `configs/*.json` keep their
monorepo `scenePath` and add the sibling path; a game repo's own
`configs/game.json` uses the `src/` path directly.

Resolution order in `discoverGames(config, projectRoot)`:

1. `<projectRoot>/<scenePath>` — monorepo / core-local (unchanged).
2. `<projectRoot>/<path>/<siblingScenePath>` — **new**: sibling repo in the
   Option C `src/` layout.
3. `<projectRoot>/<path>/<scenePath>` — sibling repo in the legacy F4 layout
   (kept for back-compat; removed once all game repos have been re-scaffolded).

The adapter path (`adapterPath` / `siblingAdapterPath`) follows the same
ordering in `registerConfiguredAdapters`.

**Rationale.** A single `scenePath` cannot serve both contexts any more, because
the two layouts genuinely differ (`example-games/golf/scenes/GolfScene.ts` vs
`src/scenes/GolfScene.ts`). The alternatives are worse:

- **Per-repo presets only** — a game repo's `configs/game.json` is self-contained,
  but the *launcher* still has to resolve the sibling game repos, and it cannot
  read the game repo's preset without a discovery-of-discovery step. Keeping the
  launcher's presets authoritative is simpler and keeps the failure mode
  local to one file.
- **Pure path probing** (try every plausible path) — hides misconfiguration: a
  typo silently resolves to an unexpected file, or to nothing at all with a
  vague error. An explicit per-context field fails fast and is greppable.
- **Uniform `example-games/<game>/` in game repos** — defeats Option C.

**Concrete values (AC3).**

Launcher `configs/full.json` entry for golf (the full preset spans all eight
games; each entry follows the same shape):

```jsonc
{
  "id": "golf",
  "path": "../tce-golf",
  "scenePath": "example-games/golf/scenes/GolfScene.ts",   // monorepo local
  "siblingScenePath": "src/scenes/GolfScene.ts",           // sibling Option C repo
  "adapterPath": "example-games/golf/scripts/adapters/GolfReplayAdapter.ts",
  "siblingAdapterPath": "scripts/adapters/GolfReplayAdapter.ts"
}
```

Sample game repo `tce-golf/configs/game.json`:

```jsonc
{
  "games": [
    {
      "id": "golf",
      "path": ".",
      "scenePath": "src/scenes/GolfScene.ts",
      "adapterPath": "scripts/adapters/GolfReplayAdapter.ts"
    }
  ]
}
```

**Migration (C4).** Rewrite `configs/{full,solo,arcade,deluxe}.json` to add
`scenePath` + `siblingScenePath` (and adapter equivalents) for all eight games;
update `renderPreset()` in `scripts/game-repo-scaffold.ts` (C3) to emit the
`src/` `scenePath`; extend `GameConfigEntry`/`discoverGames` and
`registerConfiguredAdapters` accordingly.

---

## 6. Blast-radius estimate (AC4)

Measured in this worktree at `dev` `7b11cb34` (method: `grep -rIlE` / `git grep`
over tracked files, excluding `node_modules`):

| Metric | Count |
|---|---|
| Game **source** files with a relative `src/` specifier (`example-games/**`, incl. Gym) | **162 files** |
| Game **source** relative `src/` import specifiers | **523** |
| Game **test** files with a relative `src/` specifier (`tests/<game>/**`) | **109 files** |
| Game **test** relative `src/` import specifiers | **162** |
| Adapter files importing `…/scripts/adapters/ReplayAdapter` relatively | 6 |
| **Total files to codemod (C2)** | **≈271** |
| **Total import specifiers to rewrite (C2)** | **≈691** |
| Files referencing `example-games` anywhere (all tracked) | **507** |
| Files referencing `example-games` excluding JSON | 498 |
| Presets to migrate (C4: `full`, `solo`, `arcade`, `deluxe`) | 4 |
| Column symlinks removed per game repo (C3) | 4 (`src`, `scripts`, `example-games/gym`, `tests/helpers`) |

Per-game source breakdown (relative `src/` import specifiers):

| Game | Files | Specifiers |
|---|---|---|
| golf | 16 | 36 |
| beleaguered-castle | 12 | 43 |
| blackjack | 3 | 9 |
| sushi-go | 12 | 20 |
| feudalism | 13 | 19 |
| lost-cities | 13 | 24 |
| main-street | 60 | 121 |
| coloretto | 9 | 13 |
| gym (stays in core) | 24 | 238 |

**Reconciliation with the plan baseline.** F9's plan recorded "319 game-source
`../../src/**` imports" and "507 files referencing `example-games`". The file
count matches exactly (507). The import count differs because the plan counted
*one* depth pattern (`../../src/`, two levels) whereas the codemod must also
rewrite the three-level `../../../src/` form used by files nested under
`scenes/`; this record's 523 game-source specifiers is the superset of both
forms. C2 should treat **all** `(../)+src/` specifiers as in scope, not just
the two-level form.

Notes:

- The Gym (24 files / 238 specifiers) is *not* codemodded in this feature — it
  stays in the core repo and its imports are core-relative already. It is listed
  for completeness because a naive repo-wide codemod would touch it.
- The 507 `example-games` references include the launcher's `configs/*.json`
  (which deliberately keep monorepo paths, §5) and docs; only a subset are
  code specifiers.

---

## 7. Interaction with F4 / F5 / F7

- **F4 (per-game scaffold)** is reworked by **C3**: the scaffold stops
  emitting the `src`/`scripts`/`example-games/gym`/`tests/helpers` symlinks,
  emits `src/`-based `configs/game.json`, and its `tsconfig.json`/`vite.config.ts`
  gain the `@core-scripts/*` and `@core-tests/*` aliases. The extraction
  (`extract-repos.sh`) adds a `--path-rename example-games/<game>/:src/` step
  (C3).
- **F5 (launcher distribution)** is reworked by **C4**: `configs/*.json`
  presets gain `siblingScenePath`; the discovery plugin gains the three-step
  resolution and the new aliases in `resolveCoreAliases`. The one-game (`solo`)
  and all-games (`full`) presets must both build against `src/` sibling repos
  (F9 AC4).
- **F7 (integration verification)** is a **dependent** of F9
  (`CG-0MTRO7ECL006ID7J depends-on CG-0MUH0NTRG007GDME`): its full build + test
  gate must be re-run *after* C1–C5 land, because the sibling layout and the
  presets it verifies are exactly what this feature changes. Verifying F7
  before F9 would certify a stale layout.
- **GitHub remotes remain uncreated** (F4 producer gate). The nine `tce-*`
  repos are created once, after C1–C4, in the final `src/` shape, to avoid a
  history-rewriting re-push. C1–C5 operate against local scaffolds only.

---

## 8. Consequences

- **Positive:** idiomatic per-game layout; no code symlinks; imports resolve
  identically in Vite and `tsx`; a single explicit field encodes the
  monorepo-vs-sibling difference; the `src`-collision that forced the F4
  symlinks is gone.
- **Cost:** a one-off codemod of ~271 files / ~691 specifiers (C2) and a
  coordinated change across the launcher presets, discovery plugin and
  scaffold (C3/C4). Full history is preserved for the moved
  `example-games/<game>/**` tree via `filter-repo --path-rename`.
- **Risk:** `tsx` alias resolution must keep working inside a game repo. It is
  verified here against this repo's `tsconfig.json`; C3 must add the aliases to
  the scaffolded `tsconfig.json` and C5 must prove `npm test -- --project unit`
  (which drives the `tsx` replay CLI) green in a scaffolded repo.
