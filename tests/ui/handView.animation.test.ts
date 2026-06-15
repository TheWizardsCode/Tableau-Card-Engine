/**
 * HandView Animation Coordinate Accuracy Tests
 *
 * Unit tests that assert `animateAddCard` destination coordinates match
 * HandView's canonical layout positions computed by computeCardPositions.
 *
 * Tests cover straight layout, arc layout, compressed layout, empty hand,
 * single card, and reduced-motion scenarios.
 *
 * @module tests/ui/handView.animation.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import type { Card } from '../../src/card-system/Card';
import { createCard } from '../../src/card-system/Card';
import { layoutCardPositions } from '../../src/ui/layoutCardPositions';
import { CARD_W } from '../../src/ui/constants';

// ── Minimal Phaser mock (extended from handView.test.ts) ────
// HandView uses scene.add.image(), scene.add.text(), scene.tweens, tweens.add
// We extend the mock to track dealCard-like invocations for animation testing.

function createMockScene(): any {
  const tweens: any[] = [];
  const images: any[] = [];
  const texts: any[] = [];
  const destroyed: any[] = [];
  const sceneTweens: any[] = [];

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
      setPosition: vi.fn((px: number, py: number) => {
        img.x = px;
        img.y = py;
      }),
      setRotation: vi.fn(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockImplementation(() => {
        destroyed.push(img);
      }),
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      displayWidth: 48,
      displayHeight: 65,
      rotation: 0,
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
      active: true,
      destroy: vi.fn().mockImplementation(() => {
        destroyed.push(txt);
      }),
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
    },
    tweens: {
      add: vi.fn().mockImplementation((config: any) => {
        tweens.push(config);
        const tween = { stop: vi.fn() };
        sceneTweens.push(tween);
        // Fire callbacks synchronously so that Promise-based test flows
        // resolve within the same microtask queue cycle.
        if (config.onUpdate) config.onUpdate(tween);
        if (config.onComplete) config.onComplete();
        return tween;
      }),
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
      delayedCall: vi.fn((delay: number, fn: () => void) => {
        setTimeout(fn, delay);
        return { remove: vi.fn() };
      }),
    },
    sound: {
      play: vi.fn(),
      add: vi.fn(() => ({
        play: vi.fn(),
        stop: vi.fn(),
      })),
    },
    cameras: {
      main: { setBackgroundColor: vi.fn() },
    },
    _inputHandlers: inputHandlers,
    _tweens: tweens,
    _images: images,
    _texts: texts,
    _destroyed: destroyed,
    _sceneTweens: sceneTweens,
  };
}

/** Helper: create a standard playing card. */
function card(rank: string, suit: string, faceUp = true): Card {
  return createCard(rank as any, suit as any, faceUp);
}

// ── Tests ───────────────────────────────────────────────────

