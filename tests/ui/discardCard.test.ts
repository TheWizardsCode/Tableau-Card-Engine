import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  discardCard,
  DEFAULT_DISCARD_DURATION,
  type DiscardCardOptions,
} from '../../src/ui/discardCard';

// Mock Phaser scene with tweens
const createMockScene = () => {
  const tweens: Array<{
    targets: unknown;
    duration: number;
    ease?: string;
    onComplete?: () => void;
    x?: number;
    y?: number;
    alpha?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
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
        alpha?: number;
        scaleX?: number;
        scaleY?: number;
        rotation?: number;
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
  alpha: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  setPosition: function(x: number, y: number) {
    this.x = x;
    this.y = y;
  },
  setAlpha: function(a: number) {
    this.alpha = a;
  },
  setScale: function(s: number) {
    this.scaleX = s;
    this.scaleY = s;
  },
  destroy: vi.fn(),
});

let target: ReturnType<typeof createMockTarget>;
let mockScene: ReturnType<typeof createMockScene>;
let mockGameEvents: { emit: ReturnType<typeof vi.fn> };

describe('discardCard', () => {
  beforeEach(() => {
    target = createMockTarget(500, 400);
    mockScene = createMockScene() as any;
    mockGameEvents = { emit: vi.fn() };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports DEFAULT_DISCARD_DURATION constant', () => {
    expect(DEFAULT_DISCARD_DURATION).toBe(400);
  });

  it('creates discard animation with default options', async () => {
    const opts: DiscardCardOptions = {
      scene: mockScene as any,
      target: target as any,
    };

    discardCard(opts);

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockScene.tweensList.length).toBe(1);
  });

  it('emits card:discarded event on completion when gameEvents provided', async () => {
    const opts: DiscardCardOptions = {
      scene: mockScene as any,
      target: target as any,
      gameEvents: mockGameEvents as any,
      cardId: 'test-card-1',
      playerIndex: 0,
    };

    discardCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGameEvents.emit).toHaveBeenCalledWith('card:discarded', {
      cardId: 'test-card-1',
      playerIndex: 0,
    });
  });

  it('respects custom duration option', async () => {
    const opts: DiscardCardOptions = {
      scene: mockScene as any,
      target: target as any,
      duration: 600,
    };

    discardCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockScene.tweensList[0].duration).toBe(600);
  });

  it('uses Quad.easeIn easing by default', async () => {
    const opts: DiscardCardOptions = {
      scene: mockScene as any,
      target: target as any,
    };

    discardCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockScene.tweensList[0].ease).toBe('Quad.easeIn');
  });

  it('respects offsetY option', async () => {
    const startY = 400;
    const offsetY = 50;

    target = createMockTarget(500, startY);

    const opts: DiscardCardOptions = {
      scene: mockScene as any,
      target: target as any,
      offsetY,
    };

    discardCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockScene.tweensList[0].y).toBe(startY + offsetY);
  });

  it('respects destroyAfter option', async () => {
    const opts: DiscardCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destroyAfter: false,
    };

    discardCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // destroy should not be called when destroyAfter is false
    expect(target.destroy).not.toHaveBeenCalled();
  });

  it('destroys target by default when destroyAfter is true', async () => {
    const opts: DiscardCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destroyAfter: true,
    };

    discardCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(target.destroy).toHaveBeenCalled();
  });
});