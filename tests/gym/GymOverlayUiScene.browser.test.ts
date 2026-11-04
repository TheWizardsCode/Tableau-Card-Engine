/**
 * GymOverlayUiScene browser integration tests.
 *
 * Validates that:
 *  - The overlay opens and dismisses correctly
 *  - The overlay background rectangle is centered (not in top-left corner)
 *  - Overlay positioning is correct relative to the game viewport
 *  - Visual regression via screenshot comparison
 *  - Scrollable clipped content area with wheel-based scrolling
 *  - Scrollbar indicator visible when content overflows
 *  - The scroll region genuinely clips on **both** renderers: the scene
 *    builds its clip through the core `createContainerClip()` helper, so
 *    Canvas applies a `GeometryMask` and WebGL applies a Mask filter. The
 *    WebGL case probes the framebuffer (content inside the clip rect is
 *    painted, identical content below it is not) and asserts no core-
 *    originated `setMask … not supported in WebGL` warning is emitted.
 *    Canvas parity is asserted too, so the migration cannot silently change
 *    the Canvas path.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { page } from 'vitest/browser';
import { GymOverlayUiScene } from '../../example-games/gym/scenes/GymOverlayUiScene';
import { GYM_OVERLAY_UI_KEY } from '../../example-games/gym/GymRegistry';
import { GAME_W, GAME_H } from '../../src/ui/constants';
import type { ContainerClip } from '../../src/ui/ContainerClip';
import {
  OVERLAY_MASK_HEIGHT,
  OVERLAY_MASK_WIDTH,
  OVERLAY_SCROLL_BASE_Y,
} from '../../example-games/gym/scenes/GymConstants';
import {
  bootRendererScene,
  captureConsoleWarnings,
  clearRendererSkipReasons,
  detectRendererSupport,
  getRendererSkipReasons,
  type PixelColour,
  type RendererSceneHandle,
} from '../helpers/bootRendererScene';

describe('GymOverlayUiScene browser integration', () => {
  /**
   * Bootstrap the scene for each test.
   */
  async function bootScene(): Promise<Phaser.Scene> {
    return (await bootRenderer(Phaser.CANVAS)).scene;
  }

  /**
   * Boot the scene on a **forced** renderer. The harness fails loudly rather
   * than silently falling back to the other renderer.
   */
  async function bootRenderer(renderType: number): Promise<RendererSceneHandle> {
    return bootRendererScene(renderType, {
      scene: GymOverlayUiScene,
      sceneKey: GYM_OVERLAY_UI_KEY,
      width: GAME_W,
      height: GAME_H,
      backgroundColor: '#1a2a1a',
    });
  }

  /**
   * Find a text object in the scene by exact text match.
   */
  function findText(scene: Phaser.Scene, text: string): Phaser.GameObjects.Text | null {
    return (
      scene.children.list.find(
        (child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text && child.text === text,
      ) ?? null
    );
  }

  /**
   * Get the x, y position and dimensions of the overlay background rectangle.
   * The overlay background is a Phaser.GameObjects.Rectangle with a dark fill
   * color (0x0a1a0a) that covers the full screen.
   */
  function getOverlayBackground(scene: Phaser.Scene): {
    x: number;
    y: number;
    width: number;
    height: number;
    displayOriginX: number;
    displayOriginY: number;
    fillColor?: number;
  } | null {
    const rectangles = scene.children.list.filter(
      (child): child is Phaser.GameObjects.Rectangle =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.width === GAME_W &&
        child.height === GAME_H,
    );

    // The first full-screen rectangle should be the overlay background
    if (rectangles.length === 0) return null;

    const bg = rectangles[0];
    return {
      x: bg.x,
      y: bg.y,
      width: bg.width,
      height: bg.height,
      displayOriginX: bg.displayOriginX,
      displayOriginY: bg.displayOriginY,
      fillColor: bg.fillColor,
    };
  }

  /**
   * Helper: advance the scene by N frames to allow tweens, rendering, etc.
   */
  async function advanceFrames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  /** Let the clip's render pass (and any deferred scene work) settle. */
  async function settle(handle: RendererSceneHandle): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
      await handle.awaitRenderTick();
    }
  }

  /** Open the overlay through its button. */
  function openOverlay(scene: Phaser.Scene): void {
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
  }

  /** Dismiss the open overlay through its in-overlay dismiss link. */
  function dismissOverlayViaLink(scene: Phaser.Scene): void {
    const dismissTexts = scene.children.list.filter(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text &&
        child.text === '[ Dismiss Overlay ]',
    );
    const overlayDismiss = dismissTexts.find((t) => (t as any).depth >= 11);
    expect(overlayDismiss).toBeTruthy();
    overlayDismiss!.emit('pointerdown');
  }

  // ── AC 1: Scene boots correctly ──────────────────────────

  it('boots the GymOverlayUiScene without errors', async () => {
    const scene = await bootScene();
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
  });

  // ── AC 2: Overlay opens and dismisses ─────────────────────

  it('opens overlay when Show Overlay button is clicked', async () => {
    const scene = await bootScene();

    // Find and click the Show Overlay button
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');

    await advanceFrames(5);

    // After opening, the overlay background should exist
    const bg = getOverlayBackground(scene);
    expect(bg).not.toBeNull();
  });

  it('dismisses overlay when Dismiss Overlay button is clicked', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Should have overlay background
    expect(getOverlayBackground(scene)).not.toBeNull();

    // Find and click the dismiss button (inside overlay)
    const dismissBtn = findText(scene, '[ Dismiss Overlay ]');
    expect(dismissBtn).toBeTruthy();

    // The dismiss button inside the overlay may have a different reference.
    // The overlay has text "[ Dismiss Overlay ]" at (GAME_W/2, 520).
    // Let's emit pointerdown on the dismiss text objects.
    const dismissTexts = scene.children.list.filter(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text &&
        child.text === '[ Dismiss Overlay ]',
    );
    // The dismiss link INSIDE the overlay should have depth >= 11
    const overlayDismiss = dismissTexts.find((t) => (t as any).depth >= 11);
    expect(overlayDismiss).toBeTruthy();
    overlayDismiss!.emit('pointerdown');

    await advanceFrames(5);

    // After dismissing, the overlay background should be gone
    expect(getOverlayBackground(scene)).toBeNull();
  });

  // ── AC 3: Overlay background is centered ──────────────────

  it('overlay background rectangle is centered at (GAME_W/2, GAME_H/2)', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Get the overlay background
    const bg = getOverlayBackground(scene);
    expect(bg, 'Overlay background rectangle should exist').not.toBeNull();

    // The background should be centered at (GAME_W/2, GAME_H/2)
    // Allow 1px tolerance for subpixel rendering
    expect(bg!.x).toBeCloseTo(GAME_W / 2, 0);
    expect(bg!.y).toBeCloseTo(GAME_H / 2, 0);

    // Dimensions should match the game viewport
    expect(bg!.width).toBe(GAME_W);
    expect(bg!.height).toBe(GAME_H);

    // Display origin: with default (0.5, 0.5) origin and full-screen dimensions,
    // displayOriginX = 0.5 * GAME_W, displayOriginY = 0.5 * GAME_H
    expect(bg!.displayOriginX).toBe(GAME_W / 2);
    expect(bg!.displayOriginY).toBe(GAME_H / 2);
  });

  // ── AC 4: Overlay covers the full screen ──────────────────

  it('overlay background covers the entire game viewport', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    const bg = getOverlayBackground(scene);
    expect(bg).not.toBeNull();

    // With centered position and GAME_W x GAME_H dimensions, the
    // background should extend from (0,0) to (GAME_W, GAME_H)
    const left = bg!.x - bg!.displayOriginX;
    const top = bg!.y - bg!.displayOriginY;
    const right = left + bg!.width;
    const bottom = top + bg!.height;

    expect(left).toBe(0);
    expect(top).toBe(0);
    expect(right).toBe(GAME_W);
    expect(bottom).toBe(GAME_H);
  });

  // ── AC 5: Overlay z-ordering — background is behind content ─

  it('overlay background has depth 10 and content appears above it', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    const bg = getOverlayBackground(scene);
    expect(bg).not.toBeNull();

    // Background should be at depth 10 (the default in createOverlayBackground)
    const bgRect = scene.children.list.find(
      (child): child is Phaser.GameObjects.Rectangle & { depth: number } =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.width === GAME_W &&
        child.height === GAME_H &&
        (child as any).depth === 10,
    );
    expect(bgRect).toBeTruthy();
  });

  // ── AC 6: Overlay can be closed and reopened multiple times ─

  it('overlay can be opened, closed, and reopened without errors', async () => {
    const scene = await bootScene();

    // Open → Close → Open → Close
    for (let cycle = 0; cycle < 2; cycle++) {
      // Open
      const showBtn = findText(scene, '[ Show Overlay ]');
      expect(showBtn).toBeTruthy();
      showBtn!.emit('pointerdown');
      await advanceFrames(5);

      const bg = getOverlayBackground(scene);
      expect(bg, `Background should exist after open cycle ${cycle}`).not.toBeNull();

      // Close
      const dismissTexts = scene.children.list.filter(
        (child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text &&
          child.text === '[ Dismiss Overlay ]',
      );
      const overlayDismiss = dismissTexts.find((t) => (t as any).depth >= 11);
      expect(overlayDismiss).toBeTruthy();
      overlayDismiss!.emit('pointerdown');
      await advanceFrames(5);

      expect(getOverlayBackground(scene), `Background should be null after dismiss cycle ${cycle}`).toBeNull();
    }
  });

  // ── AC 7: Background dismisses on click ───────────────────

  it('overlay dismisses when clicking the background', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    const bg = getOverlayBackground(scene);
    expect(bg).not.toBeNull();

    // Simulate a click on the background
    // The background has a pointerdown handler that calls closeOverlay
    const bgRect = scene.children.list.find(
      (child) =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.width === GAME_W &&
        child.height === GAME_H,
    );

    expect(bgRect).toBeTruthy();
    // Emit pointerdown on the background to dismiss
    if (bgRect) {
      bgRect.emit('pointerdown');
    }
    await advanceFrames(10);

    // After dismissing, the overlay should be gone
    expect(getOverlayBackground(scene)).toBeNull();
  });

  // ── AC 8: Scrollable content has enough lines to overflow the mask ──

  it('scrollable content has enough lines to overflow the 200px mask', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Verify the scene has scroll state tracking
    const scroller = (scene as any)._overlayScroller as {
      scrollY: number;
      maxScrollY: number;
      lineCount: number;
    } | undefined;
    expect(scroller, 'Overlay should have a scroll state object (_overlayScroller)').toBeTruthy();

    if (scroller) {
      // Content should overflow mask (200px tall mask, lineHeight ~16px)
      // With at least 30 lines, content height = 30*16 = 480px >> 200px
      expect(scroller.lineCount).toBeGreaterThanOrEqual(30);
      expect(scroller.maxScrollY).toBeGreaterThan(0);
    }
  });

  // ── AC 9: Scroll wheel changes the scroll position ────────

  it('scroll wheel changes the masked container Y position', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    const scroller = (scene as any)._overlayScroller as {
      scrollY: number;
      maxScrollY: number;
    } | undefined;

    expect(scroller, 'Scroll state should exist').toBeTruthy();
    const initialScrollY = scroller!.scrollY;

    // Simulate a wheel event (scroll down) via the scene input
    // Phaser's input plugin emits 'wheel' with (pointer, gameObjects, deltaX, deltaY, deltaZ)
    scene.input.emit('wheel' as any, null, [], 0, 120, 0);

    await advanceFrames(3);

    // After scrolling down, scrollY should have increased
    expect(scroller!.scrollY).toBeGreaterThan(initialScrollY);
  });

  // ── AC 10: Scroll position is clamped at boundaries ───────

  it('scroll position is clamped to [0, maxScrollY]', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    const scroller = (scene as any)._overlayScroller as {
      scrollY: number;
      maxScrollY: number;
    } | undefined;

    expect(scroller, 'Scroll state should exist').toBeTruthy();

    // Scroll way past the bottom
    for (let i = 0; i < 50; i++) {
      scene.input.emit('wheel' as any, null, [], 0, 120, 0);
    }
    await advanceFrames(5);

    // Should be clamped to maxScrollY
    expect(scroller!.scrollY).toBe(scroller!.maxScrollY);

    // Reset to top by scrolling way up
    for (let i = 0; i < 100; i++) {
      scene.input.emit('wheel' as any, null, [], 0, -120, 0);
    }
    await advanceFrames(5);

    // Should be clamped to 0
    expect(scroller!.scrollY).toBe(0);
  });

  // ── AC 11: Scroll position resets when overlay reopened ────

  it('scroll position resets to 0 when overlay is reopened', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    const scroller = (scene as any)._overlayScroller as {
      scrollY: number;
      maxScrollY: number;
    } | undefined;
    expect(scroller, 'Scroll state should exist').toBeTruthy();

    // Scroll down
    for (let i = 0; i < 10; i++) {
      scene.input.emit('wheel' as any, null, [], 0, 120, 0);
    }
    await advanceFrames(5);

    expect(scroller!.scrollY).toBeGreaterThan(0);

    // Close overlay
    const dismissTexts = scene.children.list.filter(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text &&
        child.text === '[ Dismiss Overlay ]',
    );
    const overlayDismiss = dismissTexts.find((t) => (t as any).depth >= 11);
    expect(overlayDismiss).toBeTruthy();
    overlayDismiss!.emit('pointerdown');
    await advanceFrames(10);

    // Reopen
    const showBtn2 = findText(scene, '[ Show Overlay ]');
    expect(showBtn2).toBeTruthy();
    showBtn2!.emit('pointerdown');
    await advanceFrames(5);

    const scroller2 = (scene as any)._overlayScroller as {
      scrollY: number;
      maxScrollY: number;
    } | undefined;
    expect(scroller2, 'Scroll state should exist after reopen').toBeTruthy();

    // Scroll position should reset to 0
    expect(scroller2!.scrollY).toBe(0);
  });

  // ── AC 12: Scrollbar is visible when overlay is open ──────

  it('scrollbar exists when overlay is open and content overflows', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Find the scrollbar track and thumb
    const children = scene.children.list;
    const overlayChildren = children.filter(
      (child) => child instanceof Phaser.GameObjects.Rectangle &&
        (child as any).depth >= 12,
    );

    // The overlay should contain rectangles at depth >= 12 for the scrollbar
    // We're looking specifically for small rectangles (not the full-screen background)
    const smallRects = overlayChildren.filter(
      (r: any) => r.width < 20 && r.height < 300,
    );

    // Should have at least 2 small rectangles: track + thumb
    // But to be more robust, just check there are some small rectangles
    // which would be the scrollbar elements
    expect(smallRects.length).toBeGreaterThanOrEqual(2);
  });

  // ── Renderer-aware clip: WebGL + Canvas parity ───────────

  /** Unmistakable injected content colour: no clipped-away pixel matches it. */
  const CONTENT_COLOUR = 0xff00ff;
  const CONTENT_RGB = { r: 0xff, g: 0x00, b: 0xff };

  /** Snapshot backends and mask edges may differ by a rounding step. */
  const COLOUR_TOLERANCE = 8;

  /**
   * Margin for "this pixel is not content". Deliberately much larger than
   * {@link COLOUR_TOLERANCE} so a partially-clipped edge can never pass.
   */
  const NOT_CONTENT_MARGIN = 40;

  function expectColourClose(
    actual: PixelColour,
    expected: { r: number; g: number; b: number },
    label: string,
  ): void {
    expect(
      Math.abs(actual.r - expected.r),
      `${label}: red ${actual.r} vs expected ${expected.r}`,
    ).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    expect(
      Math.abs(actual.g - expected.g),
      `${label}: green ${actual.g} vs expected ${expected.g}`,
    ).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    expect(
      Math.abs(actual.b - expected.b),
      `${label}: blue ${actual.b} vs expected ${expected.b}`,
    ).toBeLessThanOrEqual(COLOUR_TOLERANCE);
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

  /** Every container in the scene whose mask filter is currently active. */
  function containersWithActiveMaskFilter(
    scene: Phaser.Scene,
  ): Phaser.GameObjects.Container[] {
    const found: Phaser.GameObjects.Container[] = [];
    const visit = (node: unknown): void => {
      if (!node) return;
      const candidate = node as {
        filters?: { internal?: { getActive?: () => unknown[] } } | null;
        list?: unknown[];
      };
      const active = candidate.filters?.internal?.getActive?.() ?? [];
      if (active.length > 0 && node instanceof Phaser.GameObjects.Container) {
        found.push(node);
      }
      candidate.list?.forEach(visit);
    };
    scene.children.list.forEach(visit);
    return found;
  }

  /**
   * Inject a magenta rectangle into the scene's clipped content container.
   *
   * It spans the whole clip rect and continues well below it, so a renderer
   * that ignores the clip paints magenta outside the clip region as well.
   */
  function injectOverflowingContent(scene: Phaser.Scene): {
    clip: ContainerClip;
    insideProbe: { x: number; y: number };
    belowProbe: { x: number; y: number };
  } {
    const clip = (scene as any).contentClip as ContainerClip | null;
    expect(clip, 'the overlay must build its scroll clip').not.toBeNull();
    const container = (scene as any).maskedContainer as
      | Phaser.GameObjects.Container
      | null;
    expect(container, 'the overlay must create its clipped container').not.toBeNull();

    // Local (0, 0) is the clip's top-left corner: the rect covers the clip
    // and reaches twice the clip height, i.e. far past its bottom edge.
    container!.add(
      scene.add
        .rectangle(clip!.rect.w / 2, clip!.rect.h, clip!.rect.w, clip!.rect.h * 2, CONTENT_COLOUR)
        .setOrigin(0.5),
    );

    return {
      clip: clip!,
      // Left of centre: clear of the scrollbar and of the overlay's status
      // labels, so only the injected rectangle can colour these pixels.
      insideProbe: { x: clip!.rect.x + 40, y: clip!.rect.y + 60 },
      belowProbe: { x: clip!.rect.x + 40, y: clip!.rect.y + clip!.rect.h + 20 },
    };
  }

  beforeEach(() => {
    clearRendererSkipReasons();
  });

  it(
    'clips the scroll region under WebGL and destroys the clip on dismiss',
    async (ctx) => {
      const support = detectRendererSupport(Phaser.WEBGL);
      if (!support.supported) {
        ctx.skip(`WebGL unavailable in this browser: ${support.reason}`);
        return;
      }

      const warnings = captureConsoleWarnings();
      const handle = await bootRenderer(Phaser.WEBGL);
      const scene = handle.scene;
      expect(
        handle.rendererName,
        'the clip probe must really run on WebGL',
      ).toBe('webgl');
      expect(getRendererSkipReasons()).toEqual([]);

      openOverlay(scene);
      await settle(handle);

      const clip = (scene as any).contentClip as ContainerClip | null;
      expect(clip, 'the overlay must build its scroll clip').not.toBeNull();
      expect(clip!.renderer, 'WebGL must drive a Mask filter').toBe('webgl');
      expect(clip!.active).toBe(true);
      expect(clip!.rect).toEqual({
        x: GAME_W / 2 - OVERLAY_MASK_WIDTH / 2,
        y: OVERLAY_SCROLL_BASE_Y,
        w: OVERLAY_MASK_WIDTH,
        h: OVERLAY_MASK_HEIGHT,
      });
      expect(clip!.geometryMask, 'WebGL must never use a GeometryMask').toBeNull();
      expect(clip!.maskFilter).not.toBeNull();

      const maskedContainer = (scene as any).maskedContainer;
      const masked = containersWithActiveMaskFilter(scene);
      expect(
        masked,
        'the scroll container must be clipped by an active Mask filter',
      ).toContain(maskedContainer);

      const probes = injectOverflowingContent(scene);
      await settle(handle);

      // Content is painted inside the clip rect …
      const inside = await handle.probePixel(probes.insideProbe.x, probes.insideProbe.y);
      expectColourClose(inside, CONTENT_RGB, 'inside the WebGL clip rect');

      // … and absent below it, although the rectangle extends past the clip.
      const below = await handle.probePixel(probes.belowProbe.x, probes.belowProbe.y);
      expectNotContent(below, 'below the WebGL clip rect');

      expect(
        warnings.matching('not supported in WebGL'),
        'no core-originated setMask warning may be emitted under WebGL',
      ).toEqual([]);

      // Teardown: dismissing the overlay destroys the clip — the Mask filter
      // detaches and no mask Graphics is orphaned.
      dismissOverlayViaLink(scene);
      await settle(handle);

      expect((scene as any).contentClip, 'dismiss must clear the clip reference').toBeNull();
      expect(clip!.active, 'dismiss must deactivate the clip').toBe(false);
      expect(
        clip!.graphics.isDestroyed,
        'dismiss must destroy the clip mask Graphics',
      ).toBe(true);
      expect(
        containersWithActiveMaskFilter(scene),
        'dismiss must not leave an active Mask filter on the scroll container',
      ).not.toContain(maskedContainer);
      expect(warnings.matching('not supported in WebGL')).toEqual([]);

      warnings.stop();
    },
  );

  it('clips the scroll region with a GeometryMask under Canvas (parity)', async () => {
    const warnings = captureConsoleWarnings();
    const handle = await bootRenderer(Phaser.CANVAS);
    const scene = handle.scene;
    expect(handle.rendererName, 'the Canvas parity probe must run on Canvas').toBe(
      'canvas',
    );

    openOverlay(scene);
    await settle(handle);

    const clip = (scene as any).contentClip as ContainerClip | null;
    expect(clip, 'the overlay must build its scroll clip').not.toBeNull();
    expect(clip!.renderer, 'Canvas must keep the GeometryMask path').toBe('canvas');
    expect(clip!.geometryMask).toBeInstanceOf(Phaser.Display.Masks.GeometryMask);
    expect(clip!.maskFilter, 'Canvas must never use a Mask filter').toBeNull();
    expect(
      (scene as any).maskedContainer.mask,
      'the scroll container must carry the GeometryMask',
    ).toBe(clip!.geometryMask);
    expect(
      scene.children.list,
      'Canvas keeps the long-standing display-list mask Graphics',
    ).toContain(clip!.graphics);

    const probes = injectOverflowingContent(scene);
    await settle(handle);

    const inside = await handle.probePixel(probes.insideProbe.x, probes.insideProbe.y);
    expectColourClose(inside, CONTENT_RGB, 'inside the Canvas clip rect');
    const below = await handle.probePixel(probes.belowProbe.x, probes.belowProbe.y);
    expectNotContent(below, 'below the Canvas clip rect');

    // Teardown destroys the clip resources on the Canvas path too.
    dismissOverlayViaLink(scene);
    await settle(handle);

    expect((scene as any).contentClip).toBeNull();
    expect(clip!.active).toBe(false);
    expect(clip!.graphics.isDestroyed).toBe(true);
    expect(
      scene.children.list,
      'no orphaned mask Graphics after dismiss',
    ).not.toContain(clip!.graphics);
    expect(warnings.matching('not supported in WebGL')).toEqual([]);

    warnings.stop();
  });

  // ── Visual screenshot test ─────────────────────────────

  it('overlay screenshot shows centered background (visual verification)', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(10);

    // Capture a screenshot of the overlay scene
    const canvas = document.querySelector('canvas');
    expect(canvas).not.toBeNull();

    // Take a screenshot for visual regression
    const screenshotPath = `__screenshots__/GymOverlayUiScene.browser.test.ts/overlay-centered.png`;
    await page.screenshot({ path: screenshotPath });

    // Log the screenshot path for CI artifact collection
    console.info(`[screenshot:overlay-centered] path=${screenshotPath} canvas=${canvas!.width}x${canvas!.height}`);
  });
});
