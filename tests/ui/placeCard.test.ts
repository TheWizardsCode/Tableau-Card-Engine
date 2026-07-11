import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  placeCard,
  DEFAULT_PLACE_DURATION,
  type PlaceCardOptions,
} from '../../src/ui/placeCard';

// Mock Phaser scene with tweens
const createMockScene = () => {
  const tweens: Array<{
    targets: unknown;
    duration: number;
    ease?: string;
    onComplete?: () => void;
    x?: number;
    y?: number;
    scaleX?: number;
    scaleY?: number;
  }> = [];

  return {
    tweens: {
      add: (config: {
        targets: unknown;
        duration: number;
        ease?: string;
        onComplete?: () => void;
        x?: number;
        y?: number;
        scaleX?: number;
        scaleY?: number;
      }) => {
        tweens.push(config);
        // Simulate immediate completion for testing
        setTimeout(() => config.onComplete?.(), 0);
        return {};
      },
    },
    tweensList: tweens,
  };
};

// Mock target object
const createMockTarget = (initialX = 100, initialY = 100) => ({
  x: initialX,
  y: initialY,
  scaleX: 1,
  scaleY: 1,
  setPosition: (x: number, y: number) => {
    (target as any).x = x;
    (target as any).y = y;
  },
  setScale: (s: number) => {
    (target as any).scaleX = s;
    (target as any).scaleY = s;
  },
});

let target: ReturnType<typeof createMockTarget>;
let mockScene: ReturnType<typeof createMockScene>;
let mockGameEvents: { emit: ReturnType<typeof vi.fn> };

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
    const totalDuration = mockScene.tweensList[0].duration + mockScene.tweensList[1].duration;
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