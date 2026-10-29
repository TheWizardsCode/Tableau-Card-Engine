# SFX Key Naming Convention

> **Last updated:** 2026-10-19
> **Related work-items:** CG-0MM1OQN4E153GJY3 — SFX key naming inconsistency and potential collision; CG-0MQK1GC79000CQIJ — Illegal Move sound; CG-0MVFQ6QOZ003FVO4 — The Rising ToneForge SFX profile

## Overview

All sound effects (SFX) across all games in the Tableau Card Engine use the `sfx-` prefix with **no game identifier**. This ensures a consistent, collision-safe naming convention.

### Examples

| ✅ Correct | ❌ Incorrect |
|-----------|-------------|
| `sfx-card-draw` | `bc-sfx-card-draw` |
| `sfx-ui-click` | `ms-click` |
| `sfx-turn-change` | `lc-sfx-turn-change` |

## Shared Constants

Common cross-game SFX keys are defined as a shared constants object (`COMMON_SFX_KEYS`) exported from `src/core-engine/SoundManager.ts`. Games import and use these constants instead of defining duplicate strings.

```ts
import { COMMON_SFX_KEYS } from '@core-engine/SoundManager';

const MY_SFX_KEYS = {
  UI_CLICK: COMMON_SFX_KEYS.UI_CLICK,
  CARD_DRAW: 'sfx-card-draw',
} as const;
```

### Available common keys

| Constant | Value | Usage |
|----------|-------|-------|
| `COMMON_SFX_KEYS.UI_CLICK` | `sfx-ui-click` | Generic UI click / tap feedback |
| `COMMON_SFX_KEYS.TURN_CHANGE` | `sfx-turn-change` | Active player changes |
| `COMMON_SFX_KEYS.ROUND_END` | `sfx-round-end` | A round has ended |
| `COMMON_SFX_KEYS.SCORE_REVEAL` | `sfx-score-reveal` | Scores are being revealed |
| `COMMON_SFX_KEYS.ILLEGAL_MOVE` | `sfx-illegal-move` | Illegal / invalid action feedback (played automatically by {@link shakeIllegalMove}) |

## Audio Asset Organization

Audio files are organized per game with a default fallback:

```
public/assets/audio/
├── default/            # Fallback sounds for common SFX keys
│   ├── card-draw.wav
│   ├── card-flip.wav
│   ├── game-win.wav    # Game won (victory) — sfx-game-win
│   ├── game-lost.wav   # Game lost (defeat) — sfx-game-lost
│   ├── illegal-move.wav
│   ├── ui-click.wav
│   └── ...
├── golf/               # Game-specific audio
│   ├── card-draw.wav
│   ├── game-win.wav
│   ├── game-lost.wav
│   └── ...
├── sushi-go/
├── feudalism/
├── beleaguered-castle/
├── lost-cities/
├── main-street/        # (Main Street uses assets/games/main-street/audio/)
└── the-rising/         # (The Rising keeps these in its game repo: tce-the-rising/public/assets/audio/the-rising/)
```

When loading audio, use the `audioPathWithFallback()` helper from `src/ui/CardGameScene.ts`:

```ts
import { audioPathWithFallback } from '@ui/CardGameScene';

// Tries assets/audio/golf/card-draw.wav first,
// then assets/audio/default/card-draw.wav
this.load.audio('golf:sfx-card-draw', audioPathWithFallback('golf', 'card-draw.wav'));
```

## Safe Sound Playback (Overlay Helpers)

Overlay helper classes (e.g., `FeudalismOverlays`, `LostCitiesOverlays`) often do not have access to the namespaced `SoundManager` instance. In these cases, calling `this.scene.sound.play()` directly bypasses the namespace resolution and can crash the game loop if the audio key is not found.

### Recommended approach: `safePlaySound()`

For overlay helpers, use the exported `safePlaySound()` utility from `@core-engine/SoundManager`:

```ts
import { safePlaySound } from '@core-engine/SoundManager';

// Inside an overlay helper:
safePlaySound(this.scene, SFX_KEYS.GAME_END);
```

The function wraps `scene.sound.play?.()` in try/catch, gracefully handling:
- Missing audio keys (the audio file was not loaded)
- Null sound manager (e.g., during scene transitions)
- Any other playback errors

### Legacy fallback: inline try/catch

If you prefer not to import the utility, always wrap `scene.sound.play` calls in try/catch:

```ts
try { this.scene.sound.play?.(SFX_KEYS.XXX); } catch { /* ignore */ }
```

### Prohibition

Direct calls to `this.scene.sound.play()` or `this.sound.play()` without try/catch protection **must not** be committed. A custom ESLint rule (`no-direct-sound-play`) enforces this at build time.

## Collision Protection

To prevent Phaser audio key collisions when multiple games are loaded:

1. **Namespace-scoped audio keys**: Each game loads audio with a namespace-prefixed key: `game-name:sfx-card-draw`. This is transparent to game code — SoundManager handles the namespace mapping automatically via the `namespace` option.

2. **Scene-scoped cleanup**: When a game scene shuts down, `SoundManager.destroy()` unsubscribes event listeners and `clearRegistrations()` removes registered keys.

### Setting up namespace in a game scene

```ts
// In your scene's preload():
const ns = 'my-game';
this.load.audio(`${ns}:sfx-card-draw`, audioPathWithFallback('my-game', 'card-draw.wav'));

// In your scene's create():
this.initSoundSystem(Object.values(SFX_KEYS), mapping, { namespace: 'my-game' });
```

## Adding SFX to a New Game

