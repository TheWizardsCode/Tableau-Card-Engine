# UI Animation Helpers

The Tableau Card Engine provides reusable animation helpers in `src/ui/` for common card game animations.

## Animations Overview

| Animation | Description | Default Duration |
|------------|-------------|-------------------|
| `dealCard` | Card dealing animation: one continuous arc (no mid-flight stall) | 400ms |
| `placeCard` | Card placement animation with "snap" effect | 350ms |
| `discardCard` | Card discard animation with fade/shrink | 400ms |
| `flipCard` | Two-phase card flip (scaleX → 0 → texture swap → scaleX → 1) | 300ms |
| `moveGameObject` | Positional movement tween | 700ms |
| `shakeIllegalMove` | Illegal-move feedback: tint + shake, plus an optional transient reason toast | n/a (50ms × repeats) |
| `createDragDropManager` | Reusable drag-and-drop lifecycle (dragstart/drag/dragend/drop, snap-back, drop-zone hit-testing) | n/a |
| `HandView` reorder | Opt-in drag-to-reorder inside the hand row: animated re-layout + `sfx-card-swap` | 240ms |
| `revealNarration` | Progressive prose reveal (story beat) with a shared SFX | prose length × 28ms (400–9000ms) |
| `presentSceneExit` | Act/scene exit banner: title → outcome → route, from SLL anchors, with a shared SFX | 3 × 1200ms + 3000ms dwell |
| `paginateProse` | Word-boundary prose pagination for a fixed display budget (no silent clipping) | n/a (pure) |

## dealCard

Animates a card being dealt from a source position into a player's hand as
**one continuous motion**: a single tween drives a normalised progress value
from `0` to `1` across the whole `duration`, and the card's position and
rotation are evaluated from that progress on a single quadratic arc joining the
source to the destination.

There is no phase boundary to tune, so the card never decelerates to a halt
part-way through the flight and never restarts its easing — a deal reads as one
fluid gesture rather than two halves with a hiccup in the middle
(CG-0MWC07OBB004YD5E). The symmetric sine ease-in-out default accelerates from
rest, whips through the arc peak at its fastest and settles into the hand; the
rotation follows the same curve, so it eases out of `0`, peaks at the arc peak
and eases back to `0` with no abrupt reversal.

> **Upgrading note:** earlier releases chained two tweens (a 40 % rise easing
> out into a zero-velocity apex, then a 60 % drop easing in), so the caller's
> `ease` shaped only the first 40 % and phase 2 was hardcoded. The `ease` option
> now shapes the **whole** flight, and the returned tween drives the **whole**
> flight (cancelling it stops the card wherever it is). Endpoints, `duration`
> semantics, the `card:dealt` event, the SFX beats and the reduced-motion branch
> are unchanged.

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
| `duration` | `number` | 400 | Duration in ms; bounds the **whole** flight |
| `arcHeight` | `number` | -50 | Peak displacement from the source→destination chord (negative = upward; `0` = straight line) |
| `ease` | `string \| (progress) => number` | `DEFAULT_DEAL_EASE` | Easing applied **once across the whole flight** |
| `rotation` | `number` | 0.05 | Peak rotation during flight (radians), reached at the arc peak |
| `gameEvents` | `GameEventEmitter` | undefined | Event emitter |
| `cardId` | `string` | undefined | Card ID for event payload |
| `playerIndex` | `number` | undefined | Player index for event payload |
| `reducedMotion` | `boolean` | undefined | When true, animation is skipped and snaps to destination instantly |

### Pacing constants and the motion contract

The motion is exposed as exported constants and pure helpers, so re-pacing a
deal is a one-constant change and no caller has to wait on a hardcoded
millisecond window:

| Export | Purpose |
|--------|---------|
| `DEFAULT_DEAL_DURATION` | Whole-flight duration (400 ms) |
| `DEFAULT_DEAL_ARC_HEIGHT` | Peak displacement from the chord (-50 px) |
| `DEFAULT_DEAL_EASE` | Default easing function (symmetric sine ease-in-out) |
| `DEAL_ARC_PEAK_PROGRESS` | Flight progress at which the arc peaks (0.5) |
| `DEAL_MIN_INTERIOR_SPEED_RATIO` | Documented epsilon for the no-stall guarantee: the minimum fraction of peak travel speed kept at every interior sample of the flight |
| `dealArcProfile(progress)` | The arc's bulge profile: `0` at both ends, `1` at the arc peak |
| `evaluateDealPath(geometry, progress)` | Pure evaluation of position + rotation at a normalised progress (the same code the tween drives, usable in tests and headless checks) |

