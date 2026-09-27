# Merged-core repoint — game repos now compose `Tableau-Card-Engine` (F5)

**Status:** Accepted
**Epic:** [CG-0MUJ0IAJM009X0Q2](../../.worklog) — *Merge the core into
`Tableau-Card-Engine` (Option A)*
**Child:** CG-0MUJ167LG004J8JQ — *Repoint and re-pin the eight game repos'
core submodule to Tableau-Card-Engine*
**Deciding record:** [`merged-core-decision.md`](./merged-core-decision.md)

This record captures the concrete, per-repository result of the merged-core
migration for the eight `tce-<game>` repositories. Each game now composes the
merged core from
`git@github.com:TheWizardsCode/Tableau-Card-Engine.git` through its `./core`
git submodule, instead of the retired
`git@github.com:TheWizardsCode/tableau-card-engine-core.git`.

## Pinned core revision

All eight game repos are pinned to the same merged-core commit, the
F4-complete tip of `Tableau-Card-Engine` `dev` at migration time:

```
f16bc06dfd09eda694c68c78860afcc978588c12
```

The previous gitlink pin (`2e9fc0e5cb0b1266a9a039676bf6f1025135f10e`) was a
filtered-history SHA from `tableau-card-engine-core` and does not exist in
`Tableau-Card-Engine`; it had to be replaced, not merely re-pointed.

| Before | After |
|---|---|
| `submodule.core.url = git@github.com:TheWizardsCode/tableau-card-engine-core.git` | `submodule.core.url = git@github.com:TheWizardsCode/Tableau-Card-Engine.git` |
| `core` gitlink = `2e9fc0e5cb0b1266a9a039676bf6f1025135f10e` | `core` gitlink = `f16bc06dfd09eda694c68c78860afcc978588c12` |

## Per-repository result

Each row is the `dev` tip before and after the repoint commit. Every change was
a single non-fast-forward-free commit (no history rewrite, no force-push) whose
only payload is the `.gitmodules` URL change and the `core` gitlink re-pin.

| Repository | Old `dev` tip | New `dev` tip (repoint commit) |
|---|---|---|
| `tce-golf` | `c2b95e397c12fc5f36cc6caf1ba52f42aee2ede9` | `fe1683c2da0a14a87fbffd6f31df91b32b2f0b9d` |
| `tce-beleaguered-castle` | `2341a9e0712aa4330e61990ffdf8ae37d4f9313d` | `3745271b446eeaee08f3722149232a82343b692c` |
| `tce-blackjack` | `448c90640d2ebd9d411675afed39ff4d7558c888` | `c01e1af94734fcccfdc8716c87cceb60192cc335` |
| `tce-sushi-go` | `d73e22fd020e94b3c7a8789956c42453e5f5097b` | `6495756ee7ec29c566d8872958df6dbbe735fc5c` |
| `tce-feudalism` | `3aad19cb08b8bcce751d4d30baa34ff338304de8` | `c0cee1f51a07e9919e0bdbd5f1056980f8168a8c` |
| `tce-lost-cities` | `a6524dbd9251fa639864319126562b11f7682a17` | `ff2378ac71b39a42d9cf68491ab28f8a0ec57057` |
| `tce-main-street` | `80a1c7c68a6f29fda059ab47721c6a4a7d857e47` | `2beed0af9477abafbcf43bfd8d98625732e4c2f6` |
| `tce-coloretto` | `c02faa98c9389bf95c1be1a2a53c4da754087087` | `8cd1d08a1df459e8958b8c1c0633fe203051b1db` |

The per-repo migration steps were:

1. `git submodule set-url core git@github.com:TheWizardsCode/Tableau-Card-Engine.git`
   (equivalently `git config -f .gitmodules submodule.core.url <url>`).
2. Drop the stale submodule checkout and gitdir
   (`git submodule deinit -f core`, `rm -rf .git/modules/core core`).
3. Set the index gitlink to the target merged-core commit
   (`git update-index --cacheinfo 160000,<sha>,core`).
4. `git submodule update --init core` — clones the merged core from the new
   URL and checks out the pinned commit.
