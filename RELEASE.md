RELEASE
======

This document describes how releases and deployments are performed for the Tableau Card Engine project.

Quick summary
-------------
- Releases are performed automatically by GitHub Actions on every push to the main branch.
- The site is published to GitHub Pages at: https://thewizardscode.github.io/Tableau-Card-Engine/
- The release workflow builds the full distribution and deploys to GitHub Pages; deployments are blocked if the build fails.

What the release workflow does
-----------------------------
The GitHub Actions workflow (.github/workflows/deploy.yml) runs on every push to main and performs the following steps:

1. Checkout
2. Setup Node.js
3. Install dependencies
4. Compose sibling game repositories
5. Build
6. Configure Pages
7. Upload artifact
8. Deploy to GitHub Pages

Only one deployment runs at a time; if a new push arrives while a deployment is in progress, the previous run is cancelled.

Important notes about CI and tests
---------------------------------
- **CI is build-only.** Both `deploy.yml` (main branch) and
  `pr-checks.yml` (pull requests) run `npm run build` only — TypeScript
  compile and Vite bundle.  No test, Playwright, or Monte Carlo steps run in CI.
- **Tests are run locally.** The full test suite (`npm test`) should be run
  locally before every release; unit tests (`npm test -- --project unit`) are
  the minimum during development.  See [AGENTS.md quality gates]
  (AGENTS.md#quality-gates) for the full guidance.
- **Monte Carlo is a local balance tool.** `npm run monte-carlo` validates
  game balance from a JSON transcript and requires the `../tce-main-street`
  sibling — it is not run by any CI workflow.

Vite base path
--------------
GitHub Pages serves the site at /<repo>/ rather than at /. The Vite config sets the base option conditionally:

- Production (npm run build): base: '/Tableau-Card-Engine/'
- Development (npm run dev): base: '/'

This is handled automatically via Vite's mode parameter in vite.config.ts. Game scenes use relative asset paths (e.g., assets/cards/card_back.svg), which resolve correctly under either base.

First-time repository setup for Pages
------------------------------------
A repository administrator must enable GitHub Pages once via the repository settings:

1. Go to Settings → Pages in the repository
2. Under Source, select "GitHub Actions"
3. No custom domain is needed — the default URL is used

After enabling Pages, every push to main will automatically deploy via the workflow.

Verifying a deployment
----------------------
1. Check the Actions tab in the repository for the latest workflow run and its logs.
2. Visit https://thewizardscode.github.io/Tableau-Card-Engine/ to confirm the site loads.
3. Verify gameplay for the supported games and that card assets load correctly.

Pre-release checklist (recommended before merging to main)
---------------------------------------------------------
- [ ] Run the full test suite locally: npm test
- [ ] Run local Monte Carlo balance checks if you changed game balance code
      (requires `../tce-main-street` sibling):
      `GAMES_CONFIG=full npm run monte-carlo`
- [ ] Run a production build locally: npm run build
- [ ] Ensure any changed assets are committed under public/assets/ and credited in public/assets/CREDITS.md
- [ ] Update docs if the release changes developer workflows or CI (docs/DEVELOPER.md and AGENTS.md)

Manual commands (local)
-----------------------
# Fast local unit tests
npm test -- --project unit

# Full test suite (unit + browser + tutorial E2E; ~20 min)
npm test

# Production build (full launcher distribution, as deployed to Pages).
# Requires the sibling game repos: npm run setup:distribution -- --dir ..
GAMES_CONFIG=full npm run build

# Core-only build (Gym only) — the local default
npm run build

# Monte Carlo balance validation (local only; requires ../tce-main-street sibling)
GAMES_CONFIG=full npm run monte-carlo

Where the workflow lives
------------------------
The deploy workflow lives at: .github/workflows/deploy.yml

- The build-and-deploy job uploads dist/ as a Pages artifact and calls
  actions/deploy-pages@v4 to publish.

Windows binary (Steam artifact)
-------------------------------
A second workflow, `.github/workflows/package.yml`, runs on every push to `main` (and `v*` tags, or manually via workflow_dispatch) and builds the **Windows binary** on a `windows-latest` runner:

1. Checkout + Node 20, `npm ci`
2. Compose the sibling game repositories (`../tce-<game>`, the set named by `configs/full.json`) with a shallow HTTPS clone — the core repo carries no games at HEAD (multi-repo architecture)
3. `GAMES_CONFIG=full npm run package:win` -- electron-mode Vite build + electron-builder NSIS packaging of the **full distribution** (all games + Gym)
4. Smoke-tests the packaged `win-unpacked` executable with the Playwright-Electron launch test, which derives its expected Game Selector catalogue size from the same `GAMES_CONFIG` preset
5. Uploads the installer (`release/TCE-Setup-<version>.exe`) as the `tce-windows-installer` workflow artifact (downloadable from the Actions run, ~90-day retention)

Windows is the primary Steam target; this is how the binary is produced reproducibly without a Windows dev machine. The GitHub Pages deploy workflow is unaffected by this job. To produce the artifact for a manual release, run the workflow from the Actions tab (Run workflow) or push a `v*` tag.

**Automatic draft GitHub Release.** On a `v*` tag push the workflow's
`promote-release` job promotes the installer to a **draft** GitHub Release
using `CHANGELOG.md` notes for the tagged version (falling back to
`--generate-notes` when the section is absent). It attaches
`TCE-Setup-<version>.exe`, reuses the existing `v<version>` tag, and is
idempotent (an existing release for that version is reported, not
overwritten). The job is `continue-on-error`, so a promotion failure never
fails the workflow or the Pages deploy; it is surfaced in the job summary with
instructions to run `/skill:release-windows` manually. **The draft is the
operator's approval gate** — review it and click **Publish release** in the
GitHub UI; nothing is published automatically. Verify a draft exists with
`gh release list --draft`.

### `package-windows` is not a PR-required status check (exemption)

The `package-windows` job is triggered by the `v*` tag push (and by pushes to
`main`/manual dispatch), not by the pull request. The ship skill's release
script (`merge-dev-to-main.sh`) creates that tag on the release branch's merge
commit — the same commit that is the head of the automated dev→main PR. The
tag push therefore starts a `package-windows` check run against the PR head
commit, and `waitForPRMerge` in `run-release.js` sees it in the PR's
`statusCheckRollup`.

**It is not a PR-required check by intent.** It builds and smoke-tests the
Windows artifact independently of the source merge; a failure there (for
example a flaky packaging runner, or a smoke-test false positive on a missing
generated thumbnail — the class of failure addressed by
CG-0MUX17L47000O4CE) must not block the dev→main merge. The `promote-release`
job is already `continue-on-error`, so the draft-release step never gates the
deploy either.

**Exemption procedure for the operator.** When `package-windows` fails on a
release PR and the source itself is sound (both workflows' source changes
already passed the local quality gates, or the failure is upstream of the
merge):

1. Do **not** wait on the `package-windows` check — it is advisory for the
   merge.
2. Re-run the release with `--force`, which skips the `waitForPRMerge`
   status-check wait; or merge the dev→main PR manually in the GitHub UI.
3. Address the Windows artifact separately: inspect the failed job, re-run the
   workflow as needed, and use `/skill:release-windows` to regenerate the
   draft release if the artifact is missing.

Steam build (follow-to-unlock native module)
--------------------------------------------
`steamworks.js` is an **optional** native module, intentionally not a `package.json` dependency so ordinary installs and CI never need a native build. To produce a binary with Steam follow-to-unlock support:

```bash
npm install steamworks.js   # once, on the packaging machine
npm run package:steam        # checks for steamworks.js, then Windows NSIS package
```

`scripts/check-steamworks.mjs` fails the build early with actionable guidance when the module is missing. `electron-builder.yml` packs `node_modules/steamworks.js/**` and unpacks its native `dist/**` from the asar. Private credentials (Steam App ID, developer SteamID64) come from a **gitignored** `electron/steam-config.local.json` or the `TCE_STEAM_APP_ID` / `TCE_STEAM_DEVELOPER_STEAM_ID` env vars — never committed. Without the native module the non-Steam `npm run package:win` build still works; the follow feature degrades gracefully. See [Steam follow-to-unlock — manual E2E QA](docs/dev/steam-follow-qa.md) for the real-account verification checklist.

If you want help
----------------
I can:
- Open the deploy workflow and highlight the steps that run for a release
- Produce a compact release checklist in a PR-ready format
- Run the local test/build commands here (tell me which to run)

Additional notes: recreating menu thumbnails and screenshots
-----------------------------------------------------------
This repository stores the how‑to for replaying fixtures and generating thumbnails in docs/DEVELOPER.md (see the "Replay Tool" and "Game Thumbnails" sections) and the replay / thumbnail scripts in the scripts/ directory:

- Replay tool: npm run replay -- <transcript.json> (scripts/replay.ts)
- Generate thumbnail: npx tsx scripts/generate-thumbnail.ts <game-name> [source-dir]
- Batch refresh thumbnails: bash scripts/refresh-thumbnails.sh

See docs/DEVELOPER.md for step‑by‑step instructions and the replay adapter registry at scripts/adapters/.

(End of RELEASE.md)
