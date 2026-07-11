/**
 * HandView centerX Tests
 *
 * Unit tests that verify the optional `centerX` property in HandViewOptions
 * anchors the hand at a fixed horizontal centre when set, and that when
 * centerX is not set, `baseX` is used as the hand centre.
 *
 * Tests cover: construction, spacing changes, addCard, removeCard, arc
 * layout compatibility, backward compatibility (baseX as default centre),
 * vertical mode (no effect), setCenterX runtime updates, and reduced-motion
 * mode.
 *
 * @module tests/ui/handView.centerX.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import type { Card } from '../../src/card-system/Card';
import { createCard } from '../../src/card-system/Card';

// ── Minimal Phaser mock (same pattern as handView.test.ts) ─

function createMockScene(): any {
  const images: any[] = [];
  const texts: any[] = [];
  const destroyed: any[] = [];

  const mockImage = (x: number, y: number, texture: string) => {
    const img: any = {
      x,
      y,
      texture: { key: texture },
      active: true,
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setPosition: vi.fn((px: number, py: number) => { img.x = px; img.y = py; }),
      setRotation: vi.fn(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockImplementation(() => { destroyed.push(img); }),
      displayWidth: 48,
      displayHeight: 65,
      rotation: 0,
    };
    images.push(img);
    return img;
  };

  const mockText = (x: number, y: number, text: string, _style?: any) => {
    const t: any = {
      x,
      y,
      text,
      setOrigin: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
      active: true,
      destroy: vi.fn().mockImplementation(() => { destroyed.push(t); }),
    };
    texts.push(t);
    return t;
  };

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
    },
    tweens: { add: vi.fn().mockReturnValue({ stop: vi.fn() }) },
    events: { once: vi.fn(), on: vi.fn(), off: vi.fn() },
    time: { delayedCall: vi.fn() },
    _images: images,
    _texts: texts,
    _destroyed: destroyed,
  };
}

function card(rank: string, suit: string): Card {
  return createCard(rank as any, suit as any, true);
}

// ── Helpers ─────────────────────────────────────────────────

/** Compute the horizontal centre of all active card sprite positions via getCardCenters(). */
function computeHandCenter(hv: HandView): number {
  const centers = hv.getCardCenters();
  if (centers.length === 0) return 0;
  const xs = centers.map((c) => c.x);
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

// ── Tests ───────────────────────────────────────────────────

describe('HandView centerX', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  // ── Construction ───────────────────────────────────────────

  it('accepts centerX option and uses it as fixed horizontal centre', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // With 3 cards at 56px spacing, the span is 2*56 = 112px.
    // Centered at 400, the leftmost card is at 400 - 112/2 = 344,
    // rightmost at 344 + 112 = 456. The centre should be 400.
    const center = computeHandCenter(hv);
    expect(center).toBeCloseTo(400, 0);

    hv.destroy();
  });

  it('centerX with a single card places it exactly at centerX', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades')]);

    const centers = hv.getCardCenters();
    expect(centers[0].x).toBe(400);

    hv.destroy();
  });

  it('centerX with even card count places centre between the two middle cards', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs'), card('4', 'diamonds')]);

    // 4 cards, spacing 56 => span = 3*56 = 168.
    // Centered at 400: leftmost = 400 - 168/2 = 316, rightmost = 316 + 168 = 484.
    // Middle point = (316 + 484)/2 = 400.
    const center = computeHandCenter(hv);
    expect(center).toBeCloseTo(400, 0);

    hv.destroy();
  });

  // ── Spacing changes ────────────────────────────────────────

  it('hand centre stays fixed when spacing changes (centerX set)', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 20,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Record centre with initial spacing
    const centerBefore = computeHandCenter(hv);

    // Change spacing
    hv.setSpacing(56);
    const centerAfter = computeHandCenter(hv);

    expect(centerBefore).toBeCloseTo(400, 0);
    expect(centerAfter).toBeCloseTo(400, 0);

    hv.destroy();
  });

  it('hand centre stays fixed for multiple spacing changes (centerX set)', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 20,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Test several spacing values
    for (const spacing of [12, 30, 56, 72]) {
      hv.setSpacing(spacing);
      const center = computeHandCenter(hv);
      expect(center).toBeCloseTo(400, 0);
    }

    hv.destroy();
  });

  it('hand centre stays fixed when spacing changes and arc is set', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 300,
      spacing: 20,
      arcRadius: 150,
      centerX: 400,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    const centerBefore = computeHandCenter(hv);
    expect(centerBefore).toBeCloseTo(400, 0);

    hv.setSpacing(56);
    const centerAfter = computeHandCenter(hv);
    expect(centerAfter).toBeCloseTo(400, 0);

    hv.destroy();
  });

  // ── Hand-size changes (addCard/removeCard) ─────────────────

  it('hand centre stays fixed after adding a card (centerX set)', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    const centerBefore = computeHandCenter(hv);
    expect(centerBefore).toBeCloseTo(400, 0);

    hv.addCard(card('K', 'diamonds'), { animate: false });

    const centerAfter = computeHandCenter(hv);
    expect(centerAfter).toBeCloseTo(400, 0);

    hv.destroy();
  });

  it('hand centre stays fixed after removing a card (centerX set)', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    const centerBefore = computeHandCenter(hv);
    expect(centerBefore).toBeCloseTo(400, 0);

    hv.removeCard(1, { animate: false });

    const centerAfter = computeHandCenter(hv);
    expect(centerAfter).toBeCloseTo(400, 0);

    hv.destroy();
  });

  it('hand centre stays fixed after addCard for 1->N cards', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades')]);
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.addCard(card('2', 'hearts'), { animate: false });
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.addCard(card('3', 'clubs'), { animate: false });
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.addCard(card('4', 'diamonds'), { animate: false });
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.destroy();
  });

  it('hand centre stays fixed after removeCard from N->1 cards', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
    ]);
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.removeCard(0, { animate: false });
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.removeCard(0, { animate: false });
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.removeCard(0, { animate: false });
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.destroy();
  });

  // ── setCenterX runtime updates ─────────────────────────────

  it('setCenterX updates the fixed centre at runtime', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    // Change centre to 200 via public API
    hv.setCenterX(200);

    const centerAfter = computeHandCenter(hv);
    expect(centerAfter).toBeCloseTo(200, 0);

    hv.destroy();
  });

  it('setCenterX with undefined restores baseX as centre', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    // Clear centerX via public API — should fall back to baseX as centre
    hv.setCenterX(undefined);
    hv.setSpacing(56); // triggers applyLayout, should use baseX as centre
    // With the default (centerX not set), baseX is used as the centre
    const centerAfter = computeHandCenter(hv);
    expect(centerAfter).toBeCloseTo(100, 0);

    hv.destroy();
  });

  // ── Backward compatibility (centerX not set) ───────────────

  it('when centerX is not set, hand centres on baseX', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 100,
      spacing: 56,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Without centerX, baseX is used as the centre
    const center = computeHandCenter(hv);
    expect(center).toBeCloseTo(100, 0);

    hv.destroy();
  });

  it('when centerX is not set, hand stays centred on baseX when spacing changes', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 100,
      spacing: 20,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Without centerX, baseX is used as centre regardless of spacing
    expect(computeHandCenter(hv)).toBeCloseTo(100, 0);

    hv.setSpacing(56);

    // Centre should remain at baseX
    const centerAfter = computeHandCenter(hv);
    expect(centerAfter).toBeCloseTo(100, 0);

    hv.destroy();
  });

  // ── Vertical mode ─────────────────────────────────────────

  it('centerX has no effect in vertical mode (layout uses baseX directly)', () => {
    const hv = new HandView(scene, {
      baseX: 200,
      baseY: 100,
      spacing: 50,
      layoutDirection: 'vertical',
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // In vertical mode, all cards should be at baseX regardless of centerX
    const centers = hv.getCardCenters();
    for (const c of centers) {
      expect(c.x).toBe(200);
    }

    hv.destroy();
  });

  it('toggling between vertical and horizontal respects centerX in horizontal mode', () => {
    const hv = new HandView(scene, {
      baseX: 200,
      baseY: 100,
      spacing: 50,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Horizontal: centre should be at 400
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    // Switch to vertical
    hv.setLayoutDirection('vertical');
    const verticalCenters = hv.getCardCenters();
    for (const c of verticalCenters) {
      expect(c.x).toBe(200);
    }

    // Switch back to horizontal — centre should be at 400 again
    hv.setLayoutDirection('horizontal');
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.destroy();
  });

  // ── Reduced motion ────────────────────────────────────────

  it('centerX works with reduced-motion mode', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
      reducedMotion: true,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.setSpacing(72);
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.destroy();
  });

  // ── Multiple operations ───────────────────────────────────

  it('hand centre remains stable across spacing and hand-size changes', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 20,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Change spacing
    hv.setSpacing(40);
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    // Add card
    hv.addCard(card('4', 'diamonds'), { animate: false });
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    // Change spacing again
    hv.setSpacing(60);
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    // Remove card
    hv.removeCard(2, { animate: false });
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    // Change spacing once more
    hv.setSpacing(30);
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.destroy();
  });

  // ── Edge cases ────────────────────────────────────────────

  it('centerX with 0 cards does not throw', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([]);
    // Should not throw — centre of empty hand is undefined, but should not error
    expect(hv.getCards()).toHaveLength(0);

    hv.destroy();
  });

  it('centerX with 2 cards places centre midpoint at centerX', () => {
    const hv = new HandView(scene, {
      baseX: 0,
      baseY: 100,
      spacing: 56,
      centerX: 400,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

    // 2 cards at 56px spacing: span = 56. Left at 372, right at 428. Centre = 400.
    expect(computeHandCenter(hv)).toBeCloseTo(400, 0);

    hv.destroy();
  });

  it('constructor without centerX does not set the private field', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 100,
      spacing: 56,
    });

    // The private _centerX should be undefined
    expect((hv as any)._centerX).toBeUndefined();

    hv.destroy();
  });
});
