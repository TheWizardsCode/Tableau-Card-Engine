# Config-Driven Game Catalogue

**Audience:** Game developers, engine maintainers, distribution/release engineers

This is the authoritative reference for how a TCE build decides **which games
it contains**. A build's catalogue is generated at build time from a JSON
*preset* in `configs/`; the launcher shell imports the virtual module
`virtual:game-registry` and never hardcodes game imports. That is what lets the
core-engine checkout build with **no** games, the launcher distribution build
with **any subset of 1..n** games, and a game repo build with exactly **its own**
game — all without editing source.

- README summary: [Which games does a build include?](../../README.md#which-games-does-a-build-include)
- Plugin implementation: [`scripts/vite-game-discovery-plugin.ts`](../../scripts/vite-game-discovery-plugin.ts)
- Repo partition (a *different* config): [`scripts/configs/repo-layout.json`](../../scripts/configs/repo-layout.json) — see
  [Multi-Repo Architecture](multi-repo-architecture.md)
- New-game lifecycle: the canonical [Creating a New Game](creating-a-new-game.md)
  guide links here for its registration stage (stage 7).

## Selecting a preset

Set the `GAMES_CONFIG` environment variable (or a Vite `--mode`) to either:

- a **preset name** — a `configs/<name>.json` file without the suffix, e.g.
  `GAMES_CONFIG=full`; or
- an **explicit path** — any value containing a path separator or ending in
  `.json` is used as-is (relative to the project root), e.g.
  `GAMES_CONFIG=configs/full.json` or `GAMES_CONFIG=/tmp/my-preset.json`.

When `GAMES_CONFIG` is unset the default preset is **`core-only`** (the engine
+ Gym, no games):

```bash
npm run build                              # default: core-only (engine + Gym)
GAMES_CONFIG=golf npm run build            # configs/golf.json (one game + Gym)
GAMES_CONFIG=main-street npm run build     # configs/main-street.json
GAMES_CONFIG=solo npm run build            # configs/solo.json (a distribution preset)
GAMES_CONFIG=full npm run build            # configs/full.json (all games + Gym)
GAMES_CONFIG=configs/full.json npm run build   # an explicit preset path
GAMES_CONFIG=/tmp/my-preset.json npm run build # an absolute path
```

The env var is read by `selectConfigPath()` and honoured by `npm run dev`,
`npm run build`, `npm run build:electron`, the test profiles and the Electron
packaging scripts alike.

### Unknown preset names fail the build

An unknown preset **name** is a hard error. Silently falling back to a preset
would ship a distribution missing the games the operator asked for, so the
build stops with a message naming the requested value and listing the available
presets:

```text
[game-discovery] Unknown GAMES_CONFIG preset "sussi-go".
Expected one of: arcade, beleaguered-castle, blackjack, coloretto, core-only,
deluxe, feudalism, full, golf, lost-cities, main-street, solo, sushi-go
(or an explicit path such as configs/sussi-go.json).
```

## Shipped presets

Two families ship in `configs/`, both plain data — no plugin change is needed
to add one.

### Distribution presets

Distribution presets describe the *shapes* a launcher build can take. They are
named by distribution, not by game:

| Preset | Games | Purpose |
|---|---|---|
| [`configs/core-only.json`](../../configs/core-only.json) | none — engine + Gym | The default; a bare `npm run build` in the core repo. |
| [`configs/solo.json`](../../configs/solo.json) | golf | The **1 game + Gym** boundary case. |
| [`configs/arcade.json`](../../configs/arcade.json) | main-street, golf | A small non-empty subset (1 < n < all). |
| [`configs/deluxe.json`](../../configs/deluxe.json) | feudalism, lost-cities | A second, distinct partial distribution. |
| [`configs/full.json`](../../configs/full.json) | all nine games | The complete distribution; the test runners default to this. |

`solo` and `full` pin the boundary cases (exactly 1 game, all games). `arcade`
and `deluxe` pin genuinely different partial distributions so the selector's
catalogue is proven to vary with the preset. These presets are kept **as-is**;
per-game presets are additive and never rename or replace them (`solo` ships
golf even though `golf.json` also selects golf).

### Per-game presets

One preset per example game — `configs/<game-id>.json` — each containing
**exactly that game's entry**. They exist so a developer can build or run a
single game in isolation (`GAMES_CONFIG=<game-id>`) without pulling in the
others:

| Preset | Game |
|---|---|
| [`configs/beleaguered-castle.json`](../../configs/beleaguered-castle.json) | beleaguered-castle |
| [`configs/blackjack.json`](../../configs/blackjack.json) | blackjack |
| [`configs/coloretto.json`](../../configs/coloretto.json) | coloretto |
| [`configs/feudalism.json`](../../configs/feudalism.json) | feudalism |
| [`configs/golf.json`](../../configs/golf.json) | golf |
| [`configs/lost-cities.json`](../../configs/lost-cities.json) | lost-cities |
| [`configs/main-street.json`](../../configs/main-street.json) | main-street |
| [`configs/sushi-go.json`](../../configs/sushi-go.json) | sushi-go |

The game id matches the preset filename and the sibling repo suffix
(`../tce-<game-id>`) used everywhere else. The always-present Gym means
`GAMES_CONFIG=golf` produces **golf + Gym**, never golf alone.

## Preset schema

A preset is a JSON object with one top-level key:

```jsonc
{
  // Non-schema annotation. Ignored by the loader; documents the preset.
  "$comment": "Per-game preset: 9-Card Golf only (plus the core-owned Gym).",

  "games": [
    {
      "id": "golf",
      "path": "../tce-golf",
      "scenePath": "example-games/golf/scenes/GolfScene.ts",
      "siblingScenePath": "src/scenes/GolfScene.ts",
      "adapterPath": "example-games/golf/scripts/adapters/GolfReplayAdapter.ts",
      "siblingAdapterPath": "src/scripts/adapters/GolfReplayAdapter.ts"
    }
  ]
}
```

### `games` (required)

A (possibly empty) array of game entries. An empty array is a valid,
core-only-style build. Every entry must be an object with the required fields
below; the array is processed in order.

### Required fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable game id (e.g. `main-street`). Also the sibling directory suffix (`tce-main-street`) and the preset filename stem. |
| `path` | string | Sibling repo root, relative to the core/launcher root. By convention `../tce-<id>`. |
| `scenePath` | string | Scene module path in the game repo's *legacy* flat `example-games/<id>/…` layout, e.g. `example-games/golf/scenes/GolfScene.ts`. Used as the second (legacy) sibling candidate. |

All three must be non-empty strings; the loader rejects a missing or empty
field with a message naming the preset and index.

### Optional fields

| Field | Type | Meaning |
|---|---|---|
| `siblingScenePath` | string | Scene module path in a `src/`-layout sibling repo (**Option C**), resolved against `path`, e.g. `src/scenes/GolfScene.ts`. Optional; when absent the legacy `scenePath` is used for the sibling lookup. |
| `adapterPath` | string | Replay-adapter module path inside the game repo (flat layout). When present, `scripts/replay.ts` dynamically imports it and registers the adapter, so replay works without the core importing game code. Omitted for games that have no adapter (currently `blackjack` and `coloretto`). |
| `siblingAdapterPath` | string | Replay-adapter path in a `src/`-layout sibling repo (Option C), resolved against `path`. |

By convention `siblingScenePath` is `scenePath` with the
`example-games/<id>/` prefix replaced by `src/`, and `siblingAdapterPath` is
`adapterPath` likewise. The unit tests assert this pairing for every shipped
preset.

### `$comment` (non-schema)

`$comment` is **not part of the schema** — the loader neither reads nor
validates it. It is a documentation-only annotation carried in the file so a
preset explains its own purpose next to the data. The JSON parser sees it as an
ordinary (ignored) key.

## Resolution order

Each configured game is resolved against the on-disk layout by trying two
sibling candidate scene paths **in order**, and using the first that exists:

1. **`<root>/<path>/<siblingScenePath>`** — the Option C `src/` layout of a
   sibling game repo, when `siblingScenePath` is present.
2. **`<root>/<path>/<scenePath>`** — the legacy sibling layout, so a preset
   keeps working for a game repo that has not yet migrated to the `src/`
   layout.

`<root>` is the Vite project root (the repo being built); `<path>` is resolved
relative to it (in the composed distribution this is the sibling checkout). The
merged core carries **no games at HEAD**, so an in-tree
`example-games/<game>/` copy is never consulted. Presets resolve from a git
worktree exactly as from the main checkout, relative to the worktree root —
so a worktree needs its sibling checkouts beside it (or run distribution
builds from the main checkout).

One preset set therefore works in every composition, because each game repo
supplies its own source (at repo-root `src/`, or the legacy
`example-games/<game>/`).

### Failure mode: game not found

If no candidate exists, the build **fails fast** — a partially-populated
distribution is worse than a failed one. The error names the game and every
candidate path that was tried:

```text
[game-discovery] Game "golf" not found. Expected its scene module at one of:
  /…/tce-golf/src/scenes/GolfScene.ts,
  /…/tce-golf/example-games/golf/scenes/GolfScene.ts.
Check out the sibling repo at ../tce-golf (or remove "golf" from the preset).
```

## The core-owned Gym

The **Gym** (`example-games/gym/`) is core-owned and is present in **every**
build, including `core-only`. It is not listed in any preset: the registry
generator prepends it from `GYM_SCENE_NAMES`/`GYM_ENTRY`
(`scripts/vite-game-discovery-plugin.ts`), importing the Gym barrel from the
core root (`coreRoot`) when one is supplied so a game repo gets the Gym from its
`./core` submodule rather than its own tree. Consequently a preset containing
one game produces a catalogue of *that game + Gym*, and an empty preset
produces *Gym only*.

## The `GAME_INFO` convention

Every game's scene module exports its catalogue metadata next to its scene
class:

```ts
export const GAME_INFO = {
  sceneKey: 'GolfScene',
  title: '9-Card Golf',
  description: 'Single-round Golf (human vs. AI). Lowest score wins.',
  thumbnail: 'games/golf/thumbnail', // optional; relative to the game's asset root
} as const;
```

| Field | Required | Meaning |
|---|---|---|
| `sceneKey` | yes | The Phaser scene key the Game Selector starts. |
| `title` | yes | Display name on the selector card. |
| `description` | yes | One-line blurb on the selector card. |
| `thumbnail` | no | Asset path, relative to the game's asset root (`assets/<thumbnail>.png`). |

### How the plugin parses it

The plugin **cannot import** the scene module — it imports Phaser and can only
be evaluated in a browser/Vite context. Instead `readGameInfo()` performs a
bounded text scan of the module source:

- It finds the `GAME_INFO` keyword, then brace-matches a **flat object
  literal** of string values (single-, double- or back-tick-quoted). Nested
  objects are not supported.
- The scan is bounded by `GAME_INFO_SCAN_LIMIT` (4,000 characters from the
  keyword) so a pathological file cannot scan indefinitely; the whole file is
  still read, because scene modules can be tens of KB and `GAME_INFO` is often
  declared near the end.
- The **scene class name is derived from the module file name**
  (`GolfScene.ts` → `GolfScene`), not from `GAME_INFO.sceneKey`.

Failures are hard errors naming the offending module:

- no `GAME_INFO` export → "…does not export GAME_INFO. The GAME_INFO
  convention (sceneKey, title, description[, thumbnail]) is required…";
- malformed/unbalanced `GAME_INFO` → "Malformed/Unbalanced GAME_INFO in …";
- a missing `sceneKey`, `title` or `description` → "…GAME_INFO.<field> is
  required.".

## What the generated registry looks like

`renderGameRegistryModule()` turns the resolved games into the
`virtual:game-registry` module. It exports:

- `GAMES` — the catalogue (`GameEntry[]`), **Gym first**, then each game in
  preset order. `main.ts` stores this in the Phaser registry under
  `gameSelector.games` for the Game Selector.
- `SCENES` — every Phaser scene class to register, Gym scenes included.

Each game contributes one `import * as __game<i> from '<absolute scene path>'`
line, and `<alias>.<SceneClass>` is added to `SCENES`; the scene class is taken
from the file name. A core-only build emits an empty `GAMES` game list (Gym
only) and no `__game0` import.

### Selecting game ids without generating a module

`selectedGameIds(root, env)` returns the preset's game ids (empty on error) so
`vite.config.ts` can filter the smoke/dev test project lists — a test file for
a game that is not checked out would otherwise make Vitest fail with "no test
files found". It **never throws**: a broken or missing preset degrades to "no
games" so the core test profiles always remain runnable.

## Validation and failure modes

The loader (`loadGamesConfig`) is deliberately strict; every failure names the
offending file and field so the cause is obvious:

| Condition | Result |
|---|---|
| Preset file missing | Error: "Config not found: … Create configs/*.json or set GAMES_CONFIG to an existing preset." |
| Invalid JSON | Error: "… is not valid JSON: <parser message>." |
| Top level not an object, or `games` not an array | Error: "… must be an object with a \"games\" array." |
| `games[i]` not an object | Error: "… games[i] must be an object." |
| `id`/`path`/`scenePath` missing or empty | Error: "… games[i].<field> is required and must be a non-empty string." |
| Unknown preset **name** | Error listing the available presets and the explicit-path alternative. |
| Game scene not found in any candidate | Error naming the game and every candidate path. |
| `GAME_INFO` missing/malformed/incomplete | Error naming the scene module and the missing field. |

These are all build-time failures — there is no silent fallback that would ship
a distribution missing games the operator asked for.

## Authoring a new preset

Presets are **data only**: add a JSON file under `configs/`, no code change.
The plugin already iterates `games`, and the tests derive the expected set from
the game list.

1. **Pick the id and file name.** A per-game preset must be named
   `configs/<game-id>.json` and select only `<game-id>`; a distribution preset
   takes a descriptive name (e.g. `holiday-special.json`) and may select any
   subset.
2. **Add the entry (or entries)** with the required `id`, `path`, `scenePath`
   fields. Copy an existing entry from [`configs/full.json`](../../configs/full.json)
   to get the exact `scenePath`/`siblingScenePath`/adapter pairing, then adjust
   the `id`.
3. **Set `path`** to `../tce-<id>` (the sibling repo root) and keep
   `scenePath` in the flat `example-games/<id>/…` form.
4. **Add `siblingScenePath`/`siblingAdapterPath`** when the game ships (or will
   ship) in the Option C `src/` layout; omit the adapter pair when the game has
   no replay adapter.
5. **Add `$comment`** describing the preset's purpose (ignored by the loader).
6. **Verify:** `GAMES_CONFIG=<name> npm run build` must succeed, and the Game
   Selector must list the included games and no others.
7. **Add a test guard** if you are adding a *class* of preset: the per-game set
   is derived from the game list in
   [`tests/scripts/distribution-presets.test.ts`](../../tests/scripts/distribution-presets.test.ts),
   which asserts each per-game preset ships exactly one game, uses the sibling
   path form, resolves to a real scene module with the expected scene class,
   and generates a catalogue containing that game + Gym and no other game.

### Related test files

- [`tests/scripts/distribution-presets.test.ts`](../../tests/scripts/distribution-presets.test.ts) —
  distribution + per-game preset contract (path form, resolution, generated
  catalogue).
- [`tests/scripts/vite-game-discovery-plugin.test.ts`](../../tests/scripts/vite-game-discovery-plugin.test.ts) —
  plugin behaviour: config selection, validation diagnostics, sibling
  resolution, `GAME_INFO` parsing, registry rendering, `selectedGameIds`.

## Test profiles and the full preset

The shell runners (`scripts/run-ci-tests.sh`, `run-dev-tests.sh`,
`run-smoke-tests.sh`, `run-tutorial-tests.sh`) export `GAMES_CONFIG=full` by
default, because the test suites exercise every game. Override with an explicit
`GAMES_CONFIG=…` when running a game-specific subset.
