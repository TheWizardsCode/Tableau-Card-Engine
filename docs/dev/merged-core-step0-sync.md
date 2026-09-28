# Step 0 — published-repo sync (merged-core / Option A)

**Status:** Done
**Parent:** [CG-0MUJ0IAJM009X0Q2](../../.worklog) — *Merge the core into
`Tableau-Card-Engine` (Option A)*
**Child:** CG-0MUJ188KF003R3VJ — *Step 0: Sync published core and game repos
with recent monorepo changes*

This record captures the evidence for Step 0 of the merged-core migration:
bringing the published `tce-<game>` repositories up to date with the monorepo
`dev` tree **before** F3–F5 re-partition the layout and re-point the game
submodules. It is the "recorded evidence" deliverable of F0.

## Source and state

| Field | Value |
|---|---|
| Extraction source SHA (published repos built from) | `b6ce40e5` |
| Monorepo `dev` tip used for this sync | `3c74dcc8` |
| Commits on `dev` since the extraction source | 16 |
| Sync mechanism | **Option B** — replay the game-owned delta onto each published `dev` tip as a single fast-forward commit (no force push) |

`76e600f9` is **not** a monorepo commit: it is a post-extraction commit that
exists only in the published checkouts.

## Delta from `b6ce40e5` to `dev`

Only game-owned paths (see `scripts/configs/repo-layout.json`) are replayed to
the game repos. The remaining `dev` commits touch core-owned paths and land in
the merged core automatically (the merged `Tableau-Card-Engine` is the monorepo
itself and is inherently current).

| Target | Source commits replayed |
|---|---|
| `tce-golf` | `d65c5546` (replay CLI tests hermetic under core-only preset), `12c269c7` (ALPHA banner → `HelpPanel` test) |
| `tce-beleaguered-castle` | none — already current at the published tip |
| `tce-blackjack` | `12c269c7` (ALPHA banner / `createSceneTitle`) |
| `tce-sushi-go` | `e45f07f1` (tooltip work) |
| `tce-feudalism` | none |
| `tce-lost-cities` | `e45f07f1` (tooltip work) |
| `tce-main-street` | `c73f71fc`, `0da46d2a`, `8b57d931` |
| `tce-coloretto` | none |

## Per-repo outcome

Each sync is a single fast-forward commit on the published `dev` branch
(`fa49788`-style base → new tip); `main` is left untouched (it tracks `dev` and
is promoted by the release process).

| Repository | Published `dev` before | Published `dev` after |
|---|---|---|
| `tce-golf` | `fa49788` | `c2b95e3` |
| `tce-blackjack` | `05cd580` | `448c906` |
| `tce-sushi-go` | `e5a22eb` | `d73e22f` |
| `tce-lost-cities` | `26296a5` | `a6524db` |
| `tce-main-street` | `99fb2d9` | `80a1c7c` |
| `tce-beleaguered-castle` | `2341a9e` | unchanged (already current) |
| `tce-feudalism` | `3aad19c` | unchanged (no delta) |
| `tce-coloretto` | `c02faa9` | unchanged (no delta) |
| `tableau-card-engine-core` | `675c4e5` | **superseded** by the Option A merge; retired in F6 (no sync) |

## How the sync was produced and verified

The mechanism is **Option B** from the F0 analysis, chosen because it honours
the publication decision's "no force, ever" rule
(`docs/dev/repo-publication-decision.md` D3/D5) while making each published
tree current:

1. Compute the game-owned delta: `git diff b6ce40e5..dev -- <repo-layout paths>`.
2. Map monorepo paths to the game-repo layout (`example-games/<game>/` →
   `src/`, tests/docs unchanged) and apply the delta patch onto the published
   `dev` tip.
3. Apply the same path/alias transforms the extraction + scaffold used to any
   newly added file (e.g. `tests/ui/HelpPanel.test.ts` new in `tce-golf`,
   `tests/main-street/CalendarSaveLoad.test.ts` new in `tce-main-street`).
4. Fast-forward push to `refs/heads/dev` (no force, no tags, no other refs).

**Content comparison (AC2).** Every delta file in the pushed tips was compared
to the monorepo `dev` content transformed to the game-repo layout. 29 of 29
files match; the only non-alias difference is the documented core-relative
prefix (`scripts/replay.ts` → `core/scripts/replay.ts`) in
`tests/golf/replay.test.ts`. No file outside the enumerated delta changed.

## Notes

- The game repos do **not** build between this step and F5: the delta uses
  engine APIs (e.g. `createSceneTitle` from the ALPHA banner) that are present
  in `dev` but not in the currently pinned `./core` submodule. F5 re-points and
  re-pins `./core` at the merged `Tableau-Card-Engine`; F7 verifies a fresh
  clone builds and passes unit tests.
- No remote `dev` tip was replaced (all updates were fast-forwards); no
  force-push was used and no `main` branch was written.
