# UI Animation Helpers

The Tableau Card Engine provides reusable animation helpers in `src/ui/` for common card game animations.

## Animations Overview

| Animation | Description | Default Duration |
|------------|-------------|-------------------|
| `dealCard` | Card dealing animation with arc motion | 400ms |
| `placeCard` | Card placement animation with "snap" effect | 350ms |
| `discardCard` | Card discard animation with fade/shrink | 400ms |
| `flipCard` | Two-phase card flip (scaleX → 0 → texture swap → scaleX → 1) | 300ms |
| `moveGameObject` | Positional movement tween | 700ms |

## dealCard

Animates a card being dealt from a source position into a player's hand. Uses smooth arc motion with a slight rotation for a natural card-dealing feel.

### Import

```ts
import { dealCard } from '@ui/dealCard';
```

### Usage

```ts
dealCard({
  scene: this,
  target: cardSprite,
  destX: 200,
  destY: 500,
  sourceX: 400,
  sourceY: 100,
  gameEvents: this.gameEvents,
  cardId: card.id,
  playerIndex: 0,
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | The Phaser scene |
| `target` | `GameObject` | required | The card sprite to animate |
| `destX` | `number` | required | Destination X coordinate |
| `destY` | `number` | required | Destination Y coordinate |
| `sourceX` | `number` | target.x | Starting X coordinate |
| `sourceY` | `number` | target.y | Starting Y coordinate |
| `duration` | `number` | 400 | Duration in ms |
| `arcHeight` | `number` | -50 | Arc height (negative = upward) |
| `ease` | `string` | 'Quad.easeOut' | Easing function |
| `rotation` | `number` | 0.05 | Rotation during flight (radians) |
| `gameEvents` | `GameEventEmitter` | undefined | Event emitter |
| `cardId` | `string` | undefined | Card ID for event payload |
| `playerIndex` | `number` | undefined | Player index for event payload |
| `reducedMotion` | `boolean` | undefined | When true, animation is skipped and snaps to destination instantly |

### Events

Emits `card:dealt` event on completion (if `gameEvents` provided).

## placeCard

Animates a card being placed onto a destination (street grid, tableau). Uses smooth "spring" motion with `Back.easeOut` for a satisfying "snap" effect.

### Import

```ts
import { placeCard } from '@ui/placeCard';
```

### Usage

```ts
placeCard({
  scene: this,
  target: cardSprite,
  destX: gridX,
  destY: gridY,
  scale: 1.05,
  gameEvents: this.gameEvents,
  cardId: card.id,
  playerIndex: 0,
  slotIndex: slotIdx,
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | The Phaser scene |
| `target` | `GameObject` | required | The card sprite |
| `destX` | `number` | required | Destination X |
| `destY` | `number` | required | Destination Y |
| `duration` | `number` | 350 | Duration in ms |
| `ease` | `string` | 'Back.easeOut' | Easing function |
| `scale` | `number` | 1 | Peak scale during animation |
| `scaleDurationRatio` | `number` | 0.6 | Phase 1 duration as ratio |
| `gameEvents` | `GameEventEmitter` | undefined | Event emitter |
| `cardId` | `string` | undefined | Card ID for event |
| `playerIndex` | `number` | undefined | Player index |
| `slotIndex` | `number` | undefined | Slot index |
| `reducedMotion` | `boolean` | undefined | When true, animation is skipped and snaps to destination instantly |

### Events

Emits `card:placed` event on completion.

## discardCard

Animates a card being discarded: fades out, shrinks, and moves in a discard direction.

### Import

```ts
import { discardCard } from '@ui/discardCard';
```

### Usage

```ts
discardCard({
  scene: this,
  target: cardSprite,
  offsetY: 30,
  gameEvents: this.gameEvents,
  cardId: card.id,
  playerIndex: 0,
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | The Phaser scene |
| `target` | `GameObject` | required | The card sprite |
| `offsetY` | `number` | 30 | Vertical offset |
| `offsetX` | `number` | 0 | Horizontal offset |
| `duration` | `number` | 400 | Duration in ms |
| `ease` | `string` | 'Quad.easeIn' | Easing function |
| `rotation` | `number` | 0.1 | Rotation (radians) |
| `gameEvents` | `GameEventEmitter` | undefined | Event emitter |
| `cardId` | `string` | undefined | Card ID for event |
| `playerIndex` | `number` | undefined | Player index |
| `destroyAfter` | `boolean` | true | Destroy sprite after |
| `reducedMotion` | `boolean` | undefined | When true, animation is skipped and target is hidden/destroyed instantly |

### Events

Emits `card:discarded` event on completion.

## flipCard

Performs the classic "scaleX → 0 → change texture → scaleX → 1" card flip animation. Optionally translates the sprite to a destination during the flip.

### Import

```ts
import { flipCard } from '@ui/flipCard';
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | The Phaser scene |
| `target` | `Image | Sprite` | required | The sprite to flip |
| `newTexture` | `string` | required | Texture key for the face side |
| `duration` | `number` | 300 | Total duration in ms |
| `easeClose` | `string` | 'Power2' | Easing for close phase |
| `easeOpen` | `string` | easeClose | Easing for open phase |
| `destX` | `number` | undefined | Destination X (for flip + translate) |
| `destY` | `number` | undefined | Destination Y |
| `onMidpoint` | `function` | undefined | Called at midpoint after texture swap |
| `onComplete` | `function` | undefined | Called after flip completes |
| `reducedMotion` | `boolean` | undefined | When true, texture swaps instantly without animation |

## moveGameObject

Animates a Phaser game object from its current position to a target (x, y) with configurable duration, easing, and an onComplete callback. Position-only translation.

### Import

```ts
import { moveGameObject } from '@ui/moveGameObject';
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | The Phaser scene |
| `target` | `GameObject` | required | The object to move |
| `destX` | `number` | required | Destination X |
| `destY` | `number` | required | Destination Y |
| `duration` | `number` | 700 | Duration in ms |
| `ease` | `string` | 'Quad.easeOut' | Easing function |
| `onComplete` | `function` | undefined | Called after movement completes |
| `reducedMotion` | `boolean` | undefined | When true, target snaps to destination instantly |
| `sfx` | `object` | undefined | Optional SFX configuration (start/move/end keys) |

## popTextOrIcon

Animate a pop-up text or icon (rises, fades, and scales up briefly).

### Import

```ts
import { popTextOrIcon } from '@ui/popTextOrIcon';
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | The Phaser scene |
| `target` | `GameObject` | undefined | Existing text/icon object |
| `label` | `string` | undefined | Text label (created if no target provided) |
| `reducedMotion` | `boolean` | undefined | When true, destroys target immediately without animation |

## runSceneTransition

Animate a scene transition (fade or slide enter/exit).

### Import

```ts
import { runSceneTransition } from '@ui/sceneTransition';
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | The Phaser scene |
| `mode` | `'enter' | 'exit'` | required | Transition direction |
| `type` | `'fade' | 'slide'` | 'fade' | Transition type |
| `duration` | `number` | 300 | Duration in ms |
| `reducedMotion` | `boolean` | undefined | When true, transition completes instantly |

## Game-Specific Usage: Coloretto

Coloretto (`example-games/coloretto/scenes/ColorettoScene.ts`) uses the shared
animation helpers for every player-facing card action:

| Action | Helper | Notes |
|--------|--------|-------|
| Draw + place onto a row | `placeCard` | Card flies from the deck to the target row slot, then flips if drawn face-down |
| Take a row into a collection | `moveGameObject` | Taken cards fly to the player's collection chips (animated destination == rendered chip position, AC5) |
| Flip the Last Round card | `flipCard` | Two-phase texture swap at the resting position between tableau and deck |
| AI turns | `placeCard` / `moveGameObject` | AI actions run through the same animated pipeline as human actions, scheduled via `time.delayedCall` (750ms, 150ms under reduced motion) so the player can see and hear what the AI did |
| Illegal moves | `shakeIllegalMove` | Plays `COMMON_SFX_KEYS.ILLEGAL_MOVE` automatically |

Key wiring:

- **Sound**: helpers are passed `soundManager` + `sfx` (start/move/end keys) or
  emit through the scene's `GameEventEmitter` (`EventSoundMapping` from
  `src/core-engine/SoundManager.ts`) so every animated action is audible.
- **Reduced motion**: the scene passes its `reducedMotion` flag
  (SettingsStore toggle → `prefers-reduced-motion`) into every helper call;
  tweens are skipped and sprites snap instantly.
- **Test coverage**: `tests/coloretto/ColorettoScene.browser.test.ts` asserts
  the animation destinations, flip timing, AI-turn delays, and reduced-motion
  instant placement paths (including the regression test that guards the
  human placement slot when the AI's randomized first turn places first).

## Accessibility

All animation helpers respect the reduced motion preference with the following priority:

1. **Explicit `reducedMotion` parameter** — when passed directly to the animation call, takes highest priority.
2. **SettingsStore preference** — the in-game "Reduced Motion" toggle in the Settings panel (persisted to `localStorage` under `tce-ui-reduced-motion`).
3. **CSS media query** — `prefers-reduced-motion: reduce` as fallback when no explicit preference is set.

The utility function `getEffectiveReducedMotion(storage?)` in `src/ui/ReducedMotion.ts` implements this priority chain and can be used directly by any code that needs to check the preference.

When reduced motion is enabled:
- All tweens are skipped and sprites snap to their final position/state instantly
- All sound effects (SFX) are suppressed
- Callbacks (`onComplete`) fire synchronously
- Events (e.g., `card:placed`) are emitted correctly

## Event Types

The following event types are exported from `GameEventEmitter`:

```ts
interface CardDealtPayload {
  cardId?: string;
  playerIndex?: number;
}

interface CardPlacedPayload {
  cardId?: string;
  playerIndex?: number;
  slotIndex?: number;
}

interface CardDiscardedPayload {
  cardId?: string;
  playerIndex?: number;
}
```

See `src/core-engine/GameEventEmitter.ts` for the full event type definitions.