Guaranteed by that shape: the flight has **no zero-velocity stall** inside the
flight (speed stays above `DEAL_MIN_INTERIOR_SPEED_RATIO` of its peak between
launch and landing), it crosses its arc peak exactly once with no dwell or
reversal, and consecutive path steps stay within the arc's Lipschitz bound.

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

## shakeIllegalMove (illegal-move feedback + reason toast)

Shared illegal-move feedback routine: tint + horizontal shake + the
`sfx-illegal-move` SFX. Pass a `reason` and the routine **also** renders a
transient toast containing that text, so a refused move explains itself
instead of only shaking (CG-0MVPXFHBZ004LGEB).

### Import

```ts
import { shakeIllegalMove } from '@ui';
```

> **Node-safe to import.** `shakeIllegalMove` — and the toast view it composes
> (`@ui/illegalMoveToastView`) plus `@ui/dragDrop`, which imports
> `shakeIllegalMove` — are free of Phaser **value** imports, so they load in a
> plain Node environment (no `window`, no browser). Downstream game unit suites
> import these deep paths safely; `tests/ui/phaser-free-imports.test.ts` guards
> the graph at runtime with a throwing `phaser` mock (CG-0MVQQ2M8E003FQMZ).
> Do **not** add a Phaser value import (or an import of a Phaser-bearing module
> like `@ui/Renderer`) to these helpers.
>
> **Look node-safety up, do not probe it:** the authoritative list is the
> manifest [`src/ui/node-safe-modules.ts`](../src/ui/node-safe-modules.ts)
> (`uiNodeSafeModules`). If a `@ui` module is not listed there, treat it as
> Phaser-bearing and import it only from scene code. The promise is enforced by
> the static import-graph check `scripts/check-ui-node-surface.ts`
> (`npm run check:ui-node-surface`, run automatically as `prebuild` before every
> `npm run build`) and by the manifest-driven runtime guard
> `tests/ui/phaser-free-imports.test.ts` (CG-0MVS9HBN3009HIQN).

### Usage

```ts
const result = rules.placeFigure(state, cardId, slotIndex);
if (!result.legal) {
  shakeIllegalMove({
    scene: this,
    target: cardContainer,          // Image, Sprite or Container
    reason: result.reason,          // rules-layer copy, shown verbatim
  });
}
```

### Options (`ShakeIllegalMoveOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | Scene that owns the tween/toast |
| `target` | `Image \| Sprite \| Container \| null` | required | Target to shake; `null` still shows the reason toast |
| `tint` | `number` | `0xff4444` | Tint applied during the shake (tintable targets only) |
| `shakeDistance` | `number` | 5 | Horizontal offset per oscillation (px) |
| `duration` | `number` | 50 | Oscillation duration (ms) |
| `repeat` | `number` | 2 | Extra oscillation repeats |
| `ease` | `string` | `'Sine.inOut'` | Oscillation easing |
| `soundKey` | `string` | `sfx-illegal-move` | SFX key; `''` suppresses the sound |
| `reason` | `string` | — | Player-facing rejection text rendered as a toast (verbatim) |
| `reasonDwellMs` | `number` | 2500 | Toast dwell before auto-dismissal (ms) |
| `reducedMotion` | `boolean` | `getEffectiveReducedMotion()` | Skip the shake + SFX; the toast still renders |
| `onComplete` | `function` | undefined | Called after the shake (or immediately under reduced motion) |

### Reason-toast behaviour

- **Independent of the shake branch.** The toast is rendered *before* every
  shake early-return, so it appears for tintable `Image`/`Sprite` targets,
  non-tintable `Container` targets (position shake only), `null` targets, and
  when reduced motion suppresses the shake entirely.
- **Non-blocking.** The toast is a plain non-interactive text object (built
  inline via `scene.add.text` with the same style `createHudText` produced —
  `FONT_FAMILY`, bold, colour, font size, centre-aligned, origin `(0.5, 0.5)`);
  it never swallows pointer input aimed at cards, slots or buttons.
