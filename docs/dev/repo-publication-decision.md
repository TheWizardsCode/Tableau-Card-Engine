# TCE repository publication decision

**Status:** Accepted
**Parent:** [CG-0MUHK5NND0024J1S](../../.worklog) — *Create the nine `tce-*`
GitHub repositories and push extracted history*
**Child:** CG-0MUIND2NE009GPHJ — *Decide repo publication mechanism and test
contract*
**Audience:** Distribution maintainers, release engineers, agents

This record fixes **how** the nine extracted repositories are created on GitHub
and **which refs** they carry. Extraction, the `src/` rename and the scaffold are
already decided (see
[`multi-repo-architecture.md`](./multi-repo-architecture.md) and
[`per-game-src-layout-decision.md`](./per-game-src-layout-decision.md)); this
document covers only the publication step.

The machine-readable partition (names, slugs, remotes, paths) remains
[`scripts/configs/repo-layout.json`](../../scripts/configs/repo-layout.json) —
the single source of truth. Nothing here hard-codes a repository name: the
helper resolves every target from that file.

---

## 1. Producer decisions this record implements

| # | Decision | Value |
|---|---|---|
| Q1 | Visibility | **public** for all nine repositories |
| Q2 | Branch model | `dev` → `main`; seed `main` once from `dev` |
| Q3 | Source revision | current `dev` HEAD; record the SHA as evidence |
| Q4 | Published refs | **only** `dev` + `main` (no `wl-*` branches, no `v0.1.x` tags) |

Source: parent Appendix Q1–Q4.

## 2. Decisions

### D1 — Script-driven, idempotent helper (not documented manual commands)

Publication is driven by one helper, `scripts/publish-repos.ts`, exposed as
`npm run publish:repos`. The alternative — document the raw `gh`/`git`
commands and run them by hand — is **rejected**: it is not reviewable, not
re-runnable safely, and cannot be covered by the unit suite.

The helper must support:

- **no target flag** — publish all nine targets from `repo-layout.json`;
- **`--target <name>`** — publish one target (`core` for
  `tableau-card-engine-core`, the game name otherwise), repeatable;
- **`--dry-run`** — print the full plan and write nothing (no `gh`, no `git
  push`, no filesystem mutation outside a temp file);
