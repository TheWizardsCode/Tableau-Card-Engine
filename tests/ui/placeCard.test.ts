import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  placeCard,
  DEFAULT_PLACE_DURATION,
  type PlaceCardOptions,
} from '../../src/ui/placeCard';
import { createMockScene, createMockImage } from '../helpers/MockFactory';

let target: Phaser.GameObjects.Image;
let mockScene: ReturnType<typeof createMockScene>;
let mockGameEvents: { emit: ReturnType<typeof vi.fn> };

function createMockTarget(initialX = 100, initialY = 100) {
  return { ...createMockImage(initialX, initialY) } as unknown as Phaser.GameObjects.Image;
}

describe('placeCard', () => {
  beforeEach(() => {
    target = createMockTarget(50, 50);
    mockScene = createMockScene() as any;
    mockGameEvents = { emit: vi.fn() };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports DEFAULT_PLACE_DURATION constant', () => {
    expect(DEFAULT_PLACE_DURATION).toBe(350);
  });

  it('creates place animation with default options', async () => {
    const opts: PlaceCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destX: 500,
      destY: 400,
    };

    placeCard(opts);

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockScene.tweensList.length).toBe(2); // Two phases
  });

  it('emits card:placed event on completion when gameEvents provided', async () => {
    const opts: PlaceCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destX: 500,
      destY: 400,
      gameEvents: mockGameEvents as any,
      cardId: 'test-card-1',
      playerIndex: 0,
      slotIndex: 3,
    };

    placeCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGameEvents.emit).toHaveBeenCalledWith('card:placed', {
      cardId: 'test-card-1',
      playerIndex: 0,
      slotIndex: 3,
    });
  });

  it('respects custom duration option', async () => {
    const opts: PlaceCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destX: 500,
      destY: 400,
      duration: 500,
    };

    placeCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Both phases should use the custom duration
    const totalDuration = (mockScene.tweensList![0] as any).duration + (mockScene.tweensList![1] as any).duration;
    expect(totalDuration).toBe(500);
  });

  it('uses Back.easeOut easing by default', async () => {
    const opts: PlaceCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destX: 500,
      destY: 400,
    };

    placeCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockScene.tweensList[0].ease).toBe('Back.easeOut');
  });

  it('respects scale option', async () => {
    const opts: PlaceCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destX: 500,
      destY: 400,
      scale: 1.1,
    };

    placeCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockScene.tweensList[0].scaleX).toBe(1.1);
    expect(mockScene.tweensList[0].scaleY).toBe(1.1);
  });
});