- **Depth.** `ILLEGAL_MOVE_TOAST_DEPTH = 1900` — above gameplay, the HUD
  container (1000) and dialog overlays (200), below game-state overlays (2000:
  win / loss / game-over). Styling lives in `src/ui/constants.ts`
  (`ILLEGAL_MOVE_TOAST_*`); callers never position it.
- **Timing.** Dwell defaults to `ILLEGAL_MOVE_TOAST_DWELL_MS = 2500` and is
  configurable per call via `reasonDwellMs` (or on
  `IllegalMoveToastModel`/`showIllegalMoveToast`). A rejection inside the dwell
  window **replaces** the text and restarts the timer — toasts never stack.
- **No animation.** The toast appears, holds for its full dwell and disappears
  instantly in every mode (reduced motion included) — no slide, fade or scale,
  and no per-frame tween left running after dismissal.
- **Ephemeral and scene-scoped.** It is never persisted and is not part of
  undo/redo or the transcript; it is destroyed on scene `shutdown`/`destroy` so
  it cannot leak across scenes. `dismissIllegalMoveToast(scene)` (or the
  handle returned by `showIllegalMoveToast`) dismisses it early.
- **Text is verbatim.** The rules layer owns the wording (`LegalityResult
  .reason`); the toast never re-words or truncates it (long reasons wrap at
  `ILLEGAL_MOVE_TOAST_MAX_WIDTH`).

### Direct API

The underlying model is framework-free and separately exported:

```ts
import { IllegalMoveToastModel } from '@ui';

const model = new IllegalMoveToastModel({ dwellMs: 3000 });
model.show('That figure is already exhausted.');
model.visible;   // true
model.remaining; // 3000
model.tick(3000); // true — expired, model hides itself
```

`showIllegalMoveToast({ scene, text, dwellMs? })` renders the toast directly
(returns an `IllegalMoveToastHandle` with `dismiss()`), and
`dismissIllegalMoveToast(scene)` dismisses any live toast early.

## createDragDropManager (drag-and-drop lifecycle)

Encapsulates the Phaser drag lifecycle into a single configurable core-engine
module — extracted from Beleaguered Castle's bespoke `setupDragAndDrop`
(`example-games/beleaguered-castle/scenes/BeleagueredCastleScene.ts`). Register
draggable game objects (Images **or** Containers) with optional pickup
validation, register drop zones with hit-testing and acceptance validation,
and get origin capture + depth raise, valid-drop highlighting, snap-back
animation, and illegal-move feedback for free.

### Import

```ts
import { createDragDropManager } from '@ui/dragDrop';
```

### Usage (Main Street drag-to-buy)

Main Street wires the module so a business card can be dragged from the
Development row onto an empty street slot to buy + place it in one step
(`example-games/main-street/scenes/MainStreetTurnController.ts`):

```ts
this.dragDropManager = createDragDropManager({
  scene: this,
  dragDistanceThreshold: 5,          // click-vs-drag coexistence
  reducedMotion: !!this.settingsPanel?.reducedMotion,
  onDragStart: () => this.renderer.showDragHighlights(),
  onDragEnd: () => this.renderer.clearDragHighlights(),
});

this.dragDropManager.registerDraggable({
  gameObject: marketCardContainer,
  data: card.id,
  hitArea: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), // local coords
  canPickUp: (payload) => controller.canPickUpBusinessCard(payload.data),
  onDrop: (payload) => controller.onDragDropBusiness(payload),
});

this.dragDropManager.registerDropZone({
  zone,                                  // created via setRectangleDropZone
  data: slotIndex,
  canAccept: (payload) => controller.canDropBusinessCard(payload.data, slotIndex),
});
```

Beleaguered Castle also consumes the module for its tableau drag-to-move
(`example-games/beleaguered-castle/scenes/BeleagueredCastleScene.ts`): the
scene creates the manager and registers the foundation/tableau drop zones
(`initDragDrop`), while the renderer registers each column's top card as a
draggable on every board render (`makeDraggable`).

### Options (`DragDropManagerConfig`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | Scene whose input plugin drives the drag lifecycle |
| `dragDepth` | `number` | 1000 | Depth applied to the dragged object while dragging |
| `snapBackDuration` | `number` | 200 | Snap-back tween duration in ms |
| `reducedMotion` | `boolean` | false | Skip snap-back tween (instant reposition) |
| `dragDistanceThreshold` | `number` | 5 | Pointer movement (px) before a drag starts — preserves click-vs-drag coexistence |
| `onDragStart` | `(payload) => void` | — | Fired after pickup validation passes (show valid-drop highlights) |
| `onDragEnd` | `(payload) => void` | — | Fired when a drag ends, regardless of outcome (clear highlights) |
| `onIllegal` | `(payload) => void` | default | Illegal-feedback hook (shake + `sfx-illegal-move`) |

