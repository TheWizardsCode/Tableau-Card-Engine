# SFX Key Naming Convention

> **Last updated:** 2026-06-17
> **Related work-item:** CG-0MM1OQN4E153GJY3 — SFX key naming inconsistency and potential collision

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

## Audio Asset Organization

Audio files are organized per game with a default fallback:

```
public/assets/audio/
├── default/            # Fallback sounds for common SFX keys
│   ├── card-draw.wav
│   ├── card-flip.wav
│   ├── ui-click.wav
│   └── ...
├── golf/               # Game-specific audio
│   ├── card-draw.wav
│   └── ...
├── sushi-go/
├── feudalism/
├── beleaguered-castle/
├── lost-cities/
├── the-mind/
└── main-street/        # (Main Street uses assets/games/main-street/audio/)
```

When loading audio, use the `audioPathWithFallback()` helper from `src/ui/CardGameScene.ts`:

```ts
import { audioPathWithFallback } from '@ui/CardGameScene';

// Tries assets/audio/golf/card-draw.wav first,
// then assets/audio/default/card-draw.wav
this.load.audio('golf:sfx-card-draw', audioPathWithFallback('golf', 'card-draw.wav'));
```

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

## Testing

- Run `npm test` to verify all SFX-related tests pass.
- The `SoundManager.test.ts` includes tests for `COMMON_SFX_KEYS`, namespace collision protection, and registration inspection.
- The `sfxTfMapping.test.ts` validates Main Street synth key mappings.
