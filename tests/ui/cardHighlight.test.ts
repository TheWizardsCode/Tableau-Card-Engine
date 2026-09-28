/**
 * Unit tests for cardHighlight -- the Canvas-compatible persistent card
 * highlight helper (src/ui/cardHighlight.ts).
 *
 * Phaser is mocked: the scene's `add.rectangle` factory records the created
 * overlay so the tests can assert on its geometry, depth, lifecycle and the
 * WebGL tint applied to the target.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createCardHighlight,
  type CardHighlightOptions,
} from '../../src/ui/cardHighlight';

interface MockOverlay {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  alpha: number;
  originX: number;
  originY: number;
  rotation: number;
  depth: number;
  active: boolean;
  strokeColor?: number;
  strokeWidth?: number;
  setPosition: ReturnType<typeof vi.fn>;
  setOrigin: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
  setAlpha: ReturnType<typeof vi.fn>;
  setRotation: ReturnType<typeof vi.fn>;
  setStrokeStyle: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createMockScene(): { scene: Phaser.Scene; overlays: MockOverlay[] } {
  const overlays: MockOverlay[] = [];
  const scene = {
    add: {
      rectangle: vi.fn(
        (x: number, y: number, width: number, height: number, color: number) => {
          const overlay: MockOverlay = {
            x,
            y,
            width,
            height,
            color,
            alpha: 1,
            originX: 0.5,
            originY: 0.5,
            rotation: 0,
            depth: 0,
            active: true,
            setPosition: vi.fn((nx: number, ny: number) => {
              overlay.x = nx;
              overlay.y = ny;
              return overlay;
            }),
            setOrigin: vi.fn((ox: number, oy: number) => {
              overlay.originX = ox;
              overlay.originY = oy;
              return overlay;
            }),
            setDepth: vi.fn((d: number) => {
              overlay.depth = d;
              return overlay;
            }),
            setAlpha: vi.fn((a: number) => {
              overlay.alpha = a;
              return overlay;
            }),
            setRotation: vi.fn((r: number) => {
              overlay.rotation = r;
              return overlay;
            }),
            setStrokeStyle: vi.fn((width: number, strokeColor: number) => {
              overlay.strokeWidth = width;
              overlay.strokeColor = strokeColor;
              return overlay;
            }),
            destroy: vi.fn(() => {
              overlay.active = false;
            }),
          };
          overlays.push(overlay);
          return overlay;
        },
      ),
    },
  } as unknown as Phaser.Scene;
  return { scene, overlays };
}

interface MockCard {
  x: number;
  y: number;
  depth: number;
  rotation: number;
  originX: number;
  originY: number;
  displayWidth?: number;
  displayHeight?: number;
  width?: number;
  height?: number;
  active: boolean;
  setTint: ReturnType<typeof vi.fn>;
  clearTint: ReturnType<typeof vi.fn>;
}

function createMockCard(overrides: Partial<MockCard> = {}): MockCard {
  const card: MockCard = {
    x: 100,
    y: 200,
    depth: 3,
    rotation: 0,
    originX: 0.5,
    originY: 0.5,
    displayWidth: 90,
    displayHeight: 126,
    active: true,
    setTint: vi.fn(),
    clearTint: vi.fn(),
    ...overrides,
  };
  return card;
}

function makeHighlight(card: MockCard, overrides: Partial<CardHighlightOptions> = {}) {
  const { scene, overlays } = createMockScene();
  const highlight = createCardHighlight({
    scene,
    target: card as unknown as Phaser.GameObjects.Image,
    color: 0xaaffaa,
    ...overrides,
  });
  return { highlight, overlays };
}

describe('createCardHighlight', () => {
  it('applies the colour as a WebGL tint and creates a matching overlay', () => {
    const card = createMockCard();
    const { highlight, overlays } = makeHighlight(card, {
      color: 0x44ff44,
      alpha: 0.2,
    });

    // WebGL tint applied (no-op under Canvas; the overlay covers that case).
    expect(card.setTint).toHaveBeenCalledWith(0x44ff44);

    expect(overlays).toHaveLength(1);
    const overlay = overlays[0];
    expect(highlight.overlay).toBe(overlay as unknown as Phaser.GameObjects.Rectangle);
    expect(overlay.color).toBe(0x44ff44);
    expect(overlay.alpha).toBe(0.2);
    // Geometry mirrors the card.
    expect(overlay.x).toBe(100);
    expect(overlay.y).toBe(200);
    expect(overlay.width).toBe(90);
    expect(overlay.height).toBe(126);
    expect(overlay.originX).toBe(0.5);
    expect(overlay.originY).toBe(0.5);
    // Renders just above the card.
    expect(overlay.depth).toBeCloseTo(3.01, 5);
  });

  it('defaults to alpha 0.35 and a +0.01 depth offset', () => {
    const card = createMockCard({ depth: 7 });
    const { overlays } = makeHighlight(card);

    expect(overlays[0].alpha).toBe(0.35);
    expect(overlays[0].depth).toBeCloseTo(7.01, 5);
    // No stroke unless requested.
    expect(overlays[0].setStrokeStyle).not.toHaveBeenCalled();
  });

  it('draws an outline when strokeColor is supplied', () => {
    const card = createMockCard();
    const { overlays } = makeHighlight(card, {
      strokeColor: 0x33ff33,
      strokeWidth: 4,
    });

    // The outline is what makes the selection unmistakable under Canvas
    // (the fill alone is a subtle wash) — CG-0MUHKD7S8007EEAC.
    expect(overlays[0].setStrokeStyle).toHaveBeenCalledWith(4, 0x33ff33);
    expect(overlays[0].strokeWidth).toBe(4);
    expect(overlays[0].strokeColor).toBe(0x33ff33);
  });

  it('defaults the outline width to 3 when only strokeColor is supplied', () => {
    const card = createMockCard();
    const { overlays } = makeHighlight(card, { strokeColor: 0x33ff33 });

    expect(overlays[0].setStrokeStyle).toHaveBeenCalledWith(3, 0x33ff33);
  });

  it("preserves the card's rotation and origin on the overlay", () => {
    const card = createMockCard({ rotation: 0.4, originX: 0, originY: 1 });
    const { overlays } = makeHighlight(card);

    expect(overlays[0].rotation).toBe(0.4);
    expect(overlays[0].originX).toBe(0);
    expect(overlays[0].originY).toBe(1);
  });

  it('falls back to default card dimensions when display size is unavailable', () => {
    const card = createMockCard({
      displayWidth: undefined,
      displayHeight: undefined,
      width: undefined,
      height: undefined,
    });
    const { overlays } = makeHighlight(card);

    expect(overlays[0].width).toBe(96);
    expect(overlays[0].height).toBe(130);
  });

  it('sync() re-aligns the overlay after the card moves', () => {
    const card = createMockCard();
    const { highlight, overlays } = makeHighlight(card);

    card.x = 350;
    card.y = 420;
    card.depth = 12;
    card.rotation = 0.25;
    highlight.sync();

    expect(overlays[0].x).toBe(350);
    expect(overlays[0].y).toBe(420);
    expect(overlays[0].depth).toBeCloseTo(12.01, 5);
    expect(overlays[0].rotation).toBe(0.25);
  });

  it('destroy() clears the tint and destroys the overlay exactly once', () => {
    const card = createMockCard();
    const { highlight, overlays } = makeHighlight(card);

    highlight.destroy();
    expect(card.clearTint).toHaveBeenCalledTimes(1);
    expect(overlays[0].destroy).toHaveBeenCalledTimes(1);
    expect(overlays[0].active).toBe(false);

    // Idempotent: a second destroy is a no-op.
    highlight.destroy();
    expect(card.clearTint).toHaveBeenCalledTimes(1);
    expect(overlays[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('sync() is a no-op after destroy()', () => {
    const card = createMockCard();
    const { highlight, overlays } = makeHighlight(card);
    highlight.destroy();

    card.x = 999;
    highlight.sync();

    expect(overlays[0].x).toBe(100); // unchanged
  });

  it('does not throw when the target is already destroyed on destroy()', () => {
    const card = createMockCard({ active: false });
    const { highlight, overlays } = makeHighlight(card);

    expect(() => highlight.destroy()).not.toThrow();
    // A destroyed target's tint is not touched.
    expect(card.clearTint).not.toHaveBeenCalled();
    expect(overlays[0].destroy).toHaveBeenCalled();
  });
});
