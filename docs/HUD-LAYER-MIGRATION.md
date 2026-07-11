# HUD Layer — Migration Guide

This guide explains how to migrate a game scene to use the shared HUD layer
and generic `OverlayManager` introduced in the cross-game HUD-layer extraction
(CG-0MP2988UN009P9LM).

## Overview

The shared HUD layer provides:

- **`CardGameScene.initHUDContainer()`** — creates a shared container at
  depth `1000` for help/settings panels and their buttons. Call this early
  in `create()` so that `initHelpPanel()` and `initSettingsPanel()` parent
  their UI into the HUD container automatically.

- **`OverlayManager`** — a reusable class that manages the lifecycle of
  game-state overlays (win, loss, game-over, round-end). It handles depth
  assignment (`2000` for game-state overlays), input blocking, and cleanup.

- **`createOverlayBackground()`** — creates a full-screen input-blocking
  overlay background, optionally with a visible centered box.

- **`createParameterizedOverlay()`** — a higher-level helper that creates a
  titled overlay with detail text and buttons.

## Migration Steps

### 1. Call `initHUDContainer()` in `create()`

Add this call after `initEventSystem()` and before `initHelpPanel()`:

```ts
create(): void {
  // ...
  this.initEventSystem();
  this.initHUDContainer();   // <-- new
  // ...
  this.initHelpPanel(helpSections);
  this.initSettingsPanel();
  // ...
}
```

### 2. Replace game-specific overlay manager with generic `OverlayManager`

Before:

```ts
import { MyGameOverlayManager } from './MyGameOverlayManager';

// In create():
this.overlayManager = new MyGameOverlayManager(this, gameState);

// Later:
this.overlayManager.showWinOverlay();
this.overlayManager.dismiss();
```

After:

```ts
import { OverlayManager } from '../../src/ui';

// In create():
this.overlayManager = new OverlayManager(this);

// Show a game-state overlay (depth 2000):
this.overlayManager.showOverlay({
  type: 'game-over',
  backgroundOptions: { depth: 2000, alpha: 0.75 },
});

// Add custom content (text, buttons) tracked by the manager:
const title = this.add.text(400, 300, 'You Win!', { fontSize: '42px' })
  .setOrigin(0.5);
this.overlayManager.add(title);

// Clean up:
this.overlayManager.dismiss();
```

### 3. Delete the old overlay manager file

Remove `MyGameOverlayManager.ts` and its import from the scene.

### 4. Update `shutdown()` to use `overlayManager.dismiss()`

```ts
shutdown(): void {
  this.overlayManager?.dismiss();
  this.shutdownBase();
}
```

### 5. For complex overlays (card action menus, round summaries)

Use `overlayManager.showOverlay()` for the background/box, then add all
custom objects via `overlayManager.add()`:

```ts
showCardActionMenu(card, canBuy, canReserve): void {
  this.overlayManager.showOverlay({
    type: 'custom',
    backgroundOptions: { depth: 10, alpha: 0.5 },
    box: { width: 420, height: 230, alpha: 0.9 },
  });

  const infoText = /* create text */;
  this.overlayManager.add(infoText);

  const buyBtn = /* create button */;
  this.overlayManager.add(buyBtn);

  // Dismiss is handled by the same overlayManager.dismiss()
}
```

## API Reference

### `CardGameScene.initHUDContainer()`

Creates `this.hudContainer` at depth `1000`. The HUD container holds all
help/settings panels and their buttons so they render above gameplay content.

```ts
protected initHUDContainer(): void
```

### `OverlayManager`

```ts
class OverlayManager {
  constructor(scene: Phaser.Scene);

  showOverlay(config: OverlayConfig): OverlayResult;
  add(...objects: Phaser.GameObjects.GameObject[]): void;
  dismiss(): void;

  get objects(): Phaser.GameObjects.GameObject[];
}
```

**`OverlayConfig`:**

| Property           | Type              | Default         | Description                            |
|--------------------|-------------------|-----------------|----------------------------------------|
| `type`             | `OverlayType`     | —               | `'game-over'`, `'win/loss'`, `'round-end'`, or `'custom'` |
| `backgroundOptions`| `OverlayBackgroundOptions` | `{ depth: 10, alpha: 0.75 }` | Background configuration |
| `box`              | `OverlayBoxOptions` | `undefined`   | Optional visible centered box          |

Game-state overlay types (`game-over`, `win/loss`, `round-end`) use depth
`2000`. The `'custom'` type uses the depth provided in `backgroundOptions`.

### HUD Container

- **Depth:** `1000` — help/settings panels and buttons
- **Depth:** `2000` — game-state overlays (win, loss, game-over, round-end)
- Container is available as `this.hudContainer` on any scene that extends
  `CardGameScene` and calls `initHUDContainer()`.