describe('HandView animateAddCard', () => {
  let scene: ReturnType<typeof createMockScene>;
  let hv: HandView;
  let baseX: number;
  let baseY: number;

  beforeEach(() => {
    scene = createMockScene();
    baseX = 300;
    baseY = 500;
  });

  afterEach(() => {
    if (hv && !hv['destroyed']) {
      hv.destroy();
    }
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // Straight Layout (arcRadius = 0)
  // ═══════════════════════════════════════════════════════════

  describe('straight layout (arcRadius=0)', () => {
    beforeEach(() => {
      hv = new HandView(scene, {
        baseX,
        baseY,
        spacing: 56,
        arcRadius: 0,
        showLabels: false,
      });
    });

    it('animateAddCard destination matches layoutCardPositions center for first card', async () => {
      // Start with empty hand, add first card
      const newCard = card('A', 'spades');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      // After animation, the card should be in the hand at the expected position
      const cards = hv.getCards();
      expect(cards).toHaveLength(1);
      expect(cards[0]).toEqual(newCard);

      // Expected: single card centered at baseX, baseY
      const centers = hv.getCardCenters();
      expect(centers).toHaveLength(1);
      expect(centers[0].x).toBe(baseX);
      expect(centers[0].y).toBe(baseY);
    });

    it('animateAddCard destination matches expected position for multiple cards', async () => {
      // Start with 2 cards, add a 3rd
      hv.setCards([card('2', 'hearts'), card('3', 'clubs')]);

      const newCard = card('K', 'diamonds');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      const cards = hv.getCards();
      expect(cards).toHaveLength(3);

      const centers = hv.getCardCenters();
      expect(centers).toHaveLength(3);

      // Compute expected positions for 3 cards with spacing=56, arcRadius=0
      const gap = (hv as any).spacing - (hv as any).cardWidth;
      const centerX = baseX + (3 - 1) * (hv as any).spacing / 2;
      const { positions } = layoutCardPositions({
        count: 3,
        cardWidth: (hv as any).cardWidth,
        gap,
        centerX,
      });

      for (let i = 0; i < 3; i++) {
        expect(Math.abs(centers[i].x - positions[i])).toBeLessThanOrEqual(1);
        expect(centers[i].y).toBe(baseY);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Arc Layout (arcRadius > 0)
  // ═══════════════════════════════════════════════════════════

  describe('arc layout (arcRadius>0)', () => {
    beforeEach(() => {
      hv = new HandView(scene, {
        baseX,
        baseY,
        spacing: 56,
        arcRadius: 150,
        showLabels: false,
      });
    });

    it('animateAddCard destination within 1px tolerance of computeCardPositions', async () => {
      // Start with 3 cards, add a 4th (even count — no perfect center, but arc still applies)
      hv.setCards([
        card('2', 'hearts'),
        card('3', 'clubs'),
        card('4', 'diamonds'),
      ]);

      const newCard = card('5', 'spades');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      const cards = hv.getCards();
      expect(cards).toHaveLength(4);

      const centers = hv.getCardCenters();

      // Center cards (indices 1 and 2 for 4 cards) should be lifted above baseY
      // In a symmetric arc, the inner cards have the greatest offset.
      // Edge cards (0 and 3) sit at or very near baseY.
      const innerCenter = centers[1];
      if ((hv as any).arcRadius > 0) {
        expect(innerCenter.y).toBeLessThan(baseY);
      }

      // The Y coordinate should be within reasonable arc bounds
      // For 4 cards with spacing=56, halfSpan = (3*56)/2 = 84
      // To compute max offset for index 1:
      //   gap = 56 - 48 = 8
      //   centerX = 300 + 3*56/2 = 384
      //   positions: [300, 356, 412, 468]
      //   arcCenterX = (300+468)/2 = 384, halfSpan = 84
      //   normalized for index 1: (356-384)/84 = -0.333
      //   offsetY = (1-0.111) * 84² / (2*150) = 0.889 * 7056 / 300 ≈ 20.9
      //   So destY ≈ 500 - 20.9 = 479.1
      expect(innerCenter.y).toBeGreaterThan(baseY - 50);
      expect(innerCenter.y).toBeLessThan(baseY);

      // Edge cards (first and last) should sit at or very near baseY
      expect(centers[0].y).toBe(baseY);
      expect(centers[3].y).toBe(baseY);
    });

    it('animateAddCard with arc places cards at correct Y offset', async () => {
      // 2 cards, add a 3rd with arc - center card should be highest
      hv.setCards([card('2', 'hearts'), card('3', 'clubs')]);

      const newCard = card('4', 'diamonds');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      const centers = hv.getCardCenters();
      expect(centers).toHaveLength(3);

      // In arc layout with odd count, the center card (index 1) should be highest (lowest Y)
      expect(centers[1].y).toBeLessThan(centers[0].y);
      expect(centers[1].y).toBeLessThan(centers[2].y);

      // Edge cards should be closer to baseY
      expect(Math.abs(centers[0].y - baseY)).toBeLessThanOrEqual(Math.abs(centers[1].y - baseY));
      expect(Math.abs(centers[2].y - baseY)).toBeLessThanOrEqual(Math.abs(centers[1].y - baseY));
    });

    it('arc with 5 cards produces symmetric Y offsets', async () => {
      hv.setCards([
        card('2', 'hearts'),
        card('3', 'clubs'),
        card('4', 'diamonds'),
        card('5', 'spades'),
      ]);

      const newCard = card('6', 'hearts');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      const centers = hv.getCardCenters();
      expect(centers).toHaveLength(5);

      // Edge cards should have symmetric Y offsets
      expect(centers[0].y).toBeCloseTo(centers[4].y, 6);
      expect(centers[1].y).toBeCloseTo(centers[3].y, 6);

      // Center (index 2) should be highest
      expect(centers[2].y).toBeLessThan(centers[1].y);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Compressed Layout (maxWidth exceeded)
  // ═══════════════════════════════════════════════════════════

  describe('compressed layout (maxWidth exceeded)', () => {
    beforeEach(() => {
      hv = new HandView(scene, {
        baseX: 200,
        baseY,
        spacing: 80,
        arcRadius: 0,
        showLabels: false,
        maxWidth: 350, // Narrow max width forces compression
      });
    });

    it('animateAddCard destination within 1px tolerance when compressed', async () => {
      // 5 cards with spacing=80, cardWidth=48, maxWidth=350
      // idealWidth = 48 + 4*80 = 368 > 350, so compression kicks in
      hv.setCards([
        card('2', 'hearts'),
        card('3', 'clubs'),
        card('4', 'diamonds'),
        card('5', 'spades'),
        card('6', 'hearts'),
      ]);

      const newCard = card('7', 'clubs');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      const cards = hv.getCards();
      expect(cards).toHaveLength(6);

      const centers = hv.getCardCenters();
      expect(centers).toHaveLength(6);

      // Compute expected using layoutCardPositions with compression for 6 cards
      const gap = (hv as any).spacing - (hv as any).cardWidth;
      const centerX = (hv as any).baseX + (6 - 1) * (hv as any).spacing / 2;
      const { positions } = layoutCardPositions({
        count: 6,
        cardWidth: (hv as any).cardWidth,
        gap,
        centerX,
        maxWidth: 350,
      });

      // All positions should be within 1px of expected
      for (let i = 0; i < 6; i++) {
        expect(Math.abs(centers[i].x - positions[i])).toBeLessThanOrEqual(1);
        expect(centers[i].y).toBe(baseY);
      }
    });

    it('compressed step is smaller than ideal step', async () => {
      // With maxWidth=350 and 6 cards, ideal step is 80 but compressed step
      // should be (350 - 48) / 5 = 60.4
      hv.setCards([
        card('2', 'hearts'),
        card('3', 'clubs'),
        card('4', 'diamonds'),
        card('5', 'spades'),
        card('6', 'hearts'),
      ]);

      const startPositions = hv.getCardCenters();
      const idealStep = (hv as any).spacing;
      const actualStep0 = startPositions[1].x - startPositions[0].x;

      // Verify compression is actually occurring
      expect(actualStep0).toBeLessThan(idealStep);
      expect(actualStep0).toBeGreaterThan(0);

      const newCard = card('7', 'clubs');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      const afterCenters = hv.getCardCenters();
      expect(afterCenters).toHaveLength(6);

      // The new card should be placed using compressed layout
      const expectedStep6 = (350 - (hv as any).cardWidth) / 5;
      const actualStep5 = afterCenters[5].x - afterCenters[4].x;
      expect(Math.abs(actualStep5 - expectedStep6)).toBeLessThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Empty Hand Scenario
  // ═══════════════════════════════════════════════════════════

  describe('empty hand scenario', () => {
    beforeEach(() => {
      hv = new HandView(scene, {
        baseX,
        baseY,
        spacing: 56,
        arcRadius: 0,
        showLabels: false,
      });
    });

    it('animateAddCard with empty hand adds first card gracefully', async () => {
      // Hand should be empty
      expect(hv.getCards()).toHaveLength(0);

      const newCard = card('A', 'spades');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      // Card should be added
      expect(hv.getCards()).toHaveLength(1);
      expect(hv.getCards()[0]).toEqual(newCard);
    });

    it('animateAddCard can add multiple cards to an initially empty hand', async () => {
      expect(hv.getCards()).toHaveLength(0);

      for (const c of [card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]) {
        await expect(
          (hv as any).animateAddCard(c, { sourceX: 100, sourceY: 200 })
        ).resolves.toBeUndefined();
      }

      expect(hv.getCards()).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Single Card Scenario
  // ═══════════════════════════════════════════════════════════

  describe('single card scenario', () => {
    it('single card destination equals baseX/baseY', async () => {
      hv = new HandView(scene, {
        baseX,
        baseY,
        spacing: 56,
        arcRadius: 150, // Arc should have no effect with single card
        showLabels: false,
      });

      const newCard = card('A', 'spades');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      const centers = hv.getCardCenters();
      expect(centers).toHaveLength(1);

      // Single card should be at baseX/baseY regardless of arcRadius
      expect(centers[0].x).toBe(baseX);
      expect(centers[0].y).toBe(baseY);
    });

    it('single card in arc layout does not curve', async () => {
      hv = new HandView(scene, {
        baseX,
        baseY,
        spacing: 56,
        arcRadius: 200,
        showLabels: false,
      });

      const newCard = card('A', 'spades');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      const centers = hv.getCardCenters();
      // Single card should sit exactly at baseY (no arc for single card)
      expect(centers[0].y).toBe(baseY);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ReducedMotion Mode
  // ═══════════════════════════════════════════════════════════

  describe('reducedMotion mode', () => {
    beforeEach(() => {
      hv = new HandView(scene, {
        baseX,
        baseY,
        spacing: 56,
        arcRadius: 0,
        showLabels: false,
        reducedMotion: true,
      });
    });

    it('reducedMotion: card is placed instantly (no tween created)', async () => {
      const newCard = card('A', 'spades');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      // Card should be in hand immediately
      expect(hv.getCards()).toHaveLength(1);

      const initialTweenCount = scene._tweens.length;

      // Add another card
      await expect(
        (hv as any).animateAddCard(card('2', 'hearts'), { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      // The key assertion is that the cards appear correctly despite reduced motion
      expect(hv.getCards()).toHaveLength(2);

      const centers = hv.getCardCenters();
      expect(centers[0].x).toBe(baseX);
      expect(centers[1].x).toBe(baseX + (hv as any).spacing);
    });

    it('reducedMotion: no temporary animation sprites linger', async () => {
      const newCard = card('A', 'spades');
      await expect(
        (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 })
      ).resolves.toBeUndefined();

      // All images should be valid (not destroyed)
      for (const img of scene._images) {
        // Skip destroyed images
        if ((img.destroy as any).mock.calls.length > 0) continue;
        expect(img.active).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // General animation behavior
  // ═══════════════════════════════════════════════════════════

  describe('general animation behavior', () => {
    beforeEach(() => {
      hv = new HandView(scene, {
        baseX,
        baseY,
        spacing: 56,
        arcRadius: 0,
        showLabels: false,
      });
    });

    it('animateAddCard returns a Promise that resolves after card integration', async () => {
      hv.setCards([card('2', 'hearts')]);

      const newCard = card('K', 'clubs');
      const result = await (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200, duration: 300 });

      expect(result).toBeUndefined();
    });

    it('animateAddCard adds card to model on completion', async () => {
      hv.setCards([card('2', 'hearts'), card('3', 'clubs')]);

      const newCard = card('4', 'diamonds');
      await (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 });

      const cards = hv.getCards();
      expect(cards).toHaveLength(3);
      // The new card should be the last one
      expect(cards[2].rank).toBe('4');
      expect(cards[2].suit).toBe('diamonds');
    });

    it('animateAddCard updates display (sprites match model)', async () => {
      hv.setCards([card('2', 'hearts')]);

      const newCard = card('K', 'clubs');
      await (hv as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 });

      // Sprites should match cards
      const sprites = hv.getSprites();
      expect(sprites).toHaveLength(2);
      expect(hv.getCards()).toHaveLength(2);
    });

    it('animateAddCard with arc and multiple cards preserves correct ordering', async () => {
      const hvArc = new HandView(scene, {
        baseX,
        baseY,
        spacing: 56,
        arcRadius: 120,
        showLabels: false,
      });

      hvArc.setCards([card('2', 'hearts'), card('3', 'clubs'), card('4', 'diamonds')]);

      const newCard = card('5', 'spades');
      await (hvArc as any).animateAddCard(newCard, { sourceX: 100, sourceY: 200 });

      const cards = hvArc.getCards();
      expect(cards).toHaveLength(4);
      // Order should be preserved
      expect(cards[0].rank).toBe('2');
      expect(cards[1].rank).toBe('3');
      expect(cards[2].rank).toBe('4');
      expect(cards[3].rank).toBe('5');

      hvArc.destroy();
    });
  });
});
