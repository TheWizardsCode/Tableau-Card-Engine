# Renderer-Aware Clipping (`ContainerClip`)

How TCE clips a scrolling or panned region to a rectangle on **both** Phaser
renderers, and why a bare `GeometryMask` must never be used for it.

- **Helper:** `createContainerClip()` / `isWebGLRenderer()` from `@ui`
  (`src/ui/ContainerClip.ts`, re-exported by `src/ui/index.ts`).
- **Contract:** [`ContainerClip`](#the-containerclip-contract),
  [`ClipRect`](#the-containerclip-contract).
- **Gym reference:** `GymOverlayUiScene`
  (`example-games/gym/scenes/GymOverlayUiScene.ts`) — see the
  [Gym scene index](../gym/GYM_INDEX.md).
- **First consumers:** `HelpPanel`, `SettingsPanel`, and the scrolling overlay
  dialog in `src/ui/Overlay.ts` (all three migrated together).

---

## Why this helper exists

Phaser 4's WebGL renderer **removed** `GameObject.setMask` support. A
`GeometryMask` is now **Canvas-only**: calling `setMask()` on WebGL logs

```
This method is not supported in WebGL. Create a Mask filter instead.
```

and returns immediately — the call is a **silent no-op**. The visible symptom
is a scrollable log, panned street-map viewport, or card-index list that
renders **unclipped** over the panel chrome and the scene behind it, with only
a console warning as a clue. Because the warning is easy to scroll past and the
Canvas path still works, the failure is easy to misdiagnose (and to
"fix" by shrinking the clip rect, which makes it worse — see the
[do-not list](#do-not-do-this)).

`ContainerClip` is the single core-owned seam for this problem. A caller
describes a rectangle; the helper picks the renderer-appropriate mechanism.

> **Diagnosis is written down here so it is not repeated.** If clipping looks
> correct on a Canvas boot but wrong on a GPU boot, this document is the first
> stop — not a per-container `setMask` experiment.

---

## The Phaser 4 (`4.0.0-rc.7`) restriction

| Renderer | Mechanism | Supported? |
|---|---|---|
| Canvas | `GeometryMask` (`graphics.createGeometryMask()` + `target.setMask()`) | ✅ long-standing behaviour, unchanged |
| WebGL | **Mask filter** (`FilterList#addMask(maskObject, false, camera)`) | ✅ the Phaser 4 replacement |
| WebGL | `GameObject.setMask()` / `GeometryMask` | ❌ warns and no-ops |

The WebGL Mask filter is **not** a drop-in replacement for `GeometryMask`. It
multiplies the filtered object by the **alpha of the mask GameObject's rendered
texture**, which changes two things:

1. **The mask shape must be drawn opaque.** `GeometryMask` clips to the
   Graphics *path* and ignores fill colour/alpha, so a transparent fill is the
   idiomatic way to keep the mask shape invisible. A Mask filter instead
   multiplies by that alpha — a transparent fill masks **everything** away.
2. **The mask GameObject must stay off the display list.** The filter renders
   the mask into its own `DynamicTexture`; if the opaque shape were also on the
   display list it would be drawn on screen as a white rectangle.

`ContainerClip` therefore branches on the renderer, and the two branches
deliberately draw/fill differently. The renderer type is fixed for a game
instance, so it is resolved once at construction and recorded on
`clip.renderer` (`'canvas'` | `'webgl'`).

---

## The `ContainerClip` contract

```ts
import { createContainerClip } from '@ui';
import type { ClipRect, ContainerClip } from '@ui';

const clip: ContainerClip = createContainerClip(scene, scrollContainer, {
  x: 40,
  y: 120,
  w: 480,
  h: 260,
});

clip.setRect({ x: 40, y: 120, w: 480, h: 300 }); // new bounds (re-enables)
clip.clear();                                    // "no clip", resources kept
clip.destroy();                                  // release resources (idempotent)
```

`ClipRect` is `{ x, y, w, h }` in **scene (camera) space** — `w`/`h` extend from
the `x`/`y` origin corner.

### Members

| Member | Meaning |
|---|---|
| `renderer` | `'canvas'` or `'webgl'`; fixed for the clip's lifetime. |
| `graphics` | The `Graphics` describing the clip region — always the mask source. |
| `geometryMask` | Canvas only: the applied `GeometryMask`; `null` on WebGL. |
| `maskFilter` | WebGL only: the applied Mask filter; `null` on Canvas (or when the target has no filter list). |
| `rect` | The region from the last `setRect()`/constructor call (`{0,0,0,0}` before any). |
| `active` | Whether a clip is currently applied (`false` after `clear()`). |
| `setRect(rect)` | Draw and apply the clip; also **re-enables** a previously cleared clip. |
| `clear()` | Remove the clip so nothing is masked, **without** destroying resources. |
| `destroy()` | Remove the clip and destroy the mask resources. Idempotent; `setRect`/`clear`/`destroy` after it are no-ops. |

### Renderer branching, precisely

**Canvas.** `scene.add.graphics()` (on the display list) draws the rect with a
**transparent** fill (`0xffffff`, `alpha: 0`) and `target.setMask(geometryMask)`.
The Graphics stays on the display list because Phaser 4 RC7 renders the mask
shape through `Graphics.renderCanvas`, which expects a live display object.
Canvas output is therefore **byte-stable** relative to pre-helper behaviour —
the Canvas path is not "also migrated", it is the unchanged path.

**WebGL.** `scene.make.graphics({ x: 0, y: 0 }, false)` draws the rect with an
**opaque** fill (`0xffffff`, `alpha: 1`) and stays off the display list
(`add: false`); the helper calls `target.enableFilters()` and adds
`filterList.addMask(graphics, false, scene.cameras.main)`. `active` starts
`false` and only becomes `true` once a rect is applied.

**Neither renderer can clip** if `enableFilters()` produced no filter list (no
WebGL context). The Graphics stays alive so callers can inspect `rect`, but
`maskFilter` is `null` — the renderer simply cannot clip, which matches its
capability rather than pretending otherwise.

---

## Screen-space mask semantics for unbounded Containers

A `Phaser.GameObjects.Container` has no intrinsic width/height. Phaser treats
such an object as *poorly bounded* and focuses a Mask filter on the **camera
context**, so the mask is applied in **screen space** — the same semantics as a
Canvas `GeometryMask`, which is also positioned in global space and does **not**
follow the masked object.

That is exactly what a viewport clip needs: the visible rectangle stays fixed
while the clipped content pans, scrolls, or slides:

- `HelpPanel` re-applies the clip on every scroll step and on every frame of the
  slide animation, so the clip tracks the panel's x position.
- The overlay dialog keeps the clip fixed over the visible content rectangle and
  only translates the scroll container.
- `GymOverlayUiScene` demonstrates the same behaviour interactively.

Do **not** rely on the mask following a moving container: it will not, on either
renderer. Move the clip rectangle (`setRect`) when the **viewport** moves, and
translate the clipped content when the **content** moves.

---

## Teardown ownership

The clip is a **resource the caller owns**, exactly like an overlay object:

- Call **`clip.destroy()`** from whatever closes the surface (`HelpPanel.destroy()`,
  `SettingsPanel` teardown, `handle.close()` on the overlay dialog). It removes
  the mask from the filter list (WebGL), destroys the `GeometryMask` (Canvas),
  and destroys the mask `Graphics`; it is idempotent, so a double teardown
  (panel close → scene shutdown) is safe.
- Call **`clear()`** when the content temporarily fits and nothing should be
  clipped. Keep the clip object alive — it is reused the moment the content
  overflows again.
- Do **not** hand-destroy `clip.graphics` or `clip.maskFilter` directly; the
  helper owns their lifecycle and the display-list convention (on-list Canvas /
  off-list WebGL) is an implementation detail of that ownership. (One deliberate
  exception: the scrolling overlay dialog also lists `clip.graphics` in its
  `objects` array, so a bare `dismissOverlay(objects)` still frees the Graphics;
  `handle.close()` calls `clip.destroy()` **first**, which detaches the WebGL
  filter before the objects are dismissed.)

The three core-owned surfaces that clip are all torn down with the surface they
belong to: `HelpPanel.destroy()`, `SettingsPanel`'s panel teardown, and
`OverlayDialogHandle.close()` (which destroys the clip alongside the other
overlay objects).

---

## How it is verified

Clipping is a rendering behaviour, so it is asserted on a real framebuffer, not
on the scene graph:

- **`tests/helpers/bootRendererScene.ts`** boots a game with a **forced**
  `Phaser.WEBGL` / `Phaser.CANVAS` type, asserts Phaser actually created that
  renderer (a downgrade is a loud failure, never a pass), and exposes
  `probePixel()` — a single-pixel read through **`renderer.snapshotPixel()`**
  after a rendered frame. It also records console warnings so a test can assert
  that `setMask … not supported in WebGL` was **not** emitted, and destroys
  every booted game in `afterEach`.
- **`tests/ui/ContainerClip.browser.test.ts`** proves the helper itself under
  both renderers: content paints **inside** the clip rect and is **absent
  outside** it, the clip stays anchored in screen space when the container is
  translated, `clear()` really un-clips and `setRect()` re-clips, and no
  Canvas-only mask warning is emitted.
- **`tests/ui/CorePanelWebglClip.browser.test.ts`** proves the migration of the
  three real consumers (HelpPanel, SettingsPanel, overlay dialog) under WebGL —
  including that the mask Graphics stays **off** the display list and that
  `close()`/`destroy()` leave no orphaned mask Graphics or active filter — and
  that Canvas still clips through a `GeometryMask`.
- **`tests/ui/ContainerClip.test.ts`** covers the branching contract that a
  framebuffer cannot easily observe (renderer selection, `clear()` semantics,
  idempotent `destroy()`), using stub scenes/targets.

A WebGL case reports Vitest's recorded **skip** when the browser has no WebGL
context; it never goes green on a Canvas fallback. To run them:

```bash
npx vitest run --project browser tests/ui/ContainerClip.browser.test.ts
npx vitest run --project browser tests/ui/CorePanelWebglClip.browser.test.ts
npx vitest run --project unit tests/ui/ContainerClip.test.ts
```

---

## Do **not** do this

- **Do not use a zero-area rect as "no clip".** For a WebGL Mask filter a zero
  area multiplies by alpha 0 **everywhere**, hiding the whole object. "No clip"
  is `clear()` (or omitting the rect); a shrunken rect is still an active clip.
- **Do not draw the WebGL mask with a transparent fill.** `GeometryMask` needs
  transparency; the Mask filter needs opacity. Fill alpha is renderer-specific
  and the helper is the only place that should know it.
- **Do not call `setMask()` on a Canvas-forced test and expect WebGL
  behaviour.** `Phaser.CANVAS` is pinned in the Node test pool
  (`src/core-engine/TestGamePool.ts`), so a Canvas-forced browser test proves
  nothing about the WebGL path. Opt into WebGL explicitly via
  `bootRendererScene(Phaser.WEBGL, …)` — a Canvas pass cannot stand in for it.
- **Do not copy the helper into a panel, overlay, or game repo.** Per-panel
  copies are how the original bug shipped three times; import
  `createContainerClip` from `@ui` so fixes (and this documented contract)
  propagate everywhere.
- **Do not put the WebGL mask Graphics on the display list.** It would be drawn
  as an opaque rectangle over the scene. Use the helper's off-list Graphics.
- **Do not assume the clip follows a moving container.** Masks are in screen
  space; call `setRect()` when the viewport moves.

---

## Related documentation

- [Gym scene index](../gym/GYM_INDEX.md) — `GymOverlayUiScene` demonstrates
  overlay overview, dismissal, and renderer-aware clipping together.
- [Developer Guide → Shared HUD Components](../DEVELOPER.md#shared-hud-components)
  — HelpPanel, SettingsPanel, and overlay dialog clipping in context.
- [`AGENTS.md` §5 Overlay Lifecycle and Renderer-Aware Clipping](../../AGENTS.md#5-overlay-lifecycle-and-renderer-aware-clipping)
  — agent-facing summary of the overlay/clipping conventions.
