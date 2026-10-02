# Steam follow detection — native exposure spike (P1)

**Work item:** `CG-0MUN7930Y009X8Z1` / P1 `CG-0MUNBHWY90051NAU`
**Decision:** commit to **Option A** — a small custom N-API addon that exposes
`ISteamFriends::IsFollowing`, loaded as a fallback when the `steamworks.js`
binding lacks `friends.isFollowing`.

This document is the P1 spike report. It records the confirmed interface/FFI
facts, the asynchronous completion mechanism, the process-global instance
sharing analysis, SDK build/licence constraints, the recommendation, and the
throwaway probe used to reason about the design. It is **not** production code
(P1 AC6).

> **Rescope (producer 2026-09-30):** do **not** assume the Steam client is
> logged in. Detection must resolve and return `false` within a bounded timeout
> when Steam runs without a logged-in user — never crash, never fabricate
> `true`. Real-session boolean verification is consolidated into P6
> (operator-run).

## 1. Confirmed interface + FFI facts

Verified against the redistributable `steam_api64.dll` (PE32+ x86-64) shipped
with the TCE packaged Windows build:

| Fact | Value |
|---|---|
| Friends interface version | `SteamFriends017` / `SteamAPI_SteamFriends_v017()` |
| Client interface version | `SteamClient017` |
| IsFollowing export | `SteamAPI_ISteamFriends_IsFollowing` (present) |
| Return type | `SteamAPICall_t` (asynchronous) |
| Completion callback | `FriendsIsFollowing_t`, `k_iCallback = 345` |
| Callback layout | `{ CSteamID m_steamID; bool m_bIsFollowing; EResult m_eResult; }` |
| Callback pump | `SteamAPI_RunCallbacks()` |
| Completion query | `SteamAPI_IsAPICallCompleted(call, bool* pbFailed)` + `SteamAPI_GetAPICallResult(call, void*, int, int, bool*)` |

**Correction to the original plan:** the plan assumed `SteamFriends018` /
`SteamAPI_SteamFriends_v018()`. The shipped DLL exports **v017**. The addon must
resolve `SteamAPI_SteamFriends_v017()` (or
`SteamAPI_ISteamClient_GetISteamFriends(client, pipe, user, "SteamFriends017")`).
Hard-coding v018 would fail.

Secondary async friends calls also present:
`SteamAPI_ISteamFriends_EnumerateFollowingList`, `GetFollowerCount`.

## 2. Async completion mechanism

`IsFollowing` returns `SteamAPICall_t`; the result arrives as
`FriendsIsFollowing_t`. The correct sequence is:

1. obtain `ISteamFriends*` via `SteamAPI_SteamFriends_v017()`;
2. call `SteamAPI_ISteamFriends_IsFollowing(friends, csteamid)`;
3. pump `SteamAPI_RunCallbacks()` and poll `SteamAPI_IsAPICallCompleted` within
   a bounded timeout (~1 s);
4. read with `SteamAPI_GetAPICallResult(call, &out, sizeof(out), 345, &failed)`;
5. return `true` **only** when `m_eResult == k_EResultOK && m_bIsFollowing`;
   otherwise `false`.

**No logged-in user:** when Steam runs without a logged-in user (or the call
cannot complete), step 3 times out and the detection returns `false`. It must
never throw and never treat an incomplete/failed call as a follow.

## 3. Process-global instance sharing

`steamworks.js` loads `steam_api64.dll` and initialises the process-global
Steam client via `SteamAPI_InitFlat`. The addon **does not** call
`SteamAPI_Init`; it reuses the already-loaded module (`EnumProcessModules`) and
the process-global interfaces. `SteamAPI_SteamFriends_v017()` reads the same
singleton as `steamworks.js`, so a double-init is avoided **by construction**.
Empirical confirmation is deferred to P6.

**Open Risk R1 (settled empirically in P6):** `steamworks-rs` (under
`steamworks.js`) may or may not pump `SteamAPI_RunCallbacks` itself. Concurrent
pumping could race with an explicit `RunCallbacks`. Mitigation if it conflicts:
register a real `CCallback<FriendsIsFollowing_t>` (or use
`SteamAPI_ManualDispatch`) instead of polling `GetAPICallResult`, sharing the
dispatch path. This is the only fragility that would justify pivoting to
Option B.

