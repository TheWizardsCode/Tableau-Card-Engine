# Steam Achievements — F1 Research Spike Report

**Work item:** `CG-0MUNC7BR0003PFKU` (F1). **Parent:** `CG-0MSMGKSJB004MZBJ`.
**Date:** 2026-09-30.

## Purpose

Research the client-side Steamworks achievement API available through the
optional `steamworks.js` native module (introduced by CG-0MSMAJQQT004SDCC) to
confirm the exact call shape, semantics, and offline behaviour before the
implementation features (F2–F7) commit to a mechanism.

No production code is written in this spike.

## Source

The `steamworks.js` package (MIT, ceifa/steamworks.js) exposes the following
achievement and stats API (from `client.d.ts`):

```ts
namespace achievement {
  function activate(achievement: string): boolean
  function isActivated(achievement: string): boolean
  function clear(achievement: string): boolean
  function names(): Array<string>
}

namespace stats {
  function store(): boolean
}
```

## Findings

### F1.1 — Achievement unlock call shape (confirmed)

```ts
import { achievement } from 'steamworks.js'

achievement.activate('TCE_MAIN_STREET_FOODIE_ROW') // → boolean
```

`activate()` returns `true` when the request was accepted by the Steamworks
session. The achievement is set locally immediately; the server commit happens
via `stats.store()` (F1.3).

**Recommendation:** every `setAchievement` call in the launcher service must
call `achievement.activate(apiName)` and then `stats.store()`.

### F1.2 — Already-unlocked query (confirmed)

```ts
achievement.isActivated('TCE_MAIN_STREET_FOODIE_ROW') // → boolean
```

`isActivated()` reads **local** state. Steam caches unlocked achievements
client-side, so a previous session's unlock is immediately visible without a
server round-trip. This is the authoritative source for idempotence checks
before calling `activate()`.

**Recommendation:** before calling `activate()`, check `isActivated()` to avoid
redundant calls. However, the launcher's own `FileAchievementStore` is the
source of truth for the re-sync protocol (it tracks which ids have been
successfully stored).

### F1.3 — Store/commit requirement (confirmed)

```ts
import { stats } from 'steamworks.js'

stats.store() // → boolean
```

`store()` writes all pending stats and achievements to the Steam server.
Without this call, `activate()` effects are lost on app restart. The return
value is `true` on success.

**Recommendation:** after `activate()`, call `stats.store()` synchronously
within the same method. Failures are retried on next launch (offline-safe
protocol).

### F1.4 — Offline behaviour (confirmed)

When Steam is offline or the client is absent:

- `init()` throws or returns `null` (handled by the caller's try/catch).
- After a successful `init()`, if the Steam client disconnects mid-session,
  `activate()` and `store()` return `false`.
- Local cached achievements (from a previous session) are still visible via
  `isActivated()` — the Steam client caches them on disk.

**Recommendation:** the launcher service must treat a `false` return from
`activate()` as a transient failure and persist the id locally for re-sync on
the next launch. Never throw; degrade silently (intake AC3).

### F1.5 — Capability detection (confirmed)

The achievement API (`ISteamUserStats`) is a **core** Steamworks subsystem — it
has been present since the earliest SDK versions. Unlike `ISteamFriends::IsFollowing`
(which was missing from `steamworks.js` 0.4.0), **there is no capability gap**
for achievements.

**Recommendation:** no capability detection is needed for the achievement API.
The only failure modes are: Steam client absent, Steam server unreachable, or
the optional module not installed. All are handled by the `SteamAvailability`
state machine.

### F1.6 — Hidden flag (confirmed)

The `achievement.activate()` / `isActivated()` API does **not** expose the
`hidden` flag. The hidden/unlock-state flags are backend-only, configured on
the Steamworks partner portal. The client API only manipulates the unlocked
state.

**Recommendation:** the manifest mirrors the hidden flag for documentation/UI
purposes only; it does not affect the client API calls.

### F1.7 — `names()` for manifest validation

```ts
achievement.names() // → Array<string>  // registered achievement API names
```

`names()` returns all achievement API names registered with this app on the
Steam backend. This can be used at runtime (during QA or a validation mode) to
detect manifest drift: if the manifest lists an API name that is absent from
the `names()` array, Steam will silently ignore the unlock.

**Recommendation:** add a manifest-validation mode (non-production) that
compares manifest API names against `achievement.names()` and reports
discrepancies as warnings.

## Recommendations for F2–F7

| Aspect | Recommendation |
|--------|----------------|
| **Achievement activation** | `achievement.activate(apiName)` → `stats.store()` in a single synchronous call chain. |
| **Idempotence** | Check `isActivated()` before `activate()` to avoid redundant calls, but also track locally persisted ids for the offline re-sync protocol. |
| **Offline re-sync** | Persist unlocked ids in `FileAchievementStore`; on launch, re-iterate the store and call `activate()` + `store()` for any id not yet confirmed by Steam. |
| **Capability detection** | Not needed — achievement API is always available after `init()` succeeds. |
| **Graceful degradation** | `init()` catches all errors; `activate()`/`store()` return `false` on failure (never throw). |
| **Hidden flag** | Mirrored in manifest only; no client API impact. |
| **Manifest validation** | Use `achievement.names()` in a dev/QA validation mode to detect drift. |

## Decision-gate

All F1 acceptance criteria are satisfied. The confirmed API shape, offline
behaviour, and lack of capability gaps mean F2–F7 can proceed without
re-research.

---

**Status:** Spike complete. No production code committed.
