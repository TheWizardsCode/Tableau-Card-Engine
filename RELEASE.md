RELEASE
======

This document describes how releases and deployments are performed for the Tableau Card Engine project.

Quick summary
-------------
- Releases are performed automatically by GitHub Actions on every push to the main branch.
- The site is published to GitHub Pages at: https://thewizardscode.github.io/Tableau-Card-Engine/
- The release workflow runs tests and a production build; deployments are blocked if tests or the build fail.

What the release workflow does
-----------------------------
The GitHub Actions workflow (.github/workflows/deploy.yml) runs on every push to main and performs the following steps:

1. Checkout the repository and set up Node.js (Node 20).
2. Install dependencies: npm ci
3. Install Playwright Chromium (required for browser tests): npx playwright install chromium
4. Run Monte Carlo harness (on a separate job) and upload artifacts
5. Run tests: npm test (unit + browser; environment variables on main branch enable stricter Monte Carlo checks)
6. Compose the sibling game repositories, then build the full launcher distribution: GAMES_CONFIG=full npm run build (vite -> dist/). The core repo carries no games at HEAD, so the public `tce-<game>` repos listed in configs/full.json are cloned as siblings (`../tce-<game>`) first. The `full` preset bundles the engine + Gym + all eight example games; without `GAMES_CONFIG` the game-discovery plugin would default to the core-only preset (Gym only).
7. Configure Pages, upload the dist/ directory as a Pages artifact, and deploy via actions/deploy-pages@v4

Only one deployment runs at a time; if a new push arrives while a deployment is in progress, the previous run is cancelled.

Important notes about CI and tests
---------------------------------
- Browser tests require Playwright's Chromium. The workflow installs it automatically, but to reproduce locally run:

  npx playwright install chromium

- The main branch CI runs a stricter set of Monte Carlo checks (MONTE_SEEDS=200, MONTE_MIN_WIN_RATE=0.30, MONTE_MAX_WIN_RATE=0.60). To reproduce main branch CI locally:

  MONTE_SEEDS=200 MONTE_MIN_WIN_RATE=0.30 MONTE_MAX_WIN_RATE=0.60 npm test

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
- [ ] Reproduce main CI Monte Carlo locally if you changed game balance code:
      MONTE_SEEDS=200 MONTE_MIN_WIN_RATE=0.30 MONTE_MAX_WIN_RATE=0.60 npm test
- [ ] Run a production build locally: npm run build
- [ ] Ensure any changed assets are committed under public/assets/ and credited in public/assets/CREDITS.md
- [ ] Update docs if the release changes developer workflows or CI (docs/DEVELOPER.md and AGENTS.md)

Manual commands (local)
-----------------------
# Fast local tests
npm test

# Reproduce main CI tests
MONTE_SEEDS=200 MONTE_MIN_WIN_RATE=0.30 MONTE_MAX_WIN_RATE=0.60 npm test

# Production build (full launcher distribution, as deployed to Pages).
# Requires the sibling game repos: npm run setup:distribution -- --dir ..
GAMES_CONFIG=full npm run build

# Core-only build (Gym only) — the local default
npm run build

# Install Playwright Chromium (if running browser tests locally)
npx playwright install chromium

Where the workflow lives
------------------------
The deploy workflow lives at: .github/workflows/deploy.yml

- Monte Carlo artifacts (from the monte-carlo job) are uploaded to the Actions artifacts for inspection.
- The build-and-deploy job uploads dist/ as a Pages artifact and calls actions/deploy-pages@v4 to publish.

Windows binary (Steam artifact)
-------------------------------
A second workflow, `.github/workflows/package.yml`, runs on every push to `main` (and `v*` tags, or manually via workflow_dispatch) and builds the **Windows binary** on a `windows-latest` runner:

1. Checkout + Node 20, `npm ci`
2. Compose the sibling game repositories (`../tce-<game>`, the set named by `configs/full.json`) with a shallow HTTPS clone — the core repo carries no games at HEAD (multi-repo architecture)
3. `GAMES_CONFIG=full npm run package:win` -- electron-mode Vite build + electron-builder NSIS packaging of the **full distribution** (all games + Gym)
4. Smoke-tests the packaged `win-unpacked` executable with the Playwright-Electron launch test, which derives its expected Game Selector catalogue size from the same `GAMES_CONFIG` preset
5. Uploads the installer (`release/TCE-Setup-<version>.exe`) as the `tce-windows-installer` workflow artifact (downloadable from the Actions run, ~90-day retention)

Windows is the primary Steam target; this is how the binary is produced reproducibly without a Windows dev machine. The GitHub Pages deploy workflow is unaffected by this job. To produce the artifact for a manual release, run the workflow from the Actions tab (Run workflow) or push a `v*` tag.

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
