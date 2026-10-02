# Steam follow-to-unlock — manual E2E QA plan

**Work item:** `CG-0MSMAJQQT004SDCC` (F6). **Feature:** following the developer on
Steam unlocks a bundled bonus game in the TCE launcher.

This plan exercises the parts that require a **real Steam account** and the real
Steam client — things the automated suite cannot cover. Automated coverage of the
unlock/persistence/lock logic lives in `tests/steam-follow/` and the
`tce-main-street` unit suite; run those first (`npm test` in this repo, and
`npx vitest run --project unit` in the sibling game repo).

> **Automatic detection (P1 `CG-0MUNBHWY90051NAU` / P3 `CG-0MUNBHYAB0011XXW`).**
> `steamworks.js` 0.4.0 exposes no `ISteamFriends::IsFollowing`, so the launcher
> ships a small custom N-API addon (`native/steam-friends`, staged as
> `tce-steam-friends`) that resolves the shipped `steam_api64.dll` at runtime.
> When the addon is present and Steam has a logged-in user,
> `followCheckSupported = true` and the automatic path below applies. Without
> the addon — or with Steam absent / no logged-in user — the source reports
> `followCheckSupported = false` and the UI offers a **manual self-attest
> claim**; follow the manual-claim variant instead.

## Prerequisites

- Windows machine with the **Steam client installed and logged in**.
- A Steam account that does **not** yet follow the developer account.
- A packaged launcher built for Steam: `npm install steamworks.js && npm run build:steam-friends && npm run package:steam` (the addon is Windows x64; no Steamworks SDK is needed at build time).
- A Steam build with an App ID the account can run (test app id during dev).
- The private config present (gitignored) or env vars set:
  - `electron/steam-config.local.json` with `app_id` + `developer_steam_id`, **or**
  - `TCE_STEAM_APP_ID` / `TCE_STEAM_DEVELOPER_STEAM_ID`.

## Test plan

Record each step's result (Pass / Fail / N/A) and evidence (screenshot or note).

### 1. Store page opens in the Steam client (AC1)

1. Launch the launcher through the Steam client (not from the filesystem), so the
   Steamworks session initialises.
2. Reach the tutorial's final completion step (the "Follow us on Steam" CTA) — or
   the launcher's follow CTA wherever it surfaces.
3. Click **Follow us on Steam**.

**Expected:** the Steam store/community page opens **inside the Steam client /
overlay**, already logged in — no browser login prompt. Console shows no crash.

### 2. Follow is detected and the bonus unlocks (AC2)

> `followCheckSupported` is `true` when the `tce-steam-friends` addon is built
> into the package and Steam has a logged-in user. Use the manual-claim variant
> when it is `false` (addon absent, Steam absent, or no logged-in user).

**Automatic detection variant:**

1. On the opened page, click **Follow**.
2. Return to the launcher and trigger the follow **re-check** (re-open the CTA /
   return to the completion step).

**Expected:** the follow is detected, the designated bonus game
(`bonusGameId` in `electron/bonus-catalog.json` — currently *Feudalism*) unlocks,
and the launcher's game list shows it playable.

**Manual-claim variant (current binding):**

1. On the opened page, click **Follow**.
2. Return to the launcher and use the CTA's self-attest claim.
3. **Expected:** the designated bonus unlocks and the game list updates.

### 3. Unlock persists across launches (AC3)

1. Close the launcher.
2. Relaunch it (Steam session active).
3. Open the tutorial completion step again.

**Expected:** the bonus game is **still unlocked**; the player is **not**
re-prompted to follow, and no follow re-check runs on boot (the unlock flag
short-circuits). The unlock file lives under the Electron `userData` directory
(`steam-unlock.json`).

### 4. Game list reflects lock/unlock state (AC4)

1. Before following (use a fresh account or delete `steam-unlock.json`), open the
   Game Selector.

**Expected:** the designated bonus card renders **locked** ("Follow us on Steam to
unlock"); other catalogue games render locked with "Reserved for a future
milestone"; base games are playable. After following, the bonus card is playable.

### 5. Graceful degradation (AC5)

1. Quit Steam entirely.
2. Launch the launcher (from the filesystem or a build without `steamworks.js`).

**Expected:** the launcher **boots normally**; console logs a clear
"Steam is unavailable" warning; the CTA is hidden or shows the unavailable copy;
the bonus stays locked with the "Steam unavailable — cannot verify follow"
message; **every non-gated game is playable**.

### 6. Browser fallback (AC5)

1. Open the web app in a plain browser (or the launcher in browser mode).

**Expected:** no launcher bridge (`window.tce.steamFollow` absent); the CTA (if
reached) opens the **web** store page and the copy explains that rewards are only
available in the desktop launcher; **nothing is locked** — the web app is fully
functional.

## Reporting

- File a bug work item for any Failed step, linking this plan and the work item.
- Update this plan if the follow mechanism changes. Automatic detection landed
  in `CG-0MUN7930Y009X8Z1` (Option A native addon, `native/steam-friends`); see
  `native/steam-friends/README.md` and `docs/dev/steam-follow-native-spike.md`.