### `DragDropObjectConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gameObject` | `Image | Container` | required | The object to make draggable |
| `data` | `unknown` | — | Caller data (e.g. card id) exposed via the payload |
| `hitArea` | `Phaser.Geom.Rectangle` | texture frame | Local-coordinate hit area (required for Containers) |
| `canPickUp` | `(payload) => boolean` | — | Pickup veto: `false` keeps the object at its origin and fires illegal feedback |
| `onDrop` | `(payload) => void` | — | Called when dropped on an accepting zone |
| `illegalReason` | `(payload) => string \| undefined` | — | Rejection text for a pickup veto / invalid snap-back (rendered as a toast) |

### `DragDropZoneConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `zone` | `Phaser.GameObjects.Zone` | required | A drop zone (created via `setRectangleDropZone`) |
| `data` | `unknown` | — | Caller zone data (e.g. slot index) via `payload.zoneData` |
| `canAccept` | `(payload) => boolean` | — | Zone acceptance: `false` snap-backs + illegal feedback |
| `illegalReason` | `(payload) => string \| undefined` | — | Rejection text for this zone (wins over the draggable's resolver) |

### Behaviour

- **Immediate hit-testability:** `registerDraggable()` promotes Phaser's
  pending hit-test insertion queue into the active input list straight away
  (instead of waiting for the next `preUpdate`), so a pointer event arriving
  on the very next frame hits a newly registered draggable. This removes the
  post-deal first-click race where the first click after an animated deal was
  silently dropped (CG-0MUHL624W007G8EG). The flush mirrors `InputPlugin`'s
  own `_pendingInsertion` → `_list` promotion and is a no-op when the
  plugin's internals are unavailable.
- **Pickup veto** (`canPickUp` returns `false`): the object stays at its origin
  and the illegal-feedback hook fires — the "cannot drag this card" case.
- **Valid drop**: the object's depth is restored and `onDrop` fires (the caller
  performs the game action).
- **Invalid drop** (no zone, rejected `canAccept`, or released outside any
  zone): the object snap-backs to its captured origin (position **and** depth)
  with illegal feedback — the "illegal move" case.
- **Illegal feedback**: defaults to `shakeIllegalMove` for Images **and**
  Containers (Containers get the position shake only), playing
  `COMMON_SFX_KEYS.ILLEGAL_MOVE` (`sfx-illegal-move`). A reason supplied by the
  draggable's or zone's `illegalReason` resolver (or set inline on
  `payload.reason` inside `canPickUp`/`canAccept`) is rendered as the
  transient reason toast described above; without a reason the behaviour is
  unchanged. Custom `onIllegal` hooks receive `payload.reason` too.
- **Reduced motion**: snap-back restores position/depth instantly (no tween);
  runtime toggling via `setReducedMotion()`.

### Manager API

`registerDraggable`, `unregisterDraggable`, `registerDropZone`,
`unregisterDropZone`, `clearDropZones`, `getDropZoneData`, `setEnabled`,
`setReducedMotion`, `destroy` — see `src/ui/dragDrop.ts` for signatures.

## HandView drag-to-reorder (animation + SFX)

`HandView` is not a standalone animation helper, but it owns one animation that
follows the same conventions: opt-in drag-to-reorder inside the hand row
(CG-0MWBX4GJK007ZAOX).

```ts
const handView = new HandView(scene, {
  baseX, baseY, spacing: 56, maxSlots: 7,
  reorderEnabled: true,        // default false
  soundManager,                // must have COMMON_SFX_KEYS.CARD_SWAP registered
  reducedMotion,
});
handView.setDragEnabled(true);
handView.on('cardreorder', ({ from, to }) => {
  const [card] = myHand.splice(from, 1);
  myHand.splice(to, 0, card);
});
```

**Animation.** The dragged card follows the pointer; a plain 3 px insertion
marker previews the target slot (no `setMask` / `GeometryMask`). On commit the
row tweens every displaced card (240 ms, `Quad.easeOut`) to its new slot,
keeping the tint overlay and rank/suit label glued to it, then updates depth
and outline alignment.

