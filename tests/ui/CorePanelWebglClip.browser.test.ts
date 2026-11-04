/**
 * Core-panel scroll clipping under **WebGL** (CG-0MVTQ3VL4002RB1D).
 *
 * ## Why this file exists
 *
 * Phaser 4 removed `GameObject.setMask` support in WebGL: a `GeometryMask`
 * clip is Canvas-only, so a WebGL boot logged
 * `setMask … not supported in WebGL` and rendered the panel content
 * **unclipped** over the panel chrome and the game behind it.
 *
 * The three core-owned scroll surfaces now clip through the shared
 * `createContainerClip()` helper (`@ui/ContainerClip`), which keeps the
 * `GeometryMask` on Canvas and uses a **Mask filter** on WebGL. This file
 * proves the migration on a real framebuffer for each site — it does not
 * trust the scene graph:
 *
 *  1. **HelpPanel**, **SettingsPanel** and the **overlay dialog** each paint
 *     clipped content inside the scroll viewport and **not** outside it
 *     (`renderer.snapshotPixel()` probes, so this is a rendering assertion);
 *  2. no `setMask … not supported in WebGL` warning is emitted — a regression
 *     here means a site fell back to the Canvas-only API;
 *  3. under WebGL the mask Graphics stays **off the display list** (a Mask
 *     filter samples its own texture, so an on-list opaque shape would be
 *     drawn over the scene), and `close()`/`destroy()` release the clip —
 *     no orphaned mask Graphics and no active filter left behind;
 *  4. the **Canvas** renderer still clips through a `GeometryMask` whose
 *     Graphics stays on the display list, i.e. Canvas output is unchanged
 *     rather than "also migrated".
 *
 * WebGL is exercised only when this browser provides a context; otherwise the
 * WebGL cases report Vitest's recorded skip with the probe's reason (never a
 * green pass on the wrong renderer). The Canvas parity case always runs.
 *
 * @module tests/ui/CorePanelWebglClip.browser.test.ts
 */

import { beforeEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import {
  bootRendererScene,
  captureConsoleWarnings,
  clearRendererSkipReasons,
  detectRendererSupport,
  getRendererSkipReasons,
  type PixelColour,
  type RendererSceneHandle,
} from '../helpers/bootRendererScene';
import { HelpPanel } from '../../src/ui/HelpPanel';
import { SettingsPanel } from '../../src/ui/SettingsPanel';
import { createOverlayDialog, type OverlayDialogHandle } from '../../src/ui/Overlay';
import { SoundManager, type SoundPlayer } from '../../src/core-engine/SoundManager';

// ── Geometry and colours ───────────────────────────────────

/** Logical viewport used by every probe scene. */
const VIEW_W = 800;
const VIEW_H = 600;

/** The scroll backdrop behind the panels. */
const BACKDROP = '#101010';

/** Unmistakable content colour: any clipped-away pixel must NOT match it. */
const CONTENT_COLOUR = 0xff00ff;
const CONTENT_RGB = { r: 0xff, g: 0x00, b: 0xff };

/** Snapshot backends and mask edges may differ by a rounding step. */
const TOLERANCE = 8;

/**
 * Margin for "this pixel is not content". Deliberately much larger than
 * {@link TOLERANCE} so a partially-clipped edge can never pass as clipped.
 */
const NOT_CONTENT_MARGIN = 40;

/** HelpPanel geometry (see the module's style constants). */
const HELP_PADDING = 20;
const HELP_PANEL_WIDTH = Math.floor(VIEW_W * 0.35);
const HELP_CLIP_BOTTOM = VIEW_H - HELP_PADDING;

/** SettingsPanel geometry (widthPercent 30, full-height clip). */
const SETTINGS_PANEL_WIDTH = Math.floor(VIEW_W * 0.3);

const HELP_SCENE_KEY = 'core-panel-clip-help';
const SETTINGS_SCENE_KEY = 'core-panel-clip-settings';
const OVERLAY_SCENE_KEY = 'core-panel-clip-overlay';

// ── Pixel assertions ───────────────────────────────────────

function expectColourClose(
  actual: PixelColour,
  expected: { r: number; g: number; b: number },
  label: string,
): void {
  expect(
    Math.abs(actual.r - expected.r),
    `${label}: red ${actual.r} vs expected ${expected.r}`,
  ).toBeLessThanOrEqual(TOLERANCE);
  expect(
    Math.abs(actual.g - expected.g),
    `${label}: green ${actual.g} vs expected ${expected.g}`,
  ).toBeLessThanOrEqual(TOLERANCE);
  expect(
    Math.abs(actual.b - expected.b),
    `${label}: blue ${actual.b} vs expected ${expected.b}`,
  ).toBeLessThanOrEqual(TOLERANCE);
}

function expectNotContent(actual: PixelColour, label: string): void {
  const distance =
    Math.abs(actual.r - CONTENT_RGB.r) +
    Math.abs(actual.g - CONTENT_RGB.g) +
    Math.abs(actual.b - CONTENT_RGB.b);
  expect(
    distance,
    `${label}: expected clipped-away content but the pixel is content-coloured (${actual.r},${actual.g},${actual.b})`,
  ).toBeGreaterThan(NOT_CONTENT_MARGIN);
}

// ── Scene-graph helpers (renderer-agnostic) ────────────────

interface SceneNode {
  list?: SceneNode[];
  filters?: { internal?: { getActive?: () => unknown[] } } | null;
  mask?: unknown;
}

/** Every container in the scene whose Mask filter is currently active. */
function containersWithActiveMaskFilter(scene: Phaser.Scene): SceneNode[] {
  const found: SceneNode[] = [];
  const visit = (node: SceneNode | undefined): void => {
    if (!node) return;
    const active = node.filters?.internal?.getActive?.() ?? [];
    if (active.length > 0) found.push(node);
    node.list?.forEach(visit);
  };
  scene.children.list.forEach((child) => visit(child as unknown as SceneNode));
  return found;
}

/** Every Graphics on the scene's display list. */
function displayListGraphics(scene: Phaser.Scene): Phaser.GameObjects.Graphics[] {
  return scene.children.list.filter(
    (child): child is Phaser.GameObjects.Graphics =>
      child instanceof Phaser.GameObjects.Graphics,
  );
}

/**
 * Capture the Graphics created through `scene.make.graphics(...)`.
 *
 * The WebGL clip's mask Graphics is deliberately **not** added to the display
 * list, so it cannot be found by scanning `scene.children` — the only way to
 * prove it is released on teardown is to capture it where it is created.
 */
function captureMadeGraphics(scene: Phaser.Scene): Phaser.GameObjects.Graphics[] {
  const created: Phaser.GameObjects.Graphics[] = [];
  const make = scene.make as unknown as {
    graphics: (...args: unknown[]) => Phaser.GameObjects.Graphics;
  };
  const original = make.graphics.bind(scene.make);
  make.graphics = (...args: unknown[]): Phaser.GameObjects.Graphics => {
    const graphics = original(...args);
    created.push(graphics);
    return graphics;
  };
  return created;
}

/** A 1×1 magenta probe rect factory used to inject known content. */
function paintContent(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  container.add(
    scene.add
      .rectangle(x, y, width, height, CONTENT_COLOUR)
      .setOrigin(0.5)
      .setDepth(0),
  );
}

/** SoundManager stub for SettingsPanel (no audio backend in the test). */
function createSilentSoundManager(): SoundManager {
  const player: SoundPlayer = {
    play: () => undefined,
    stop: () => undefined,
    setVolume: () => undefined,
    setMute: () => undefined,
  };
  return new SoundManager(player, { storage: null });
}

/** Let the panel tweens and deferred scene work settle. */
async function settle(handle: RendererSceneHandle): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await handle.awaitRenderTick();
  }
}

// ── HelpPanel scenes ───────────────────────────────────────

/**
 * HelpPanel whose (only) section paints a huge magenta rectangle, so content
 * that escapes the scroll clip is unmistakable on the framebuffer.
 */
class HelpPanelProbeScene extends Phaser.Scene {
  panel!: HelpPanel;
  madeGraphics: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super({ key: HELP_SCENE_KEY });
  }

  create(): void {
    this.madeGraphics = captureMadeGraphics(this);
    this.panel = new HelpPanel(this, {
      showButton: false,
      animationDuration: 0,
      sections: [
        {
          heading: 'Clipped',
          render: (scene, container, _x, y) => {
            paintContent(scene, container, HELP_PANEL_WIDTH, y + 2000, 4000, 4000);
            return 4000;
          },
        },
      ],
    });
    this.panel.open();
  }
}