- **`--repos-dir <path>`** — directory holding the extracted/scaffolded
  checkouts (default: the monorepo's parent directory).

### D2 — Creation command and push sequence

Create each repository **empty and public**, then push the agreed refs with
explicit refspecs:

```bash
gh repo create TheWizardsCode/<slug> --public
git -C <repos-dir>/<slug> push origin refs/heads/dev:refs/heads/dev
git -C <repos-dir>/<slug> push origin refs/heads/dev:refs/heads/main   # seed main once
gh repo edit TheWizardsCode/<slug> --default-branch main
```

Notes:

- `gh repo create` is used **without** `--source`/`--push`; the extracted
  checkouts already have `origin` set (extraction wires it from the layout), and
  `--source` would try to manage that remote. Creating empty and pushing
  explicitly keeps the ref set exact.
- The push refspecs use fully-qualified `refs/heads/...` names, so a stray
  local branch cannot be published by accident.
- `main` is seeded by pushing the extracted `dev` tip to `refs/heads/main`; no
  local `main` branch is required in the extracted checkout.
- The default branch is `main`. `dev` receives the extracted history; `main`
  is a one-time seed until the first dev→main promotion via the ship skill.

### D3 — Ref contract

The only refs ever published are **`dev`** and **`main`**. Specifically:

- push `dev` + seed `main`; do **not** push monorepo feature/`wl-*` branches,
  the monorepo's `revert-fix`/`temp-*` branches, or the `v0.1.x` release tags;
- `main` is the default branch;
- **no force push, ever** — a divergent remote aborts the run (see D5).

### D4 — Idempotency

A run is safe to repeat:

1. **Repo existence** — `gh repo view TheWizardsCode/<slug>` (or
   `gh api repos/TheWizardsCode/<slug>`). If it exists, the repository is
   **never re-created**.
2. **Remote refs** — `git ls-remote --heads origin` and
   `git ls-remote --tags origin`.
3. **Up to date** — when `dev` and `main` both exist at the local `dev` tip,
   no tags are present that would be pushed, and the default branch is `main`,
   the target is reported `up-to-date`, **no push command is issued**, and the
   run still exits `0`.
4. **Partial state** — if `dev` is missing, push it; if `main` is missing,
   seed it from `dev`; if the default branch is not `main`, set it.
5. A second run after a successful publication is a **no-op**.

### D5 — Safety guards

Every guard is enforced by the helper and is a hard failure (non-zero exit)
unless stated otherwise:

- **No force** — the helper never emits `--force`/`-f`/`--force-with-lease`
  for `git push`, and never `--force` for `gh`.
- **No tags** — tags are never pushed, and a target whose remote carries tags
  is still published with heads only (tags are *not* pushed); the ref set
  stays exactly `{dev, main}`.
- **No unexpected branches** — only `dev` and `main` are pushed. Extra remote
  branches are left untouched, never deleted and never force-updated.
- **Source monorepo is never rewritten or pushed to** — the helper only reads
  the layout and runs `git push` inside each extracted checkout under
  `--repos-dir`; it never runs a push from the monorepo checkout and never
  targets the launcher repository.
- **Launcher `main` is never pushed to** — the target remotes are resolved from
  `repo-layout.json`; the helper refuses any remote whose owner is not the
  configured owner (`TheWizardsCode`) and never touches the launcher's own
  remote.
- **Repo-name collision aborts** — if a remote exists but does not correspond
  to the resolved target (for example a stale/unrelated repository at the same
  slug), or `git ls-remote` fails, the helper aborts that target rather than
  overwriting it, and reports it.
- **Divergence aborts** — a non-fast-forward `dev` update is not forced; the
  target is reported and the run fails.
- **`--dry-run` writes nothing** — the runner is not invoked; only the plan is
  printed.

## 3. Helper interface

`scripts/publish-repos.ts` exports (consumed by
`tests/scripts/repo-publication.test.ts`):

```ts
export const OWNER = 'TheWizardsCode';
export const PUBLISH_REFS = ['dev', 'main'] as const; // dev first, then seed main
export const DEFAULT_BRANCH = 'main';

export interface PublishTarget {
  kind: 'core' | 'game';
  slug: string;   // repo name and checkout directory, e.g. 'tce-golf'
  remote: string; // SSH remote from repo-layout.json
}

export interface CommandRunner {
  run(cmd: string, args: string[]): { status: number; stdout: string; stderr: string };
}

export interface RemoteState {
  exists: boolean;
  heads: string[]; // branch names on the remote
  tags: string[];  // tag names on the remote
}

export interface PublicationPlanEntry {
  slug: string;
  remote: string;
  create: boolean;          // true when the repo must be created
  push: string[];           // refspecs to push, e.g. ['dev', 'main']
  defaultBranch: boolean;   // true when the default branch must be set to main
  upToDate: boolean;        // true when nothing needs doing
}

export function loadPublishTargets(layoutPath?: string): PublishTarget[];
export function buildPublicationPlan(
  targets: PublishTarget[],
  remoteState: Record<string, RemoteState>,
): PublicationPlanEntry[];
export function renderPublicationPlan(plan: PublicationPlanEntry[]): string;
export function assertPublishRefAllowed(refspec: string): void;
export function publishRepos(opts: {
  repoRoot: string;
  owner?: string;
  layoutPath?: string;
  targets?: string[];
  dryRun?: boolean;
  runner?: CommandRunner;
}): { dryRun: boolean; exitCode: number; entries: PublicationPlanEntry[]; commands: string[] };
```

CLI:

```bash
npm run publish:repos -- [--dry-run] [--target <name>]... [--repos-dir <path>]
```

## 4. Publication procedure

1. Extract + scaffold (C3) and record the per-repo commit counts and the source
   `dev` SHA.
2. `npm run publish:repos -- --dry-run` — review the plan against
   `repo-layout.json` and the C3 evidence.
3. `npm run publish:repos` — create the nine public repositories, push `dev`,
   seed `main`, set `main` as default.
4. Audit each remote (`gh api`, `git ls-remote`) and record the evidence on the
   parent work item.
5. Re-run to prove idempotency (expected: all `up-to-date`, exit 0).

## 5. Fresh-clone verification commands (executed by C5)

Single game repository (engine pulled in through the `core` submodule):

```bash
tmp="$(mktemp -d)"
git clone --recurse-submodules git@github.com:TheWizardsCode/tce-golf.git "$tmp/tce-golf"
cd "$tmp/tce-golf"
npm install && npm run build && npm test -- --project unit
```

Repeat for `tce-main-street`, and for the core repository itself:

```bash
tmp="$(mktemp -d)"
git clone git@github.com:TheWizardsCode/tableau-card-engine-core.git "$tmp/tableau-card-engine-core"
cd "$tmp/tableau-card-engine-core"
npm install && npm run build && npm test -- --project unit
```

Launcher presets against fresh sibling clones (run from the launcher
`Tableau-Card-Engine` checkout, with the game repos cloned as siblings under
`../tce-<game>`):

```bash
git clone --recurse-submodules git@github.com:TheWizardsCode/tce-golf.git ../tce-golf
GAMES_CONFIG=solo npm run build

for g in golf beleaguered-castle blackjack sushi-go feudalism lost-cities main-street coloretto; do
  [ -d "../tce-$g" ] || git clone --recurse-submodules "git@github.com:TheWizardsCode/tce-$g.git" "../tce-$g"
done
GAMES_CONFIG=full npm run build
```

## 6. Out of scope

- CI pipelines and npm publication (parent AC6 / epic constraint).
- Switching the launcher monorepo's `.gitmodules` at the new remotes.
- Creating release tags on the new repositories (first release owns its tags).
- Re-pushing or rewriting the monorepo history.
