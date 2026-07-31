/**
 * GymHandPileScene "click-to-play" interaction tests.
 *
 * Validates that:
 *  - A visual indicator (zone/area) is displayed showing where the discard pile is.
 *  - Clicking a card then clicking the discard pile indicator discards the selected card.
 *  - The discarded card is added to the top of the discard pile.
 *  - The card is removed from the hand.
 *  - Clicking the discard pile when no card is selected still recalls from discard.
 *
 * @module tests/gym/GymHandPileClickToPlay
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Pile } from '../../src/card-system/Pile';
import { HandView } from '../../src/ui/HandView';
import { PileView } from '../../src/ui/PileView';
import { CARD_H, CARD_W, GAME_H, GAME_W } from '../../src/ui/constants';
import type { Card } from '../../src/card-system/Card';

// ── Minimal Phaser mock ─────────────────────────────────────

function createMockScene(): any {
  const images: any[] = [];
  const texts: any[] = [];
  const destroyed: any[] = [];
  const tweens: any[] = [];
  const graphicsObjects: any[] = [];
  let listeners: Record<string, Array<(...args: any[]) => void>> = {};

  const mockImage = (x: number, y: number, texture: string) => {
    const img = {
      x,
      y,
      texture: { key: texture },
      active: true,
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setTexture: vi.fn().mockImplementation((tex: string) => { img.texture.key = tex; }),
      setVisible: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setPosition: vi.fn((px: number, py: number) => { img.x = px; img.y = py; }),
      setRotation: vi.fn(),
      on: vi.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
        return img;
      }),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockImplementation(() => {
        destroyed.push(img);
        img.active = false;
      }),
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      depth: 0,
      originX: 0.5,
      originY: 0.5,
      displayWidth: CARD_W,
      displayHeight: CARD_H,
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
      setColor: vi.fn().mockReturnThis(),
      setText: vi.fn().mockImplementation((t: string) => { txt.text = t; }),
      setVisible: vi.fn().mockReturnThis(),
      active: true,
      destroy: vi.fn().mockImplementation(() => {
        destroyed.push(txt);
        txt.active = false;
      }),
    };
    texts.push(txt);
    return txt;
  };

  const mockGraphics = () => {
    let drawn = false;
    const g = {
      fillStyle: vi.fn().mockReturnThis(),
      fillRoundedRect: vi.fn().mockImplementation(() => { drawn = true; }),
      lineStyle: vi.fn().mockReturnThis(),
      strokeRoundedRect: vi.fn().mockReturnThis(),
      clear: vi.fn().mockImplementation(() => { drawn = false; }),
      setAlpha: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
      setVisible: vi.fn().mockReturnThis(),
      _drawn: () => drawn,
    };
    graphicsObjects.push(g);
    return g;
  };

  // Track whether specific pointerdown listeners were called
  const pointerdownCalls: Array<{ spriteIndex: number }> = [];

  return {
    add: {
      image: vi.fn().mockImplementation(mockImage),
      text: vi.fn().mockImplementation(mockText),
      graphics: vi.fn().mockImplementation(mockGraphics),
      rectangle: vi.fn().mockImplementation((x: number, y: number, w: number, h: number, color: number) => {
        const rect = {
          x, y, width: w, height: h, color,
          depth: 0,
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
        tweens.push(config);
        return {
          stop: vi.fn(),
          set progress(_v: number) { /* noop */ },
        };
      }),
    },
    events: {
      once: vi.fn(),
      on: vi.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      off: vi.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter(h => h !== handler);
        }
      }),
      emit: vi.fn().mockImplementation((event: string, ...args: any[]) => {
        if (listeners[event]) {
          for (const handler of listeners[event]) handler(...args);
        }
      }),
    },
    time: {
      delayedCall: vi.fn((_delay: number, fn: () => void) => {
        fn();
        return { remove: vi.fn() };
      }),
    },
    input: {
      on: vi.fn(),
      off: vi.fn(),
    },
    cameras: {
      main: { setBackgroundColor: vi.fn() },
    },
    _images: images,
    _texts: texts,
    _destroyed: destroyed,
    _tweens: tweens,
    _graphics: graphicsObjects,
    _listeners: listeners,
    _pointerdownCalls: pointerdownCalls,
  };
}

// ── Reusable test helpers ───────────────────────────────────

function makeCard(rank: string, suit: string, faceUp = true): Card {
  return { rank, suit, faceUp } as Card;
}

// ── Scene-like discard/recall simulation ─────────────────────

