import { describe, it, expect, vi, beforeEach } from 'vitest';

const { ensureTextureMock, ensureBackTextureMock, flipCardMock } = vi.hoisted(() => ({
  ensureTextureMock: vi.fn(async () => ({ key: 'ensured-face-key', ready: true })),
  ensureBackTextureMock: vi.fn(async () => ({ key: 'ensured-back-key', ready: true })),
  flipCardMock: vi.fn(),
}));

vi.mock('../../example-games/the-mind/MindCardTextureAdapter', () => ({
  resolveTemplateId: vi.fn((value: number) => `mind-${value}`),
  resolveBackTemplateId: vi.fn(() => 'mind-back'),
  getCanonicalTextureKey: vi.fn((templateId: string) => `canonical-${templateId}`),
  ensureTexture: ensureTextureMock,
  ensureBackTexture: ensureBackTextureMock,
}));

vi.mock('../../src/ui', () => ({
  GAME_W: 1000,
  GAME_H: 700,
  flipCard: flipCardMock,
  shakeIllegalMove: vi.fn(),
}));

import { MindAnimator } from '../../example-games/the-mind/scenes/MindAnimator';

function createSprite(key: string) {
  const sprite = {
    x: 100,
    y: 100,
    texture: { key },
    setDisplaySize: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    disableInteractive: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    setTexture: vi.fn().mockReturnThis(),
  };
  return sprite;
}

function createScene() {
  return {
    add: {
      image: vi.fn((_x: number, _y: number, key: string) => createSprite(key)),
    },
    tweens: {
      add: vi.fn(() => ({ stop: vi.fn() })),
    },
    time: {
      delayedCall: vi.fn((_delay: number, cb: () => void) => {
        cb();
      }),
    },
  } as unknown as Phaser.Scene;
}

describe('MindAnimator', () => {
  beforeEach(() => {
    ensureTextureMock.mockClear();
    ensureBackTextureMock.mockClear();
    flipCardMock.mockClear();
  });

  it('normalizes human card sprite scale before animating to pile', () => {
    const scene = createScene();
    const humanSprite = createSprite('canonical-mind-42') as any;
    humanSprite.__mindCardValue = 42;

    const renderer = {
      aiCardSprites: [],
      humanCardSprites: [humanSprite],
    } as any;
    const session = {
      players: [
        { hand: [] },
        { hand: [] },
      ],
    } as any;

    const animator = new MindAnimator(scene, session, renderer, null);

    animator.animateCardTowardsPile(0, 42, vi.fn());

    expect(humanSprite.disableInteractive).toHaveBeenCalled();
    expect(humanSprite.setScale).toHaveBeenCalledWith(1);
    expect(humanSprite.setDisplaySize).toHaveBeenCalledWith(120, 164);
  });

  it('uses ensured textures for AI play animation instead of unresolved canonical keys', async () => {
    const scene = createScene();
    const renderer = {
      aiCardSprites: [createSprite('canonical-mind-back')],
      humanCardSprites: [],
    } as any;
    const session = {
      players: [
        { hand: [] },
        { hand: [] },
      ],
    } as any;

    const animator = new MindAnimator(scene, session, renderer, null);
    const onComplete = vi.fn();

    animator.animateCardTowardsPile(1, 42, onComplete);
    await Promise.resolve();
    await Promise.resolve();

    expect(ensureBackTextureMock).toHaveBeenCalled();
    expect(ensureTextureMock).toHaveBeenCalledWith(scene, 42, 120, 164);

    expect(flipCardMock).toHaveBeenCalled();
    const flipArgs = flipCardMock.mock.calls[0][0] as { newTexture: string };
    expect(flipArgs.newTexture).toBe('ensured-face-key');
  });
});
