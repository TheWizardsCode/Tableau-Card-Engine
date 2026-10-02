# Steam achievements — manual E2E QA plan

**Work item:** `CG-0MUNC7G7C007STWV` (F8), parent `CG-0MSMGKSJB004MZBJ`.
**Feature:** completing an in-game Main Street challenge unlocks the mapped
Steam achievement.

This plan exercises the parts that require a **real Steam account** and the real
Steam client — things the automated suite cannot cover. Automated coverage of
the engine layer, the manifest, the sync service, the IPC bridge, and the Main
Street mapping lives in `tests/achievements/`, `tests/steam-achievements/`, and
the `tce-main-street` unit suite; run those first (`npm test` in this repo, and
`npx vitest run --project unit` in the sibling game repo).

> **Prerequisite.** Achievements must be registered on the Steamworks partner
> backend **before** this plan can pass. See
> [Manifest ↔ store mismatch detection](#manifest--store-mismatch-detection).

## Prerequisites

- Windows machine with the **Steam client installed and logged in**.
- A Steam account that can run the TCE launcher app.
- A packaged launcher built for Steam:
  `npm install steamworks.js && npm run package:steam`.
- A Steam build with an App ID the account can run (test app id during dev).
- The private config present (gitignored) or env vars set:
  - `electron/steam-config.local.json` with `app_id`, **or**
  - `TCE_STEAM_APP_ID`.
- The achievement API names in `electron/achievement-manifest.json` registered
  on the partner backend (same App ID).

## Test plan

Record each step's result (Pass / Fail / N/A) and evidence (screenshot or note).

### 1. Achievement unlocks in-game and in the Steam overlay (AC2)

1. Launch the launcher **through the Steam client** (not from the filesystem),
   so the Steamworks session initialises.
2. Start a Main Street run. Use a save/scenario that can complete one mapped
   challenge quickly (e.g. the Accountant + first upgrade completes
   *First Upgrade*, achievement id `first-upgrade` /
   `TCE_MAIN_STREET_FIRST_UPGRADE`).
3. Complete the challenge.

**Expected:** the in-game challenge-completion feedback fires (activity log
entry), and opening the Steam overlay (Shift+Tab) → **Achievements** shows the
matching achievement unlocked. The achievement also appears on the account's
Steam profile. Console shows no `[achievements]` error.

**Evidence:** screenshot of the overlay achievement; note the console output.

### 2. Idempotence across a repeat completion (AC2/AC3)

1. Continue the run (or start another) and complete the **same** challenge again
   if the run allows.
2. Open the Steam overlay.

**Expected:** the achievement is still unlocked; no duplicate entry is created.
The launcher does not log a re-unlock error.

**Evidence:** overlay screenshot; console note.

### 3. Persistence across launches (AC3)

1. Close the launcher.
2. Relaunch it through Steam.
3. Open the Steam overlay → Achievements.

**Expected:** previously unlocked achievements are still unlocked. The launcher
runs a launch-time re-sync (see console `[achievements]`); a re-sync of an
already-synced achievement is silent (no error).

**Evidence:** overlay screenshot after restart; `%APPDATA%/…/steam-achievements.json`
(the `userData` store) contains the unlocked engine ids.

### 4. Offline unlock then re-sync (AC3)

1. Quit the **Steam client** entirely, then launch the launcher from the
   filesystem (or start Steam in offline mode).
2. Complete a mapped challenge.

**Expected:** the challenge completes normally; the launcher logs
`[achievements] Steam is unavailable — unlocks persist locally and re-sync later.`
The achievement is **not** in the overlay yet. The engine id is written to the
local store.

3. Quit the launcher, restart the Steam client, and relaunch the launcher through
   Steam.

**Expected:** the launch-time re-sync replays the persisted unlock; the
achievement now appears in the overlay/profile. No crash in either session.

**Evidence:** local store contents before/after; overlay screenshot after
re-sync.

### 5. Graceful degradation without Steam (AC3)

1. Quit Steam entirely.
2. Launch the launcher from the filesystem (or a build without
   `steamworks.js`).

**Expected:** the launcher **boots normally**; console logs a clear
`[achievements] Steam is unavailable` warning (never an unhandled error); Main
Street is fully playable; completing a challenge does not crash the game and the
unlock is recorded locally only.

**Evidence:** launcher boots; console warning; a completed challenge in-game.

### 6. Browser / headless unaffected (AC1/AC3)

1. Open the web app in a plain browser (or run the headless Monte Carlo harness).

**Expected:** no `window.tce.achievements` bridge; the engine uses its no-op
sink; the game is fully playable and no achievement IPC is attempted.

**Evidence:** browser console / headless run exit 0.

## Manifest ↔ store mismatch detection

The **manifest** (`electron/achievement-manifest.json`) is the single source of
truth for `achievementId ↔ steamApiName ↔ hidden`. Steam silently drops a
`SetAchievement` call whose API name is not registered for the app, so drift is
invisible at runtime unless checked.

Automated checks (run in CI / before release):

- `npm test -- --project unit` runs
  `tests/steam-achievements/steam-achievements.test.ts`, which validates the
  committed manifest (duplicate game/achievement/API names, empty entries,
  version).
- The sibling game repo (`tce-main-street`) test
  `tests/main-street/main-street-achievements.test.ts` asserts every game
  achievement id exists in the launcher manifest and that the `hidden` flags
  match (drift guard).

Manual / real-account check (when a Steam session is available):

1. In a dev build, query the client's registered names
   (`achievement.names()` via the F5 adapter) and compare with the manifest's
   `steamApiName` values. Any manifest name absent from `names()` is a
   backend-registration gap.
2. If a name is missing, register it on the Steamworks partner portal with the
   **exact** API name, or correct the manifest to match the backend, then
   re-test step 1.

**Fixing drift:** never rename only one side. Change the backend and the
manifest together (and, if the achievement id changes, the game's
`MainStreetAchievements.ts` mapping — the game drift test will fail until it
matches).

## Reporting

- File a bug work item for any Failed step, linking this plan and the work item.
- File a producer/backend work item when the failure is a missing Steamworks
  backend registration (outside this repo).
- Update this plan if the unlock mechanism changes.
