import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import type { Card } from '../../src/card-system/Card';
import { createCard } from '../../src/card-system/Card';

// ── Minimal Phaser mock ─────────────────────────────────────
function createMockScene(): any {
  const tweens: any[] = [];
  const images: any[] = [];
  const texts: any[] = [];
  const destroyed: any[] = [];
  const rectangles: any[] = [];

  const mockImage = (x: number, y: number, texture: string) => {
    const img = {
      x, y, texture: { key: texture }, active: true,
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockImplementation(() => { destroyed.push(img); }),
      scaleX: 1, scaleY: 1, alpha: 1, rotation: 0,
      displayWidth: 48, displayHeight: 65,
    };
    images.push(img);
    return img;
  };

  const mockText = (x: number, y: number, text: string) => {
    const txt = {
      x, y, text,
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
          x, y, width: w, height: h, color, fillColor: color, active: true,
          setPosition: vi.fn().mockReturnThis(),
          setOrigin: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
          setAlpha: vi.fn().mockReturnThis(),
          setRotation: vi.fn().mockReturnThis(),
          setFillStyle: vi.fn().mockImplementation((c: number) => { rect.fillColor = c; return rect; }),
          destroy: vi.fn().mockImplementation(() => { rect.active = false; destroyed.push(rect); }),
        };
        rectangles.push(rect);
        return rect;
      }),
    },
    tweens: {
      add: vi.fn().mockImplementation((config: any) => {
        tweens.push(config);
        if (config.onComplete) setTimeout(() => config.onComplete(), 0);
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
    events: { once: vi.fn(), on: vi.fn(), off: vi.fn() },
    time: { delayedCall: vi.fn() },
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

describe('HandView cardHeight tint overlay', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('tint overlay height matches cardHeight when cardHeight > CARD_H (130)', () => {
    // Simulate Lost Cities card size: 100x137
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      cardWidth: 100,
      cardHeight: 137,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

    // Select a card to trigger the selection highlight overlay
    hv.setSelected(0);

    const overlay = scene._rectangles.find((r: any) => r.active && r.color === 0x88ff88);
    expect(overlay).toBeDefined();

    // The overlay should use cardHeight (137), not the default CARD_H (130)
    expect(overlay!.width).toBe(100);
    expect(overlay!.height).toBe(137);
  });

  it('tint overlay height matches cardHeight when cardHeight < CARD_H (130)', () => {
    // Simulate a smaller card: 100x110
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      cardWidth: 100,
      cardHeight: 110,
    });

    hv.setCards([card('A', 'spades')]);
    hv.setSelected(0);

    const overlay = scene._rectangles.find((r: any) => r.active && r.color === 0x88ff88);
    expect(overlay).toBeDefined();

    expect(overlay!.width).toBe(100);
    expect(overlay!.height).toBe(110);
  });

  it('tint overlay height matches CARD_H (130) when cardHeight is not provided', () => {
    // Default: cardHeight falls back to CARD_H
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
    });

    hv.setCards([card('A', 'spades')]);
    hv.setSelected(0);

    const overlay = scene._rectangles.find((r: any) => r.active && r.color === 0x88ff88);
    expect(overlay).toBeDefined();

    // Default cardHeight is CARD_H = 130, cardWidth is CARD_W = 96
    expect(overlay!.width).toBe(96);
    expect(overlay!.height).toBe(130);
  });

  it('hover tint overlay also uses cardHeight', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      cardWidth: 100,
      cardHeight: 137,
      showLabels: false,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);

    // Simulate hover event on first card
    const firstImage = scene._images[0];
    const onCalls = firstImage.on.mock.calls;
    const pointerOver = onCalls.find((c: any[]) => c[0] === 'pointerover');
    expect(pointerOver).toBeDefined();
    pointerOver[1]();

    // Find the hover overlay (green tint 0x66ff66)
    const hoverOverlay = scene._rectangles.find((r: any) => r.active && r.color === 0x66ff66);
    expect(hoverOverlay).toBeDefined();
    expect(hoverOverlay!.width).toBe(100);
    expect(hoverOverlay!.height).toBe(137);
  });

  it('destroy cleans up overlays created with custom cardHeight', () => {
    const hv = new HandView(scene, {
      baseX: 60,
      baseY: 130,
      spacing: 56,
      cardWidth: 100,
      cardHeight: 137,
    });

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    hv.setSelected(0);

    // Verify overlays exist
    expect(scene._rectangles.length).toBeGreaterThan(0);

    hv.destroy();

    // After destroy, all overlays should be inactive
    const activeRects = scene._rectangles.filter((r: any) => r.active);
    expect(activeRects.length).toBe(0);
  });
});