1. **Create audio files** in `public/assets/audio/<game>/`.
2. **Define SFX keys** in a constants file, using `sfx-` prefix:
   ```ts
   import { COMMON_SFX_KEYS } from '@core-engine/SoundManager';

   export const SFX_KEYS = {
     UI_CLICK: COMMON_SFX_KEYS.UI_CLICK,
     CARD_DRAW: 'sfx-card-draw',
   } as const;
   ```
3. **Load audio** in `preload()` using namespace-prefixed keys and `audioPathWithFallback`.
4. **Register and connect** in `create()` via `initSoundSystem()` with the namespace option.
5. **Document** any new game-specific audio files in this document or the game's README.

## Main Street Synth SFX

Main Street uses ToneForge-generated synth audio in addition to WAV fallbacks. The synth key mapping is defined in `example-games/main-street/sfx-tf-mapping.ts` and uses the same `sfx-` prefix convention.

Main Street also uses the two shared **game-over** convention keys (`sfx-game-win` / `sfx-game-lost`) directly from the default audio dir (`public/assets/audio/default/game-win.wav` / `game-lost.wav` — see the [Audio Asset Organization](#audio-asset-organization) tree above). They are loaded in `MainStreetLifecycleManager.preload()` and played by `MainStreetAnimator.animateGameOver()`; they are **not** synth-mapped (no ToneForge factory), so playback falls through to the Phaser WAV assets.

## The Rising ToneForge SFX

The Rising (`tce-the-rising`) generates its three face-off resolution sounds
deterministically with ToneForge and commits the resulting WAVs to its own
repo. This section is maintained in the engine because sibling game repos read
this document; the assets themselves stay in the game repo and are **not**
vendored here.

### Face-off SFX keys and recipes

| Key | Asset (in `tce-the-rising/public/assets/audio/the-rising/`) | ToneForge recipe | Seed |
|-----|-----------------------------------------------------------|------------------|------|
| `sfx-face-off-reveal` | `face-off-reveal.wav` | `card-treasure-reveal` | 42 |
| `sfx-float-in-whoosh` | `float-in-whoosh.wav` | `whoosh-air-swish` | 43 |
| `sfx-land-tick` | `land-tick.wav` | `card-timer-tick` | 44 |

Regenerate each sound from the game repo root with the pinned recipe and seed
(identical inputs produce byte-identical output):

```bash
# Face-off reveal/impact — played at the start of board resolution
tf generate --recipe card-treasure-reveal --seed 42 \
  --output public/assets/audio/the-rising/face-off-reveal.wav

# Fly-in whoosh — played as the winning card travels to the VP counter
tf generate --recipe whoosh-air-swish --seed 43 \
  --output public/assets/audio/the-rising/float-in-whoosh.wav

# Landing tick — played as the winning card lands on the VP counter
tf generate --recipe card-timer-tick --seed 44 \
  --output public/assets/audio/the-rising/land-tick.wav
```

The game README's [*Regenerating the face-off SFX*](../tce-the-rising/README.md#regenerating-the-face-off-sfx)
section is the authority for these recipes and seeds; keep this section in sync
with it.

### Runtime wiring

- **Keys** are declared in `THERISING_SFX_KEYS` (`src/scenes/TheRisingConstants.ts`),
  using the shared `sfx-` prefix with no game identifier. Nine baseline keys
  are plain strings or come from `COMMON_SFX_KEYS`; the three face-off keys
  above are game-specific.
- **File mappings** are declared in `THERISING_AUDIO_FILES` (same module),
  mapping every key to its filename relative to the game's audio directory.
- **Loading** happens in `TheRisingScene.preload()`: each key is registered
  with `audioPathWithFallback('the-rising', file)`, which yields
  `[assets/audio/the-rising/<file>, assets/audio/default/<file>]` so Phaser
  tries the game file first and the shared default second.
- **Playback** goes only through `SoundManager` (via the animator's
  `playSfx()`); overlay helpers use the exported `safePlaySound()`. Direct
  `scene.sound.play()` calls are blocked by the `no-direct-sound-play` ESLint
  rule.

The three beats are sequenced by `TheRisingAnimator.playFaceOffSfxSequence()`:
the reveal sting fires immediately, the whoosh after the reveal→flight gap, and
the landing tick once the flight would land. Deterministic fixed offsets keep
the sequence testable.

### Reduced motion

With reduced motion enabled the face-off travel is skipped and the outcome is
presented instantly, but **all three SFX beats still play** in order — the
result is always audible; only the animation is shortened. The animator reads
the shared reduced-motion setting once in `TheRisingScene.create()` and applies
it to the card tweens and sweeps.

### Fallback behaviour

- The three face-off WAVs are **game-specific** and have no `default/`
  equivalent, so they play only while the game audio directory is present.
- The nine baseline SFX (`sfx-card-draw`, `sfx-card-swap`, `sfx-card-flip`,
  `sfx-illegal-move`, `sfx-score-reveal`, `sfx-ui-click`, `sfx-turn-change`,
  `sfx-game-win`, `sfx-game-lost`) fall back to `public/assets/audio/default/`.
- The Rising has **no** ToneForge synth-mapping module (unlike Main Street's
  `example-games/main-street/sfx-tf-mapping.ts`), so playback always resolves
  to the committed WAV assets — there is no synthesised fallback.

## Testing

- Run `npm test` to verify all SFX-related tests pass.
- The `SoundManager.test.ts` includes tests for `COMMON_SFX_KEYS`, namespace collision protection, and registration inspection.
- The `sfxTfMapping.test.ts` validates Main Street synth key mappings.
