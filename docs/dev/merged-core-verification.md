# Merged-core (Option A) end-to-end verification (F7)

**Status:** Verified
**Epic:** CG-0MUJ0IAJM009X0Q2 — *Merge the core into `Tableau-Card-Engine` (Option A)*
**Work item:** CG-0MUJ168XG006DOGK — *Verify the merged-core architecture end to end*
**Decision:** [`merged-core-decision.md`](./merged-core-decision.md)

This document records the fresh-clone and full-suite evidence that the
merged-core topology is correct. The core repo (`Tableau-Card-Engine`) holds the
engine + Gym + launcher shell and no games; each `tce-<game>` composes it as a
`./core` submodule; the multi-game distribution composes the game repos as
**sibling checkouts** (the core never submodules games, so the graph is
acyclic).

## Repo pins

| Repo | Branch | Tip at verification |
|---|---|---|
| `Tableau-Card-Engine` | `dev` | `ecbadd81` + the F7 shared-dependency fix |
| `tce-golf`, `tce-main-street`, … | `dev` / `main` | `core` gitlink → `f16bc06dfd09eda694c68c78860afcc978588c12` |

## AC1 — fresh recursive clone of two game repos

```bash
git clone --recurse-submodules git@github.com:TheWizardsCode/tce-golf.git
git clone --recurse-submodules git@github.com:TheWizardsCode/tce-main-street.git
```

Both clones register `submodule 'core'
(git@github.com:TheWizardsCode/Tableau-Card-Engine.git)` and check out
`f16bc06d`. Per repo (default branch `main`):

| Repo | `npm install` | `npm run build` | `npm test` (unit) |
|---|---|---|---|
| `tce-golf` | exit 0 | ✅ `tsc --noEmit` + Vite (305 modules) | ✅ 12 files, 223 passed / 5 skipped |
| `tce-main-street` | exit 0 | ✅ `tsc --noEmit` + Vite (386 modules) | ✅ 238 files, 3922 passed / 3 skipped |

## AC2 — sibling distribution builds `core-only`, `solo`, `full`

Bootstrapped with the F4 helper (games' `./core` submodules omitted — each
game's own dependency install is not required for the launcher build):

```bash
npm run setup:distribution -- --dir /home/rgardler/tce-f7-dist --branch dev --no-submodules
cd Tableau-Card-Engine && npm install
GAMES_CONFIG=core-only npm run build   # ✅ 285 modules
GAMES_CONFIG=solo      npm run build   # ✅ 305 modules (gym + golf sibling)
GAMES_CONFIG=full      npm run build   # ✅ 482 modules (gym + all 8 siblings)
```

All three builds run `tsc --noEmit` followed by a successful Vite production
bundle.

## AC3 — clean submodule status, acyclic graph

```bash
git -C tce-golf submodule status
#  f16bc06dfd09eda694c68c78860afcc978588c12 core (v0.1.17-112-gf16bc06d)
git -C tce-main-street submodule status
#  f16bc06dfd09eda694c68c78860afcc978588c12 core (v0.1.17-112-gf16bc06d)
```

The leading space (no `+`/`-`) means the checked-out gitlink matches the
recorded pin. The core checkout declares **no** `.gitmodules` and its
`example-games/` contains only `gym`, so the submodule graph has no cycle.

## AC4 — `tests/scripts/` contract suite

```bash
npx vitest run --project unit tests/scripts/
# Test Files  14 passed (14)
# Tests       264 passed | 38 skipped (302)
```

This includes the F1 merged-core topology contract tests in
`extract-repos.test.ts` / `repo-publication.test.ts` and the Vite discovery
plugin suite.

## AC5 — full suite at the final commit

The full project test suite (`npm test`) passes at the F7 commit in the core
checkout, recorded by the implement finish gate:

```bash
python3 <test-skill>/run_tests.py --scope full
# unit:    131 files passed — 2070 passed / 38 skipped
# browser:  28 files passed — 192 passed
# tutorial E2E parts skipped (no Main Street checkout)
# exit 0, no failures
```

During verification a suite run in a **sibling distribution** (game repos
checked out at `../tce-<game>`) exposed a separate test-profile bug — see
*Discovered issue (tracked and deferred)* below. That failure does not occur in
the core checkout this document verifies against.

## Discovered issue and fix — sibling shared-dependency resolution

The `GAMES_CONFIG=full` build **failed** on the first pass:

```
[vite]: Rollup failed to resolve import "phaser" from
"/home/rgardler/tce-f7-dist/tce-sushi-go/src/scenes/SushiGoScene.ts".
```

A sibling game is bundled straight from `../tce-<game>/src/` and has no
guaranteed `node_modules` of its own; Vite resolved the bare `phaser` /
`tone` imports relative to the *game* directory, not the core. The launcher
owns these shared runtime deps (they are in the core's `package.json`), so
`vite.config.ts` now pins them to the core checkout:

```ts
resolve: {
  alias: resolveCoreAliases(process.env.CORE_ROOT || __dirname),
  dedupe: ['phaser', 'tone'],
}
```

After the fix the `full` build succeeds (482 modules). A contract test
(`tests/vite-config.test.ts` → *vite config dedupes shared runtime deps for
sibling games*) guards the config, so the regression cannot return silently.

## Discovered issue (tracked and deferred) — sibling distribution test profile

Running the full suite from the core checkout **with the sibling game repos
present** fails in `tests/vite-config.test.ts` (*only references test files
that exist*): the guard treats a sibling `../tce-<game>` checkout as proof the
core owns `tests/<game>/...`, but in Option A the game's tests live in the game
repo. `coreOrSelected()` likewise keeps `tests/<game>/...` paths that do not
exist in the core. This is a test-profile design gap, not a topology defect,
and is tracked separately as **CG-0MUKWPTZ50040V0Q** (bug, high). It does not
block the F7 acceptance criteria, which verify the core checkout and the
distribution *builds*.
