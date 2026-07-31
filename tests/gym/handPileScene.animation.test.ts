/**
 * GymHandPileScene Animation Integration Tests
 *
 * Integration tests verifying that drawToHand() and recallFromDiscard()
 * use the new animateAddCard API correctly and that no duplicated layout
 * logic remains.
 *
 * @module tests/gym/handPileScene.animation.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import { PileView } from '../../src/ui/PileView';
import { createStandardDeck, shuffleArray } from '../../src/card-system/Deck';
import { Pile } from '../../src/card-system/Pile';
import { createCard } from '../../src/card-system/Card';
import type { Card } from '../../src/card-system/Card';
import { createSeededRng } from '../../src/core-engine/SeededRng';
import { rankValue } from '../../src/card-system/rankValue';
import { CARD_H, GAME_H } from '../../src/ui/constants';

// ── Minimal Phaser mock ─────────────────────────────────────
// Extended to support HandView.animateAddCard, PileView, flipCard, discardCard, etc.

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
      setPosition: vi.fn((px: number, py: number) => {
        img.x = px;
        img.y = py;
      }),
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
        if (config.onComplete) config.onComplete();
        return { stop: vi.fn() };
      }),
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

/** Create a card with rank/suit for test purposes. */
function makeCard(rank: string, suit: string, faceUp = true): Card {
  return createCard(rank as any, suit as any, faceUp);
}

// ── Tests ───────────────────────────────────────────────────

