import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../example-games/the-mind/MindCardRenderer', () => ({
  ensureMindCardTexture: vi.fn(async (_scene: unknown, value: number) => ({
    key: `card-${value}`,
  })),
  getMindCardTexture: vi.fn((card: { value: number }) => `card-${card.value}`),
}));

vi.mock('../../src/ui', () => ({
  GAME_W: 1000,
  GAME_H: 700,
  FONT_FAMILY: 'sans-serif',
  createSceneHeader: vi.fn(),
  layoutCardPositions: vi.fn(({ count }: { count: number }) => ({
    positions: Array.from({ length: count }, (_, i) => 100 + i * 40),
  })),
}));

import { MindRenderer } from '../../example-games/the-mind/scenes/MindRenderer';
import type { TheMindSession } from '../../example-games/the-mind/TheMindGameState';

function createMockSprite() {
  const sprite = {
    texture: { key: 'card-back' },
    x: 0,
    y: 0,
    setDisplaySize: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setTexture: vi.fn(),
    on: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setY: vi.fn(),
    destroy: vi.fn(),
    disableInteractive: vi.fn(),
    setAlpha: vi.fn().mockReturnThis(),
  };

  sprite.setTexture.mockImplementation((key: string) => {
    sprite.texture.key = key;
    return sprite;
  });
  sprite.setY.mockImplementation((y: number) => {
    sprite.y = y;
    return sprite;
  });

  return sprite;
}

function createMockText() {
  return {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function createMockScene() {
  return {
    add: {
      image: vi.fn(() => createMockSprite()),
      text: vi.fn(() => createMockText()),
    },
    time: {
      addEvent: vi.fn(() => ({ destroy: vi.fn() })),
      delayedCall: vi.fn(),
    },
  } as unknown as Phaser.Scene;
}

function createSession(): TheMindSession {
  return {
    players: [
      { name: 'P1', isAI: false, hand: [{ value: 5, faceUp: false }, { value: 20, faceUp: false }] },
      { name: 'P2', isAI: true, hand: [{ value: 10, faceUp: false }, { value: 30, faceUp: false }] },
    ],
    pile: {
      peek: () => null,
      size: () => 0,
      clear: () => undefined,
      isEmpty: () => true,
    } as unknown as TheMindSession['pile'],
    currentLevel: 1,
    lives: 2,
    outcome: 'in-progress',
    rng: Math.random,
  };
}

describe('MindRenderer', () => {
  let scene: Phaser.Scene;
  let session: TheMindSession;
  let renderer: MindRenderer;

  beforeEach(() => {
    scene = createMockScene();
    session = createSession();
    renderer = new MindRenderer(scene, session);
    renderer.createStatusDisplay();
    renderer.createPile();
    renderer.createInstruction();
    renderer.renderHumanHand(() => undefined, 'playing', false);
    renderer.renderAiHand();
  });

  it('re-renders hands when penalty changes hand size', () => {
    expect(renderer.humanCardSprites).toHaveLength(2);
    expect(renderer.aiCardSprites).toHaveLength(2);

    // Simulate out-of-order penalty removing lower cards from both players.
    session.players[0].hand = [{ value: 20, faceUp: false }];
    session.players[1].hand = [{ value: 30, faceUp: false }];

    renderer.refreshAll();

    expect(renderer.humanCardSprites).toHaveLength(1);
    expect(renderer.aiCardSprites).toHaveLength(1);
  });
});
