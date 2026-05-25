import { describe, it, expect, vi, beforeEach } from 'vitest';

const { ensureTextureMock, ensureBackTextureMock } = vi.hoisted(() => ({
  ensureTextureMock: vi.fn(async (_scene: unknown, value: number) => ({
    key: `ms_card_mind-${value}_120x164@1`,
    ready: true,
  })),
  ensureBackTextureMock: vi.fn(async () => ({
    key: 'ms_card_mind-back_120x164@1',
    ready: true,
  })),
}));

vi.mock('../../example-games/the-mind/MindCardTextureAdapter', () => ({
  ensureTexture: ensureTextureMock,
  ensureBackTexture: ensureBackTextureMock,
  resolveTemplateId: vi.fn((value: number) => `mind-${value}`),
  resolveBackTemplateId: vi.fn(() => 'mind-back'),
  getCanonicalTextureKey: vi.fn((templateId: string, _w?: number, _h?: number, _dpr?: number) => `ms_card_${templateId}_120x164@1`),
  getTextureKey: vi.fn((card: { value: number; faceUp: boolean }) =>
    card.faceUp ? `ms_card_mind-${card.value}_120x164@1` : 'ms_card_mind-back_120x164@1',
  ),
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createMockSprite() {
  const sprite = {
    texture: { key: 'ms_card_mind-back_120x164@1' },
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
    game: {
      config: {
        width: 1000,
        height: 700,
      },
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
    ensureTextureMock.mockReset();
    ensureBackTextureMock.mockReset();

    ensureTextureMock.mockImplementation(async (_scene: unknown, value: number) => ({
      key: `ms_card_mind-${value}_120x164@1`,
      ready: true,
    }));
    ensureBackTextureMock.mockImplementation(async () => ({
      key: 'ms_card_mind-back_120x164@1',
      ready: true,
    }));

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

    session.players[0].hand = [{ value: 20, faceUp: false }];
    session.players[1].hand = [{ value: 30, faceUp: false }];

    renderer.refreshAll();

    expect(renderer.humanCardSprites).toHaveLength(1);
    expect(renderer.aiCardSprites).toHaveLength(1);
  });

  it('waits for face texture promise before applying card texture', async () => {
    const deferred = createDeferred<void>();
    ensureTextureMock.mockImplementation(async (_scene: unknown, value: number) => ({
      key: `ms_card_mind-${value}_120x164@1`,
      ready: false,
      promise: deferred.promise,
    }));

    const firstSprite = renderer.humanCardSprites[0] as unknown as { texture: { key: string }; setTexture: ReturnType<typeof vi.fn> };
    (firstSprite.setTexture as unknown as { mockClear: () => void }).mockClear();

    renderer.refreshHumanHand();
    const callsBeforeResolve = (firstSprite.setTexture as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(callsBeforeResolve.some((c) => c[0] === 'ms_card_mind-5_120x164@1')).toBe(false);

    deferred.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const callsAfterResolve = (firstSprite.setTexture as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(callsAfterResolve.some((c) => c[0] === 'ms_card_mind-5_120x164@1')).toBe(true);
  });

  it('re-applies display size after setting ensured texture', async () => {
    renderer.refreshHumanHand();
    await Promise.resolve();
    await Promise.resolve();

    const firstSprite = renderer.humanCardSprites[0] as unknown as { setDisplaySize: ReturnType<typeof vi.fn> };
    const displayCalls = (firstSprite.setDisplaySize as unknown as { mock: { calls: unknown[][] } }).mock.calls;

    // One call is from sprite creation; at least one additional call should happen
    // after texture swap to avoid unintended size reset.
    expect(displayCalls.length).toBeGreaterThan(1);
    expect(displayCalls[displayCalls.length - 1]).toEqual([120, 164]);
  });

  it('ensures real card-back texture for AI hand', async () => {
    expect(ensureBackTextureMock).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();

    for (const sprite of renderer.aiCardSprites as unknown as Array<{ texture: { key: string } }>) {
      expect(sprite.texture.key).toBe('ms_card_mind-back_120x164@1');
    }
  });

  it('does not flash pile back texture when face texture already exists', () => {
    session.pile.peek = () => ({ value: 42, faceUp: true }) as any;
    session.pile.size = () => 1;

    (scene as any).textures = {
      exists: (key: string) => key === 'ms_card_mind-42_120x164@1' || key === 'ms_card_mind-back_120x164@1',
    };

    const pileSprite = renderer.pileSprite as unknown as { setTexture: ReturnType<typeof vi.fn> };
    (pileSprite.setTexture as unknown as { mockClear: () => void }).mockClear();

    renderer.refreshPile();

    const calls = (pileSprite.setTexture as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toBe('ms_card_mind-42_120x164@1');
  });
});
