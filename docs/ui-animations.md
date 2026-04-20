# UI Animation Helpers

The Tableau Card Engine provides reusable animation helpers in `src/ui/` for common card game animations.

## Animations Overview

| Animation | Description | Default Duration |
|------------|-------------|-------------------|
| `dealCard` | Card dealing animation with arc motion | 400ms |
| `placeCard` | Card placement animation with "snap" effect | 350ms |
| `placeCard` | Card discard animation with fade/shrink | 400ms |

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

### Events

Emits `card:discarded` event on completion.

## Accessibility

All animation helpers respect the `prefers-reduced-motion` media query. When reduced motion is preferred, animations complete instantly (50ms) without the visual effects.

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