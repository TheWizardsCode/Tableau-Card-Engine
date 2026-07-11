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
      setVisible: vi.fn().mockReturnThis(),
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

describe('PileView.setFaceUp', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('defaults to faceUp=true (shows card face)', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pile.push(makeCard('K', 'hearts'));
    pv.setPile(pile);

    const sprite = scene._images[0];
    // With faceUp=true, should show the top card's face texture, not card_back
    // Pile is LIFO so peek returns K of hearts
    expect(sprite.setTexture).toHaveBeenCalledWith('king_of_hearts');
    pv.destroy();
  });

  it('setFaceUp(false) makes all cards show card_back', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pile.push(makeCard('K', 'hearts'));
    pv.setPile(pile);
    pv.update();

    // Initially face up - top card is K of hearts (LIFO)
    const sprite = scene._images[0];
    expect(sprite.setTexture).toHaveBeenCalledWith('king_of_hearts');

    // Reset mock to track new calls
    (sprite.setTexture as any).mockClear();

    // Toggle to face down
    pv.setFaceUp(false);
    pv.update();

    expect(sprite.setTexture).toHaveBeenCalledWith('card_back');
    pv.destroy();
  });

  it('setFaceUp(true) makes all cards show their faces again', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pile.push(makeCard('K', 'hearts'));
    pv.setPile(pile);
    pv.setFaceUp(false);
    pv.update();

    // Reset mock
    const sprite = scene._images[0];
    (sprite.setTexture as any).mockClear();

    // Toggle back to face up
    pv.setFaceUp(true);
    pv.update();

    expect(sprite.setTexture).toHaveBeenCalledWith('king_of_hearts');
    pv.destroy();
  });

  it('setFaceUp toggles between face up and face down', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pile.push(makeCard('K', 'hearts'));
    pv.setPile(pile);
    pv.update();

    const sprite = scene._images[0];

    // Start face up - top card is K of hearts
    expect(sprite.setTexture).toHaveBeenCalledWith('king_of_hearts');
    (sprite.setTexture as any).mockClear();

    // Toggle to face down
    pv.setFaceUp(false);
    pv.update();
    expect(sprite.setTexture).toHaveBeenCalledWith('card_back');
    (sprite.setTexture as any).mockClear();

    // Toggle back to face up
    pv.setFaceUp(true);
    pv.update();
    expect(sprite.setTexture).toHaveBeenCalledWith('king_of_hearts');
    (sprite.setTexture as any).mockClear();

    pv.destroy();
  });

  it('setFaceUp(true) on an empty pile shows card_back', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
    });

    const emptyPile = new Pile<Card>();
    pv.setPile(emptyPile);
    pv.setFaceUp(true);
    pv.update();

    const sprite = scene._images[0];
    // Empty piles always show card_back regardless of faceUp
    expect(sprite.setTexture).toHaveBeenCalledWith('card_back');
    pv.destroy();
  });

  it('setFaceUp does not modify the underlying card model', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
    });

    const card = makeCard('A', 'spades', true); // faceUp = true in model
    const pile = new Pile<Card>();
    pile.push(card);
    pv.setPile(pile);

    // Toggle to face down
    pv.setFaceUp(false);
    pv.update();

    // The card model should NOT have been changed
    expect(card.faceUp).toBe(true);
    pv.destroy();
  });

  it('setFaceUp preserves card order in the pile', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('2', 'clubs'));
    pile.push(makeCard('5', 'diamonds'));
    pile.push(makeCard('A', 'spades'));
    pv.setPile(pile);
    pv.setFaceUp(false);
    pv.update();

    // Pile order should still be [2, 5, A]
    const cards = pile.toArray();
    expect(cards).toHaveLength(3);
    expect(cards[0].rank).toBe('2');
    expect(cards[0].suit).toBe('clubs');
    expect(cards[1].rank).toBe('5');
    expect(cards[1].suit).toBe('diamonds');
    expect(cards[2].rank).toBe('A');
    expect(cards[2].suit).toBe('spades');
    pv.destroy();
  });

  it('setFaceUp returns the PileView for chaining', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pv.setPile(pile);

    const result = pv.setFaceUp(false);
    expect(result).toBe(pv);
    pv.destroy();
  });

  it('setFaceUp with custom cardTextureFn uses face-down display', () => {
    const resolver = vi.fn().mockReturnValue('custom-face-texture');
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
      cardTextureFn: resolver,
    });

    const customPile = {
      size: () => 1,
      isEmpty: () => false,
      peek: () => ({ type: 'expedition', color: 'red' }),
    };
    pv.setPile(customPile);

    // Initially face up - resolver should have been called
    expect(resolver).toHaveBeenCalledTimes(1);
    const sprite = scene._images[0];
    (sprite.setTexture as any).mockClear();

    // Toggle to face down
    pv.setFaceUp(false);
    pv.update();

    // Should show card_back, not use cardTextureFn
    expect(sprite.setTexture).toHaveBeenCalledWith('card_back');
    pv.destroy();
  });

  it('setFaceUp(true) with custom cardTextureFn uses resolver', () => {
    const resolver = vi.fn().mockReturnValue('custom-face-texture');
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
      cardTextureFn: resolver,
    });

    const customPile = {
      size: () => 1,
      isEmpty: () => false,
      peek: () => ({ type: 'expedition', color: 'red' }),
    };
    pv.setPile(customPile);
    // resolver called once from setPile → update
    expect(resolver).toHaveBeenCalledTimes(1);

    pv.setFaceUp(false);
    pv.update();
    // resolver NOT called (face down)
    expect(resolver).toHaveBeenCalledTimes(1);

    // Reset mock to track new calls
    const sprite = scene._images[0];
    (sprite.setTexture as any).mockClear();
    resolver.mockClear();

    // Toggle back to face up (setFaceUp already calls update())
    pv.setFaceUp(true);

    // Should use the custom resolver (setFaceUp triggers update() internally)
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(sprite.setTexture).toHaveBeenCalledWith('custom-face-texture');
    pv.destroy();
  });

  it('getFaceUp returns the current face-up state', () => {
    const pv = new PileView(scene, {
      x: 500,
      y: 150,
      label: 'Discard',
    });

    const pile = new Pile<Card>();
    pile.push(makeCard('A', 'spades'));
    pv.setPile(pile);

    // Default should be true
    expect(pv.getFaceUp()).toBe(true);

    pv.setFaceUp(false);
    expect(pv.getFaceUp()).toBe(false);

    pv.setFaceUp(true);
    expect(pv.getFaceUp()).toBe(true);

    pv.destroy();
  });
});