// ── SettingsPanel scene ────────────────────────────────────

/**
 * SettingsPanel configured to overflow the panel (the skill slider pushes
 * `_maxContentY` past the canvas height), so its scroll clip is created.
 */
class SettingsPanelProbeScene extends Phaser.Scene {
  panel!: SettingsPanel;
  madeGraphics: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super({ key: SETTINGS_SCENE_KEY });
  }

  create(): void {
    this.madeGraphics = captureMadeGraphics(this);
    this.panel = new SettingsPanel(this, {
      soundManager: createSilentSoundManager(),
      animationDuration: 0,
      skillRating: { value: 80, min: 1, max: 100, onChange: () => undefined },
    });
    this.panel.open();
  }
}

// ── Overlay dialog scene ───────────────────────────────────

class OverlayDialogProbeScene extends Phaser.Scene {
  dialog!: OverlayDialogHandle;
  madeGraphics: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super({ key: OVERLAY_SCENE_KEY });
  }

  create(): void {
    this.madeGraphics = captureMadeGraphics(this);
    this.dialog = createOverlayDialog(this, { title: 'Clipped dialog' });
    // Content far larger than the scroll viewport on both axes.
    paintContent(
      this,
      this.dialog.scrollContainer,
      this.dialog.contentWidth,
      this.dialog.contentHeight,
      this.dialog.contentWidth * 4,
      this.dialog.contentHeight * 4,
    );
    this.dialog.refresh(
      this.dialog.contentHeight * 4,
      this.dialog.contentWidth * 4,
    );
  }
}

// ── Tests ──────────────────────────────────────────────────

