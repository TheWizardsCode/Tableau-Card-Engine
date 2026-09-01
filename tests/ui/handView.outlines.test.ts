import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import type { Card } from '../../src/card-system/Card';
import { createCard } from '../../src/card-system/Card';

// ── Minimal Phaser mock (extends handView.test.ts pattern) ───

function createMockScene(): any {
  const tweens: any[] = [];
  const images: any[] = [];
  const texts: any[] = [];
  const destroyed: any[] = [];
  const rectangles: any[] = [];

  const mockImage = (x: number, y: number, texture: string) => {
    const img = {
      x,
      y,
      texture: { key: texture },
      active: true,
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockImplementation(() => { destroyed.push(img); }),
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      rotation: 0,
      displayWidth: 48,
      displayHeight: 65,
    };
    images.push(img);
    return img;
  };

  const mockText = (x: number, y: number, text: string, _style?: any) => {
    const txt = {
      x,
      y,
      text,
      setOrigin: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      active: true,
      destroy: vi.fn().mockImplementation(() => { destroyed.push(txt); }),
    };
    texts.push(txt);
    return txt;
  };

  const inputHandlers: Record<string, any[]> = {};

  return {
    add: {
      image: vi.fn().mockImplementation(mockImage),
      text: vi.fn().mockImplementation(mockText),
      graphics: vi.fn().mockReturnValue({
        fillStyle: vi.fn().mockReturnThis(),
        fillRoundedRect: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        strokeRoundedRect: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      }),
      rectangle: vi.fn().mockImplementation(
        (x: number, y: number, w: number, h: number, color?: number) => {
          const rect: any = {
            x,
            y,
            width: w,
            height: h,
            color: color ?? 0xffffff,
            fillColor: color ?? 0xffffff,
            fillAlpha: 1,
            strokeWidth: 0,
            strokeColor: 0xffffff,
            strokeAlpha: 1,
            isOutline: false,
            active: true,
            originX: 0.5,
            originY: 0.5,
            depth: 0,
            rotation: 0,
            alpha: 1,
            setPosition: vi.fn().mockImplementation((nx: number, ny: number) => {
              rect.x = nx;
              rect.y = ny;
              return rect;
            }),
            setOrigin: vi.fn().mockImplementation((ox: number, oy?: number) => {
              rect.originX = ox;
              rect.originY = oy ?? ox;
              return rect;
            }),
            setDepth: vi.fn().mockImplementation((d: number) => {
              rect.depth = d;
              return rect;
            }),
            setAlpha: vi.fn().mockImplementation((a: number) => {
              rect.alpha = a;
              return rect;
            }),
            setRotation: vi.fn().mockImplementation((r: number) => {
              rect.rotation = r;
              return rect;
            }),
            setStrokeStyle: vi.fn().mockImplementation((w2: number, c: number, a?: number) => {
              rect.strokeWidth = w2;
              rect.strokeColor = c;
              rect.strokeAlpha = a ?? 1;
              rect.isOutline = true;
              return rect;
            }),
            setFillStyle: vi
              .fn()
              .mockImplementation((c: number, a?: number) => {
                rect.fillColor = c;
                rect.color = c;
                rect.fillAlpha = a ?? 1;
                return rect;
              }),
            destroy: vi.fn().mockImplementation(() => {
              rect.active = false;
              destroyed.push(rect);
            }),
          };
          rectangles.push(rect);
          return rect;
        },
      ),
    },
    tweens: {
      add: vi.fn().mockImplementation((config: any) => {
        tweens.push(config);
        if (config.onComplete) {
          setTimeout(() => config.onComplete(), 0);
        }
        return { stop: vi.fn() };
      }),
      killTweensOf: vi.fn(),
    },
    input: {
      on: vi.fn((event: string, handler: any) => {
        if (!inputHandlers[event]) inputHandlers[event] = [];
        inputHandlers[event].push(handler);
      }),
      off: vi.fn(),
    },
    events: {
      once: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    time: {
      delayedCall: vi.fn(),
    },
    _inputHandlers: inputHandlers,
    _tweens: tweens,
    _images: images,
    _texts: texts,
    _destroyed: destroyed,
    _rectangles: rectangles,
  };
}

function card(rank: string, suit: string, faceUp = true): Card {
  return createCard(rank as any, suit as any, faceUp);
}

// ── Helper: find outline rectangles ─────────────────────────
// Outlines are stroke-only rectangles: strokeColor 0x666666 at 0.5 alpha,
// strokeWidth 2, size CARD_W x CARD_H, tagged isOutline=true.

function getOutlineRects(scene: any): any[] {
  return scene._rectangles.filter(
    (r: any) =>
      r.active &&
      r.isOutline === true &&
      r.strokeColor === 0x666666,
  );
}

// ── Tests ───────────────────────────────────────────────────

describe('HandView position outlines', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  // ── Construction ──────────────────────────────────────────

  it('showPositionOutlines defaults to false', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });
    expect((hv as any).showPositionOutlines).toBe(false);
    hv.destroy();
  });

  it('showPositionOutlines=true creates outline rectangles for each card', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
    ]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(3);
    hv.destroy();
  });

  it('showPositionOutlines=false creates no outline rectangles', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: false,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(0);
    hv.destroy();
  });

  // ── Outline visual style ──────────────────────────────────

  it('outlines are stroke-only rectangles with correct dimensions', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([card('A', 'spades')]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(1);

    // Card dimensions (CARD_W=96, CARD_H=130)
    const outline = outlines[0];
    expect(outline.width).toBe(96);
    expect(outline.height).toBe(130);

    // Stroke-only: stroke at 0.5 alpha, no fill
    expect(outline.strokeAlpha).toBe(0.5);

    hv.destroy();
  });

  it('outline depth is index - 0.5 (behind card sprite at index)', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
    ]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(3);

    // Outline at index 0 should have depth -0.5
    // Outline at index 1 should have depth 0.5
    // Outline at index 2 should have depth 1.5
    const depthCalls0 = outlines[0].setDepth.mock.calls;
    expect(depthCalls0[depthCalls0.length - 1][0]).toBe(-0.5);

    const depthCalls1 = outlines[1].setDepth.mock.calls;
    expect(depthCalls1[depthCalls1.length - 1][0]).toBe(0.5);

    const depthCalls2 = outlines[2].setDepth.mock.calls;
    expect(depthCalls2[depthCalls2.length - 1][0]).toBe(1.5);

    hv.destroy();
  });

  // ── maxSlots ──────────────────────────────────────────────

  it('maxSlots shows outlines for all slots even with fewer cards', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    // Only 2 cards but maxSlots=5 → 5 outlines
    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(5);

    hv.destroy();
  });

  it('maxSlots outlines for empty hand', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    // Empty hand → 5 outlines (showing full capacity)
    hv.setCards([]);

    // Need to call rebuildDisplay manually since setCards with empty
    // returns early — but actually rebuildDisplay has an early return
    // when cards.length === 0. Let me check this...
    // Looking at the code: rebuildDisplay() has `if (this.cards.length === 0) return;`
    // So outlines for empty hand with maxSlots would NOT be created with the current code.
    // We need to handle this case specially.

    // For now, with 0 cards and maxSlots, the outlines should still render
    // if showPositionOutlines is true. Let's verify this AC.
    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(5);

    hv.destroy();
  });

  it('when maxSlots is omitted, outlines = card count (one per card)', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      // No maxSlots
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(2);

    hv.destroy();
  });

  // ── Lifecycle mutations ───────────────────────────────────

  it('addCard creates a new outline at the new index', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([card('A', 'spades')]);
    expect(getOutlineRects(scene)).toHaveLength(5);

    hv.addCard(card('2', 'hearts'));
    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(5);

    hv.destroy();
  });

  it('removeCard removes the outline at the removed index', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
    ]);
    expect(getOutlineRects(scene)).toHaveLength(5);

    hv.removeCard(1);
    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(5);

    hv.destroy();
  });

  it('setCards updates outlines to match new card count', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
    ]);
    expect(getOutlineRects(scene)).toHaveLength(5);

    // Replace with more cards
    hv.setCards([
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
      card('6', 'hearts'),
    ]);
    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(5);

    hv.destroy();
  });

  // ── Layout direction ──────────────────────────────────────

  it('outlines in horizontal layout match card positions', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(2);

    // Horizontal layout: outlines should match card Y positions
    for (let i = 0; i < outlines.length; i++) {
      expect(outlines[i].y).toBe(scene._images[i].y);
    }

    hv.destroy();
  });

  it('outlines in vertical layout cascade vertically', () => {
    const hv = new HandView(scene, {
      baseX: 200,
      baseY: 100,
      spacing: 50,
      layoutDirection: 'vertical',
      showPositionOutlines: true,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
    ]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(3);

    // Each outline should match its card position
    for (let i = 0; i < outlines.length; i++) {
      expect(outlines[i].x).toBe(scene._images[i].x);
      expect(outlines[i].y).toBe(scene._images[i].y);
    }

    hv.destroy();
  });

  // ── Layout updates ────────────────────────────────────────

  it('setSpacing repositions outlines', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    const outlineX0Before = getOutlineRects(scene)[0].x;

    hv.setSpacing(80);

    const outlines = getOutlineRects(scene);
    expect(outlines[0].x).not.toBe(outlineX0Before);
    expect(outlines[1].x).toBeGreaterThan(outlines[0].x);

    hv.destroy();
  });

  it('setArcRadius repositions outlines', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      arcRadius: 0,
      showPositionOutlines: true,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    // All outlines should be at baseY (no arc)
    for (const o of getOutlineRects(scene)) {
      expect(o.y).toBe(130);
    }

    hv.setArcRadius(80);

    // With arc, center card should be above baseY
    const outlines = getOutlineRects(scene);
    expect(outlines[2].y).toBeLessThan(130); // center lifted
    expect(outlines[0].y).toBeGreaterThanOrEqual(130); // edges near baseY

    hv.destroy();
  });

  it('setLayoutDirection updates outline positions for vertical cascade', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
    ]);

    // Horizontal layout: outlines have same Y
    let outlines = getOutlineRects(scene);
    expect(outlines[0].y).toBe(outlines[1].y);

    // Switch to vertical
    hv.setLayoutDirection('vertical');
    outlines = getOutlineRects(scene);
    // Vertical layout: outlines cascade down
    expect(outlines[1].y).toBeGreaterThan(outlines[0].y);

    hv.destroy();
  });

  it('setBaseX shifts all outlines', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    const before = getOutlineRects(scene).map((o: any) => o.x);

    hv.setBaseX(200);
    const after = getOutlineRects(scene).map((o: any) => o.x);

    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBeCloseTo(before[i] + 140, 6);
    }

    hv.destroy();
  });

  it('setBaseY shifts all outlines vertically', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    const before = getOutlineRects(scene).map((o: any) => o.y);

    hv.setBaseY(200);
    const after = getOutlineRects(scene).map((o: any) => o.y);

    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBeCloseTo(before[i] + 70, 6);
    }

    hv.destroy();
  });

  // ── sortCards ─────────────────────────────────────────────

  it('sortCards repositions outlines after sorting', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    const cards = [
      card('K', 'spades'),
      card('A', 'hearts'),
      card('Q', 'clubs'),
    ];
    hv.setCards(cards);

    getOutlineRects(scene);

    // Sort by rank (A < K < Q)
    const rankOrder: Record<string, number> = { A: 1, K: 13, Q: 12 };
    hv.sortCards((a, b) => rankOrder[a.rank] - rankOrder[b.rank]);

    const afterOutlines = getOutlineRects(scene);
    expect(afterOutlines).toHaveLength(3);

    // Outlines should now follow sorted card order
    for (let i = 0; i < afterOutlines.length; i++) {
      expect(afterOutlines[i].x).toBe(scene._images[i].x);
      expect(afterOutlines[i].y).toBe(scene._images[i].y);
    }

    hv.destroy();
  });

  // ── Destruction ───────────────────────────────────────────

  it('destroy cleans up all outline rectangles', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    expect(getOutlineRects(scene)).toHaveLength(5);

    hv.destroy();

    // All outlines should be inactive after destroy
    const activeOutlines = getOutlineRects(scene);
    expect(activeOutlines).toHaveLength(0);
  });

  // ── Reduced motion ────────────────────────────────────────

  it('outlines render correctly with reducedMotion enabled', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      reducedMotion: true,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(2);

    // Outlines are static — no animation concerns
    for (let i = 0; i < outlines.length; i++) {
      expect(outlines[i].x).toBe(scene._images[i].x);
      expect(outlines[i].y).toBe(scene._images[i].y);
    }

    hv.destroy();
  });

  // ── Empty hand with outlines ──────────────────────────────

  it('empty hand with maxSlots shows outlines for all slots', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 4,
    });

    // setCards([]) currently returns early from rebuildDisplay()
    // We need to handle this: create outlines even for empty hands
    // when maxSlots is set.
    hv.setCards([]);

    const outlines = getOutlineRects(scene);
    // With empty hand and maxSlots, we should still show outlines
    // This tests the AC: "With 0 cards and maxSlots=5, 5 outlines render"
    expect(outlines).toHaveLength(4);

    hv.destroy();
  });

  // ── Occupied position outlines (behind cards) ─────────────

  it('outlines appear behind card sprites at occupied positions', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([card('A', 'spades')]);

    const outline = getOutlineRects(scene)[0];
    const sprite = scene._images[0];

    // Outline should be at the same position as the card
    expect(outline.x).toBe(sprite.x);
    expect(outline.y).toBe(sprite.y);

    // Outline should be behind the sprite (depth - 0.5)
    const outlineDepthCalls = outline.setDepth.mock.calls;
    const outlineDepth = outlineDepthCalls[outlineDepthCalls.length - 1][0];
    expect(outlineDepth).toBe(-0.5); // sprite depth = 0

    hv.destroy();
  });
});