**Open Risk R2 (low):** ABI stability. `CSteamID` is an 8-byte single-member
struct (register-passed as an integer on x64 MSVC); `SteamAPICall_t` is
`uint64`. The addon calls exported C wrappers, not raw vtable offsets, so SDK
version drift is largely neutralised.

## 4. SDK build / acquisition and licence

- **Acquisition:** the Steamworks SDK is not in the repo and must never be
  committed. Producer policy (plan Q2 answer (a)): local SDK path or private CI
  secret.
- **Build:** requires `steam_api64.dll` plus its import library
  (`steam_api64.lib`) and the public headers (`isteamfriends.h`, `steam_api.h`);
  `node-gyp` on a Windows x64 host with MSVC Build Tools. Option A needs no Rust
  toolchain.
- **Licence:** SDK headers/`.lib` are **not redistributable**; only
  `steam_api64.dll` may ship with the app (already handled by
  `electron-builder.yml` `asarUnpack`). Build artefacts must be gitignored and
  CI-provided.
- **Target:** Windows x64 only (matches `package:steam` / `electron-builder
  --win`).

## 5. Recommendation

Commit to **Option A** (custom N-API addon), with the R1 mitigation (shared
callback / manual dispatch) as the fallback if the `steamworks.js` pump
conflicts. Option B (a patched `steamworks.js` fork) is not required on
API-availability grounds because the shipped DLL already exports
`SteamAPI_ISteamFriends_IsFollowing`.

## Appendix — throwaway probe

The C++ below was written to reason about the FFI. It is **not** compiled into
the product; P3 implements the real module. It resolves the loaded
`steam_api64.dll`, obtains `ISteamFriends*`, calls `IsFollowing`, pumps
callbacks and polls with a bounded timeout, and returns `false` when no
logged-in user / no running Steam is present.

