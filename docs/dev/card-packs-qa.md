# Card packs — manual E2E QA plan

**Work item:** `CG-0MUZIS56500806DE` (core feature F10), epic
`CG-0MUZFD1WR0031QTB`. **Feature:** card packs extend an already-installed game
with new cards and assets through the launcher's content directory, gated by
Steam DLC entitlement (Main Street is the first consumer).

This plan exercises the parts that need a **packaged Electron run**, a
**real content directory**, and (for the locked scenario) a **real Steam DLC
app id** — things the automated suite cannot cover. For the end-to-end
lifecycle itself (authoring, building, installing and gating a pack), see the
[card-packs runbook](card-packs-runbook.md); this document is its manual
verification companion. Automated coverage of the loader, merge, entitlement,
save/load and missing-pack policy lives in:

- core: `tests/core-engine/card-pack-manifest.test.ts`,
  `tests/core-engine/card-pack-merge.test.ts`,
  `tests/ui/card-pack-loader.test.ts`,
  `tests/ui/card-pack-listing.test.ts`,
  `tests/ui/card-pack-client.test.ts`,
  `tests/electron/pack-protocol.test.ts`,
  `tests/electron/card-pack-entitlements.test.ts`,
  `tests/scripts/build-card-pack.test.ts`;
- Main Street: `../tce-main-street/tests/main-street/CardPackPipelineIntegration.test.ts`
  (the end-to-end loader → merge → save/load proof),
  `MainStreetCardPacks.test.ts`, `MainStreetCardPacksUi.test.ts`,
  `CardPackListing.browser.test.ts`.

Run those first: `npm test -- --project unit` in this repo and
`npm test` in `../tce-main-street`.

## Prerequisites

- A machine that can run the Electron launcher, with the **Steam client
  installed and logged in** for the entitlement scenarios.
- A built launcher: `npm run build:electron && npm run build:electron-main`
  (renderer + main). For a packaged binary use `npm run package:win` (or the
  host-appropriate `package:*`).
- The reference pack built into an installable packs root:

  ```bash
  npm run build:card-pack -- --input tests/fixtures/reference-packs/main-street
  ```

  This writes `build/card-packs/packs/manifest.json` plus
  `build/card-packs/packs/main-street/main-street-foundations/` (CSV + assets).

- The packs root **installed into a content directory**. The launcher resolves
  content as (first match wins) `--content-dir <dir>` / `TCE_CONTENT_DIR` →
  the bundled `dist/`. Either:
  - **Bundled run (dev):** build once, then copy the packs in and launch
    Electron directly — do **not** re-run `npm run start:electron` afterwards,
    because it rebuilds `dist/` and clears the packs:

    ```bash
    npm run build:electron && npm run build:electron-main
    cp -r build/card-packs/packs dist/packs
    npx electron .
    ```

  - **Override run (Steam DLC model):** create a content root containing
    `index.html` plus `packs/` (mirrors a Steam-installed DLC directory), then
    pass it via `--content-dir` (or `TCE_CONTENT_DIR`):

    ```bash
    rm -rf /tmp/tce-qa && mkdir -p /tmp/tce-qa
    cp -r dist/. /tmp/tce-qa/
    cp -r build/card-packs/packs /tmp/tce-qa/packs
    npx electron . --content-dir /tmp/tce-qa
    ```

    A packaged binary takes the same flag: `tce-launcher --content-dir /tmp/tce-qa`
    (or set `TCE_CONTENT_DIR`). The override root must contain `index.html`.

- To reach the in-game listing: launch Main Street and click the **Card Packs**
  button (top-right HUD, SLL `cardPacksButton` zone). It opens the reusable
  `CardPackListing` overlay; entitled packs carry an enable/disable control,
  locked/incompatible packs are read-only.

Record each step's result (Pass / Fail / N/A) and evidence (screenshot or note).

### Scenario A — installed and entitled (free pack)

1. Install the reference pack as above (it declares **no** `entitlement`, so it
   is free base content).
2. Launch Main Street and open the **Card Packs** listing.

**Expected:** the listing shows **Main Street Foundations** as installed and
**enabled**. Start a new game and confirm the pack's cards can appear in play —
business `biz-ms-foundations-teahouse`, event `evt-ms-foundations-fair`, upgrade
`upg-ms-foundations-teahouse` (inspect the market/deck or the transcript). The
console shows no pack errors.

3. Toggle the pack **off**, then **on** again.

**Expected:** toggling re-merges and re-applies the pool immediately; the
enabled-set preference persists across a relaunch; disabling a pack whose card
is currently in play is refused in place with an explanatory hint and the pool
is unchanged.

### Scenario B — present but not entitled (locked)

1. Gate the reference pack on an unowned Steam app id. Add an entry to
   `electron/card-pack-dlc-catalog.json`, e.g.:

   ```json
   { "gameId": "main-street", "packId": "main-street-foundations", "steamAppId": 480 }
   ```

   (or add `"entitlement": { "steamAppId": 480 }` to the pack manifest entry),
   then rebuild the Electron main process / repackage so the catalog change
   ships.
2. Launch Main Street (pack installed, DLC not owned by the logged-in account)
   and open the **Card Packs** listing.

**Expected:** the pack is listed as **locked** with the reason
`Requires Steam DLC 480.`; it cannot be enabled; its cards are **absent** from
play and the game runs on base content. With Steam unavailable, the reason is
`Steam is unavailable.` instead.

### Scenario C — missing (a save references an uninstalled pack)

1. With the pack installed and enabled, start a game that puts a pack card into
   play (or place one on the street), then **save**.
2. Remove the pack from the content directory (`rm -rf dist/packs` or the
   override `packs/`), keeping the save.
3. Relaunch and **load** the save.

**Expected:** the game degrades to base content with a warning naming the pack
as **missing** (the save embeds its merged CSV, so already-saved templates are
restored). The game refuses to resume only when a **live** card instance needs
the missing template, surfacing a `MissingCardPackTemplateError` with the
missing template id — otherwise it loads cleanly.

4. Reinstall the pack and load the save again.

**Expected:** the pack's cards resolve and the game resumes normally.

### Scenario D — deny-by-default asset protocol (security smoke)

1. In the running dev build, attempt to load a pack asset that escapes the pack
   directory, e.g.
   `tce-packs://main-street/main-street-foundations/../../../../etc/passwd` or
   `tce-packs://main-street/../secret/icon.png`.

**Expected:** the request is denied (404 / no body); no file outside
`<contentDir>/packs/<gameId>/<packId>/` is ever served. Absolute paths, NUL
bytes, `..`, and directory escapes all resolve to 404.
