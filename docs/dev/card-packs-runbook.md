# Card packs — authoring, building, installing and gating

This runbook walks the full card-pack lifecycle end to end — **authoring →
building → installing → gating** — using the committed reference pack as the
worked example. It is the operational companion to
[DEVELOPER.md → Card Packs](../DEVELOPER.md#card-packs) and the documentation
slice for feature F11 (`CG-0MUZIS5QH006WICK`) of the card-pack DLC epic
(`CG-0MUZFD1WR0031QTB`).

A **card pack** extends an *already-installed* game with new cards (and optional
art/audio) through the launcher's content directory, **without rebuilding the
launcher**. It is the card-level sibling of the
[runtime game plugin](runtime-game-plugins-runbook.md) channel; a pack is a
manifest + a CSV fragment in the **game's existing card schema** + optional
assets, and may be entitlement-gated (Steam DLC). Packs are additive — a pack
adds rows, it never replaces or rebalances the base pool.

## Contract at a glance

```
<contentDir>/packs/
  manifest.json                 # pack catalogue ({ version, packs[] })
  <gameId>/<packId>/
    cards.csv                   # CSV fragment (header matches the base pool)
    assets/…                    # pack art/audio, served over tce-packs://
```

Each `manifest.json` entry declares:

| Field | Required | Meaning |
|-------|----------|---------|
| `id` | yes | Stable pack id; also the pack directory name. |
| `gameId` | yes | The game the pack extends (`main-street`). |
| `title` | yes | Display name in the in-game listing. |
| `description` | yes | Short description in the listing. |
| `version` | yes | Pack content version (independent of game/engine). |
| `coreEngineVersion` | yes | Semver **range** the pack supports (e.g. `^0.1.0`). |
| `cards` | yes | Pack-relative path to the CSV fragment. |
| `assets` | no | Pack-relative asset paths (served via `tce-packs://`). |
| `entitlement.steamAppId` | no | Steam DLC app id that unlocks the pack; absent = free. |

The contract is parsed and validated by
`src/core-engine/CardPackManifest.ts` (`parseCardPackManifest` +
`splitPacksByCompatibility`). It **never throws**: a malformed document,
duplicate ids, and core-incompatible packs are reported structurally and never
applied.

## Prerequisites

- Dependencies installed (`npm install`).
- `tsx` available (a devDependency) — the builder runs under it.
- The **base game's** `card-data.csv` header to copy into the fragment (Main
  Street's lives at `../tce-main-street/src/card-data.csv`; there are 53
  columns).