**Reduced motion.** The re-layout snaps to the new positions instantly — no
tween is created and the insertion marker still previews the target slot. The
SFX still plays (only the animation is shortened).

**SFX.** `COMMON_SFX_KEYS.CARD_SWAP` (`sfx-card-swap`, backed by
`public/assets/audio/default/card-swap.wav`) plays once per committed reorder
through the injected `SoundManager`, so the settings-panel mute/volume apply.
Nothing plays for a no-op release (card returned to its own slot) or when no
manager is wired. The scene must load and register the key:

```ts
preload() { this.load.audio(COMMON_SFX_KEYS.CARD_SWAP, 'assets/audio/default/card-swap.wav'); }

const manager = new SoundManager(player, { storage: null });
manager.register(COMMON_SFX_KEYS.CARD_SWAP);
```

**Precedence.** A pile target (`setDragTargetPileIndex()`) always wins over
reordering, and vertical cascade drags are never reordered (they pick up a
multi-card range). See
[Hand reordering](../DEVELOPER.md#hand-reordering-drag-to-reorder) for the full
contract and the model-sync rule.

## createCardHighlight (Canvas-compatible card highlight)

Attach a persistent, renderer-agnostic highlight to a card sprite — used for
selection markers. `setTint()` is a no-op under Phaser 4's Canvas renderer, so
this helper applies **both** the WebGL tint and a semi-transparent overlay
rectangle (visible under both renderers), the same approach `HandView` uses for
its selection state.

### Import

```ts
import { createCardHighlight, type CardHighlight } from '@ui';
```

### Usage (Beleaguered Castle selection)

```ts
// Select: create the highlight and keep the returned handle.
const highlight = createCardHighlight({
  scene: this.scene,
  target: topCardSprite,
  color: SELECTION_TINT,
  alpha: 0.35,
  // A bright outline makes the selection unmistakable in both renderers
  // (the semi-transparent fill alone reads as a subtle wash under Canvas).
  strokeColor: SELECTION_STROKE, // 0x33ff33
  strokeWidth: 4,
});

// Card moved/tweened while highlighted: re-align the overlay.
highlight.sync();

// Deselect: remove the overlay and clear the WebGL tint.
highlight.destroy();
```

### Options (`CardHighlightOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | Scene that owns the overlay rectangle |
| `target` | `Image \| Sprite` | required | Card sprite to highlight |
| `color` | `number` | required | Overlay fill colour and WebGL tint |
| `alpha` | `number` | 0.35 | Overlay alpha |
| `depthOffset` | `number` | 0.01 | Overlay depth above the target's current depth |
| `strokeColor` | `number` | `undefined` | Optional outline colour; omitted → no outline |
| `strokeWidth` | `number` | 3 | Outline width in px (only used when `strokeColor` is set) |

### API

`createCardHighlight(options)` returns a `CardHighlight` with:

- `overlay` — the `Phaser.GameObjects.Rectangle` that provides the
  Canvas-visible highlight;
- `sync()` — re-align the overlay to the target's position/rotation/depth
  (e.g. after a tween), a no-op once destroyed;
- `destroy()` — remove the overlay and clear the WebGL tint (idempotent).

> **Persistent, not transient:** unlike `shakeIllegalMove`'s flash overlay, a
> highlight stays attached until `destroy()`. Callers that rebuild the card
> sprites (e.g. `HandView.setCards`) must destroy any live highlights first so
> no orphaned rectangles linger.

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

## revealNarration (animated narration reveal)

Progressively reveals a prose block — the consequence of a choice — into an
**existing** text object (or a container holding one), with a shared
`COMMON_SFX_KEYS` sound. Turns an outcome into a story beat instead of a silent
text swap (CG-0MWO7CULE001IWU1).

**Signature.** `revealNarration(options: RevealNarrationOptions): NarrationRevealHandle`
(`src/ui/narration-reveal.ts`) — the module imports Phaser only as a type, so
the pacing plan is unit-testable without a scene.

### Import

```ts
import { revealNarration } from '@ui';
import { COMMON_SFX_KEYS } from '@core-engine/SoundManager';
```

`@ui/narration-reveal` is listed in the node-safe manifest
(`src/ui/node-safe-modules.ts`): Phaser is referenced only through
`import type`, so unit suites can import it in a plain Node environment.

### Usage

```ts
const reveal = revealNarration({
  scene: this,
  target: this.narrationText,        // Phaser.GameObjects.Text or a Container
  prose: option.says,                // authored outcome prose, shown verbatim
  soundManager: this.soundManager,   // optional; injected audio backend
  sfx: COMMON_SFX_KEYS.SCORE_REVEAL, // any COMMON_SFX_KEYS value
});

// Later, e.g. when the overlay closes or the player skips ahead:
reveal.complete(); // full prose now, timer/listeners released
// or
reveal.destroy();  // abort: keep the text revealed so far, release resources
```

### Options (`RevealNarrationOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scene` | `Phaser.Scene` | required | Owns the reveal timer and input listeners |
| `target` | `Text \| Container` | required | Text object to write into, or a container whose first text child is used. Never destroyed by the helper |
| `prose` | `string` | required | Prose to reveal, verbatim (the content/rules layer owns the copy) |
| `reducedMotion` | `boolean` | `getEffectiveReducedMotion()` | Instant reveal, no timer and no SFX |
| `soundManager` | `{ play(key): void }` | undefined | Injected audio backend (typically `SoundManager`) |
| `sfx` | `CommonSfxKey \| null` | `COMMON_SFX_KEYS.SCORE_REVEAL` | Shared SFX key; `null` silences the reveal |
| `skipOnInput` | `boolean` | `true` | First pointer/key input completes the reveal instantly |
| `msPerCharacter` | `number` | `28` | Reveal speed override (clamped to a readable 16–60 ms step) |
| `scheduler` | `NarrationRevealScheduler` | Phaser time plugin | Timer seam — unit tests inject a fake |
| `onComplete` | `function` | undefined | Called at most once when the full prose is on screen |

### Handle (`NarrationRevealHandle`)

| Member | Description |
|--------|-------------|
| `prose` / `plan` / `text` | Immutable prose, the deterministic schedule, and the text currently applied |
| `done` / `destroyed` | Whether the full prose is on screen / the handle has been torn down |
| `complete()` | Finish instantly: full prose, timer cancelled, listeners detached. Idempotent |
| `destroy()` | Abort: cancel the timer and detach every listener, leaving the text as it stands. Idempotent; `complete()` afterwards is a no-op |

### Pacing and scheduling

`planNarrationReveal(prose, opts)` is pure and exported, so pacing is testable
without a scene. The total duration is `prose.length × 28ms`, clamped to
400–9000 ms; the step interval is the per-character duration clamped to
16–60 ms; step *i* reveals the first `ceil(length × i / stepCount)` characters,
and the final step is always the exact prose. Empty prose is an instant plan.

### Reduced-motion contract

With `reducedMotion: true` (or the effective preference — explicit SettingsStore
toggle, then `prefers-reduced-motion`) the helper applies the **full prose
synchronously**, creates no timer, registers no input listeners and plays no
SFX, matching the shared reduced-motion contract below. `onComplete` fires
synchronously.

### SFX contract

The sound is always a `COMMON_SFX_KEYS` value played through the injected
`SoundManager`; `resolveNarrationSfxKey()` never returns a game-scoped literal
(an unknown key falls back to the shared default, and `null` means silent).
Audio is best-effort: a missing/unplayable key, a throwing backend or no
`soundManager` at all is swallowed, and the **textual channel is
unconditional** — a scene without a time plugin degrades to an instant reveal
rather than leaving the prose half-written.

## paginateProse (prose panels)

Splits an authored prose block into word-boundary **pages** sized to a panel's
character budget, so a narrative panel can show one page plus a visible
`[ more… ]` affordance instead of silently clipping the writer's text
(CG-0MWO7CVDI004J3JX). Pure and Phaser-free — the panel owns the budget (derived
from its width and line count), this module owns the deterministic split.

### Import

```ts
import { paginateProse, DEFAULT_PROSE_PAGE_CHARS } from '@ui';
```

### Usage

```ts
const { pages, pageCount, overflow } = paginateProse(prose, DEFAULT_PROSE_PAGE_CHARS);

panelText.setText(pages[0] ?? '');
moreText
  .setText(overflow ? `[ more… ] (1/${pageCount})` : '')
  .setVisible(overflow);
// On click: panelText.setText(pages[1] ?? ''); …
```

### Contract

- **Nothing is dropped.** Whitespace is normalised (runs collapse to one space,
  as word wrap renders them); joining the pages with a single space reproduces
  the normalised prose exactly.
- **Word boundaries.** A page break falls between words unless one word alone
  exceeds the budget — that word gets its own over-budget page, never a
  mid-word cut.
- **Total.** Blank prose returns `pages: []` (`pageCount: 0`, `overflow: false`)
  so the caller renders nothing; a non-positive budget degrades to one
  character per page rather than throwing.

The Gym's *The Long Erasure* scene is the reference consumer: the `context`
paragraph, the choice's narrated outcome and the closing `epilogue` all flow
through one paged panel, with `[ more… ]` revealing the remainder.

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

## presentSceneExit (act/scene exit banner)

Presents a scene's close as a **consequence**: the act/scene that just finished,
what the objective came to, and where the story opens next — sequenced in that
order, with a shared `COMMON_SFX_KEYS` sound
(CG-0MWR0BJBU005TDTT / CG-0MWZCM6I0005DYZ6).

**Signature.** `presentSceneExit(scene, options: PresentSceneExitOptions): SceneExitPresentationHandle`
(`src/ui/scene-exit-presentation.ts`) — the planner and SFX resolver are pure
and Phaser-free, so the schedule is unit-testable without a scene; the rendered
helper drives a real scene through Phaser **types only**.

### Import

```ts
import { presentSceneExit, anchorPoint, type ScreenLayoutDocument } from '@ui';
import { COMMON_SFX_KEYS } from '@core-engine/SoundManager';
```

### Usage

```ts
const banner = presentSceneExit(this, {
  actTitle: 'Act I',
  sceneTitle: 'The Arrival',   // optional: an act-only game omits it
  outcome: 'success',          // 'success' | 'partial' | 'failure'
  route: 'The road south',     // where the story opens next
  // Every position comes from the layout's `sceneBanner` zone — never a pixel.
  resolveAnchor: (name) => anchorPoint(layout, 'sceneBanner', name, viewport),
  soundManager: this.soundManager,
});

await banner.promise;   // resolves once, on auto-advance, skip or destroy
banner.destroy();       // remove the text when the next beat is ready
```

### Options (`PresentSceneExitOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `actTitle` | `string` | required | The act that is closing (non-blank) |
| `sceneTitle` | `string` | undefined | The scene that is closing; omitted for an act-only game |
| `outcome` | `'success' \| 'partial' \| 'failure'` | required | The outcome **word** — the primary channel |
| `route` | `string` | required | Where the story opens next (non-blank) |
| `resolveAnchor` | `(name) => { x, y } \| null` | required\* | Resolves `actTitle` / `sceneTitle` / `outcome` / `route` from the SLL `sceneBanner` zone; a missing anchor skips that field |
| `anchors` | `Partial<Record<name, { x, y }>>` | undefined | Pre-resolved anchors, alternative to `resolveAnchor` |
| `reducedMotion` | `boolean` | `getEffectiveReducedMotion()` | Present everything synchronously: no timer, no listeners, no SFX |
| `soundManager` | `{ play(key): boolean \| void }` | undefined | Injected audio backend (typically `SoundManager`) |
| `sfx` | `CommonSfxKey \| null \| string` | stage key | Shared SFX override; `null` silences; an unknown/game-scoped string falls back to the stage key |
| `actClosed` | `boolean` | `false` | `true` selects `ROUND_END` (act closes), otherwise `TURN_CHANGE` |
| `stepMs` | `number` | `SCENE_EXIT_STEP_MS` (1200) | Dwell per step |
| `autoAdvanceMs` | `number` | `SCENE_EXIT_AUTO_ADVANCE_MS` (3000) | Dwell after the last step before auto-advancing |
| `skipOnInput` | `boolean` | `true` | First pointer/key press reveals every field and dismisses |
| `tintOutcome` | `boolean` | `true` | Shared outcome colour as a **secondary** cue only |
| `scheduler` | `SceneExitPresentationScheduler` | Phaser time plugin | Timer seam — tests inject a fake |
| `onComplete` | `function` | undefined | Called at most once when dismissed/destroyed |

\* `resolveAnchor` or `anchors` is required: the helper throws rather than
placing an element at a pixel literal, keeping the project's SLL rule.

### Handle (`SceneExitPresentationHandle`)

| Member | Description |
|--------|-------------|
| `plan` | The deterministic schedule (`steps`, `totalMs`, `instant`, `stepMs`, `autoAdvanceMs`) |
| `done` | `true` once the presentation is dismissed (the promise has settled) |
| `destroyed` | `true` once `destroy()` has run |
| `promise` | Resolves **exactly once** — on auto-advance, skip-on-input or `destroy()` — so the caller can sequence its own transition |
| `skip()` | Show every field instantly and dismiss with no further animation. Idempotent; a **no-op** once the presentation is dismissed or destroyed |
| `destroy()` | Cancel the pending timer, detach every listener (pointer, key and scene `shutdown`) and destroy every created text object. Idempotent; a destroy **before** dismissal also settles the promise and fires `onComplete` exactly once, so an awaiting caller never hangs |

### Teardown and lifecycle

Presenting a banner is a full lifecycle, not just a draw
(CG-0MWZCOL3O005A2B9). Two phases, both total and idempotent:

- **Dismissal** — auto-advance or skip-on-input settles `promise` once, fires
  `onComplete` once and releases the pointer/key listeners. The text stays on
  screen so the caller can read it during its own scene transition.
- **Teardown** — `destroy()` (or the scene's `shutdown` event, which stays
  wired **even after dismissal**) cancels the pending timer, detaches the
  remaining listeners and destroys every created text object. Calling
  `destroy()` repeatedly, or `skip()` after `destroy()`, is a no-op; neither
  throws nor resurrects an object. `destroyed` reports the teardown state and
  `done` reports that the promise has settled.

The reveal is visibility-based, not tween-based: the helper creates **no**
tweens, so teardown cannot strand one. The browser suite asserts the timer and
listener counts return to their pre-presentation values, the scene's display
list is empty afterwards, and no tween remains.

### Pacing and sequencing

`planSceneExitPresentation()` (pure, exported) produces the schedule:
title → outcome → route, then `autoAdvanceMs`. The rendered helper reveals one
anchor pair per step (`actTitle`+`sceneTitle`, then `outcome`, then `route`) and
leaves earlier steps readable, so the player reads the close as a sentence
rather than a swap. Reduced motion collapses the plan to one instant step.

### Camera ownership (do not double-play motion)

The helper **never moves the camera**. `runSceneTransition()` (or the game) owns
the camera fade/slide; this presentation only draws in-layout text pinned to the
screen (`setScrollFactor(0)`), so a game may layer the banner over a camera
transition without two competing animations. The banner renders at depth
`SCENE_EXIT_PRESENTATION_DEPTH` (900): above the game board, below HUD panels.

### Outcome and colour

The outcome is always printed as a **word**; the shared tint
(`SCENE_EXIT_OUTCOME_COLOURS`) only reinforces it, never replaces it
(GDD §3.4.3). `tintOutcome: false` proves the word carries the outcome alone.

### Reduced motion and SFX contract

With reduced motion every field is shown synchronously, the promise settles
immediately, and no timer, input listener or SFX is created — the shared
accessibility rule (motion is removed, information is never omitted). Audio is
best-effort: `playSceneExitSfx()` swallows a missing/unplayable/throwing backend,
and the textual channel is unconditional.

### Gym precedent

*The Long Erasure* spike (`GymLongErasureScene`) is the rendered precedent
(CG-0MWZCPERA004FQZ6): its act turn presents the act boundary through this
helper — the closing act (`Act I`), the act's closing outcome word and the
route ahead (`Act II — The Dead Zone`) — from the `sceneBanner` zone in
`example-games/gym/layouts/gym-long-erasure.layout.json`, whose anchors are the
GDD contract fixture's. It replaces the old `TURN_CHANGE` + feedback-line pair,
so the act close is sounded with `ROUND_END` (the helper's `actClosed: true`
key) and the feedback line keeps the choice's own sentence.

Because the spike has acts but no scenes, it passes **no** `sceneTitle`: the
slot fills once a game has scene-exit data (the episode runner's
`SceneExitRecord`, which is game-side work). The outcome word is `success` on
this path by construction — an act turns only when the run *advanced* past it,
while a clock failure expires and an abandoned voyage closes, and neither turns
an act. Real per-scene outcomes become available with the scene-exit-record
data and are not invented by the spike.

## Game-Specific Usage: Coloretto

Coloretto (`example-games/coloretto/scenes/ColorettoRenderer.ts` — the scene's
rendering/animation helper) uses the shared
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
