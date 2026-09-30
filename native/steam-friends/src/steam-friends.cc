/**
 * tce-steam-friends — N-API addon exposing `ISteamFriends::IsFollowing`
 * (Option A, CG-0MUN7930Y009X8Z1 / P3 CG-0MUNBHYAB0011XXW).
 *
 * Design (see `docs/dev/steam-follow-native-spike.md`):
 *  - The addon **never** calls `SteamAPI_Init`. It resolves the `steam_api64.dll`
 *    already loaded by `steamworks.js` (`EnumProcessModules`) and the
 *    process-global interfaces, so there is no second init and no DLL conflict.
 *  - All Steam symbols are resolved at **runtime** via `GetProcAddress`, so the
 *    addon needs **no Steamworks SDK headers or import library at build time**.
 *  - `ISteamFriends::IsFollowing` is asynchronous (`SteamAPICall_t`); the result
 *    arrives as `FriendsIsFollowing_t` (callback 345). We pump
 *    `SteamAPI_RunCallbacks()` and poll `ISteamUtils::IsAPICallCompleted` with a
 *    bounded timeout, then read the result with `ISteamUtils::GetAPICallResult`.
 *  - **No logged-in assumption:** when Steam is not running, no user is logged
 *    in, or the call cannot complete, `isFollowing` returns `false`. It never
 *    throws and never fabricates `true`.
 *
 * Windows x64 only (matches `package:steam`). Build with node-gyp; see the
 * package README.
 */
#include <node_api.h>
#include <windows.h>
#include <psapi.h>

#include <cstdint>
#include <cstring>

#pragma comment(lib, "psapi.lib")