describe('core panel scroll clips', () => {
  const support = detectRendererSupport(Phaser.WEBGL);
  const skipReason = support.supported
    ? null
    : `WebGL unavailable in this browser: ${support.reason}`;

  beforeEach(() => {
    clearRendererSkipReasons();
  });

  it(
    'HelpPanel: WebGL clips the scroll content and keeps the mask Graphics off the display list',
    async (ctx) => {
      if (skipReason) {
        ctx.skip(skipReason);
        return;
      }
      const warnings = captureConsoleWarnings();
      const handle = await bootRendererScene(Phaser.WEBGL, {
        scene: HelpPanelProbeScene,
        sceneKey: HELP_SCENE_KEY,
        width: VIEW_W,
        height: VIEW_H,
        backgroundColor: BACKDROP,
      });
      const scene = handle.scene as HelpPanelProbeScene;
      expect(handle.rendererName, 'the probe must really run on WebGL').toBe('webgl');
      expect(getRendererSkipReasons()).toEqual([]);

      await settle(handle);

      // The clip is a Mask filter under WebGL — never a `setMask` call.
      expect(
        containersWithActiveMaskFilter(scene),
        'the scroll container must be clipped by an active Mask filter',
      ).toHaveLength(1);
      expect(
        displayListGraphics(scene),
        'the WebGL mask Graphics must stay off the display list',
      ).toHaveLength(0);

      // Content is painted inside the clip rect …
      const inside = await handle.probePixel(HELP_PANEL_WIDTH / 2, 300);
      expectColourClose(inside, CONTENT_RGB, 'HelpPanel inside the clip rect');

      // … and absent below it, although the rectangle extends to y = 4000.
      const outside = await handle.probePixel(HELP_PANEL_WIDTH / 2, VIEW_H - 10);
      expectNotContent(outside, 'HelpPanel below the clip rect');
      expect(VIEW_H - 10, 'probe must sit below the clip bottom').toBeGreaterThan(
        HELP_CLIP_BOTTOM,
      );

      expect(
        warnings.matching('not supported in WebGL'),
        'no core-originated setMask warning may be emitted under WebGL',
      ).toEqual([]);

      // Close → reopen re-applies the clip (a second, not a leaked, filter).
      scene.panel.close();
      await settle(handle);
      scene.panel.open();
      await settle(handle);

      expect(
        containersWithActiveMaskFilter(scene),
        'reopening must not stack Mask filters',
      ).toHaveLength(1);
      const reopenedInside = await handle.probePixel(HELP_PANEL_WIDTH / 2, 300);
      expectColourClose(
        reopenedInside,
        CONTENT_RGB,
        'HelpPanel inside the clip rect after reopen',
      );
      const reopenedOutside = await handle.probePixel(
        HELP_PANEL_WIDTH / 2,
        VIEW_H - 10,
      );
      expectNotContent(reopenedOutside, 'HelpPanel below the clip rect after reopen');

      // destroy() releases the clip: no orphaned Graphics, no active filter.
      scene.panel.destroy();
      await settle(handle);

      expect(scene.madeGraphics.length, 'the clip creates one mask Graphics').toBe(1);
      for (const graphics of scene.madeGraphics) {
        expect(
          graphics.isDestroyed,
          'the mask Graphics must be destroyed with the panel',
        ).toBe(true);
      }
      expect(
        containersWithActiveMaskFilter(scene),
        'destroy() must not leave an active Mask filter behind',
      ).toHaveLength(0);
      expect(warnings.matching('not supported in WebGL')).toEqual([]);

      warnings.stop();
    },
  );

  it(
    'SettingsPanel: WebGL clips the scroll content, and close/destroy release the clip',
    async (ctx) => {
      if (skipReason) {
        ctx.skip(skipReason);
        return;
      }
      const warnings = captureConsoleWarnings();
      const handle = await bootRendererScene(Phaser.WEBGL, {
        scene: SettingsPanelProbeScene,
        sceneKey: SETTINGS_SCENE_KEY,
        width: VIEW_W,
        height: VIEW_H,
        backgroundColor: BACKDROP,
      });
      const scene = handle.scene as SettingsPanelProbeScene;
      expect(handle.rendererName, 'the probe must really run on WebGL').toBe('webgl');
      expect(getRendererSkipReasons()).toEqual([]);

      await settle(handle);

      const clipped = containersWithActiveMaskFilter(scene);
      expect(
        clipped,
        'SettingsPanel must clip its over-long scroll content with a Mask filter',
      ).toHaveLength(1);

      // Inject content that reaches beyond the panel's left edge: the clip
      // (panel-width, full height) must hide everything left of the panel.
      const scrollContent = clipped[0] as unknown as Phaser.GameObjects.Container;
      paintContent(
        scene,
        scrollContent,
        SETTINGS_PANEL_WIDTH / 2,
        VIEW_H / 2,
        SETTINGS_PANEL_WIDTH * 4,
        VIEW_H,
      );
      await settle(handle);

      const panelLeft = VIEW_W - SETTINGS_PANEL_WIDTH;
      const inside = await handle.probePixel(panelLeft + SETTINGS_PANEL_WIDTH / 2, 300);
      expectColourClose(inside, CONTENT_RGB, 'SettingsPanel inside the clip rect');

      const outside = await handle.probePixel(panelLeft - 100, 300);
      expectNotContent(outside, 'SettingsPanel left of the clip rect');

      expect(
        warnings.matching('not supported in WebGL'),
        'no core-originated setMask warning may be emitted under WebGL',
      ).toEqual([]);

      // close() → reopen() keeps exactly one clip.
      scene.panel.close();
      await settle(handle);
      scene.panel.open();
      await settle(handle);
      expect(
        containersWithActiveMaskFilter(scene),
        'reopening must not stack Mask filters',
      ).toHaveLength(1);

      scene.panel.destroy();
      await settle(handle);

      expect(scene.madeGraphics.length, 'the clip creates one mask Graphics').toBe(1);
      for (const graphics of scene.madeGraphics) {
        expect(
          graphics.isDestroyed,
          'the mask Graphics must be destroyed with the panel',
        ).toBe(true);
      }
      expect(
        containersWithActiveMaskFilter(scene),
        'destroy() must not leave an active Mask filter behind',
      ).toHaveLength(0);
      expect(warnings.matching('not supported in WebGL')).toEqual([]);

      warnings.stop();
    },
  );

  it(
    'Overlay dialog: WebGL clips the scroll area and close() releases the clip',
    async (ctx) => {
      if (skipReason) {
        ctx.skip(skipReason);
        return;
      }
      const warnings = captureConsoleWarnings();
      const handle = await bootRendererScene(Phaser.WEBGL, {
        scene: OverlayDialogProbeScene,
        sceneKey: OVERLAY_SCENE_KEY,
        width: VIEW_W,
        height: VIEW_H,
        backgroundColor: BACKDROP,
      });
      const scene = handle.scene as OverlayDialogProbeScene;
      expect(handle.rendererName, 'the probe must really run on WebGL').toBe('webgl');
      expect(getRendererSkipReasons()).toEqual([]);
      const dialog = scene.dialog;

      await settle(handle);

      expect(
        containersWithActiveMaskFilter(scene),
        'the dialog scroll container must be clipped by an active Mask filter',
      ).toHaveLength(1);

      // Inside the scroll viewport the content paints …
      const inside = await handle.probePixel(
        dialog.contentX + dialog.contentWidth / 2,
        dialog.contentY + dialog.contentHeight / 2,
      );
      expectColourClose(inside, CONTENT_RGB, 'overlay inside the scroll area');

      // … and below it (still inside the dialog box) it does not.
      const belowContent = dialog.contentY + dialog.contentHeight + 20;
      expect(belowContent, 'probe must sit inside the dialog box').toBeLessThan(
        dialog.boxY + dialog.boxHeight,
      );
      const outside = await handle.probePixel(
        dialog.contentX + dialog.contentWidth / 2,
        belowContent,
      );
      expectNotContent(outside, 'overlay below the scroll area');

      expect(
        warnings.matching('not supported in WebGL'),
        'no core-originated setMask warning may be emitted under WebGL',
      ).toEqual([]);

      dialog.close();
      await settle(handle);

      expect(scene.madeGraphics.length, 'the clip creates one mask Graphics').toBe(1);
      for (const graphics of scene.madeGraphics) {
        expect(
          graphics.isDestroyed,
          'close() must destroy the mask Graphics with the overlay objects',
        ).toBe(true);
      }
      expect(
        containersWithActiveMaskFilter(scene),
        'close() must not leave an active Mask filter behind',
      ).toHaveLength(0);
      expect(warnings.matching('not supported in WebGL')).toEqual([]);

      warnings.stop();
    },
  );

  it('HelpPanel: Canvas parity — the GeometryMask path still clips', async () => {
    const warnings = captureConsoleWarnings();
    const handle = await bootRendererScene(Phaser.CANVAS, {
      scene: HelpPanelProbeScene,
      sceneKey: HELP_SCENE_KEY,
      width: VIEW_W,
      height: VIEW_H,
      backgroundColor: BACKDROP,
    });
    const scene = handle.scene as HelpPanelProbeScene;
    expect(handle.rendererName, 'the Canvas parity probe must run on Canvas').toBe(
      'canvas',
    );

    await settle(handle);

    // Canvas keeps the long-standing behaviour: a GeometryMask whose Graphics
    // stays on the display list (RenderTexture screenshot exclusion relies on
    // it — see HelpPanel.getSceneChildren()).
    const maskedDescendants: unknown[] = [];
    const visit = (node: SceneNode | undefined): void => {
      if (!node) return;
      if (node.mask instanceof Phaser.Display.Masks.GeometryMask) {
        maskedDescendants.push(node);
      }
      node.list?.forEach(visit);
    };
    scene.children.list.forEach((child) => visit(child as unknown as SceneNode));
    expect(
      maskedDescendants,
      'the scroll container must be GeometryMask-clipped on Canvas',
    ).toHaveLength(1);
    expect(
      displayListGraphics(scene),
      'the Canvas mask Graphics stays on the display list',
    ).toHaveLength(1);
    expect(scene.panel.getSceneChildren()).toContain(displayListGraphics(scene)[0]);

    const inside = await handle.probePixel(HELP_PANEL_WIDTH / 2, 300);
    expectColourClose(inside, CONTENT_RGB, 'Canvas HelpPanel inside the clip rect');
    const outside = await handle.probePixel(HELP_PANEL_WIDTH / 2, VIEW_H - 10);
    expectNotContent(outside, 'Canvas HelpPanel below the clip rect');

    // Canvas teardown drops the mask Graphics with the panel.
    scene.panel.destroy();
    await settle(handle);
    expect(displayListGraphics(scene), 'no orphaned mask Graphics after destroy').toHaveLength(0);
    expect(
      warnings.matching('not supported in WebGL'),
      'the Canvas path never warns about WebGL masks',
    ).toEqual([]);

    warnings.stop();
  });
});