5. `git add .gitmodules core`; commit; `git push origin dev`.

## Reference sweep (AC4)

A tracked-file search for `tableau-card-engine-core` across each game repo
(excluding the `core/` working tree) returns **no matches** in any of the eight
repositories — `.gitmodules`, `package.json`, docs and scripts are clean.

## Fresh-clone verification (AC5)

A fresh recursive clone with the new remote was taken into a clean directory and
verified:

```bash
git clone --recurse-submodules -b dev \
  git@github.com:TheWizardsCode/tce-golf.git tce-golf
cd tce-golf
git submodule status
#  f16bc06dfd09eda694c68c78860afcc978588c12 core (v0.1.17-112-gf16bc06d)
cat .gitmodules
# [submodule "core"]
#   path = core
#   url = git@github.com:TheWizardsCode/Tableau-Card-Engine.git
npm install --no-audit --no-fund     # 449 packages, exit 0
npx tsc --noEmit                     # exit 0 — aliases resolve through ./core
```

`tsc --noEmit` type-checks the game's `src/` and `tests/` against the merged
core's `src/` through the `@core-engine`, `@card-system`, `@rule-engine`,
`@ui`, `@ai`, `@balance-cards`, `@core-scripts`, `@core-tests` and `@core-gym`
aliases, so it exercises the `./core` resolution end to end. The full build and
unit-test verification across the whole distribution is F7.

## `main` promotion (completed)

Each repository's `main` branch was fast-forwarded to the repoint commit with
`git push origin dev:main` (fast-forward only, no force) after explicit operator
approval — `main` is a protected branch.

| Repository | `main` before | `main` after (= `dev`) |
|---|---|---|
| `tce-golf` | `fa49788bb33746e4e1a0d6a2c3404b7551dd0bec` | `fe1683c2da0a14a87fbffd6f31df91b32b2f0b9d` |
| `tce-beleaguered-castle` | `2341a9e0712aa4330e61990ffdf8ae37d4f9313d` | `3745271b446eeaee08f3722149232a82343b692c` |
| `tce-blackjack` | `05cd5801435cf468760af910c9fc3495b5756bf0` | `c01e1af94734fcccfdc8716c87cceb60192cc335` |
| `tce-sushi-go` | `e5a22ebbac90a4e3531899ff82a14924c8e0565d` | `6495756ee7ec29c566d8872958df6dbbe735fc5c` |
| `tce-feudalism` | `3aad19cb08b8bcce751d4d30baa34ff338304de8` | `c0cee1f51a07e9919e0bdbd5f1056980f8168a8c` |
| `tce-lost-cities` | `26296a55b66b19f9de8849b4ac8f4d938a5908a7` | `ff2378ac71b39a42d9cf68491ab28f8a0ec57057` |
| `tce-main-street` | `99fb2d95d3dd60cf86bcc9dc2359ce0306bf0e7d` | `2beed0af9477abafbcf43bfd8d98625732e4c2f6` |
| `tce-coloretto` | `c02faa98c9389bf95c1be1a2a53c4da754087087` | `8cd1d08a1df459e8958b8c1c0633fe203051b1db` |

After the promotion a **default-branch** (no `-b`) recursive clone resolves the
merged core:

```bash
git clone --recurse-submodules git@github.com:TheWizardsCode/tce-golf.git
cd tce-golf
git branch --show-current          # main
git submodule status
#  f16bc06dfd09eda694c68c78860afcc978588c12 core (v0.1.17-112-gf16bc06d)
```

Both published branches (`dev` and `main`) of every game repository are now
consistent, and **no published branch of any game repo references the retired
`tableau-card-engine-core`**.

## Retirement of `tableau-card-engine-core` (F6) — deliberately deferred

Deleting `tableau-card-engine-core` (F6, CG-0MUJ1689Z007M58X) is intentionally
deferred until the merged-core refactoring is otherwise complete. The old
repository is now unreferenced by any game repo branch; it can be archived and
then deleted later without breaking a clone. F6 remains the tracked work item
for that retirement and also requires a `gh` token with the `delete_repo`
scope.
