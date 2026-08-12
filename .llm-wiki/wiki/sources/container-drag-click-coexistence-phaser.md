---
type: source
title: Phaser Container drag + click coexistence pattern
status: insight
category: frontend
created: 2026-08-09
updated: 2026-08-09
slug: container-drag-click-coexistence-phaser
---

# Phaser Container drag + click coexistence pattern

To make a Phaser Container draggable while preserving a click action, the container must be the ONLY interactive object under the pointer (with `topOnly` input default, an interactive child rect wins the hit test and the container never enters the drag candidate list). Pattern (Main Street market cards, CG-0MSKSAREE007AYSZ): give the container an interactive local-coordinate hit area via the core-engine dragDrop module (`registerDraggable` with `hitArea: new Phaser.Geom.Rectangle(-w/2, -h/2, w, h)`), move click handling from the child's `pointerdown` to the container's `pointerup`, and gate it with a pointer-distance check (`Phaser.Math.Distance.Between(pointer.downX, downY, x, y) > input.dragDistanceThreshold` → skip click) so a drag never triggers the click path. Phaser's drag machinery emits GAMEOBJECT_DRAG_END even for a click when a distance threshold is configured (dragState 2), so drag handlers must guard on an internal `dragging` flag. See src/ui/dragDrop.ts and example-games/main-street/scenes/MainStreetRenderer.ts drawMarketCard().

*Category: frontend*

---
*Captured: 2026-08-09*

## Related

_Add links to related pages._