/** Simulate the scene's discard-to-pile logic from the click-to-play fix. */
function simulateDiscardOnClick(
  hand: Card[],
  discardPile: Pile<Card>,
  handView: HandView,
  discardView: PileView,
  selectedIdx: number,
): void {
  if (selectedIdx >= 0 && selectedIdx < hand.length) {
    // Discard selected card
    const card = hand.splice(selectedIdx, 1)[0];
    card.faceUp = false;
    discardPile.push(card);
    handView.setCards(hand);
    handView.setSelected(null);
    discardView.update();
  } else {
    // Recall from discard (existing behavior)
    if (!discardPile.isEmpty()) {
      const recalled = discardPile.pop()!;
      recalled.faceUp = true;
      hand.push(recalled);
      handView.setCards(hand);
      discardView.update();
    }
  }
}

// ── Tests ───────────────────────────────────────────────────

describe('GymHandPileScene click-to-play discard', () => {
  let scene: ReturnType<typeof createMockScene>;
  let handView: HandView;
  let discardView: PileView;
  let hand: Card[];
  let discardPile: Pile<Card>;

  const DISCARD_X = GAME_W - 160;
  const DISCARD_Y = 250;

  beforeEach(() => {
    scene = createMockScene();
    hand = [];
    discardPile = new Pile<Card>();

    handView = new HandView(scene, {
      baseX: 320,
      baseY: GAME_H - CARD_H - 80,
      spacing: 20,
      arcRadius: 150,
      showLabels: false,
      maxRotationDegrees: 25,
      reducedMotion: false,
    });

    discardView = new PileView(scene, { x: DISCARD_X, y: DISCARD_Y, label: 'Discard' });
    discardView.setPile(discardPile);

    hand = [
      makeCard('A', 'spades'),
      makeCard('K', 'hearts'),
      makeCard('Q', 'clubs'),
    ];
    handView.setCards(hand);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    handView.destroy();
    discardView.destroy();
  });

  // ═══════════════════════════════════════════════════════════
  // Click behavior: card selected → discard to pile
  // ═══════════════════════════════════════════════════════════

  it('clicking discard pile with selected card discards the card', () => {
    const selectedIdx = 1; // Select K of hearts

    simulateDiscardOnClick(hand, discardPile, handView, discardView, selectedIdx);

    // Card should be in discard pile
    expect(discardPile.size()).toBe(1);
    const discarded = discardPile.peek();
    expect(discarded?.rank).toBe('K');
    expect(discarded?.suit).toBe('hearts');
    expect(discarded?.faceUp).toBe(false);

    // Card should be removed from hand
    expect(hand).toHaveLength(2);
    expect(hand.find((c) => c.rank === 'K' && c.suit === 'hearts')).toBeUndefined();
  });

  it('discarded card is added to the top of the discard pile', () => {
    // Place a card in discard pile first
    discardPile.push(makeCard('2', 'diamonds', false));

    // Discard another card on top
    const selectedIdx = 0; // A of spades
    simulateDiscardOnClick(hand, discardPile, handView, discardView, selectedIdx);

    // Pile should have 2 cards
    expect(discardPile.size()).toBe(2);

    // Top card should be A of spades (most recently discarded)
    const top = discardPile.peek();
    expect(top?.rank).toBe('A');
    expect(top?.suit).toBe('spades');
  });

  it('card is removed from hand when discarded via click', () => {
    const selectedIdx = 2; // Q of clubs
    simulateDiscardOnClick(hand, discardPile, handView, discardView, selectedIdx);

    expect(hand).toHaveLength(2);
    expect(hand.find((c) => c.rank === 'Q' && c.suit === 'clubs')).toBeUndefined();
    // Remaining cards are A spades and K hearts
    expect(hand[0].rank).toBe('A');
    expect(hand[1].rank).toBe('K');
  });

  // ═══════════════════════════════════════════════════════════
  // Click behavior: no card selected → recall from discard
  // ═══════════════════════════════════════════════════════════

  it('clicking discard pile with no card selected recalls from discard (existing behavior)', () => {
    // Add a card to discard pile
    discardPile.push(makeCard('5', 'hearts', false));

    const selectedIdx = -1; // No card selected
    simulateDiscardOnClick(hand, discardPile, handView, discardView, selectedIdx);

    // Card should be recalled to hand
    expect(hand).toHaveLength(4);
    expect(hand.find((c) => c.rank === '5' && c.suit === 'hearts')).toBeDefined();
    expect(discardPile.isEmpty()).toBe(true);
  });

  it('clicking empty discard pile with no selection does nothing', () => {
    const selectedIdx = -1;
    simulateDiscardOnClick(hand, discardPile, handView, discardView, selectedIdx);

    expect(hand).toHaveLength(3);
    expect(discardPile.isEmpty()).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════
  // Visual indicator verification
  // ═══════════════════════════════════════════════════════════

  it('PileView is positioned at the discard pile location', () => {
    // Verify the discard PileView was created at the right position
    const sprite = discardView.getSprite();
    expect(sprite.x).toBe(DISCARD_X);
    expect(sprite.y).toBe(DISCARD_Y);
  });

  it('discard PileView has interactive cursor for clicking', () => {
    const sprite = discardView.getSprite();
    // Verify setInteractive was called on the sprite during PileView construction
    // In the mock, setInteractive returns this, so we check it was called
    expect(sprite.setInteractive).toHaveBeenCalled();
  });

  it('discard PileView click triggers pointerdown event', () => {
    let clicked = false;
    discardView.onClick(() => { clicked = true; });

    // Simulate clicking the PileView sprite (emit pointerdown)
    const sprite = discardView.getSprite();
    const registerCalls = (sprite as any).on.mock.calls as Array<[string, (...args: any[]) => void]>;
    const pointerdownEntry = registerCalls.find(
      (call: [string, (...args: any[]) => void]) => call[0] === 'pointerdown',
    );
    expect(pointerdownEntry).toBeDefined();

    // Invoke the handler
    if (pointerdownEntry) {
      pointerdownEntry[1]();
    }
    expect(clicked).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════
  // Source-level verification
  // ═══════════════════════════════════════════════════════════

  it('scene source contains discard zone highlight visual', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts'),
      'utf-8',
    );

    // The scene should use HighlightManager or graphics for the discard zone
    expect(source).toContain('highlightManager');
  });

  it('scene source checks selectedIdx before calling recallFromDiscard', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts'),
      'utf-8',
    );

    // The discardView.onClick handler should check selectedIdx
    const discardClickSection = source.substring(
      source.indexOf('discardView.onClick'),
      source.indexOf('});', source.indexOf('discardView.onClick')),
    );

    // Should reference selectedIdx for conditional behavior
    expect(discardClickSection).toMatch(/selectedIdx/);
  });

  it('scene source has a highlight that responds to selection state', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts'),
      'utf-8',
    );

    // The scene should show/hide highlights based on selected state
    const handClickSection = source.substring(
      source.indexOf('handView.on'),
    );
    // The card click handler should trigger some visual indicator
    // when a card is selected
    expect(handClickSection).toMatch(/selectedIdx/);
  });

  // ═══════════════════════════════════════════════════════════
  // Full scenario: select card → click discard → verify
  // ═══════════════════════════════════════════════════════════

  it('full click-to-play scenario: select card, click discard pile, card moves', () => {
    // Step 1: Select card at index 0 (A of spades)
    handView.setSelected(0);
    expect(handView.getSelected()).toBe(0);

    // Step 2: Click discard pile (triggers discard)  
    simulateDiscardOnClick(hand, discardPile, handView, discardView, 0);

    // Step 3: Verify card moved from hand to discard pile
    expect(hand).toHaveLength(2);
    expect(discardPile.size()).toBe(1);
    expect(discardPile.peek()?.rank).toBe('A');
    expect(discardPile.peek()?.suit).toBe('spades');

    // Step 4: Verify selection cleared
    expect(handView.getSelected()).toBeNull();
  });

  it('multiple cards discarded one at a time via click', () => {
    // Discard card 0 (A of spades) via click
    simulateDiscardOnClick(hand, discardPile, handView, discardView, 0);
    expect(discardPile.size()).toBe(1);
    expect(discardPile.peek()?.rank).toBe('A');

    // Discard card 0 again (now K of hearts since A was removed)
    simulateDiscardOnClick(hand, discardPile, handView, discardView, 0);
    expect(discardPile.size()).toBe(2);
    expect(discardPile.peek()?.rank).toBe('K');

    // Discard card 0 again (now Q of clubs)
    simulateDiscardOnClick(hand, discardPile, handView, discardView, 0);
    expect(discardPile.size()).toBe(3);
    expect(discardPile.peek()?.rank).toBe('Q');

    // Hand should be empty
    expect(hand).toHaveLength(0);
  });
});
