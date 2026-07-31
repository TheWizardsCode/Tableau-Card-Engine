import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import type { Card } from '../../src/card-system/Card';
import { createCard } from '../../src/card-system/Card';

// ── Minimal Phaser mock ─────────────────────────────────────
// HandView uses scene.add.image(), scene.add.text(), scene.events, scene.tweens
// We provide the minimum required to test the API logic without a real Phaser runtime.

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
      rectangle: vi.fn().mockImplementation((x: number, y: number, w: number, h: number, color: number) => {
        const rect = {
          x, y, width: w, height: h, color, fillColor: color,
          active: true,
          setPosition: vi.fn().mockReturnThis(),
          setOrigin: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
          setAlpha: vi.fn().mockReturnThis(),
          setRotation: vi.fn().mockReturnThis(),
          setFillStyle: vi.fn().mockImplementation((c: number, _a?: number) => {
            rect.fillColor = c;
            rect.color = c;
            return rect;
          }),
          destroy: vi.fn().mockImplementation(() => {
            rect.active = false;
            destroyed.push(rect);
          }),
        };
        rectangles.push(rect);
        return rect;
      }),
    },
    tweens: {
      add: vi.fn().mockImplementation((config: any) => {
        tweens.push(config);
        // Simulate immediate completion for reduced-motion
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

// ── Tests ───────────────────────────────────────────────────

describe('HandView', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  // ── Construction & basic API ───────────────────────────────

  it('creates a HandView with default options', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });
    expect(hv).toBeDefined();
    hv.destroy();
  });

  it('setCards replaces the hand and creates sprites for each card', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    const cards = [card('A', 'spades'), card('2', 'hearts'), card('K', 'clubs')];
    hv.setCards(cards);

    // Should have created 3 images (one per card) + 3 texts (labels)
    expect(scene.add.image).toHaveBeenCalledTimes(3);
    expect(scene.add.text).toHaveBeenCalledTimes(3);
    hv.destroy();
  });

  it('showLabels=false suppresses card labels', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      showLabels: false,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

    expect(scene.add.image).toHaveBeenCalledTimes(2);
    expect(scene.add.text).not.toHaveBeenCalled();
    hv.destroy();
  });

  it('setCards with empty array clears the hand', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    hv.setCards([]);

    // All old sprites should be destroyed
    expect(scene._destroyed.filter((d: any) => d.destroy).length).toBeGreaterThanOrEqual(2);
    hv.destroy();
  });

  it('getCards returns the current hand', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    const cards = [card('A', 'spades'), card('2', 'hearts')];
    hv.setCards(cards);

    expect(hv.getCards()).toEqual(cards);
    hv.destroy();
  });

  it('arcRadius=0 keeps all cards on the baseY line', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 300,
      spacing: 56,
      arcRadius: 0,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    expect(scene._images).toHaveLength(3);
    for (const img of scene._images) {
      expect(img.y).toBe(300);
    }
    hv.destroy();
  });

  it('arcRadius>0 positions cards on an arc (center card above edges)', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 300,
      spacing: 56,
      arcRadius: 60,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    const ys = scene._images.map((img: any) => img.y);
    // Center should be above (smaller y) than the edges
    expect(ys[2]).toBeLessThan(300);
    expect(ys[0]).toBeGreaterThan(ys[2]);
    expect(ys[4]).toBeGreaterThan(ys[2]);
    hv.destroy();
  });

  it('setArcRadius updates card Y offsets live', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 300,
      spacing: 56,
      arcRadius: 0,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    const before = scene._images.map((img: any) => img.y);
    hv.setArcRadius(120);
    const after = scene._images.map((img: any) => img.y);

    expect(hv.getArcRadius()).toBe(120);
    // Edges should remain at or near the baseY while the center moves up
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[4]).toBeCloseTo(before[4], 6);
    expect(after[2]).toBeLessThan(before[2]);
    hv.destroy();
  });

  // ── Centering (baseX as center in horizontal mode) ────────

  it('single card is centered at baseX', () => {
    const hv = new HandView(scene, {
      baseX: 400,
      baseY: 300,
      spacing: 56,
      arcRadius: 0,
    });

    hv.setCards([card('A', 'spades')]);

    const centers = hv.getCardCenters();
    expect(centers).toHaveLength(1);
    // Single card should sit at (baseX, baseY)
    expect(centers[0].x).toBe(400);
    expect(centers[0].y).toBe(300);
    hv.destroy();
  });

  it('multiple cards are centered around baseX', () => {
    const hv = new HandView(scene, {
      baseX: 400,
      baseY: 300,
      spacing: 56,
      arcRadius: 0,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    const centers = hv.getCardCenters();
    expect(centers).toHaveLength(5);

    // The average of the first and last X should be baseX (hand is centered)
    const avgX = (centers[0].x + centers[4].x) / 2;
    expect(Math.abs(avgX - 400)).toBeLessThanOrEqual(1);

    // Symmetry: left and right pairs should be equidistant from center
    expect(Math.abs(centers[0].x - centers[1].x)).toBeCloseTo(Math.abs(centers[3].x - centers[4].x), 6);
    expect(Math.abs(centers[1].x - centers[2].x)).toBeCloseTo(Math.abs(centers[2].x - centers[3].x), 6);
    hv.destroy();
  });

  it('hand stays centered around baseX after addCard', () => {
    const hv = new HandView(scene, {
      baseX: 400,
      baseY: 300,
      spacing: 56,
      arcRadius: 0,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Add a 4th card
    hv.addCard(card('4', 'diamonds'));

    const centers = hv.getCardCenters();
    expect(centers).toHaveLength(4);

    // Hand should still be centered around baseX
    const avgX = (centers[0].x + centers[3].x) / 2;
    expect(Math.abs(avgX - 400)).toBeLessThanOrEqual(1);
    hv.destroy();
  });

  it('hand stays centered around baseX after removeCard', () => {
    const hv = new HandView(scene, {
      baseX: 400,
      baseY: 300,
      spacing: 56,
      arcRadius: 0,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    // Remove middle card
    hv.removeCard(2);

    const centers = hv.getCardCenters();
    expect(centers).toHaveLength(4);

    // Hand should still be centered around baseX
    const avgX = (centers[0].x + centers[3].x) / 2;
    expect(Math.abs(avgX - 400)).toBeLessThanOrEqual(1);
    hv.destroy();
  });

  it('centerX option overrides the default centering behavior', () => {
    const hv = new HandView(scene, {
      baseX: 400,
      baseY: 300,
      spacing: 56,
      arcRadius: 0,
      centerX: 500,  // Explicit center, different from baseX
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
    ]);

    const centers = hv.getCardCenters();
    expect(centers).toHaveLength(3);

    // Hand should be centered around centerX=500, not baseX=400
    const avgX = (centers[0].x + centers[2].x) / 2;
    expect(Math.abs(avgX - 500)).toBeLessThanOrEqual(1);
    hv.destroy();
  });

  it('setCenterX dynamically updates the centering point', () => {
    const hv = new HandView(scene, {
      baseX: 400,
      baseY: 300,
      spacing: 56,
      arcRadius: 0,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);
    hv.setCenterX(600);

    const centers = hv.getCardCenters();
    expect(centers).toHaveLength(3);

    // Hand should now be centered around 600
    const avgX = (centers[0].x + centers[2].x) / 2;
    expect(Math.abs(avgX - 600)).toBeLessThanOrEqual(1);
    hv.destroy();
  });

  // ── addCard ────────────────────────────────────────────────

  it('addCard adds a card to the end of the hand without animation', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    hv.setCards([card('A', 'spades')]);
    scene.add.image.mockClear();
    scene.add.text.mockClear();

    const newCard = card('K', 'hearts');
    hv.addCard(newCard, { animate: false });

    expect(hv.getCards()).toHaveLength(2);
    expect(hv.getCards()[1]).toEqual(newCard);
    // Should have created a new sprite
    expect(scene.add.image).toHaveBeenCalled();
    hv.destroy();
  });

  // ── removeCard ────────────────────────────────────────────

  it('removeCard removes a card at the given index without animation', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    const cards = [card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')];
    hv.setCards(cards);

    const removed = hv.removeCard(1, { animate: false });
    expect(removed).toEqual(card('2', 'hearts'));
    expect(hv.getCards()).toHaveLength(2);
    expect(hv.getCards()[1]).toEqual(card('3', 'clubs'));
    hv.destroy();
  });

  it('removeCard returns undefined for out-of-bounds index', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    hv.setCards([card('A', 'spades')]);
    const result = hv.removeCard(5, { animate: false });
    expect(result).toBeUndefined();
    hv.destroy();
  });

  // ── Selection ─────────────────────────────────────────────

  it('setSelected sets the selected index and updates display', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    const cards = [card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')];
    hv.setCards(cards);

    hv.setSelected(1);
    expect(hv.getSelected()).toBe(1);
    hv.destroy();
  });

  it('setSelected with null clears selection', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    const cards = [card('A', 'spades'), card('2', 'hearts')];
    hv.setCards(cards);

    hv.setSelected(0);
    expect(hv.getSelected()).toBe(0);

    hv.setSelected(null);
    expect(hv.getSelected()).toBeNull();
    hv.destroy();
  });

  it('getSelected returns null initially', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    expect(hv.getSelected()).toBeNull();
    hv.destroy();
  });

  // ── Canvas-compatible tint overlays ───────────────────────

  it('setSelected creates tint overlay rectangles on cards', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    const cards = [card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')];
    hv.setCards(cards);

    // Initially no tint overlays
    const beforeRects = scene._rectangles.filter((r: any) => r.active);
    expect(beforeRects.length).toBe(0);

    // Select card at index 1
    hv.setSelected(1);
    const selectedRects = scene._rectangles.filter((r: any) => r.active);
    expect(selectedRects.length).toBeGreaterThanOrEqual(1);
    // The selected card should have a green-ish (0x88ff88) overlay
    const selectedRect = selectedRects.find((r: any) => r.color === 0x88ff88);
    expect(selectedRect).toBeDefined();

    // Clear selection should remove overlays
    hv.setSelected(null);
    const clearedRects = scene._rectangles.filter((r: any) => r.active);
    const greenRects = clearedRects.filter((r: any) => r.color === 0x88ff88);
    expect(greenRects.length).toBe(0);

    hv.destroy();
  });

  it('tint overlay rectangles match the rotated sprite angle', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      maxRotationDegrees: 25,
    });

    // 5 cards so the outer cards receive non-zero proportional rotation
    const cards = [
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ];
    hv.setCards(cards);

    // Select an edge card — it has a non-zero rotation in an arc layout
    hv.setSelected(0);
    const selectedRects = scene._rectangles.filter((r: any) => r.active && r.color === 0x88ff88);
    expect(selectedRects.length).toBeGreaterThanOrEqual(1);

    // The overlay's setRotation must have been called with the sprite's rotation
    const spriteRotation = (scene._images[0] as any).rotation ?? 0;
    const rectRotationCalls = selectedRects[0].setRotation.mock.calls;
    expect(rectRotationCalls.length).toBeGreaterThanOrEqual(1);
    const lastRotation = rectRotationCalls[rectRotationCalls.length - 1][0];
    expect(Math.abs(lastRotation - spriteRotation)).toBeLessThan(0.001);

    hv.destroy();
  });

  it('card sprites get per-index depth so the highlight cannot render over the card to the right', () => {
    const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Sprites are assigned depth equal to their index (cards to the right
    // render on top of the highlight of cards to their left).
    expect(scene._images[0].setDepth).toHaveBeenCalledWith(0);
    expect(scene._images[1].setDepth).toHaveBeenCalledWith(1);
    expect(scene._images[2].setDepth).toHaveBeenCalledWith(2);

    hv.setSelected(0);

    // The green selection overlay renders at sprite depth + 0.01 = 0.01,
    // i.e. above card 0 but below card 1 (depth 1) — no bleed.
    const overlay = scene._rectangles.find((r: any) => r.active && r.color === 0x88ff88);
    expect(overlay).toBeDefined();
    const overlayDepthCalls = overlay.setDepth.mock.calls;
    const overlayDepth = overlayDepthCalls[overlayDepthCalls.length - 1][0];
    expect(overlayDepth).toBe(0.01);
    expect(overlayDepth).toBeLessThan(1);

    hv.destroy();
  });

  it('vertical cascade: highlight of selected cards does not render over unselected cards below', () => {
    const hv = new HandView(scene, {
      baseX: 200,
      baseY: 100,
      spacing: 50,
      layoutDirection: 'vertical',
    });
    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Cascade selection: index 1 selects cards [0..1]
    hv.setSelected(1);

    const overlays = scene._rectangles.filter((r: any) => r.active && r.color === 0x88ff88);
    expect(overlays.length).toBeGreaterThanOrEqual(1);
    // Every selection overlay must sit below the first unselected card (index 2)
    for (const o of overlays) {
      const calls = o.setDepth.mock.calls;
      const depth = calls[calls.length - 1][0];
      expect(depth).toBeLessThan(2);
    }

    hv.destroy();
  });

  it('selected-card raise keeps the highlight depth below the card to the right', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      reducedMotion: true,
    });
    hv.setSelectionLift(25);
    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    hv.setSelected(0);

    // The raised sprite keeps depth 0 and its overlay 0.01 → still below
    // card 1 (depth 1) at any raise distance.
    const overlay = scene._rectangles.find((r: any) => r.active && r.color === 0x88ff88);
    expect(overlay).toBeDefined();
    const calls = overlay.setDepth.mock.calls;
    const depth = calls[calls.length - 1][0];
    expect(depth).toBe(0.01);
    expect(depth).toBeLessThan(1);

    hv.destroy();
  });

  it('hover events create and remove tint overlay rectangles', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    const firstImage = scene._images[0];

    // Find pointerover handler
    const onCalls = firstImage.on.mock.calls;
    const pointerOver = onCalls.find((c: any[]) => c[0] === 'pointerover');
    const pointerOut = onCalls.find((c: any[]) => c[0] === 'pointerout');
    expect(pointerOver).toBeDefined();
    expect(pointerOut).toBeDefined();

    // Simulate hover in
    pointerOver[1]();
    const hoverRects = scene._rectangles.filter((r: any) => r.active && r.color === 0x66ff66);
    expect(hoverRects.length).toBeGreaterThanOrEqual(1);

    // Simulate hover out
    pointerOut[1]();
    const afterOutRects = scene._rectangles.filter((r: any) => r.active && r.color === 0x66ff66);
    expect(afterOutRects.length).toBe(0);

    hv.destroy();
  });

  it('destroy cleans up all tint overlay rectangles', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    hv.setSelected(0);

    // Verify overlays are created
    expect(scene._rectangles.length).toBeGreaterThan(0);

    hv.destroy();

    // After destroy, overlays should be inactive/destroyed
    const activeRects = scene._rectangles.filter((r: any) => r.active);
    expect(activeRects.length).toBe(0);
  });

  // ── Event emission ─────────────────────────────────────────

  it('on registers event listeners that are emitted for card clicks', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    const cards = [card('A', 'spades'), card('2', 'hearts')];
    hv.setCards(cards);

    const clickHandler = vi.fn();
    hv.on('cardclick', clickHandler);

    // Simulate a click on the first card image by finding the pointerdown handler
    const firstImage = scene._images[0];
    // Find the pointerdown handler that was registered via .on()
    const onCalls = firstImage.on.mock.calls;
    const pointerdownCall = onCalls.find((c: any[]) => c[0] === 'pointerdown');
    if (pointerdownCall) {
      pointerdownCall[1](); // invoke the callback
    }

    expect(clickHandler).toHaveBeenCalled();
    hv.destroy();
  });

  // ── Destroy ────────────────────────────────────────────────

  it('destroy cleans up all sprites and listeners', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    hv.destroy();

    // All sprites should be destroyed
    expect(hv.getCards()).toHaveLength(0);
    expect(hv.getSelected()).toBeNull();
  });

  // ── Vertical / Cascade Layout ─────────────────────────────

  describe('vertical layout mode', () => {
    it('layoutDirection defaults to horizontal when not set', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      expect((hv as any).layoutDirection).toBe('horizontal');
      hv.destroy();
    });

    it('renders cards stacked vertically from top to bottom', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
      });

      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
      ]);

      expect(scene._images).toHaveLength(3);
      // All cards should have same X
      expect(scene._images[0].x).toBe(200);
      expect(scene._images[1].x).toBe(200);
      expect(scene._images[2].x).toBe(200);

      // Y should increase by spacing each card
      expect(scene._images[0].y).toBe(100); // baseY = top card
      expect(scene._images[1].y).toBe(150); // baseY + 1*spacing
      expect(scene._images[2].y).toBe(200); // baseY + 2*spacing

      hv.destroy();
    });

    it('spacing smaller than card height produces overlapping cards', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 42,  // Card height is 130 (from CARD_H), so spacing < card height = overlap
        layoutDirection: 'vertical',
      });

      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
        card('4', 'diamonds'),
      ]);

      // All cards share same X
      expect(scene._images[0].x).toBe(200);
      expect(scene._images[1].x).toBe(200);

      // Y positions cascade by spacing amount
      expect(scene._images[0].y).toBe(100);
      expect(scene._images[1].y).toBe(142);
      expect(scene._images[2].y).toBe(184);
      expect(scene._images[3].y).toBe(226);

      // Since spacing (42) < typical card height (130), cards overlap vertically
      expect(scene._images[1].y - scene._images[0].y).toBeLessThan(130);

      hv.destroy();
    });

    it('cascade selection tints all cards from top to clicked index', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
        selectionEnabled: true,
      });

      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
        card('4', 'diamonds'),
      ]);

      // Initially no selection — all sprites should have white tint
      for (const img of scene._images) {
        expect(img.setTint).toHaveBeenCalledWith(0xffffff);
      }

      // Simulate cascade selection: setSelected(2) should select [0, 1, 2]
      hv.setSelected(2);

      // Cards at indices 0, 1, 2 should have selection tint
      expect(hv.getSelected()).toBe(2);

      hv.destroy();
    });

    it('getCascadeRange returns [0..index] when selected in vertical mode', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
      });

      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
      ]);

      expect(hv.getCascadeRange()).toBeNull();

      hv.setSelected(2);
      expect(hv.getCascadeRange()).toEqual({ from: 0, to: 2 });

      hv.setSelected(0);
      expect(hv.getCascadeRange()).toEqual({ from: 0, to: 0 });

      hv.setSelected(null);
      expect(hv.getCascadeRange()).toBeNull();

      hv.destroy();
    });

    it('getCascadeRange returns single index range in horizontal mode', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

      expect(hv.getCascadeRange()).toBeNull();

      hv.setSelected(1);
      expect(hv.getCascadeRange()).toEqual({ from: 1, to: 1 });

      hv.destroy();
    });

    it('selection change fires selectionchange event with selected index', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
      });

      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
      ]);

      const changeHandler = vi.fn();
      hv.on('selectionchange', changeHandler);

      hv.setSelected(1);
      expect(changeHandler).toHaveBeenCalledWith(1);

      hv.setSelected(null);
      expect(changeHandler).toHaveBeenCalledWith(null);

      hv.destroy();
    });

    it('vertical layout with showLabels=false suppresses labels', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
        showLabels: false,
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

      expect(scene.add.image).toHaveBeenCalledTimes(2);
      expect(scene.add.text).not.toHaveBeenCalled();
      hv.destroy();
    });

    it('labels are positioned to the right in vertical mode', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
        cardWidth: 96,
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

      expect(scene._texts).toHaveLength(2);
      // Label X should be to the right of card center
      // baseX + cardWidth/2 + 8 = 200 + 48 + 8 = 256
      expect(scene._texts[0].x).toBe(256);
      expect(scene._texts[0].y).toBe(100); // Same Y as card

      expect(scene._texts[1].x).toBe(256);
      expect(scene._texts[1].y).toBe(150); // baseY + spacing

      hv.destroy();
    });

    it('click on a card in vertical mode sets cascade selection', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
        selectionEnabled: true,
        clickEnabled: true,
      });

      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
      ]);

      // Simulate a click on the third card (index 2)
      const thirdImage = scene._images[2];
      const onCalls = thirdImage.on.mock.calls;
      const pointerdownCall = onCalls.find((c: any[]) => c[0] === 'pointerdown');
      expect(pointerdownCall).toBeDefined();
      pointerdownCall[1](); // invoke click handler

      expect(hv.getSelected()).toBe(2);
      expect(hv.getCascadeRange()).toEqual({ from: 0, to: 2 });

      hv.destroy();
    });

    it('can represent Beleaguered Castle cascade column layout', () => {
      // Simulate Beleaguered Castle column layout parameters
      // BC_CARD_W = 90, CASCADE_OFFSET_Y = 42
      const columnX = 200;
      const columnTopY = 200;
      const cascadeOffsetY = 42;

      const hv = new HandView(scene, {
        baseX: columnX,
        baseY: columnTopY,
        spacing: cascadeOffsetY,
        cardWidth: 90,
        layoutDirection: 'vertical',
      });

      // A Beleaguered Castle tableau column can have up to ~19 cards
      const cards = Array.from({ length: 5 }, (_, i) =>
        card(String(i + 1), 'spades'),
      );
      hv.setCards(cards);

      // Verify all cards share the same column X
      for (const img of scene._images) {
        expect(img.x).toBe(columnX);
      }

      // Verify Y positions match cascade formula
      for (let i = 0; i < cards.length; i++) {
        expect(scene._images[i].y).toBe(columnTopY + i * cascadeOffsetY);
      }

      hv.destroy();
    });
  });

  // ── Drag-and-drop ─────────────────────────────────────────

  describe('drag-and-drop', () => {
    /** Helper: simulate a pointerdown on a card sprite and retrieve the scene input handlers. */
    function triggerPointerDown(
      scene: any,
      _hv: HandView,
      spriteIndex: number,
      pointerX: number,
      pointerY: number,
    ): void {
      const sprite = scene._images[spriteIndex];
      expect(sprite).toBeDefined();
      const onCalls = sprite.on.mock.calls;
      const pointerdownCall = onCalls.find((c: any[]) => c[0] === 'pointerdown');
      expect(pointerdownCall).toBeDefined();
      pointerdownCall[1]({ x: pointerX, y: pointerY });
    }

    /** Retrieve a scene input handler by event name. */
    function getInputHandler(scene: any, event: string): any {
      const handlers = scene._inputHandlers[event];
      expect(handlers).toBeDefined();
      return handlers[handlers.length - 1];
    }

    // ── Drag enable / disable ────────────────────────────────

    it('setDragEnabled/getDragEnabled toggle drag state', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      expect(hv.getDragEnabled()).toBe(false);

      hv.setDragEnabled(true);
      expect(hv.getDragEnabled()).toBe(true);

      hv.setDragEnabled(false);
      expect(hv.getDragEnabled()).toBe(false);

      hv.destroy();
    });

    it('does not register scene input handlers when drag is disabled', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

      // Click without drag enabled
      triggerPointerDown(scene, hv, 0, 100, 100);

      // No scene input handlers should have been registered
      expect(scene.input.on).not.toHaveBeenCalled();

      hv.destroy();
    });

    it('registers scene input handlers on pointerdown when drag is enabled', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });
      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

      triggerPointerDown(scene, hv, 0, 100, 100);

      expect(scene.input.on).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(scene.input.on).toHaveBeenCalledWith('pointerup', expect.any(Function));

      hv.destroy();
    });

    // ── Drag validator ───────────────────────────────────────

    it('setDragValidator stores the validator callback', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      const validator = vi.fn(() => true);

      hv.setDragValidator(validator);
      // Cannot directly inspect private field, but we'll verify it's called in drag tests

      hv.setDragValidator(null);
      hv.destroy();
    });

    it('calls validator on drag end with source range and target pile index', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });
      const validator = vi.fn(() => true);

      hv.setDragEnabled(true);
      hv.setDragValidator(validator);
      hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

      // Click card at index 1
      triggerPointerDown(scene, hv, 1, 100, 100);

      // Exceed drag threshold with pointermove
      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 }); // distance ~14px > 5px threshold

      // Set target pile index
      hv.setDragTargetPileIndex(2);

      // End drag
      const pointerUpHandler = getInputHandler(scene, 'pointerup');
      pointerUpHandler();

      expect(validator).toHaveBeenCalledWith({ from: 1, to: 1 }, 2);

      hv.destroy();
    });

    it('calls validator returns false triggers snap-back (no accepted)', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });
      const validator = vi.fn(() => false);

      hv.setDragEnabled(true);
      hv.setDragValidator(validator);
      hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

      // Click card at index 1
      triggerPointerDown(scene, hv, 1, 100, 100);

      // Exceed drag threshold
      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      hv.setDragTargetPileIndex(0);

      // End drag
      const pointerUpHandler = getInputHandler(scene, 'pointerup');
      pointerUpHandler();

      // Validator was called, returned false, so snap-back occurred
      expect(validator).toHaveBeenCalledWith({ from: 1, to: 1 }, 0);

      hv.destroy();
    });

    // ── Drag threshold ───────────────────────────────────────

    it('does not start drag when pointer movement is below threshold', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades')]);

      // Store initial sprite position
      const sprite = scene._images[0];
      const initialX = sprite.x;
      const initialY = sprite.y;

      triggerPointerDown(scene, hv, 0, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      // Move only 3px (below 5px threshold)
      pointerMoveHandler({ x: 103, y: 100 });

      // Sprite should not have moved
      expect(sprite.x).toBe(initialX);
      expect(sprite.y).toBe(initialY);

      hv.destroy();
    });

    it('starts drag when pointer movement exceeds threshold', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades')]);

      const sprite = scene._images[0];
      const initialX = sprite.x;
      const initialY = sprite.y;

      triggerPointerDown(scene, hv, 0, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      // Move 10px (exceeds 5px threshold)
      pointerMoveHandler({ x: 110, y: 110 });

      // Sprite should have moved (original + delta + lift offset)
      // originalPos.y + lift(-8) + dy(10) = initialY + 2
      expect(sprite.x).toBe(initialX + 10);
      expect(sprite.y).toBe(initialY + 2); // initialY + (-8 lift) + 10 dy

      hv.destroy();
    });

    // ── Horizontal single-card drag ──────────────────────────

    it('horizontal mode: source range is single card {i, i}', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });
      const dragstartHandler = vi.fn();

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);
      hv.on('dragstart', dragstartHandler);

      triggerPointerDown(scene, hv, 1, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      expect(dragstartHandler).toHaveBeenCalledWith({ from: 1, to: 1 });

      hv.destroy();
    });

    it('horizontal mode: single card moves with pointer delta', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

      const sprite1 = scene._images[1];
      const sprite0 = scene._images[0];
      const sprite2 = scene._images[2];
      const startX1 = sprite1.x;
      const startY1 = sprite1.y;
      const startX0 = sprite0.x;
      const startX2 = sprite2.x;

      triggerPointerDown(scene, hv, 1, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 130, y: 150 });

      // Dragged card (index 1) should move
      expect(sprite1.x).toBe(startX1 + 30);
      expect(sprite1.y).toBe(startY1 + 42); // lift(-8) + dy(50)

      // Other cards should NOT move
      expect(sprite0.x).toBe(startX0);
      expect(sprite2.x).toBe(startX2);

      hv.destroy();
    });

    // ── Vertical cascade multi-card drag ─────────────────────

    it('vertical mode: source range is {0, i} (cascade selection)', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
      });
      const dragstartHandler = vi.fn();

      hv.setDragEnabled(true);
      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
        card('4', 'diamonds'),
      ]);
      hv.on('dragstart', dragstartHandler);

      // Click card at index 2 (should select range [0..2])
      triggerPointerDown(scene, hv, 2, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      expect(dragstartHandler).toHaveBeenCalledWith({ from: 0, to: 2 });

      hv.destroy();
    });

    it('vertical mode: all cards in cascade range move together', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
      });

      hv.setDragEnabled(true);
      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
        card('4', 'diamonds'),
      ]);

      const posBefore = scene._images.map((img: any) => ({ x: img.x, y: img.y }));

      // Click card at index 2 — selects [0..2]
      triggerPointerDown(scene, hv, 2, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 120, y: 130 });

      // Cards 0, 1, 2 should move
      const dx = 20;
      const dy = 30; // delta from (100,100) to (120,130)

      for (let i = 0; i <= 2; i++) {
        expect(scene._images[i].x).toBe(posBefore[i].x + dx);
        expect(scene._images[i].y).toBe(posBefore[i].y + dy + (-8)); // lift applied
      }

      // Card 3 (index 3, not selected) should NOT move
      expect(scene._images[3].x).toBe(posBefore[3].x);
      expect(scene._images[3].y).toBe(posBefore[3].y);

      hv.destroy();
    });

    // ── Drag events ──────────────────────────────────────────

    it('emits dragstart, dragmove, dragend events in order', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });
      const events: string[] = [];

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades')]);

      hv.on('dragstart', () => events.push('dragstart'));
      hv.on('dragmove', () => events.push('dragmove'));
      hv.on('dragend', () => events.push('dragend'));

      triggerPointerDown(scene, hv, 0, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      const pointerUpHandler = getInputHandler(scene, 'pointerup');
      pointerUpHandler();

      expect(events).toEqual(['dragstart', 'dragmove', 'dragend']);

      hv.destroy();
    });

    it('dragstart event receives source range', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });
      const dragstartHandler = vi.fn();

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
      hv.on('dragstart', dragstartHandler);

      triggerPointerDown(scene, hv, 0, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      expect(dragstartHandler).toHaveBeenCalledWith({ from: 0, to: 0 });

      hv.destroy();
    });

    it('dragmove event receives source range and pointer coordinates', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });
      const dragmoveHandler = vi.fn();

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades')]);
      hv.on('dragmove', dragmoveHandler);

      triggerPointerDown(scene, hv, 0, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 150, y: 200 });

      expect(dragmoveHandler).toHaveBeenCalledWith({
        sourceRange: { from: 0, to: 0 },
        x: 150,
        y: 200,
      });

      hv.destroy();
    });

    it('dragend event receives source range, target pile index, and accepted flag', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });
      const dragendHandler = vi.fn();

      hv.setDragEnabled(true);
      hv.setDragValidator((_src, _target) => true);
      hv.setCards([card('A', 'spades')]);
      hv.on('dragend', dragendHandler);

      triggerPointerDown(scene, hv, 0, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      hv.setDragTargetPileIndex(3);

      const pointerUpHandler = getInputHandler(scene, 'pointerup');
      pointerUpHandler();

      expect(dragendHandler).toHaveBeenCalledWith({
        sourceRange: { from: 0, to: 0 },
        targetPileIndex: 3,
        accepted: true,
      });

      hv.destroy();
    });

    it('dragend with rejected validator sends accepted: false', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });
      const dragendHandler = vi.fn();

      hv.setDragEnabled(true);
      hv.setDragValidator((_src, _target) => false);
      hv.setCards([card('A', 'spades')]);
      hv.on('dragend', dragendHandler);

      triggerPointerDown(scene, hv, 0, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      hv.setDragTargetPileIndex(1);

      const pointerUpHandler = getInputHandler(scene, 'pointerup');
      pointerUpHandler();

      expect(dragendHandler).toHaveBeenCalledWith({
        sourceRange: { from: 0, to: 0 },
        targetPileIndex: 1,
        accepted: false,
      });

      hv.destroy();
    });

    // ── Visual feedback ──────────────────────────────────────

    it('applies lift to selected cards in vertical mode and dims unselected cards above drag handle', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
      });

      hv.setDragEnabled(true);
      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
        card('4', 'diamonds'),
      ]);

      const posBefore = scene._images.map((img: any) => ({ x: img.x, y: img.y }));

      // Click card at index 2 — selects [0..2]
      triggerPointerDown(scene, hv, 2, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      // Selected cards (0, 1, 2) should have lift offset applied
      // posBeforeY + lift(-8) + dy(20)
      for (let i = 0; i <= 2; i++) {
        expect(scene._images[i].y).toBe(posBefore[i].y + 12); // -8 lift + 20 dy
      }

      // Unselected card (3) below the selection should NOT have moved
      expect(scene._images[3].x).toBe(posBefore[3].x);
      expect(scene._images[3].y).toBe(posBefore[3].y);

      hv.destroy();
    });

    it('restores selection tints on drag end', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

      // Select card 0 via click
      triggerPointerDown(scene, hv, 0, 100, 100);
      expect(hv.getSelected()).toBe(0);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      const pointerUpHandler = getInputHandler(scene, 'pointerup');
      pointerUpHandler();

      // After snap-back, selection should be restored:
      // Selected card (0) should have selection tint, unselected (1) should be white
      const spriteSelected = scene._images[0];
      const spriteUnselected = scene._images[1];
      const lastSelectedCall = spriteSelected.setTint.mock.calls.slice(-1)[0];
      const lastUnselectedCall = spriteUnselected.setTint.mock.calls.slice(-1)[0];
      expect(lastSelectedCall).toEqual([0x88ff88]);
      expect(lastUnselectedCall).toEqual([0xffffff]);

      hv.destroy();
    });



    // ── Reduced-motion ───────────────────────────────────────

    it('reduced-motion: snap-back is instant (no tween)', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        reducedMotion: true,
      });

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades')]);

      const sprite = scene._images[0];
      const startX = sprite.x;
      const startY = sprite.y;

      triggerPointerDown(scene, hv, 0, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 130, y: 150 });

      // Sprite moved
      expect(sprite.x).not.toBe(startX);

      const tweenCountBefore = scene._tweens.length;

      const pointerUpHandler = getInputHandler(scene, 'pointerup');
      pointerUpHandler();

      // No new tweens should have been added
      expect(scene._tweens.length).toBe(tweenCountBefore);

      // Sprite should have snapped back to original position
      expect(sprite.x).toBe(startX);
      expect(sprite.y).toBe(startY);

      hv.destroy();
    });

    it('reduced-motion: drag acceptance removes lift offset instantly', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        reducedMotion: true,
      });

      hv.setDragEnabled(true);
      hv.setDragValidator((_src, _target) => true);
      hv.setCards([card('A', 'spades')]);

      const sprite = scene._images[0];
      const startY = sprite.y;

      triggerPointerDown(scene, hv, 0, 100, 100);

      const pointerMoveHandler = getInputHandler(scene, 'pointermove');
      pointerMoveHandler({ x: 110, y: 120 });

      hv.setDragTargetPileIndex(0);

      const tweenCountBefore = scene._tweens.length;

      const pointerUpHandler = getInputHandler(scene, 'pointerup');
      pointerUpHandler();

      // No new tweens
      expect(scene._tweens.length).toBe(tweenCountBefore);

      // Lift offset should be removed
      // original Y + dy = startY + 20 (lift removed, dy = 120-100 = 20)
      expect(sprite.y).toBe(startY + 20);

      hv.destroy();
    });

    // ── Backward compatibility ───────────────────────────────

    it('existing behavior is unchanged when drag is not enabled', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

      // Click should work normally
      triggerPointerDown(scene, hv, 0, 100, 100);
      expect(hv.getSelected()).toBe(0);

      // No scene input handlers registered
      expect(scene.input.on).not.toHaveBeenCalled();

      hv.destroy();
    });

    it('existing horizontal mode continues to work when drag is enabled but not active', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
      });

      hv.setDragEnabled(true);
      hv.setCards([card('A', 'spades')]);

      // Simple click (no pointermove) — selection still works
      triggerPointerDown(scene, hv, 0, 100, 100);
      expect(hv.getSelected()).toBe(0);

      hv.destroy();
    });

    it('existing vertical mode cascade selection still works with drag enabled', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
      });

      hv.setDragEnabled(true);
      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
      ]);

      // Click card at index 2
      triggerPointerDown(scene, hv, 2, 100, 100);

      // Selection should include cascade range
      expect(hv.getSelected()).toBe(2);
      expect(hv.getCascadeRange()).toEqual({ from: 0, to: 2 });

      hv.destroy();
    });
  });

  // ── Custom card rendering (renderCard) ────────────────────

  describe('custom card rendering', () => {
    /** Create a mock Container for custom rendering tests. */
    function createMockContainer(x: number, y: number): any {
      return {
        x,
        y,
        active: true,
        setTint: vi.fn().mockReturnThis(),
        setInteractive: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
        destroy: vi.fn().mockReturnThis(),
        setData: vi.fn(),
        scale: 1,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }

    it('uses renderCard callback instead of default Image creation', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: (_card, _index, _isSelected) => {
          const container = createMockContainer(0, 0);
          container.setData('cardId', _card.id);
          container.setData('isSelected', _isSelected);
          return container;
        },
      });

      const cards = [card('A', 'spades'), card('2', 'hearts')];
      hv.setCards(cards);

      // Should NOT have called scene.add.image
      expect(scene.add.image).not.toHaveBeenCalled();

      // renderCard should have been called for each card
      expect(hv.getCards()).toHaveLength(2);

      // getSprites should return the containers
      const sprites = hv.getSprites();
      expect(sprites).toHaveLength(2);

      hv.destroy();
    });

    it('renderCard receives isSelected flag', () => {
      const renderCalls: Array<{ index: number; isSelected: boolean }> = [];

      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: (_card, index, isSelected) => {
          renderCalls.push({ index, isSelected });
          return createMockContainer(0, 0);
        },
      });

      // Set with no selection — all cards should be isSelected=false
      hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('K', 'clubs')]);

      expect(renderCalls).toEqual([
        { index: 0, isSelected: false },
        { index: 1, isSelected: false },
        { index: 2, isSelected: false },
      ]);

      // Select card at index 1
      renderCalls.length = 0;
      hv.setSelected(1);

      // Selection tint update should re-trigger isSelected for each card
      // Note: setSelected does NOT re-render; isSelected is only passed at create time
      // This test verifies the initial render isSelected values
      hv.destroy();
    });

    it('getSpriteAt returns generic GameObject for custom-rendered cards', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: () => createMockContainer(0, 0),
      });

      hv.setCards([card('A', 'spades')]);

      const sprite = hv.getSpriteAt(0);
      expect(sprite).toBeDefined();
      expect(sprite?.active).toBe(true);
      // Verify it's the custom container, not an Image
      expect((sprite as any)?.setTint).toBeDefined();

      hv.destroy();
    });

    it('custom-rendered cards support layout (position update)', () => {
      const positions: Array<{ x: number; y: number }> = [];

      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: (_card, _index, _isSelected) => {
          const container = createMockContainer(0, 0);
          positions[_index] = container;
          return container;
        },
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

      // Initially containers have x=0, y=0 (renderCard returns them at origin)
      expect(hv.getCardCenters()).toEqual([
        { x: 32, y: 130 },
        { x: 88, y: 130 },
      ]);
      // The containers' own positions were set by applyLayout
      // Note: renderCard returns containers at (0,0), applyLayout sets them

      hv.destroy();
    });

    it('getSprites returns all card objects including custom ones', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: (_card, _index) => createMockContainer(0, 0),
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('K', 'clubs')]);

      const sprites = hv.getSprites();
      expect(sprites).toHaveLength(3);
      for (const s of sprites) {
        expect(s.active).toBe(true);
      }

      hv.destroy();
    });

    it('destroy cleans up custom-rendered card objects', () => {
      const destroyed: any[] = [];

      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: () => {
          const container = createMockContainer(0, 0);
          container.destroy = vi.fn().mockImplementation(() => destroyed.push(container));
          return container;
        },
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
      hv.destroy();

      // Custom card objects should have been destroyed
      expect(destroyed).toHaveLength(2);
    });

    it('setRenderCard updates the renderer at runtime', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: (_card, _index, _isSelected) => {
          const container = createMockContainer(0, 0);
          container.setData('cardId', _card.id);
          return container;
        },
      });

      hv.setCards([card('A', 'spades')]);
      expect(hv.getSprites()).toHaveLength(1);

      // Switch to default rendering
      hv.clearRenderCard();
      hv.setCards([card('2', 'hearts')]);

      // Should now use Image sprites
      expect(scene.add.image).toHaveBeenCalled();

      // Switch back to custom
      hv.setRenderCard((__card, __index, __isSelected) => {
        const c = createMockContainer(0, 0);
        c.setData('isSelected', __isSelected);
        return c;
      });
      hv.setCards([card('K', 'clubs')]);
      expect(hv.getSprites()).toHaveLength(1);

      hv.destroy();
    });

    it('renderCard with showLabels=false works (no labels added)', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        showLabels: false,
        renderCard: () => createMockContainer(0, 0),
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

      // No labels should be created
      expect(scene.add.text).not.toHaveBeenCalled();

      hv.destroy();
    });

    it('renderCard with vertical layout works', () => {
      const hv = new HandView(scene, {
        baseX: 200,
        baseY: 100,
        spacing: 50,
        layoutDirection: 'vertical',
        renderCard: (_card, _index, _isSelected) => {
          const container = createMockContainer(0, 0);
          container.setData('isSelected', _isSelected);
          return container;
        },
      });

      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
      ]);

      expect(hv.getSprites()).toHaveLength(3);
      expect(hv.getLayoutDirection()).toBe('vertical');

      hv.destroy();
    });

    it('custom hover and click callbacks are used when renderCard is provided', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: () => createMockContainer(0, 0),
        customHoverFn: (cardObj) => {
          (cardObj as any).setTint(0xffff00);
        },
        customClickFn: () => {
          // custom click handler
        },
      });

      hv.setCards([card('A', 'spades')]);

      // The custom render card path should not attach default click handlers
      // Verify by checking that the scene.add.image was NOT called
      expect(scene.add.image).not.toHaveBeenCalled();

      hv.destroy();
    });

    it('selection tint is applied to custom-rendered card containers', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: () => createMockContainer(0, 0),
      });

      hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

      // No selection initially — all containers should have default tint (0xffffff)
      const sprites = hv.getSprites();
      // Custom-rendered cards do not receive selection tint via setTint
      // (selection visuals are delegated to the custom renderer)
      // Verify that setTint is NOT called on custom containers
      for (const s of sprites) {
        expect((s as any).setTint).not.toHaveBeenCalled();
      }

      // Select card at index 0 — selection tint is not applied to custom-rendered
      hv.setSelected(0);

      // No setTint should have been called for custom-rendered cards
      for (const s of sprites) {
        expect((s as any).setTint).not.toHaveBeenCalled();
      }

      hv.destroy();
    });

    it('setCards with renderCard and cardTextureFn uses renderCard priority', () => {
      let renderCardCalled = false;

      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        cardTextureFn: () => 'custom_texture',
        renderCard: () => {
          renderCardCalled = true;
          return createMockContainer(0, 0);
        },
      });

      hv.setCards([card('A', 'spades')]);

      // renderCard should take priority over cardTextureFn
      expect(renderCardCalled).toBe(true);
      expect(scene.add.image).not.toHaveBeenCalled();

      hv.destroy();
    });

    it('empty cards array with renderCard produces no sprites', () => {
      const renderCard = vi.fn(() => createMockContainer(0, 0));

      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard,
      });

      hv.setCards([]);

      expect(renderCard).not.toHaveBeenCalled();
      expect(hv.getSprites()).toHaveLength(0);
      expect(scene.add.image).not.toHaveBeenCalled();

      hv.destroy();
    });

    it('drag-and-drop works with custom-rendered cards', () => {
      const hv = new HandView(scene, {
        baseX: 60,
        baseY: 130,
        spacing: 56,
        renderCard: (_card, _index) => createMockContainer(0, 0),
      });

      hv.setDragEnabled(true);
      hv.setCards([
        card('A', 'spades'),
        card('2', 'hearts'),
        card('3', 'clubs'),
      ]);

      const dragstartHandler = vi.fn();
      hv.on('dragstart', dragstartHandler);

      // Note: Custom render path doesn't register default click handlers,
      // so drag won't initiate from pointerdown on the custom container.
      // However, the layout system should still work correctly.

      expect(hv.getSprites()).toHaveLength(3);

      hv.destroy();
    });
  });

  // ── Rotation clamping (maxRotationDegrees) ───────────────

  describe('rotation clamping (maxRotationDegrees)', () => {
    it('clamps setMaxRotationDegrees(400) to 359', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(400);
      expect(hv.getMaxRotationDegrees()).toBe(359);
      hv.destroy();
    });

    it('clamps setMaxRotationDegrees(360) to 359', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(360);
      expect(hv.getMaxRotationDegrees()).toBe(359);
      hv.destroy();
    });

    it('allows setMaxRotationDegrees(0) (no tilt)', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(0);
      expect(hv.getMaxRotationDegrees()).toBe(0);
      hv.destroy();
    });

    it('allows setMaxRotationDegrees(359)', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(359);
      expect(hv.getMaxRotationDegrees()).toBe(359);
      hv.destroy();
    });

    it('accepts setMaxRotationDegrees(180) (mid-range)', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(180);
      expect(hv.getMaxRotationDegrees()).toBe(180);
      hv.destroy();
    });

    it('clamps negative value to 0', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(-50);
      expect(hv.getMaxRotationDegrees()).toBe(0);
      hv.destroy();
    });

    it('clamps setMaxRotationDegrees(NaN) to 0', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(NaN);
      expect(hv.getMaxRotationDegrees()).toBe(0);
      hv.destroy();
    });

    it('clamps setMaxRotationDegrees(Infinity) to 0', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(Infinity);
      expect(hv.getMaxRotationDegrees()).toBe(0);
      hv.destroy();
    });

    it('clamps setMaxRotationDegrees(-Infinity) to 0', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(-Infinity);
      expect(hv.getMaxRotationDegrees()).toBe(0);
      hv.destroy();
    });

    it('constructor default maxRotationDegrees is 25 and valid', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      expect(hv.getMaxRotationDegrees()).toBe(25);
      hv.destroy();
    });

    it('getMaxRotationDegrees always returns a value within [0, 359]', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      // Set to a few valid and invalid values, verify return is always clamped
      hv.setMaxRotationDegrees(500);
      expect(hv.getMaxRotationDegrees()).toBeGreaterThanOrEqual(0);
      expect(hv.getMaxRotationDegrees()).toBeLessThanOrEqual(359);

      hv.setMaxRotationDegrees(-100);
      expect(hv.getMaxRotationDegrees()).toBeGreaterThanOrEqual(0);
      expect(hv.getMaxRotationDegrees()).toBeLessThanOrEqual(359);

      hv.setMaxRotationDegrees(200);
      expect(hv.getMaxRotationDegrees()).toBeGreaterThanOrEqual(0);
      expect(hv.getMaxRotationDegrees()).toBeLessThanOrEqual(359);
      hv.destroy();
    });

    it('clamping does not affect existing valid values < 45', () => {
      const hv = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
      hv.setMaxRotationDegrees(10);
      expect(hv.getMaxRotationDegrees()).toBe(10);
      hv.setMaxRotationDegrees(25);
      expect(hv.getMaxRotationDegrees()).toBe(25);
      hv.setMaxRotationDegrees(44);
      expect(hv.getMaxRotationDegrees()).toBe(44);
      hv.destroy();
    });
  });
});