```cpp
// ── steam-friends-spike.cpp ──────────────────────────────────────────────────
// THROWAWAY N-API probe for CG-0MUN7930Y009X8Z1 / P1.  NOT production code.
//
// Purpose: confirm that ISteamFriends::IsFollowing can be obtained from the
// steam_api64.dll already loaded by steamworks.js, without a second
// SteamAPI_Init, and that the asynchronous result can be correlated.
//
// Target: Windows x64.  Build (on a Windows host):
//     npm install --save-dev node-addon-api node-gyp
//     node-gyp configure build --target=<electron-abi>
//
// Confirmed facts (from the TCE build's steam_api64.dll):
//   Interface : SteamFriends017 / SteamAPI_SteamFriends_v017()
//   Function  : SteamAPI_ISteamFriends_IsFollowing(ISteamFriends*, CSteamID)
//               -> SteamAPICall_t (asynchronous)
//   Callback  : FriendsIsFollowing_t (k_iCallback = 345)
//               { CSteamID m_steamID; bool m_bIsFollowing; EResult m_eResult; }
//   Pump      : SteamAPI_RunCallbacks()
//   Complete  : SteamAPI_IsAPICallCompleted(hCall, bool* pbFailed)
//               SteamAPI_GetAPICallResult(hCall, void*, int, int, bool*)
// ──────────────────────────────────────────────────────────────────────────────
#include <node_api.h>
#include <windows.h>
#include <psapi.h>
#include <cstdint>
#include <cstdio>
#include <cstring>

#pragma comment(lib, "psapi.lib")

// ── Minimal Steam ABI types (no SDK header needed) ───────────────────────────
typedef uint64_t CSteamID;      // single 8-byte member; register-passed on x64
typedef uint64_t SteamAPICall_t;
static const int k_EResultOK = 1;
static const int k_iFriendsIsFollowingCallback = 345; // k_iSteamFriendsCallbacks + 45

struct FriendsIsFollowing_t {
  CSteamID m_steamID;
  bool     m_bIsFollowing;
  int      m_eResult; // EResult
};

// ── Function pointer signatures ──────────────────────────────────────────────
typedef void*          (*SteamFriendsV017_fn)(void);
typedef SteamAPICall_t (*IsFollowing_fn)(void* pFriends, CSteamID steamId);
typedef void           (*RunCallbacks_fn)(void);
typedef bool           (*IsAPICallCompleted_fn)(SteamAPICall_t, bool* pbFailed);
typedef bool           (*GetAPICallResult_fn)(SteamAPICall_t, void*, int, int, bool*);

static HMODULE g_steam = nullptr;

// Locate steam_api64.dll among the modules already loaded in this process.
static bool findLoadedSteamDll() {
  HMODULE mods[1024];
  DWORD needed = 0;
  if (!EnumProcessModules(GetCurrentProcess(), mods, sizeof(mods), &needed)) return false;
  for (DWORD i = 0; i < needed / sizeof(HMODULE); ++i) {
    char name[MAX_PATH] = {0};
    if (!GetModuleFileNameExA(GetCurrentProcess(), mods[i], name, MAX_PATH)) continue;
    const char* base = strrchr(name, '\\');
    base = base ? base + 1 : name;
    if (_stricmp(base, "steam_api64.dll") == 0) { g_steam = mods[i]; return true; }
  }
  return false;
}

template <typename T>
static T resolve(const char* name) {
  return reinterpret_cast<T>(GetProcAddress(g_steam, name));
}

// napi: init() -> boolean (is steam_api64.dll already loaded?)
static napi_value Init(napi_env env, napi_callback_info) {
  napi_value out;
  napi_get_boolean(env, findLoadedSteamDll(), &out);
  return out;
}

// napi: isFollowing(steamId64: number) -> boolean
static napi_value IsFollowing(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) { napi_throw_type_error(env, nullptr, "steamId64 required"); return nullptr; }

  double asDouble = 0;
  napi_get_value_double(env, argv[0], &asDouble);
  const CSteamID steamId = static_cast<CSteamID>(asDouble);

  napi_value out;
  if (!g_steam && !findLoadedSteamDll()) {
    napi_throw_error(env, nullptr, "steam_api64.dll not loaded by this process");
    return nullptr;
  }

  auto getFriends   = resolve<SteamFriendsV017_fn>("SteamAPI_SteamFriends_v017");
  auto isFollowing  = resolve<IsFollowing_fn>("SteamAPI_ISteamFriends_IsFollowing");
  auto runCallbacks = resolve<RunCallbacks_fn>("SteamAPI_RunCallbacks");
  auto isCompleted  = resolve<IsAPICallCompleted_fn>("SteamAPI_IsAPICallCompleted");
  auto getResult    = resolve<GetAPICallResult_fn>("SteamAPI_GetAPICallResult");

  if (!getFriends || !isFollowing) {
    napi_throw_error(env, nullptr, "SteamFriends v017 / IsFollowing not exported");
    return nullptr;
  }

  void* friends = getFriends();
  if (!friends) { napi_get_boolean(env, false, &out); return out; }

  SteamAPICall_t call = isFollowing(friends, steamId);
  if (call == 0) { napi_get_boolean(env, false, &out); return out; }

  // Bounded poll: pump the callback queue and wait up to ~1 s for completion.
  bool failed = false;
  for (int attempt = 0; attempt < 10; ++attempt) {
    if (runCallbacks) runCallbacks();
    if (isCompleted && isCompleted(call, &failed)) break;
    Sleep(100);
  }

  FriendsIsFollowing_t result{};
  bool ok = getResult &&
            getResult(call, &result, sizeof(result),
                      k_iFriendsIsFollowingCallback, &failed);
  bool following = ok && !failed && result.m_eResult == k_EResultOK &&
                   result.m_bIsFollowing;
  napi_get_boolean(env, following, &out);
  return out;
}

static napi_value InitModule(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
    { "init",        0, Init,        0, 0, 0, napi_default, 0 },
    { "isFollowing", 0, IsFollowing, 0, 0, 0, napi_default, 0 },
  };
  napi_define_properties(env, exports, 2, props);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, InitModule)
```
