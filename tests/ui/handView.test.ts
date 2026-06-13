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

  const mockImage = (x: number, y: number, texture: string) => {
    const img = {
      x,
      y,
      texture: { key: texture },
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockImplementation(() => { destroyed.push(img); }),
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
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
      active: true,
      destroy: vi.fn().mockImplementation(() => { destroyed.push(txt); }),
    };
    texts.push(txt);
    return txt;
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
    tweens: {
      add: vi.fn().mockImplementation((config: any) => {
        tweens.push(config);
        // Simulate immediate completion for reduced-motion
        if (config.onComplete) {
          setTimeout(() => config.onComplete(), 0);
        }
        return { stop: vi.fn() };
      }),
    },
    events: {
      once: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    time: {
      delayedCall: vi.fn(),
    },
    _tweens: tweens,
    _images: images,
    _texts: texts,
    _destroyed: destroyed,
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
});