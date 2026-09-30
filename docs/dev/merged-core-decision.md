# Merged-core decision (Option A)

**Status:** Accepted
**Epic:** [CG-0MUJ0IAJM009X0Q2](../../.worklog) — *Merge the core into
`Tableau-Card-Engine` (Option A)*
**Audience:** Distribution maintainers, engine maintainers, game developers

This is the architecture decision record for the **merged core**: the engine,
the Gym, the launcher shell and the distribution live together in **one**
repository, `Tableau-Card-Engine`, while each example game is still developed
and released independently in its own `tce-<game>` repository.

It supersedes the "separate core-engine repository" parts of
[`multi-repo-architecture.md`](./multi-repo-architecture.md) and
[`repo-publication-decision.md`](./repo-publication-decision.md). Those records
remain the historical account of how the repositories were first split and
published; where they describe `tableau-card-engine-core` as the composition
point they are superseded by this decision.

---

## 1. Context

The first decomposition created **nine** repositories: a `tableau-card-engine-core`
holding the engine + Gym + launcher shell, and one `tce-<game>` per game. The
original `Tableau-Card-Engine` monorepo remained a third, launcher/distribution
repository.

That three-way split produced an ownership ambiguity: both
`tableau-card-engine-core` and `Tableau-Card-Engine` were launcher-capable, and
it was never clear which one owned `main.ts`, `vite.config.ts`, `configs/` and
the distribution build. Maintaining two launcher-capable repositories duplicates
work and invites drift.

## 2. Decision — Option A

1. **`Tableau-Card-Engine` is the single merged engine + launcher core.** The
   engine modules (`src/core-engine`, `src/card-system`, `src/rule-engine`,
   `src/ui`, `src/ai`, `src/balance-cards`), the **Gym** (`example-games/gym`),
   the launcher shell (`GameSelectorScene`, `createCardGame`), `main.ts`,
   `index.html`, `vite.config.ts`, `configs/`, the Electron host (`electron/`)
   and the shared assets all live here. It carries **no games** at HEAD
   (`example-games/` holds only `gym`).
2. **Each `tce-<game>` repository composes `Tableau-Card-Engine` as its `./core`
   git submodule** (URL `git@github.com:TheWizardsCode/Tableau-Card-Engine.git`)
   and keeps its own source at repo-root `src/`.
3. **The multi-game distribution is composed from the same repo plus the game
   repos checked out as siblings** (`../tce-<game>`) — the mechanism the
   discovery plugin already supports (`configs/*.json` `path` +
   `siblingScenePath`). `Tableau-Card-Engine` has **no game `.gitmodules`**.
4. **`tableau-card-engine-core` is retired** (archived, then deleted once no
   reference remains).

## 3. The cycle constraint (why games are siblings, not submodules)

If `Tableau-Card-Engine` submoduled the games **and** the games submoduled
`Tableau-Card-Engine`, the dependency graph would be circular:

```
tce-golf → ./core: Tableau-Card-Engine → ./tce-golf → ./core: Tableau-Card-Engine → …
```

Cyclic submodules break `git --recurse-submodules` and most tooling
deterministically. The distribution therefore composes the game repositories as
**sibling checkouts**, never as submodules of the core:

```
<parent>/
├── Tableau-Card-Engine/    # engine + Gym + launcher shell + shared assets
│                           # (no game .gitmodules)
├── tce-golf/               # each game composes ./core -> Tableau-Card-Engine
├── tce-beleaguered-castle/
└── …                       # 8 game repos in total
```

This keeps the submodule graph acyclic: **games submodule the core; the core
never submodules games.**

## 4. Accepted trade-off — no single recursive distribution clone

The distribution is no longer a single
`git clone --recurse-submodules Tableau-Card-Engine`; it is the core repo plus
sibling game clones. This is automated by a **bootstrap manifest/script**
(added by the F4 child) so a full distribution checkout stays a one-command
operation. A `game + engine` checkout is still a single recursive clone: each
game repo pulls the whole merged core through its `./core` submodule.

## 5. Alternatives rejected

- **Thin distribution (a separate `Tableau-Card-Engine` that submodules the core
  + games).** This is the three-way split being replaced. It keeps a second
  launcher-capable repository whose ownership overlaps the launcher and is the
  root cause of the "which repo owns `main.ts` / `vite.config.ts` / `configs`"
  ambiguity. Rejected as unnecessarily duplicative.
- **Engine as an npm package** (games `npm install` the engine; the launcher can
  then freely submodule games with no cycle). Cleaner for versioning, but it
  contradicts the project's submodule model and would require npm publication,
  which is explicitly out of scope.

## 6. Migration

The migration lands through the child work items of
CG-0MUJ0IAJM009X0Q2 and is **additive at HEAD** (no history rewrite; game files
remain in history):

1. Sync the published game repos with current `dev` (F0 — done).
2. Land this decision record and reconcile the docs (F2).
3. Re-partition `repo-layout.json` and the migration tooling for the merged core
   (F3), then make `Tableau-Card-Engine` sibling-only with a distribution
   bootstrap (F4).
4. Re-point and re-pin each `tce-<game>` `./core` submodule at
   `Tableau-Card-Engine` (F5).
5. Archive `tableau-card-engine-core` (F6 — archived 2026-09-27); deletion was
   deferred to the follow-up `CG-0MUKGQINO002ILXA`, blocked by this epic, and
   ran after it (including F7) completed and was released. The repository was
   **deleted on 2026-09-30** (`gh repo delete … --yes`; `gh api` now returns
   HTTP 404).
6. Verify fresh clones and the full build/test gates (F7).

## 7. Out of scope

- npm publication of the engine.
- Per-game CI pipelines and the per-game Worklog strategy (separate items).
- Scrubbing game files from `Tableau-Card-Engine` history.
- Changes to engine/Gym/game behaviour — this is a repository-topology and
  tooling change only.
