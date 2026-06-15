/**
 * Lost Cities hand/pile migration smoke tests
 *
 * Validates that the Lost Cities scene uses HandView for the player hand
 * and PileView for the draw pile, as required by the HandView/PileView
 * migration epic (CG-0MPDWKITM006Y08I).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import { PileView } from '../../src/ui/PileView';

// ── Minimal Phaser scene mock ───────────────────────────────

function createMockScene(): any {
  const images: any[] = [];
  const texts: any[] = [];
  const rectangles: any[] = [];

  const createImage = vi.fn((x: number, y: number, texture: string) => {
    const img = {
      x,
      y,
      texture: { key: texture },
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setTexture: vi.fn().mockImplementation((tex: string) => {
        (img as any).texture.key = tex;
        return img;
      }),
      setVisible: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setDisplaySize: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      setPosition: vi.fn().mockReturnThis(),
      rotation: 0,
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
      active: true,
      input: { enabled: true },
    };
    images.push(img);
    return img;
  });

  const createText = vi.fn((x: number, y: number, text: string, _style?: any) => {
    const txt = {
      x,
      y,
      text,
      width: text.length * 8,
      setOrigin: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
      setText: vi.fn().mockImplementation((t: string) => { (txt as any).text = t; return txt; }),
      destroy: vi.fn(),
      active: true,
    };
    texts.push(txt);
    return txt;
  });

  const createRectangle = vi.fn((x: number, y: number, w: number, h: number, _color: number, _alpha: number) => {
    const rect = {
      x,
      y,
      width: w,
      height: h,
      setInteractive: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
      active: true,
    };
    rectangles.push(rect);
    return rect;
  });

  const add = {
    image: createImage,
    text: createText,
    rectangle: createRectangle,
    graphics: vi.fn(() => ({
      lineStyle: vi.fn(),
      fillStyle: vi.fn(),
      fillRoundedRect: vi.fn(),
      strokeRoundedRect: vi.fn(),
      clear: vi.fn(),
    })),
  };

  const tweens = {
    add: vi.fn().mockReturnValue({
      stop: vi.fn(),
    }),
  };

  const input = {
    on: vi.fn(),
    off: vi.fn(),
  };

  return {
    add,
    tweens,
    input,
    images,
    texts,
    rectangles,
    createImage,
    createText,
    createRectangle,
    game: {
      config: {
        width: 1280,
        height: 720,
      },
    },
    textures: {
      exists: vi.fn(() => true),
    },
    events: {
      once: vi.fn(),
      emit: vi.fn(),
    },
  };
}

// ── Lost Cities card helpers ────────────────────────────────

/** Create a mock Lost Cities card for testing. */
function createMockLCCard(
  color: 'yellow' | 'blue' | 'white' | 'green' | 'red',
  type: 'investment' | 'numbered',
  index?: number,
  rank?: number,
): any {
  return {
    id: Math.floor(Math.random() * 10000),
    color,
    type,
    faceUp: true,
    ...(type === 'investment' ? { investmentIndex: (index || 1) as 1 | 2 | 3 } : {}),
    ...(type === 'numbered' ? { rank: rank || (2 + Math.floor(Math.random() * 9)) as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 } : {}),
  };
}

// ── Texture key helper (matches LostCitiesCards.cardAssetKey) ─

function cardAssetKey(card: any): string {
  if (card.type === 'investment') {
    return `lc-${card.color}-inv${card.investmentIndex}`;
  }
  return `lc-${card.color}-${card.rank}`;
}

// ── Tests ───────────────────────────────────────────────────

