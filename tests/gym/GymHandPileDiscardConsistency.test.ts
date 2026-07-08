/**
 * GymHandPileScene Discard Consistency Tests
 *
 * Validates that discardSelected() never orphans a card — the card
 * must always be either in `this.hand` or `this.discardPile` at every
 * point during the discard operation, even if the animation is
 * interrupted or never fires its completion event.
 *
 * @module tests/gym/GymHandPileDiscardConsistency.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Pile } from '../../src/card-system/Pile';
import { HandView } from '../../src/ui/HandView';
import { PileView } from '../../src/ui/PileView';
import { GameEventEmitter } from '../../src/core-engine';
import { CARD_H, GAME_H } from '../../src/ui/constants';
import type { Card } from '../../src/card-system/Card';

// ── Minimal Phaser mock ─────────────────────────────────────

function createMockScene(): any {
  const images: any[] = [];
  const texts: any[] = [];
  const destroyed: any[] = [];
  const tweens: any[] = [];

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
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockImplementation(() => {
        destroyed.push(img);
        img.active = false;
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
      setColor: vi.fn().mockReturnThis(),
      setText: vi.fn().mockImplementation((t: string) => { txt.text = t; }),
      active: true,
      destroy: vi.fn().mockImplementation(() => {
        destroyed.push(txt);
        txt.active = false;
      }),
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
        // Do NOT auto-fire onComplete so we can test interrupted animations
        return { stop: vi.fn() };
      }),
    },
    events: {
      once: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    time: {
      delayedCall: vi.fn((_delay: number, fn: () => void) => {
        // Fire delayed callbacks synchronously for test determinism
        fn();
        return { remove: vi.fn() };
      }),
    },
    sound: {
      play: vi.fn(),
      add: vi.fn(() => ({ play: vi.fn(), stop: vi.fn() })),
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
  };
}

// ── Reusable test helpers ───────────────────────────────────

function makeCard(rank: string, suit: string, faceUp = true): Card {
  return { rank, suit, faceUp } as Card;
}

/** Simulates the scene's discardSelected logic with the fix applied. */
function simulateDiscardSelected(
  hand: Card[],
  discardPile: Pile<Card>,
  handView: HandView,
  discardView: PileView,
  selectedIdx: number,
  reducedMotion: boolean,
  skipAnimationComplete: boolean,
): void {
  if (selectedIdx < 0 || selectedIdx >= hand.length) return;

  // Remove the card from hand model
  const card = hand.splice(selectedIdx, 1)[0];

  // FIX: Immediately update data model before any animation
  card.faceUp = false;
  discardPile.push(card);

  const sprite = handView.getSpriteAt(selectedIdx);

  if (sprite && !reducedMotion) {
    const gameEvents = new GameEventEmitter();

    gameEvents.on('card:discarded', () => {
      // Data model is already consistent — only UI cleanup needed
      handView.setCards(hand);
      handView.setSelected(null);
      discardView.update();
    });

    // If skipAnimationComplete is true, we simulate an interrupted
    // animation by calling discardCard without the animation completion
    // callback actually running. In the fixed code, the card is already
    // in discardPile before the animation starts, so it's not orphaned.
    if (!skipAnimationComplete) {
      // Simulate animation completion
      gameEvents.emit('card:discarded', {});
    }
  } else {
    if (sprite) {
      sprite.destroy();
    }
    // Data model already updated — just UI cleanup
    handView.setCards(hand);
    handView.setSelected(null);
    discardView.update();
  }
}

// ── Tests ───────────────────────────────────────────────────