- For the gated scenario, a Steam DLC app id and a launcher build that ships
  the catalog entry (see [Gating a pack](#4-gating-a-pack-optional)).

## 1. Author a pack

A pack source is a directory laid out **exactly like the on-disk target** — a
`manifest.json` (`{ version, packs[] }`) plus one `<gameId>/<packId>/`
directory per pack:

```
my-packs/
  manifest.json
  main-street/my-pack/
    cards.csv
    assets/
      my-card-art.png
```

### Worked example — Main Street Foundations

The committed reference pack is the complete worked example, and the builder's
test fixture:

```
tests/fixtures/reference-packs/main-street/
  README.md
  manifest.json
  main-street/main-street-foundations/
    cards.csv
    assets/biz-ms-foundations-teahouse.png
    assets/evt-ms-foundations-fair.png
```

`manifest.json`:

```json
{
  "version": 1,
  "packs": [
    {
      "id": "main-street-foundations",
      "gameId": "main-street",
      "title": "Main Street Foundations",
      "description": "Reference card pack: one business, one event and one upgrade card used to demonstrate and test the card-pack builder.",
      "version": "1.0.0",
      "coreEngineVersion": "^0.1.0",
      "cards": "cards.csv",
      "assets": [
        "assets/biz-ms-foundations-teahouse.png",
        "assets/evt-ms-foundations-fair.png"
      ]
    }
  ]
}
```

`main-street/main-street-foundations/cards.csv` starts with **the base game's
exact header**, then one row per new card (a business, an event and an upgrade).
The header must be byte-for-byte identical to the base — the merge rejects a
fragment whose header differs:

```csv
family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,newDisplayName,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn,upgradeCostDiscount,purchaseCostDiscount,art_notes,hasChoices,acceptNextCardId,rejectNextCardId,availableWeekStart,availableWeekEnd,allowedBusinessTypes,coinPercentDelta,taxAuditRate,storylineId,storylineTitle,unitTestStatus,unitTestFailReason,browserTestStatus,browserTestFailReason,marketRelevanceBias,freeMarketRerollPerTurn,drawWeight
business,biz-ms-foundations-teahouse,Foundations Tea House,300,161,Food,…
event,evt-ms-foundations-fair,Founders' Day Fair,300,…
upgrade,upg-ms-foundations-teahouse,Upgrade to Tea House,300,…
```

Authoring rules:

- **Reuse the base header exactly** (same columns, same order).
- **Use fresh, pack-scoped ids** (e.g. `biz-ms-foundations-teahouse`) — a card
  id that already exists in the base pool or another pack is a **duplicate
  conflict**, and the offending pack is dropped **whole**.
- **Only add rows.** A pack cannot remove or replace a base card.
- Art assets referenced from a row's art columns must be listed in the
  manifest's `assets` and exist under the pack directory.
- Add the pack's art to `public/assets/CREDITS.md` when it ships in the core
  repo; a game repo attributes it in its own credits. Licences must be
  MIT/Apache-2.0/CC0-compatible.

## 2. Build a pack

The reference builder validates the source, copies its real (non-symlink) files,
and upserts the manifest entry into an installable **packs root**:

```bash
npm run build:card-pack -- --input tests/fixtures/reference-packs/main-street
```

Output:

```
build/card-packs/packs/
  manifest.json                         # merged (upserted, not overwritten)
  main-street/main-street-foundations/
    cards.csv
    assets/biz-ms-foundations-teahouse.png
    assets/evt-ms-foundations-fair.png
```

Options:

| Flag | Default | Meaning |
|------|---------|---------|
| `--input <dir>` | *required* | Pack source root (manifest + pack dirs). |
| `--out <dir>` | `build/card-packs/packs` | Packs root to write. |

Builder behaviour that matters operationally:

- An **invalid manifest refuses the build** (exit non-zero, nothing written).
- A malformed individual pack (missing directory, missing/invalid CSV, header
  without `id`, or a fragment path that escapes the pack directory) is
  **rejected whole** and printed to the summary; the build then exits non-zero.
- The manifest is **upserted** by `(gameId, id)` and sorted deterministically,
  so building several packs (or rebuilding one) preserves the others and
  produces byte-identical output for equal inputs.
- Symlinks are skipped — they point at shared core assets the launcher already
  ships (the same `copyGameOwnedAssets` convention as `build:game-artifact`).

The Main Street pack merge consumes the fragment through the core
`mergeCardPackCsv` seam (`src/core-engine/CardPackMerge.ts`), which is also
covered by `tests/core-engine/card-pack-merge.test.ts` and
`tests/scripts/build-card-pack.test.ts`.

## 3. Install a pack

A pack is installed by copying the built packs root into the launcher's
**content directory**, under `packs/`:

```bash
cp -r build/card-packs/packs <contentDir>/packs
```

The launcher resolves `<contentDir>` (first match wins):

1. `--content-dir <dir>` / `TCE_CONTENT_DIR` (the Steam DLC-install model — a
   directory containing `index.html` plus `packs/`);
2. the bundled `dist/` (default).

For a **dev build**, install into `dist/packs/` *after* building and launch
Electron directly — do **not** re-run `npm run start:electron` afterwards,
because it rebuilds `dist/` and clears the packs:

```bash
npm run build:electron && npm run build:electron-main
cp -r build/card-packs/packs dist/packs
npx electron .
```

For the **override (Steam DLC) model**:

```bash
rm -rf /tmp/tce-qa && mkdir -p /tmp/tce-qa
cp -r dist/. /tmp/tce-qa/
cp -r build/card-packs/packs /tmp/tce-qa/packs
npx electron . --content-dir /tmp/tce-qa
```

A packaged binary takes the same flag (`tce-launcher --content-dir /tmp/tce-qa`)
or the `TCE_CONTENT_DIR` environment variable.

At boot the renderer **discovers** the packs for the running game with
`loadCardPacks` (`src/ui/CardPackLoader.ts`): it reads
`<contentDir>/packs/manifest.json` through `fetch`, filters by `gameId` and
`coreEngineVersion`, resolves entitlement, and reads each entitled pack's CSV
fragment through the scoped `tce-packs://` scheme. Main Street bootstraps this
**before scene setup** via `bootstrapMainStreetCardPacks()`, so the first deal
already includes pack cards.

### Pack assets

Pack art/audio is never loaded as raw bytes by the loader; it is resolved to a
`tce-packs://<gameId>/<packId>/<path>` URL
(`src/ui/card-pack-url.ts`) and served by the Electron main process through a
**deny-by-default** handler (`electron/pack-protocol.ts`). Absolute paths, NUL
bytes, `..`, and directory escapes all resolve to **404**; no file outside
`<contentDir>/packs/<gameId>/<packId>/` is ever served.

## 4. Gate a pack (optional)

A pack is **free** when its manifest entry declares no `entitlement`. To gate a
pack on Steam DLC ownership, add a mapping to the operator catalog
`electron/card-pack-dlc-catalog.json` (the operator's authority; no pack or game
title is ever hard-coded):

```json
{
  "version": 1,
  "packs": [
    { "gameId": "main-street", "packId": "main-street-founders-pack", "steamAppId": 480 }
  ]
}
```

A pack absent from the catalog falls back to its own manifest
`entitlement.steamAppId`; a pack with neither is free base content. Resolution
precedence is **exact `(packId, gameId)` → wildcard `packId` → manifest
declaration** (`electron/card-pack-catalog.ts`).

### Entitlement resolution

The main process owns the only Steam-aware code. The seam is
`PackEntitlementSource` (`electron/card-pack-entitlements.ts`) with:

- a **deterministic fake** (`FakeEntitlementSource`) for unit tests, and
- a real **Steamworks adapter** (`electron/card-pack-entitlements-steamworks.ts`)
  that dynamically imports the optional `steamworks.js` and capability-detects
  `apps.isDlcInstalled`.

A pack resolves to one of three states:

| State | Meaning | Listing |
|-------|---------|---------|
| `free` | No entitlement declared. | Enabled by default. |
| `unlocked` | Gated, and the DLC is owned. | Enabled by default, toggleable. |
| `locked` | Gated, and not owned / Steam unavailable / no DLC API. | Read-only with a lock reason. |

The renderer never imports the SDK; it reads status through
`window.tce.cardPacks` (`electron/preload.cjs` → `electron/card-pack-ipc.ts`),
wrapped by the total `src/ui/card-pack-client.ts`. In a plain browser (no
bridge) an ungated pack is reported `free` and a gated pack `locked` with
`Steam is unavailable.` — so the web build plays base content and never crashes.

Lock reasons surfaced in the listing:

- `Requires Steam DLC <appId>.` — gated and not owned.
- `Steam is unavailable.` — no Steam client/session, or the bridge could not be
  reached.
- `Pack bridge unavailable.` — the preload bridge returned a malformed result.

> **Security note:** a capability gap (a binding with no `isDlcInstalled`) is
> never treated as entitlement. The pack stays locked; the launcher never
> fabricates an unlock.

## 5. Degradation behaviour

Every layer is **total** — a failure degrades to base content, never a crash:

| Failure | Behaviour |
|---------|-----------|
| No content directory (browser / core-only) | Base content; no packs discovered. |
| Missing/malformed `packs/manifest.json` | Reported structurally; base content. |
| Pack `coreEngineVersion` incompatible | Hidden from play; listed as incompatible with a reason. |
| Gated pack not owned / Steam unavailable | Listed locked with a reason; its cards are absent. |
| Pack CSV header mismatched, or duplicate card id | Pack dropped **whole** (never partially merged). |
| Failed CSV/asset read | Error reported; base content. |

### Save compatibility (Main Street)

Main Street records the active pack set (`activePacks: { id, version }[]`) plus
the merged `csvChecksum` / `csvData` in every save. On load:

- the merged CSV is restored from the save, so already-saved pack templates
  resolve even if the pack is later removed;
- a pack named in the save but not currently active produces a **warning**
  (`missing` when not installed, `disabled` when present but excluded/locked)
  and the game continues on base content;
- the game **refuses to resume only when a live card instance needs a missing
  template**, surfacing a `MissingCardPackTemplateError` naming the missing
  template id (`src/MainStreetCardPacks.ts`).

Main Street's single merge entry point is
`mergeMainStreetCardPool()` → `loadTemplatesFromCsv()`; no other module
concatenates pack rows.

## Verifying a pack

Automated coverage:

```bash
# Core: contract, merge, loader, URL, listing, protocol, entitlements, builder
npx vitest run --project unit tests/core-engine/card-pack-manifest.test.ts \
  tests/core-engine/card-pack-merge.test.ts \
  tests/ui/card-pack-loader.test.ts tests/ui/card-pack-url.test.ts \
  tests/ui/card-pack-listing.test.ts tests/ui/card-pack-client.test.ts \
  tests/electron/pack-protocol.test.ts \
  tests/electron/card-pack-entitlements.test.ts \
  tests/scripts/build-card-pack.test.ts

# Main Street: the end-to-end loader → merge → save/load pipeline
cd ../tce-main-street && npx vitest run --project unit \
  tests/main-street/CardPackPipelineIntegration.test.ts
```

Manual, packaged-Electron scenarios (installed/entitled, present/locked,
missing, and the deny-by-default asset protocol) are specified in the
[card-packs manual QA plan](card-packs-qa.md).

## Public API index

| Module | Public surface |
|--------|----------------|
| `src/core-engine/CardPackManifest.ts` | `parseCardPackManifest`, `splitPacksByCompatibility`, `filterPacksByGameId`, `DEFAULT_ENGINE_VERSION`, manifest/entitlement types. |
| `src/core-engine/CardPackMerge.ts` | `mergeCardPackCsv`, `computeMergedChecksum`, `CardPackMergeResult`, conflict types. |
| `src/ui/CardPackLoader.ts` | `loadCardPacks`, `PACKS_DIRNAME`, `MANIFEST_FILENAME`, loader options/result types. |
| `src/ui/card-pack-url.ts` | `resolveCardPackAssetUrl`, `CARD_PACK_URL_SCHEME`, `CardPackUrlError`. |
| `src/ui/card-pack-client.ts` | `createCardPackClient`, `cardPackClientFromWindow`, `CardPackClient`, status types, lock reasons. |
| `src/ui/CardPackListing.ts` | `CardPackListing`, `CARD_PACK_LISTING_LAYOUT`, `createCardPackListingState`, `toggleCardPack`, `planCardPackListing`. |
| `electron/pack-protocol.ts` | `resolveCardPackFilePath`, `handleCardPackRequest`, `registerCardPackAssetHandler`. |
| `electron/card-pack-catalog.ts` | `loadCardPackCatalog`, `resolvePackSteamAppId`, catalog types. |
| `electron/card-pack-entitlements.ts` | `PackEntitlementSource`, `FakeEntitlementSource`, `CardPackEntitlementService`, status types. |
| `electron/card-pack-entitlements-steamworks.ts` | `SteamPackEntitlementSource`, `checkEntitlementSupport`. |
| `electron/card-pack-ipc.ts` | `CARD_PACK_CHANNELS`, `createCardPackHandlers`. |
| `scripts/build-card-pack.mjs` | `buildCardPack`, `validatePackCsv`, `mergePackManifestEntry`, `main`. |
