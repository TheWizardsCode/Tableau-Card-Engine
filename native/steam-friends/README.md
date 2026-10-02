# tce-steam-friends

N-API addon that exposes `ISteamFriends::IsFollowing` to the TCE Electron main
process (Option A, `CG-0MUN7930Y009X8Z1` / P3 `CG-0MUNBHYAB0011XXW`). Loaded as
a fallback by `electron/steam-follow-native.ts` when the `steamworks.js` binding
lacks `friends.isFollowing`.

## What it does

- Resolves the **already-loaded** `steam_api64.dll` (loaded by `steamworks.js`)
  via `EnumProcessModules` and `GetProcAddress`. It never calls `SteamAPI_Init`,
  so there is no second init and no DLL conflict.
- Calls `SteamAPI_ISteamFriends_IsFollowing`, pumps `SteamAPI_RunCallbacks`, and
  correlates the asynchronous `FriendsIsFollowing_t` result (callback 345) within
  a bounded timeout using the `ISteamUtils` API-call helpers.
- Returns `true` **only** when `m_eResult == k_EResultOK && m_bIsFollowing`.
  With Steam absent, no user logged in, or an incomplete/failed call it returns
  `false` — it never throws and never fabricates `true`.

Exposed API (frozen by P2):

```ts
init(): boolean;                                // is steam_api64.dll loaded?
isFollowing(steamId: bigint): boolean;          // strict, never throws
```

## Build prerequisites

- **Windows x64** (matches `package:steam` / `electron-builder --win`).
- Visual Studio Build Tools (MSVC, Desktop C++) + Python 3.
- `node-gyp` (bundled with npm, or `npm i -g node-gyp`).
- The Node/Electron headers for the target ABI (`--target`/`--dist-url` for a
  specific Electron version).

**No Steamworks SDK is required at build time.** All Steam symbols are resolved
at runtime from the DLL that `steamworks.js` loads, so the SDK (headers and
`steam_api64.lib`) never needs to be present, committed, or linked. At runtime
only the redistributable `steam_api64.dll` ships with the app.

## Build

```bat
cd native\steam-friends
npm run build
:: produces build\Release\steam_friends.node
```

For Electron, build against Electron's ABI, e.g.:

```bat
cd native\steam-friends
node-gyp rebuild --target=43.3.0 --dist-url=https://electronjs.org/headers --arch=x64
```

## Runtime loading

`electron/steam-follow-native.ts` resolves the built module by the bare
specifier `tce-steam-friends` (install/symlink it into `node_modules`, or
package it — see P4), or via the `TCE_STEAM_FRIENDS_MODULE` environment override
for local development. Any failure degrades to `null`, and the launcher falls
back to the manual self-attest claim.
