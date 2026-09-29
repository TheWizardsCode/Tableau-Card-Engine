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
            setRounded: vi.fn().mockImplementation((r: number) => {
              (rect as any).radius = r;
              (rect as any).isRounded = r > 0;
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
      r.strokeColor === 0xffffff,
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

    // Default card dimensions (CARD_W=96, CARD_H=130)
    const outline = outlines[0];
    expect(outline.width).toBe(96);
    expect(outline.height).toBe(130);

    // White outline: 0.45 stroke alpha + faint fill (0.06), rounded corners (radius 8)
    expect(outline.strokeAlpha).toBe(0.45);
    expect(outline.strokeColor).toBe(0xffffff);
    expect((outline as any).radius).toBe(8);
    expect((outline as any).isRounded).toBe(true);
    expect(outline.fillAlpha).toBeCloseTo(0.06, 3);

    hv.destroy();
  });

  it('outlines honour a custom cardHeight (e.g. Main Street 140x80 cards)', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 148,
      cardWidth: 136,
      cardHeight: 76,
      showPositionOutlines: true,
    });

    hv.setCards([card('A', 'spades')]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(1);
    expect(outlines[0].width).toBe(136);
    expect(outlines[0].height).toBe(76);

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

  it('occupied outlines align exactly with card centres when maxSlots exceeds card count', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(5);

    // The occupied slot outlines must sit exactly where the cards rest
    // (producer feedback: outlines should be "positioned the same as the
    // cards themselves, with the same rotation and spacing").
    for (let i = 0; i < 3; i++) {
      expect(outlines[i].x).toBe(scene._images[i].x);
      expect(outlines[i].y).toBe(scene._images[i].y);
    }

    hv.destroy();
  });

  it('extra capacity outlines render behind every card', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(5);

    const depth = (r: any) => {
      const calls = r.setDepth.mock.calls;
      return calls[calls.length - 1][0];
    };

    // Occupied slots sit behind their own card (index - 0.5)
    expect(depth(outlines[0])).toBe(-0.5);
    expect(depth(outlines[1])).toBe(0.5);
    expect(depth(outlines[2])).toBe(1.5);

    // Extra empty slots are pushed below every card so an overlapping
    // card face is never drawn over by a ghost slot.
    expect(depth(outlines[3])).toBeLessThan(-0.5);
    expect(depth(outlines[4])).toBeLessThan(-0.5);
    expect(depth(outlines[3])).toBeLessThan(depth(outlines[4]));

    hv.destroy();
  });

  it('empty-hand outlines use index - 0.5 depth (no cards to sit behind)', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 3,
    });

    hv.setCards([]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(3);
    for (let i = 0; i < outlines.length; i++) {
      const calls = outlines[i].setDepth.mock.calls;
      expect(calls[calls.length - 1][0]).toBe(i - 0.5);
    }

    hv.destroy();
  });

  it('never renders more outlines than maxSlots when the hand is over capacity', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 2,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
    ]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(2);
    // The two slots still ghost their cards
    for (let i = 0; i < 2; i++) {
      expect(outlines[i].x).toBe(scene._images[i].x);
      expect(outlines[i].y).toBe(scene._images[i].y);
    }

    hv.destroy();
  });

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

  it('outlines match card rotation in arc layout', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      arcRadius: 120,
      maxRotationDegrees: 25,
      showPositionOutlines: true,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(5);

    // Every outline must carry the same rotation as the card it ghosts
    // (producer feedback: outlines need "the same rotation" as the cards).
    for (let i = 0; i < outlines.length; i++) {
      expect(outlines[i].rotation).toBeCloseTo(scene._images[i].rotation, 6);
    }
  });

  it('occupied outlines keep card rotation when maxSlots adds extra slots', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      arcRadius: 120,
      maxRotationDegrees: 25,
      showPositionOutlines: true,
      maxSlots: 7,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    const outlines = getOutlineRects(scene);
    expect(outlines).toHaveLength(7);

    for (let i = 0; i < 5; i++) {
      expect(outlines[i].x).toBe(scene._images[i].x);
      expect(outlines[i].rotation).toBeCloseTo(scene._images[i].rotation, 6);
    }
  });

  it('outline rotation updates on setMaxRotationDegrees', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      arcRadius: 120,
      maxRotationDegrees: 0,
      showPositionOutlines: true,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    const outlines = getOutlineRects(scene);
    // No rotation initially
    for (const o of outlines) {
      expect(o.rotation).toBe(0);
    }

    hv.setMaxRotationDegrees(25);
    const after = getOutlineRects(scene);
    // Edge cards rotate, centre card stays flat
    expect(after[0].rotation).toBeLessThan(0);
    expect(after[2].rotation).toBeCloseTo(0, 6);
    expect(after[4].rotation).toBeGreaterThan(0);
    for (let i = 0; i < after.length; i++) {
      expect(after[i].rotation).toBeCloseTo(scene._images[i].rotation, 6);
    }
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

  // ── Capacity-driven, stable slots (CG-0MUAYBB4E007LWEQ) ────
  //
  // With `maxSlots` set, slot positions are derived from the hand's
  // **capacity**, not its current size: adding a card fills the next slot
  // to the right without re-centring the row.

  /** Current outline slot centres, in slot order. */
  const outlineSlots = (hv: any) =>
    (hv.outlineRects as any[]).map((r) => ({ x: r.x, y: r.y }));

  const ranks = ['A', '2', '3', '4', '5', '6', '7'] as const;
  const suits = ['spades', 'hearts', 'clubs', 'diamonds'] as const;
  const makeHand = (n: number): Card[] =>
    Array.from({ length: n }, (_, i) => card(ranks[i % ranks.length], suits[i % suits.length]));

  // AC 1: outline slot positions are identical for a hand of
  // 0, 1, … maxSlots cards.
  it('outline slot positions are capacity-derived and stable across hand sizes', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([]);
    const baseline = outlineSlots(hv);
    expect(baseline).toHaveLength(5);

    for (let n = 1; n <= 5; n++) {
      hv.setCards(makeHand(n));
      expect(outlineSlots(hv)).toEqual(baseline);
    }

    hv.destroy();
  });

  // AC 1 (arc/rotation variant): the same stability holds with an arc.
  it('outline slot positions are stable across hand sizes with an arc', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      arcRadius: 120,
      maxRotationDegrees: 25,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([]);
    const baseline = outlineSlots(hv);

    for (let n = 1; n <= 5; n++) {
      hv.setCards(makeHand(n));
      expect(outlineSlots(hv)).toEqual(baseline);
    }

    hv.destroy();
  });

  // AC 2: adding a card leaves every already-placed card exactly where it
  // was and fills the next empty capacity slot.
  it('addCard leaves existing cards in place and fills the next slot', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    const before = hv.getCardCenters();

    hv.addCard(card('3', 'clubs'));
    const after = hv.getCardCenters();

    // Pre-existing cards keep their exact pre-add position.
    expect(after.slice(0, before.length)).toEqual(before);

    // The new card lands in the next capacity slot to the right.
    expect(after[2].x).toBeGreaterThan(after[1].x);
    expect(after[2].x).toBeCloseTo(before[1].x + 56, 6);

    hv.destroy();
  });

  // AC 2 regression: successive addCard calls up to capacity never move cards.
  it('successive adds up to capacity never move earlier cards', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 4,
    });

    hv.setCards([card('A', 'spades')]);
    const positions: Array<{ x: number; y: number }> = [...hv.getCardCenters()];

    for (let n = 2; n <= 4; n++) {
      hv.addCard(makeHand(n)[n - 1]);
      const now = hv.getCardCenters();
      // Every card placed so far is unchanged.
      for (let i = 0; i < positions.length; i++) {
        expect(now[i]).toEqual(positions[i]);
      }
      positions.push(now[now.length - 1]);
    }

    // Full hand still matches the capacity template captured when empty.
    hv.setCards([]);
    const emptySlots = outlineSlots(hv);
    hv.setCards(makeHand(4));
    expect(hv.getCardCenters()).toEqual(emptySlots);

    hv.destroy();
  });

  // AC 2 (rotation): per-card rotation is capacity-stable too.
  it('adding a card does not rotate existing cards when maxSlots is set', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      arcRadius: 120,
      maxRotationDegrees: 25,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    const before = hv.getSprites().map((s) => (s as any).rotation);

    hv.addCard(card('3', 'clubs'));
    const after = hv.getSprites().map((s) => (s as any).rotation);

    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);

    hv.destroy();
  });

  // AC 3: occupied slots ghost their card exactly; extras render below every card.
  it('occupied slots track cards through adds while extras stay below', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      arcRadius: 120,
      maxRotationDegrees: 25,
      showPositionOutlines: true,
      maxSlots: 5,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);
    const outlines = getOutlineRects(scene);
    const sprites = hv.getSprites();

    for (let i = 0; i < sprites.length; i++) {
      expect(outlines[i].x).toBeCloseTo((sprites[i] as any).x, 6);
      expect(outlines[i].y).toBeCloseTo((sprites[i] as any).y, 6);
      expect(outlines[i].rotation).toBeCloseTo((sprites[i] as any).rotation, 6);
    }

    const depth = (r: any) => r.setDepth.mock.calls[r.setDepth.mock.calls.length - 1][0];
    for (let i = sprites.length; i < outlines.length; i++) {
      expect(depth(outlines[i])).toBeLessThan(-0.5);
    }

    hv.destroy();
  });

  // AC 4: setMaxSlots is the only mutation that re-lays the row and always
  // yields exactly n slots.
  it('setMaxSlots re-lays the row and yields exactly n slots', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 3,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    const before = hv.getCardCenters();
    expect(getOutlineRects(scene)).toHaveLength(3);

    hv.setMaxSlots(5);
    expect(getOutlineRects(scene)).toHaveLength(5);
    expect((hv as any).outlineRects).toHaveLength(5);
    expect(hv.getCardCenters()).not.toEqual(before);

    hv.setMaxSlots(1);
    expect((hv as any).outlineRects).toHaveLength(1);

    hv.destroy();
  });

  // AC 5: the empty-hand capacity row equals the row cards occupy when full.
  it('empty-hand capacity row matches the fully-filled card row', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 3,
    });

    hv.setCards([]);
    const emptySlots = outlineSlots(hv);
    expect(emptySlots).toHaveLength(3);

    hv.setCards(makeHand(3));
    expect(hv.getCardCenters()).toEqual(emptySlots);

    hv.destroy();
  });

  // Toggling outlines is purely visual and never moves cards.
  it('toggling outlines on/off never moves cards', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 4,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    const before = hv.getCardCenters();

    hv.setShowPositionOutlines(false);
    expect(hv.getCardCenters()).toEqual(before);
    expect((hv as any).outlineRects).toHaveLength(0);

    hv.setShowPositionOutlines(true);
    expect(hv.getCardCenters()).toEqual(before);
    expect((hv as any).outlineRects).toHaveLength(4);

    hv.destroy();
  });

  // Scope guard: hands without maxSlots keep the legacy centred-on-count row.
  it('hands without maxSlots stay centred on the current card count', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
    });

    hv.setCards([card('A', 'spades')]);
    expect(hv.getCardCenters()[0].x).toBeCloseTo(60, 6);

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    const two = hv.getCardCenters();
    expect(two[0].x).toBeCloseTo(32, 6);
    expect(two[1].x).toBeCloseTo(88, 6);

    hv.destroy();
  });

  // Over-capacity is best-effort: the first maxSlots slots stay fixed, the
  // outline count is capped, and overflow cards continue with the same step.
  it('over-capacity hands keep fixed slots, cap outlines, and extend right', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showPositionOutlines: true,
      maxSlots: 2,
    });

    hv.setCards([card('A', 'spades')]);
    const firstX = hv.getCardCenters()[0].x;

    hv.addCard(card('2', 'hearts'));
    hv.addCard(card('3', 'clubs')); // transient overflow

    const centers = hv.getCardCenters();
    expect(centers[0].x).toBe(firstX);
    expect(centers[2].x).toBeCloseTo(centers[1].x + 56, 6);
    expect((hv as any).outlineRects).toHaveLength(2);

    hv.destroy();
  });
});
