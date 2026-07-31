/**
 * Gym Hand & Pile scene – integration tests for HandView / PileView
 * usage within the scene.
 *
 * Validates that:
 *  - HandView and PileView APIs work as expected with card-system models
 *  - Selection, addCard, removeCard, and pile operations integrate correctly
 *  - The scene uses HandView and PileView for display
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createStandardDeck,
  shuffleArray,
} from '../../src/card-system/Deck';
import { Pile } from '../../src/card-system/Pile';
import { createSeededRng } from '../../src/core-engine/SeededRng';
import { HandView } from '../../src/ui/HandView';
import { PileView } from '../../src/ui/PileView';
import { createCard } from '../../src/card-system/Card';
import type { Card } from '../../src/card-system/Card';

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
      setOrigin: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
      active: true,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      depth: 0,
      originX: 0.5,
      originY: 0.5,
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
      setColor: vi.fn().mockReturnThis(),
      setText: vi.fn().mockImplementation((t: string) => { txt.text = t; }),
      active: true,
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
      rectangle: vi.fn().mockImplementation((x: number, y: number, w: number, h: number, color: number) => {
        const rect = {
          x, y, width: w, height: h, color,
          active: true,
          setPosition: vi.fn().mockReturnThis(),
          setOrigin: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
          setAlpha: vi.fn().mockReturnThis(),
          setRotation: vi.fn().mockReturnThis(),
          destroy: vi.fn(),
        };
        return rect;
      }),
    },
    tweens: {
      add: vi.fn().mockImplementation((config: any) => {
        if (config.onComplete) setTimeout(() => config.onComplete(), 0);
        return { stop: vi.fn() };
      }),
    },
    events: { once: vi.fn(), on: vi.fn(), off: vi.fn() },
    time: { delayedCall: vi.fn() },
    _images: images,
    _texts: texts,
  };
}

function makeCard(rank: string, suit: string, faceUp = true): Card {
  return createCard(rank as any, suit as any, faceUp);
}

describe('Gym Hand & Pile integration with HandView/PileView', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('HandView reflects hand state after setCards', () => {
    const handView = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
    const hand = [makeCard('A', 'spades'), makeCard('2', 'hearts'), makeCard('3', 'clubs')];
    handView.setCards(hand);

    expect(handView.getCards()).toHaveLength(3);
    expect(handView.getSelected()).toBeNull();
    handView.destroy();
  });

  it('HandView selection updates correctly', () => {
    const handView = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
    handView.setCards([makeCard('A', 'spades'), makeCard('K', 'hearts')]);

    handView.setSelected(1);
    expect(handView.getSelected()).toBe(1);

    handView.setSelected(null);
    expect(handView.getSelected()).toBeNull();

    handView.destroy();
  });

  it('HandView addCard and removeCard work together', () => {
    const handView = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
    handView.setCards([makeCard('A', 'spades')]);

    handView.addCard(makeCard('K', 'hearts'), { animate: false });
    expect(handView.getCards()).toHaveLength(2);

    const removed = handView.removeCard(0, { animate: false });
    expect(removed?.rank).toBe('A');
    expect(handView.getCards()).toHaveLength(1);
    expect(handView.getCards()[0].rank).toBe('K');

    handView.destroy();
  });

  it('PileView reflects pile state after setPile and update', () => {
    const pileView = new PileView(scene, { x: 500, y: 150, label: 'Deck' });
    const pile = new Pile<Card>();

    pile.push(makeCard('A', 'spades', false));
    pileView.setPile(pile);

    expect(pileView.peek()?.rank).toBe('A');
    expect(pileView.getPile()?.size()).toBe(1);

    pile.pop();
    pileView.update();
    expect(pileView.peek()).toBeUndefined();

    pileView.destroy();
  });

  it('PileView onClick fires callback', () => {
    const pileView = new PileView(scene, { x: 500, y: 150, label: 'Deck' });
    const handler = vi.fn();
    pileView.onClick(handler);

    // Find and invoke the pointerdown handler on the sprite
    const sprite = scene._images[0];
    const pointerdownCall = sprite.on.mock.calls.find((c: any[]) => c[0] === 'pointerdown');
    if (pointerdownCall) pointerdownCall[1]();

    expect(handler).toHaveBeenCalledOnce();
    pileView.destroy();
  });

  it('full hand+pile workflow mimics scene usage', () => {
    // Simulate the reset -> draw -> select -> discard workflow
    const rng = createSeededRng(42);
    const deck = createStandardDeck();
    shuffleArray(deck, rng);
    const drawPile = new Pile<Card>(deck);
    const discardPile = new Pile<Card>();

    const handView = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
    const deckView = new PileView(scene, { x: 500, y: 150, label: 'Deck' });
    const discardView = new PileView(scene, { x: 700, y: 150, label: 'Discard' });

    deckView.setPile(drawPile);
    discardView.setPile(discardPile);

    // Draw 5 cards to hand
    const hand: Card[] = [];
    for (let i = 0; i < 5; i++) {
      const card = drawPile.pop()!;
      card.faceUp = true;
      hand.push(card);
    }

    handView.setCards(hand);
    deckView.update();

    expect(handView.getCards()).toHaveLength(5);
    expect(deckView.getPile()?.size()).toBe(47);

    // Select card at index 2
    handView.setSelected(2);
    expect(handView.getSelected()).toBe(2);

    // Discard selected card
    const selectedIdx = handView.getSelected()!;
    const discarded = hand.splice(selectedIdx, 1)[0];
    discarded.faceUp = false;
    discardPile.push(discarded);
    handView.setCards(hand);
    handView.setSelected(null);
    discardView.update();
    deckView.update();

    expect(handView.getCards()).toHaveLength(4);
    expect(discardPile.size()).toBe(1);
    expect(handView.getSelected()).toBeNull();

    handView.destroy();
    deckView.destroy();
    discardView.destroy();
  });

  it('GymHandPileScene source configures bottom hand, arc slider, and hidden labels', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts'),
      'utf-8',
    );

    expect(source).toContain('HAND_BASE_Y = GAME_H - CARD_H - 80');
    expect(source).toContain('showLabels: false');
    expect(source).toContain('arcRadius: this.arcRadius');
    expect(source).toContain('minValue: 0');
    expect(source).toContain('maxValue: 200');
    expect(source).toContain('setArcRadius');
  });
});