namespace {

using CSteamID = std::uint64_t;
using SteamAPICall_t = std::uint64_t;

// EResult::k_EResultOK — the only value that means "the call succeeded".
constexpr int kEResultOK = 1;
// FriendsIsFollowing_t::k_iCallback (k_iSteamFriendsCallbacks + 45).
constexpr int kFriendsIsFollowingCallback = 345;
// Bound on the async poll (~1 s); the JS layer also has a safety timeout.
constexpr int kPollAttempts = 10;
constexpr DWORD kPollIntervalMs = 100;

// Mirrors isteamfriends.h. CSteamID is a single 8-byte member and is passed in
// a register on x64, so a std::uint64_t parameter is ABI-compatible. The
// trailing padding after m_bIsFollowing matches the compiler's layout, so
// sizeof() is the SDK's expected callback size (16 bytes).
struct FriendsIsFollowing_t {
  CSteamID m_steamID;
  bool m_bIsFollowing;
  int m_eResult;
};

using SteamFriendsFn = void* (*)();
using IsFollowingFn = SteamAPICall_t (*)(void*, CSteamID);
using RunCallbacksFn = void (*)();
using SteamUtilsFn = void* (*)();
using UtilsIsAPICallCompletedFn = bool (*)(void*, SteamAPICall_t, bool*);
using UtilsGetAPICallResultFn = bool (*)(void*, SteamAPICall_t, void*, int, int, bool*);

HMODULE gSteam = nullptr;

/** Locate `steam_api64.dll` among the modules already loaded in this process. */
bool FindLoadedSteamDll() {
  HMODULE modules[1024];
  DWORD needed = 0;
  if (!EnumProcessModules(GetCurrentProcess(), modules, sizeof(modules), &needed)) {
    return false;
  }
  const DWORD count = needed / sizeof(HMODULE);
  for (DWORD i = 0; i < count; ++i) {
    char path[MAX_PATH] = {0};
    if (!GetModuleFileNameExA(GetCurrentProcess(), modules[i], path, MAX_PATH)) {
      continue;
    }
    const char* base = std::strrchr(path, '\\');
    base = base ? base + 1 : path;
    if (_stricmp(base, "steam_api64.dll") == 0) {
      gSteam = modules[i];
      return true;
    }
  }
  return false;
}

bool SteamLoaded() { return gSteam != nullptr || FindLoadedSteamDll(); }

template <typename T>
T Resolve(const char* name) {
  return gSteam ? reinterpret_cast<T>(GetProcAddress(gSteam, name)) : nullptr;
}

/** Try several exported names, returning the first that resolves. */
template <typename T>
T ResolveFirst(const char* const* names, int count) {
  for (int i = 0; i < count; ++i) {
    if (T fn = Resolve<T>(names[i])) return fn;
  }
  return nullptr;
}

/**
 * Resolve the interface accessor across known SDK versions. The interface
 * version is bumped when the vtable changes; the flat `IsFollowing` wrapper is
 * version-independent.
 */
void* GetSteamFriends() {
  static const char* const names[] = {
      "SteamAPI_SteamFriends_v018",
      "SteamAPI_SteamFriends_v017",
      "SteamAPI_SteamFriends_v016",
  };
  auto getFriends = ResolveFirst<SteamFriendsFn>(names, 3);
  return getFriends ? getFriends() : nullptr;
}

void* GetSteamUtils() {
  static const char* const names[] = {
      "SteamAPI_SteamUtils_v010",
      "SteamAPI_SteamUtils_v009",
  };
  auto getUtils = ResolveFirst<SteamUtilsFn>(names, 2);
  return getUtils ? getUtils() : nullptr;
}

/** Returns true only for a confirmed follow; false on any error/timeout. */
bool CheckFollowing(CSteamID steamId) {
  if (!SteamLoaded()) return false;

  auto isFollowing =
      Resolve<IsFollowingFn>("SteamAPI_ISteamFriends_IsFollowing");
  auto runCallbacks = Resolve<RunCallbacksFn>("SteamAPI_RunCallbacks");
  auto isCompleted = Resolve<UtilsIsAPICallCompletedFn>(
      "SteamAPI_ISteamUtils_IsAPICallCompleted");
  auto getResult = Resolve<UtilsGetAPICallResultFn>(
      "SteamAPI_ISteamUtils_GetAPICallResult");
  if (!isFollowing || !isCompleted || !getResult) return false;

  void* friends = GetSteamFriends();
  void* utils = GetSteamUtils();
  if (!friends || !utils) return false;

  const SteamAPICall_t call = isFollowing(friends, steamId);
  if (call == 0) return false;

  bool failed = false;
  bool completed = false;
  for (int attempt = 0; attempt < kPollAttempts; ++attempt) {
    if (runCallbacks) runCallbacks();
    if (isCompleted(utils, call, &failed)) {
      completed = true;
      break;
    }
    Sleep(kPollIntervalMs);
  }
  if (!completed || failed) return false;

  FriendsIsFollowing_t result{};
  if (!getResult(utils, call, &result, static_cast<int>(sizeof(result)),
                 kFriendsIsFollowingCallback, &failed)) {
    return false;
  }
  return !failed && result.m_eResult == kEResultOK && result.m_bIsFollowing;
}

/** Read a SteamID from a JS BigInt or number; returns false for anything else. */
bool ReadSteamId(napi_env env, napi_value value, CSteamID* out) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok) return false;

  if (type == napi_bigint) {
    std::uint64_t bits = 0;
    bool lossless = false;
    if (napi_get_value_bigint_uint64(env, value, &bits, &lossless) != napi_ok) {
      return false;
    }
    *out = static_cast<CSteamID>(bits);
    return true;
  }
  if (type == napi_number) {
    double number = 0;
    if (napi_get_value_double(env, value, &number) != napi_ok) return false;
    *out = static_cast<CSteamID>(number);
    return true;
  }
  return false;
}

napi_value Init(napi_env env, napi_callback_info) {
  napi_value result;
  napi_get_boolean(env, SteamLoaded(), &result);
  return result;
}

napi_value IsFollowing(napi_env env, napi_callback_info info) {
  napi_value result;
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  CSteamID steamId = 0;
  if (argc < 1 || !ReadSteamId(env, argv[0], &steamId)) {
    // Invalid input is "not following", never an exception.
    napi_get_boolean(env, false, &result);
    return result;
  }
  napi_get_boolean(env, CheckFollowing(steamId), &result);
  return result;
}

napi_value InitModule(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"init", nullptr, Init, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"isFollowing", nullptr, IsFollowing, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports,
                         sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, InitModule)