describe('GymHandPileScene discard consistency', () => {
  let scene: ReturnType<typeof createMockScene>;
  let handView: HandView;
  let discardView: PileView;
  let hand: Card[];
  let discardPile: Pile<Card>;

  beforeEach(() => {
    scene = createMockScene();
    hand = [];
    discardPile = new Pile<Card>();

    // Create HandView
    handView = new HandView(scene, {
      baseX: 320,
      baseY: GAME_H - CARD_H - 80,
      spacing: 20,
      arcRadius: 150,
      showLabels: false,
      maxRotationDegrees: 25,
      reducedMotion: false,
    });

    discardView = new PileView(scene, { x: 640, y: 250, label: 'Discard' });
    discardView.setPile(discardPile);

    // Populate hand with test cards
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
  // Core consistency: card is never orphaned
  // ═══════════════════════════════════════════════════════════

  it('card is in discardPile immediately after splice, before animation completes', () => {
    const selectedIdx = 1; // Select K of hearts

    simulateDiscardSelected(
      hand, discardPile, handView, discardView,
      selectedIdx, false, false,
    );

    // After discardSelected returns, the card should be in discardPile
    expect(discardPile.size()).toBe(1);
    const discarded = discardPile.peek();
    expect(discarded?.rank).toBe('K');
    expect(discarded?.suit).toBe('hearts');
    expect(discarded?.faceUp).toBe(false);

    // Card should NOT be in hand anymore
    expect(hand).toHaveLength(2);
    expect(hand.find((c) => c.rank === 'K' && c.suit === 'hearts')).toBeUndefined();
  });

  it('card is NOT orphaned when animation completion never fires', () => {
    const selectedIdx = 1;

    // Simulate discard where animation completion does NOT fire
    simulateDiscardSelected(
      hand, discardPile, handView, discardView,
      selectedIdx, false, true, // skipAnimationComplete = true
    );

    // Card must still be in discardPile (not orphaned)
    expect(discardPile.size()).toBe(1);
    expect(discardPile.peek()?.rank).toBe('K');
    expect(discardPile.peek()?.suit).toBe('hearts');
  });

  it('card is either in hand or discardPile at all times during animated discard', () => {
    const selectedIdx = 0; // Select A of spades

    // Step 1: Record which cards are in hand before
    const handBefore = [...hand];
    expect(handBefore.find((c) => c.rank === 'A' && c.suit === 'spades')).toBeDefined();
    expect(discardPile.size()).toBe(0);

    // Step 2: Simulate the fixed discard logic — splice + push to discard
    const removed = hand.splice(selectedIdx, 1)[0];
    removed.faceUp = false;
    discardPile.push(removed);

    // At this point (after data model update, before animation), card is in discardPile
    expect(hand.find((c) => c.rank === 'A' && c.suit === 'spades')).toBeUndefined();
    expect(discardPile.size()).toBe(1);
    expect(discardPile.peek()?.rank).toBe('A');

    // Step 3: Even if we do nothing more (animation never completes),
    // the card is safely in discardPile — not orphaned!
    const allCards = [...hand];
    for (let i = 0; i < discardPile.size(); i++) {
      allCards.push(discardPile.toArray()[i]);
    }
    const isCardPresent = allCards.some(
      (c) => c.rank === 'A' && c.suit === 'spades',
    );
    expect(isCardPresent).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════
  // Normal animated discard still works
  // ═══════════════════════════════════════════════════════════

  it('normal animated discard still works with visual effect', () => {
    const selectedIdx = 0; // Select A of spades

    // Full animation path
    simulateDiscardSelected(
      hand, discardPile, handView, discardView,
      selectedIdx, false, false,
    );

    // Card should be in discard pile
    expect(discardPile.size()).toBe(1);
    expect(discardPile.peek()?.rank).toBe('A');

    // Hand should have 2 cards left
    expect(hand).toHaveLength(2);

    // HandView should reflect hand state
    expect(handView.getCards()).toHaveLength(2);
  });

  it('reduced-motion discard still works', () => {
    const selectedIdx = 2; // Select Q of clubs

    simulateDiscardSelected(
      hand, discardPile, handView, discardView,
      selectedIdx, true, false,
    );

    // Card should be in discard pile
    expect(discardPile.size()).toBe(1);
    expect(discardPile.peek()?.rank).toBe('Q');

    // Hand should have 2 cards left
    expect(hand).toHaveLength(2);
  });

  it('discard with invalid selection does nothing', () => {
    simulateDiscardSelected(
      hand, discardPile, handView, discardView,
      -1, false, false,
    );

    // Nothing should change
    expect(hand).toHaveLength(3);
    expect(discardPile.size()).toBe(0);
  });

  it('discard with out-of-range index does nothing', () => {
    simulateDiscardSelected(
      hand, discardPile, handView, discardView,
      99, false, false,
    );

    expect(hand).toHaveLength(3);
    expect(discardPile.size()).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════
  // Sequential discards
  // ═══════════════════════════════════════════════════════════

  it('sequential discards all land in discardPile', () => {
    // Discard all 3 cards one by one
    simulateDiscardSelected(hand, discardPile, handView, discardView, 0, false, true);
    simulateDiscardSelected(hand, discardPile, handView, discardView, 0, false, true);
    simulateDiscardSelected(hand, discardPile, handView, discardView, 0, false, true);

    expect(hand).toHaveLength(0);
    expect(discardPile.size()).toBe(3);
  });

  // ═══════════════════════════════════════════════════════════
  // Source-level verification
  // ═══════════════════════════════════════════════════════════

  it('scene source pushes to discardPile before animation starts', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts'),
      'utf-8',
    );

    // In the discardSelected method, push should come before discardCard
    // Find the relevant section — note: method is 'private discardSelected'
    const discardStart = source.indexOf('private discardSelected');
    // The next method after discardSelected is the async recallFromDiscard
    const recallStart = source.indexOf('private async recallFromDiscard');

    expect(discardStart).toBeGreaterThan(0);
    expect(recallStart).toBeGreaterThan(discardStart);

    const discardSelectedSection = source.substring(discardStart, recallStart);

    const sectionPushPos = discardSelectedSection.indexOf('this.discardPile.push(');
    const sectionDiscardCardPos = discardSelectedSection.indexOf('discardCard({');

    expect(sectionPushPos).toBeGreaterThan(0);
    expect(sectionDiscardCardPos).toBeGreaterThan(0);
    expect(sectionPushPos).toBeLessThan(sectionDiscardCardPos);
  });
});
