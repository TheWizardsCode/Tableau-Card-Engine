import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PileView } from '../../src/ui/PileView';
import { Pile } from '../../src/card-system/Pile';
import type { Card } from '../../src/card-system/Card';
import { createCard } from '../../src/card-system/Card';

// ── Minimal Phaser mock ─────────────────────────────────────

function createMockScene(): any {
  const images: any[] = [];
  const texts: any[] = [];

  const mockImage = (x: number, y: number, texture: string) => {
    const img = {
      x,
      y,
      texture: { key: texture },
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setTexture: vi.fn().mockImplementation((tex: string) => { img.texture.key = tex; }),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
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
      setText: vi.fn().mockImplementation((t: string) => { txt.text = t; }),
      setOrigin: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
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
    _images: images,
    _texts: texts,
  };
}

function makeCard(rank: string, suit: string, faceUp = false): Card {
  return createCard(rank as any, suit as any, faceUp);
}

// ── Tests ───────────────────────────────────────────────────

describe('PileView', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('creates a PileView with required options', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Deck',
    });
    expect(pv).toBeDefined();
    pv.destroy();
  });

  it('setPile assigns a pile model and updates the display', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Deck',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pv.setPile(pile);

    expect(pv.peek()).toEqual(makeCard('A', 'spades'));
    pv.destroy();
  });

  it('peek returns the top card of the pile', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Deck',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pile.push(makeCard('K', 'hearts'));
    pv.setPile(pile);

    expect(pv.peek()).toEqual(makeCard('K', 'hearts'));
    pv.destroy();
  });

  it('peek returns undefined when pile is empty', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Deck',
    });

    pv.setPile(new Pile<Card>());
    expect(pv.peek()).toBeUndefined();
    pv.destroy();
  });

  it('update refreshes the sprite and count label', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Deck',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pv.setPile(pile);
    pv.update();

    // The sprite should have its texture set (pile is non-empty)
    const sprite = scene._images[0];
    expect(sprite.setTexture).toHaveBeenCalled();
    pv.destroy();
  });

  it('onClick registers a callback fired on pile sprite click', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Deck',
    });

    const clickHandler = vi.fn();
    pv.onClick(clickHandler);

    // Simulate a click on the pile sprite
    const sprite = scene._images[0];
    const onCalls = sprite.on.mock.calls;
    const pointerdownCall = onCalls.find((c: any[]) => c[0] === 'pointerdown');
    if (pointerdownCall) {
      pointerdownCall[1]();
    }

    expect(clickHandler).toHaveBeenCalled();
    pv.destroy();
  });

  it('destroy cleans up the pile view', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Deck',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pv.setPile(pile);
    pv.destroy();

    // After destroy, internal references should be cleaned up
    expect(pv.peek()).toBeUndefined();
  });

  it('getCountText returns the count label text object', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Deck',
    });

    const countText = pv.getCountText();
    expect(countText).toBeDefined();
    pv.destroy();
  });

  it('getSprite returns the pile sprite', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Deck',
    });

    const sprite = pv.getSprite();
    expect(sprite).toBeDefined();
    pv.destroy();
  });
});