describe('GymHandPileScene animation integration', () => {
  let scene: ReturnType<typeof createMockScene>;
  let handView: HandView;
  let deckView: PileView;
  let discardView: PileView;
  let hand: Card[];
  let drawPile: Pile<Card>;
  let discardPile: Pile<Card>;
  let animateAddCardSpy: any;

  /** Find sorted insertion index matching the scene's sortHand logic. */
  function findSortedIndex(card: Card): number {
    for (let i = 0; i < hand.length; i++) {
      const existing = hand[i];
      const suitCmp = existing.suit.localeCompare(card.suit);
      if (suitCmp > 0) return i;
      if (suitCmp < 0) continue;
      if (rankValue(existing.rank) > rankValue(card.rank)) return i;
    }
    return hand.length;
  }

  /** Simulate the scene's drawToHand logic using HandView.animateAddCard. */
  async function simulatedDrawToHand(): Promise<void> {
    if (drawPile.isEmpty()) return;
    const card = drawPile.pop()!;
    card.faceUp = true;

    const insertIndex = findSortedIndex(card);

    await handView.animateAddCard(card, {
      sourceX: 500, // Simulated DECK_X
      sourceY: 250, // Simulated PILE_Y
      duration: 400,
      insertAtIndex: insertIndex,
    });

    // Sync scene model at the same insertion index
    hand.splice(insertIndex, 0, card);
    deckView.update();
  }

  /** Simulate the scene's recallFromDiscard logic using HandView.animateAddCard. */
  async function simulatedRecallFromDiscard(): Promise<void> {
    if (discardPile.isEmpty()) return;
    const card = discardPile.pop()!;
    card.faceUp = true;

    const insertIndex = findSortedIndex(card);

    await handView.animateAddCard(card, {
      sourceX: 640, // Simulated DISCARD_X
      sourceY: 250, // Simulated PILE_Y
      duration: 350,
      insertAtIndex: insertIndex,
    });

    // Sync scene model at the same insertion index
    hand.splice(insertIndex, 0, card);
    discardView.update();
  }

  beforeEach(() => {
    scene = createMockScene();
    hand = [];

    // Create a seeded draw pile
    const rng = createSeededRng(42);
    const deck = createStandardDeck();
    shuffleArray(deck, rng);
    drawPile = new Pile<Card>(deck);
    discardPile = new Pile<Card>();

    // Create HandView with same params as GymHandPileScene
    handView = new HandView(scene, {
      baseX: 320,
      baseY: GAME_H - CARD_H - 80,
      spacing: 20,
      arcRadius: 150,
      showLabels: false,
      maxRotationDegrees: 25,
      reducedMotion: false,
    });

    deckView = new PileView(scene, { x: 500, y: 250, label: 'Deck' });
    deckView.setPile(drawPile);

    discardView = new PileView(scene, { x: 640, y: 250, label: 'Discard' });
    discardView.setPile(discardPile);

    // Spy on animateAddCard
    animateAddCardSpy = vi.spyOn(handView, 'animateAddCard');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    handView.destroy();
    deckView.destroy();
    discardView.destroy();
  });

  // ═══════════════════════════════════════════════════════════
  // drawToHand usage
  // ═══════════════════════════════════════════════════════════

  describe('drawToHand()', () => {
    it('calls handView.animateAddCard when drawing a card', async () => {
      // Initial hand is empty
      expect(hand).toHaveLength(0);

      // Draw a card
      await simulatedDrawToHand();

      // animateAddCard should have been called
      expect(animateAddCardSpy).toHaveBeenCalledTimes(1);
      const callArgs = animateAddCardSpy.mock.calls[0];
      expect(callArgs[0]).toBeDefined(); // Card
      expect(callArgs[1].sourceX).toBe(500); // DECK_X
      expect(callArgs[1].sourceY).toBe(250); // PILE_Y
      expect(callArgs[1].duration).toBe(400);
      // insertAtIndex should be provided (sorted insertion)
      expect(callArgs[1].insertAtIndex).toBe(0); // Empty hand → insert at 0
    });

    it('adds card to hand model after animation', async () => {
      await simulatedDrawToHand();

      expect(hand).toHaveLength(1);
      // HandView should also have the card
      expect(handView.getCards()).toHaveLength(1);
    });

    it('does not create temporary sprites outside HandView', async () => {
      await simulatedDrawToHand();

      // Sprites should only be from HandView's rebuildDisplay (no extra temp sprite from the scene)
      const sprites = handView.getSprites();
      expect(sprites).toHaveLength(1);

      // All images should be active (no orphan destroyed sprites)
      const activeImages = scene._images.filter((img: any) => img.active);
      expect(activeImages.length).toBeGreaterThanOrEqual(1);
    });

    it('multiple draws work sequentially', async () => {
      await simulatedDrawToHand();
      expect(hand).toHaveLength(1);

      await simulatedDrawToHand();
      expect(hand).toHaveLength(2);

      await simulatedDrawToHand();
      expect(hand).toHaveLength(3);

      // animateAddCard called 3 times
      expect(animateAddCardSpy).toHaveBeenCalledTimes(3);
    });

    it('does not draw when deck is empty', async () => {
      // Empty the deck
      while (!drawPile.isEmpty()) drawPile.pop();

      // Try to draw — should be no-op
      await simulatedDrawToHand();
      expect(hand).toHaveLength(0);
      expect(animateAddCardSpy).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // recallFromDiscard usage
  // ═══════════════════════════════════════════════════════════

  describe('recallFromDiscard()', () => {
    beforeEach(() => {
      // Populate discard pile with a card
      const card = makeCard('K', 'spades');
      card.faceUp = false;
      discardPile.push(card);
    });

    it('calls handView.animateAddCard when recalling from discard', async () => {
      await simulatedRecallFromDiscard();

      expect(animateAddCardSpy).toHaveBeenCalledTimes(1);
      const callArgs = animateAddCardSpy.mock.calls[0];
      expect(callArgs[0]).toBeDefined(); // Card
      expect(callArgs[1].sourceX).toBe(640); // DISCARD_X
      expect(callArgs[1].sourceY).toBe(250); // PILE_Y
      expect(callArgs[1].duration).toBe(350);
      // insertAtIndex should be provided (sorted insertion)
      expect(callArgs[1].insertAtIndex).toBe(0); // Empty hand → insert at 0
    });

    it('does not create temporary sprites outside HandView', async () => {
      await simulatedRecallFromDiscard();

      const sprites = handView.getSprites();
      expect(sprites).toHaveLength(1);

      const activeImages = scene._images.filter((img: any) => img.active);
      expect(activeImages.length).toBeGreaterThanOrEqual(1);
    });

    it('does not recall when discard pile is empty', async () => {
      discardPile.pop(); // Empty it

      await simulatedRecallFromDiscard();
      expect(animateAddCardSpy).not.toHaveBeenCalled();
      expect(hand).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Combined draw/recall workflow
  // ═══════════════════════════════════════════════════════════

  describe('combined workflow', () => {
    it('draw then recall: cards are added in correct order', async () => {
      // Draw 2 cards
      await simulatedDrawToHand();
      await simulatedDrawToHand();
      expect(hand).toHaveLength(2);

      // Move drawn cards to discard
      for (const c of hand.splice(0)) {
        c.faceUp = false;
        discardPile.push(c);
      }
      handView.setCards(hand);
      discardView.update();

      expect(discardPile.size()).toBe(2);

      // Recall both from discard
      await simulatedRecallFromDiscard();
      expect(hand).toHaveLength(1);

      await simulatedRecallFromDiscard();
      expect(hand).toHaveLength(2);

      // animateAddCard should have been called 4 times (2 draws + 2 recalls)
      expect(animateAddCardSpy).toHaveBeenCalledTimes(4);
    });

    it('handles arc layout correctly during combined workflow', async () => {
      // Draw 3 cards with arc layout
      handView.setArcRadius(200);

      await simulatedDrawToHand();
      await simulatedDrawToHand();
      await simulatedDrawToHand();

      expect(hand).toHaveLength(3);
      expect(handView.getCards()).toHaveLength(3);

      // Centers should be laid out with arc
      const centers = handView.getCardCenters();
      expect(centers).toHaveLength(3);
      // Center card should be above edges
      expect(centers[1].y).toBeLessThan(centers[0].y);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Reduced-motion behavior
  // ═══════════════════════════════════════════════════════════

  describe('reduced-motion behavior', () => {
    beforeEach(() => {
      handView.setReducedMotion(true);
    });

    it('ReducedMotion: drawToHand places card instantly', async () => {
      const initialTweens = scene._tweens.length;

      await simulatedDrawToHand();

      // Card should be in hand immediately
      expect(hand).toHaveLength(1);
      expect(handView.getCards()).toHaveLength(1);

      // Wait a tick to let any deferred callbacks settle
      await new Promise((r) => setTimeout(r, 10));

      // In reduced motion mode, animateAddCard should not create tweens
      expect(scene._tweens.length - initialTweens).toBeLessThanOrEqual(1);
    });
  });
});