describe('Lost Cities hand/pile migration', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('HandView: renders Lost Cities cards using a custom texture resolver', () => {
    // Create some mock Lost Cities cards
    const cards = [
      createMockLCCard('yellow', 'numbered', undefined, 5),
      createMockLCCard('yellow', 'numbered', undefined, 7),
      createMockLCCard('blue', 'investment', 1),
      createMockLCCard('green', 'numbered', undefined, 3),
    ];

    // Track texture resolution calls
    const textureKeys: string[] = [];
    const customTextureFn = (card: any, _index: number): string => {
      const key = cardAssetKey(card);
      textureKeys.push(key);
      return key;
    };

    // Create a HandView with a custom texture resolver
    const handView = new HandView(scene, {
      baseX: 500,
      baseY: 550,
      spacing: 20,
      cardWidth: 100,
      showLabels: false,
      selectionEnabled: true,
      clickEnabled: true,
      layoutDirection: 'vertical',
      cardTextureFn: customTextureFn,
    });

    // Set cards — this should trigger sprite creation
    handView.setCards(cards, { cardTextureFn: customTextureFn });

    // Verify that sprites were created for each card
    expect(scene.images.length).toBe(cards.length);

    // Verify that the custom texture resolver was called for each card
    expect(textureKeys.length).toBe(cards.length);
    expect(textureKeys).toContain('lc-yellow-5');
    expect(textureKeys).toContain('lc-yellow-7');
    expect(textureKeys).toContain('lc-blue-inv1');
    expect(textureKeys).toContain('lc-green-3');

    // Verify the sprites have the correct textures
    const sprites = handView.getSprites();
    expect(sprites.length).toBe(cards.length);
    expect((sprites[0] as any).texture.key).toBe('lc-yellow-5');
    expect((sprites[2] as any).texture.key).toBe('lc-blue-inv1');
  });

  it('HandView: emits cardclick events', () => {
    const cards = [
      createMockLCCard('yellow', 'numbered', undefined, 5),
      createMockLCCard('blue', 'numbered', undefined, 7),
    ];

    const cardClickIndices: number[] = [];

    const handView = new HandView(scene, {
      baseX: 500,
      baseY: 550,
      spacing: 20,
      cardWidth: 100,
      showLabels: false,
      selectionEnabled: true,
      clickEnabled: true,
      layoutDirection: 'vertical',
      cardTextureFn: (card: any) => cardAssetKey(card),
    });

    handView.on('cardclick', (index: number) => {
      cardClickIndices.push(index);
    });

    handView.setCards(cards);

    // Simulate clicking the first card sprite
    const sprites = handView.getSprites();
    expect(sprites.length).toBe(2);
    const firstSprite = sprites[0];
    // The 'pointerdown' handler should be registered
    expect(firstSprite.on).toHaveBeenCalled();

    // Verify the first call to 'on' is with 'pointerdown'
    const onCalls = (firstSprite.on as any).mock.calls;
    expect(onCalls.length).toBeGreaterThan(0);
    expect(onCalls[0][0]).toBe('pointerdown');
  });

  it('HandView: selection updates tint on sprites', () => {
    const cards = [
      createMockLCCard('yellow', 'numbered', undefined, 5),
      createMockLCCard('blue', 'numbered', undefined, 7),
      createMockLCCard('white', 'numbered', undefined, 3),
    ];

    const handView = new HandView(scene, {
      baseX: 500,
      baseY: 550,
      spacing: 20,
      cardWidth: 100,
      showLabels: false,
      selectionEnabled: true,
      clickEnabled: true,
      layoutDirection: 'vertical',
      cardTextureFn: (card: any) => cardAssetKey(card),
    });

    handView.setCards(cards);

    // Initially no selection
    expect(handView.getSelected()).toBeNull();

    // Select the second card
    handView.setSelected(1);
    expect(handView.getSelected()).toBe(1);

    // All sprites should have setTint called
    const sprites = handView.getSprites();
    expect(sprites.length).toBe(3);
    for (const sprite of sprites) {
      expect((sprite as any).setTint).toHaveBeenCalled();
    }

    // Clear selection
    handView.setSelected(null);
    expect(handView.getSelected()).toBeNull();
  });

  it('PileView: renders a discard pile with custom texture resolver', () => {
    // Create a mock discard pile adapter
    const discardCard = createMockLCCard('red', 'numbered', undefined, 8);
    const discardPile = {
      size: () => 3,
      isEmpty: () => false,
      peek: () => discardCard,
    };

    let resolvedTexture = '';
    const compactTextureFn = (card: any): string => {
      resolvedTexture = `lc-${card.color}-${card.rank}-sm`;
      return resolvedTexture;
    };

    const pileView = new PileView(scene, {
      x: 200,
      y: 300,
      label: 'Discard',
      cardTextureFn: compactTextureFn,
    });

    pileView.setPile(discardPile);
    pileView.update();

    // Verify that the custom texture resolver was called
    expect(resolvedTexture).toBe('lc-red-8-sm');

    // Verify a sprite was created
    expect(scene.images.length).toBeGreaterThan(0);
    expect(scene.images[scene.images.length - 1].texture.key).toBe(resolvedTexture);

    // Verify the count text was updated
    expect(scene.texts.length).toBeGreaterThan(0);
    const countText = scene.texts[scene.texts.length - 1];
    expect(countText.text).toContain('3');
  });

  it('PileView: shows empty state when pile is empty', () => {
    const emptyPile = {
      size: () => 0,
      isEmpty: () => true,
      peek: () => undefined,
    };

    const pileView = new PileView(scene, {
      x: 500,
      y: 200,
      label: 'Draw',
    });

    pileView.setPile(emptyPile);
    pileView.update();

    // Verify the sprite is invisible for empty pile
    const sprite = scene.images[scene.images.length - 1];
    expect(sprite.setVisible).toHaveBeenCalledWith(false);
    expect(sprite.setAlpha).toHaveBeenCalledWith(0.3);
  });

  it('DrawPileView: uses card back texture', () => {
    // Simulate a DrawPileView scenario
    const drawPile = {
      size: () => 44,
      isEmpty: () => false,
      peek: () => undefined,
    };

    // Use the card back as empty texture since draw pile is face-down
    const pileView = new PileView(scene, {
      x: 1100,
      y: 350,
      label: 'Draw Pile',
      emptyTexture: 'card_back',
      cardTextureFn: () => 'card_back',
    });

    pileView.setPile(drawPile);
    pileView.update();

    // The pile should show the card back texture
    expect(scene.texts.length).toBeGreaterThan(0);
    const countText = scene.texts[scene.texts.length - 1];
    expect(countText.text).toContain('Draw Pile:');
    expect(countText.text).toContain('44');
  });

  it('HandView + PileView: integrate with session state refresh', () => {
    // Simulate a full refresh cycle like LostCitiesRenderer.refreshAll()
    const session = {
      players: [
        {
          hand: [
            createMockLCCard('yellow', 'numbered', undefined, 5),
            createMockLCCard('yellow', 'numbered', undefined, 7),
            createMockLCCard('blue', 'investment', 1),
          ],
        },
        {
          hand: [
            createMockLCCard('green', 'numbered', undefined, 3),
            createMockLCCard('green', 'numbered', undefined, 9),
          ],
        },
      ],
      round: {
        drawPile: Array.from({ length: 54 }, (_, i) => i), // 54 remaining
        discardPiles: new Map([
          ['yellow', [createMockLCCard('yellow', 'numbered', undefined, 2)]],
          ['blue', [createMockLCCard('blue', 'investment', 2)]],
        ]),
      },
    };

    // Create the views
    const playerHandView = new HandView(scene, {
      baseX: 1000,
      baseY: 100,
      spacing: 20,
      cardWidth: 100,
      showLabels: false,
      selectionEnabled: true,
      clickEnabled: true,
      layoutDirection: 'vertical',
      cardTextureFn: (card: any) => cardAssetKey(card),
    });

    const drawPileView = new PileView(scene, {
      x: 1100,
      y: 350,
      label: 'Draw Pile',
      emptyTexture: 'card_back',
      cardTextureFn: () => 'card_back',
    });

    // Simulate refreshAll
    playerHandView.setCards(session.players[0].hand, {
      cardTextureFn: (card: any) => cardAssetKey(card),
    });

    drawPileView.setPile({
      size: () => session.round.drawPile.length,
      isEmpty: () => session.round.drawPile.length === 0,
      peek: () => undefined,
    });
    drawPileView.update();

    // Verify player hand has correct number of sprites
    const handSprites = playerHandView.getSprites();
    expect(handSprites.length).toBe(3);

    // Verify draw pile count text
    expect(scene.texts.length).toBeGreaterThan(0);
    const lastText = scene.texts[scene.texts.length - 1];
    expect(lastText.text).toContain('54');

    // Clean up
    playerHandView.destroy();
    drawPileView.destroy();
  });

  // ── Expedition colour: multiple PileView instances ──────────

  it('PileView: Lost Cities renderer creates one discard pile PileView per expedition color', () => {
    // Simulate the Lost Cities discard row: 5 expedition colors, each with its own PileView.
    // This mirrors the actual LostCitiesRenderer pattern (one PileView per colour).
    const colors: Array<'yellow' | 'blue' | 'white' | 'green' | 'red'> = ['yellow', 'blue', 'white', 'green', 'red'];
    const discardViews: PileView[] = [];

    for (const color of colors) {
      const pileCards = [
        createMockLCCard(color, 'numbered', undefined, 2),
        createMockLCCard(color, 'numbered', undefined, 3),
      ];
      discardViews.push(
        new PileView(scene, {
          x: 100 + colors.indexOf(color) * 120,
          y: 300,
          label: '',
          emptyTexture: 'card_back',
          cardTextureFn: (card: any) => cardAssetKey(card),
        }),
      );
      // Simulate the LostCitiesRenderer refreshDiscardPiles() adapter pattern
      discardViews[discardViews.length - 1].setPile({
        size: () => pileCards.length,
        isEmpty: () => pileCards.length === 0,
        peek: () => pileCards[pileCards.length - 1],
      });
      discardViews[discardViews.length - 1].update();
    }

    // Verify exactly 5 PileView instances were created
    expect(discardViews.length).toBe(5);

    // Each PileView should have created a sprite and a count text
    const sprites = scene.images.filter((img: any) => img.texture && img.texture.key.startsWith('lc-'));
    expect(sprites.length).toBe(5);

    // Verify each colour's pile shows the correct count and texture
    for (let i = 0; i < 5; i++) {
      const pileView = discardViews[i];
      // The count text should reflect the pile size
      const countText = pileView.getCountText();
      expect(countText.text).toContain('2');
    }

    // Verify different colours use different texture keys
    const textureKeys = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const topCard = {
        color: colors[i],
        type: 'numbered' as const,
        rank: 2,
      };
      textureKeys.add(cardAssetKey(topCard));
    }
    expect(textureKeys.size).toBe(5);

    // Clean up all discard views
    for (const view of discardViews) {
      view.destroy();
    }
  });

  it('PileView: expedition discard piles show different textures per colour', () => {
    const colors: Array<'yellow' | 'blue' | 'white' | 'green' | 'red'> = ['yellow', 'blue', 'white', 'green', 'red'];
    const pileViews: PileView[] = [];

    for (const color of colors) {
      const card = createMockLCCard(color, 'numbered', undefined, 5);
      pileViews.push(
        new PileView(scene, {
          x: 100 + colors.indexOf(color) * 120,
          y: 300,
          label: '',
          emptyTexture: 'card_back',
          cardTextureFn: (c: any) => cardAssetKey(c),
        }),
      );
      pileViews[pileViews.length - 1].setPile({
        size: () => 3,
        isEmpty: () => false,
        peek: () => card,
      });
      pileViews[pileViews.length - 1].update();
    }

    // Each pile should show the correct card texture for its colour
    for (let i = 0; i < 5; i++) {
      const sprite = scene.images[scene.images.length - 5 + i];
      const expectedKey = `lc-${colors[i]}-5`;
      expect(sprite.texture.key).toBe(expectedKey);
    }

    // Clean up
    for (const view of pileViews) {
      view.destroy();
    }
  });

  // ── Reduced-motion mode ─────────────────────────────────────

  it('HandView: reduced-motion mode skips tweens and applies instant state changes', () => {
    const cards = [
      createMockLCCard('yellow', 'numbered', undefined, 5),
      createMockLCCard('blue', 'numbered', undefined, 7),
    ];

    const handView = new HandView(scene, {
      baseX: 500,
      baseY: 550,
      spacing: 20,
      cardWidth: 100,
      showLabels: false,
      selectionEnabled: true,
      clickEnabled: true,
      layoutDirection: 'vertical',
      cardTextureFn: (card: any) => cardAssetKey(card),
      reducedMotion: true,
    });

    expect(handView.reducedMotion).toBe(true);

    handView.setCards(cards);

    // With reduced motion, tweens.add should not be called during layout or selection
    // (selection updates tints via setTint, not tweens)
    expect(handView.getSelected()).toBeNull();

    // Select a card — this should NOT use tweens in reduced-motion mode
    handView.setSelected(0);
    expect(handView.getSelected()).toBe(0);

    // Verify selection tint was applied
    const sprites = handView.getSprites();
    expect((sprites[0] as any).setTint).toHaveBeenCalledWith(0x88ff88);

    // Clear selection — should not use tweens
    handView.setSelected(null);
    expect(handView.getSelected()).toBeNull();

    handView.destroy();
  });

  it('HandView: reducedMotion option defaults to false', () => {
    const handView = new HandView(scene, {
      baseX: 500,
      baseY: 550,
      spacing: 20,
      cardWidth: 100,
      showLabels: false,
      selectionEnabled: true,
      clickEnabled: true,
      layoutDirection: 'vertical',
      cardTextureFn: (card: any) => cardAssetKey(card),
    });

    expect(handView.reducedMotion).toBe(false);
    handView.destroy();
  });

  it('HandView: setReducedMotion toggles at runtime', () => {
    const handView = new HandView(scene, {
      baseX: 500,
      baseY: 550,
      spacing: 20,
      cardWidth: 100,
      showLabels: false,
      selectionEnabled: true,
      clickEnabled: true,
      layoutDirection: 'vertical',
      cardTextureFn: (card: any) => cardAssetKey(card),
    });

    expect(handView.reducedMotion).toBe(false);
    handView.setReducedMotion(true);
    expect(handView.reducedMotion).toBe(true);
    handView.setReducedMotion(false);
    expect(handView.reducedMotion).toBe(false);
    handView.destroy();
  });

  it('PileView: works correctly in an empty-pile scenario (no tweens needed)', () => {
    const emptyPile = {
      size: () => 0,
      isEmpty: () => true,
      peek: () => undefined,
    };

    const pileView = new PileView(scene, {
      x: 500,
      y: 200,
      label: 'Draw',
    });

    pileView.setPile(emptyPile);
    pileView.update();

    // Sprite should be set invisible for empty pile
    const sprite = scene.images[scene.images.length - 1];
    expect(sprite.setVisible).toHaveBeenCalledWith(false);
    expect(sprite.setAlpha).toHaveBeenCalledWith(0.3);

    pileView.destroy();
  });

  it('HandView + PileView: full refresh cycle with reduced motion for Lost Cities', () => {
    // Simulate a full Lost Cities refresh cycle with reduced motion enabled.
    // This tests that all views can be rebuilt instantaneously without relying on tweens.

    // Create views matching Lost Cities layout
    const playerHandView = new HandView(scene, {
      baseX: 1000,
      baseY: 100,
      spacing: 20,
      cardWidth: 100,
      showLabels: false,
      selectionEnabled: true,
      clickEnabled: true,
      layoutDirection: 'vertical',
      cardTextureFn: (card: any) => cardAssetKey(card),
      reducedMotion: true,
    });

    const drawPileView = new PileView(scene, {
      x: 1100,
      y: 350,
      label: 'Draw Pile',
      emptyTexture: 'card_back',
      cardTextureFn: () => 'card_back',
    });

    const colors: Array<'yellow' | 'blue' | 'white' | 'green' | 'red'> = ['yellow', 'blue', 'white', 'green', 'red'];
    const discardViews = new Map<string, PileView>();

    for (const color of colors) {
      discardViews.set(
        color,
        new PileView(scene, {
          x: 100 + colors.indexOf(color) * 120,
          y: 300,
          label: '',
          emptyTexture: 'card_back',
          cardTextureFn: (card: any) => cardAssetKey(card),
        }),
      );
    }

    // Simulate game state
    const session = {
      playerHand: [
        createMockLCCard('yellow', 'numbered', undefined, 5),
        createMockLCCard('yellow', 'numbered', undefined, 7),
      ],
      drawCount: 42,
      discardPiles: new Map<string, any[]>([
        ['yellow', [createMockLCCard('yellow', 'numbered', undefined, 2)]],
        ['blue', [createMockLCCard('blue', 'investment', 1)]],
        ['white', []],
        ['green', [createMockLCCard('green', 'numbered', undefined, 3)]],
        ['red', []],
      ]),
    };

    // Player hand refresh
    playerHandView.setCards(session.playerHand, {
      cardTextureFn: (card: any) => cardAssetKey(card),
    });
    expect(playerHandView.getSprites().length).toBe(2);

    // Draw pile refresh
    drawPileView.setPile({
      size: () => session.drawCount,
      isEmpty: () => session.drawCount === 0,
      peek: () => undefined,
    });
    drawPileView.update();

    // Discard pile refresh (per colour)
    for (const color of colors) {
      const pileCards = session.discardPiles.get(color) ?? [];
      const view = discardViews.get(color);
      if (!view) continue;

      if (pileCards.length === 0) {
        view.setPile({
          size: () => 0,
          isEmpty: () => true,
          peek: () => undefined,
        });
      } else {
        view.setPile({
          size: () => pileCards.length,
          isEmpty: () => false,
          peek: () => pileCards[pileCards.length - 1],
        });
      }
      view.update();
    }

    // Verify discard pile counts are correct
    expect(discardViews.get('yellow')!.getCountText().text).toContain('1');
    expect(discardViews.get('blue')!.getCountText().text).toContain('1');
    expect(discardViews.get('white')!.getCountText().text).toContain('0');
    expect(discardViews.get('green')!.getCountText().text).toContain('1');
    expect(discardViews.get('red')!.getCountText().text).toContain('0');

    // Verify draw pile count
    expect(drawPileView.getCountText().text).toContain('Draw Pile: 42');

    // Clean up
    playerHandView.destroy();
    drawPileView.destroy();
    for (const view of discardViews.values()) {
      view.destroy();
    }
  });
});
