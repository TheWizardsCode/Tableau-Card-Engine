import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dealCard,
  DEFAULT_DEAL_DURATION,
  DEFAULT_DEAL_ARC_HEIGHT,
  type DealCardOptions,
} from '../../src/ui/dealCard';

// Mock Phaser scene with tweens
const createMockScene = () => {
  const tweens: Array<{
    targets: unknown;
    duration: number;
    ease?: string;
    onComplete?: () => void;
    x?: number;
    y?: number;
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
  rotation: 0,
  setPosition: (x: number, y: number) => {
    (target as any).x = x;
    (target as any).y = y;
  },
  setRotation: (r: number) => {
    (target as any).rotation = r;
  },
});

let target: ReturnType<typeof createMockTarget>;
let mockScene: ReturnType<typeof createMockScene>;
let mockGameEvents: { emit: ReturnType<typeof vi.fn> };

describe('dealCard', () => {
  beforeEach(() => {
    target = createMockTarget(50, 50);
    mockScene = createMockScene() as any;
    mockGameEvents = { emit: vi.fn() };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports DEFAULT_DEAL_DURATION constant', () => {
    expect(DEFAULT_DEAL_DURATION).toBe(400);
  });

  it('exports DEFAULT_DEAL_ARC_HEIGHT constant', () => {
    expect(DEFAULT_DEAL_ARC_HEIGHT).toBe(-50);
  });

  it('creates deal animation with default options', async () => {
    const opts: DealCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destX: 500,
      destY: 400,
    };

    dealCard(opts);

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockScene.tweensList.length).toBe(2); // Two phases
  });

  it('emits card:dealt event on completion when gameEvents provided', async () => {
    const opts: DealCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destX: 500,
      destY: 400,
      gameEvents: mockGameEvents as any,
      cardId: 'test-card-1',
      playerIndex: 0,
    };

    dealCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGameEvents.emit).toHaveBeenCalledWith('card:dealt', {
      cardId: 'test-card-1',
      playerIndex: 0,
    });
  });

  it('respects custom duration option', async () => {
    const opts: DealCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destX: 500,
      destY: 400,
      duration: 600,
    };

    dealCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Phase 1 should use 60% of duration
    expect(mockScene.tweensList[0].duration).toBe(600 * 0.4);
    // Phase 2 should use 40% of duration
    expect(mockScene.tweensList[1].duration).toBe(600 * 0.6);
  });

  it('respects arcHeight option', async () => {
    const startX = 50;
    const startY = 50;
    const destX = 500;
    const destY = 400;
    const customArcHeight = -100;

    target = createMockTarget(startX, startY);

    const opts: DealCardOptions = {
      scene: mockScene as any,
      target: target as any,
      destX,
      destY,
      arcHeight: customArcHeight,
    };

    dealCard(opts);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Midpoint should use custom arc height
    const midY = (startY + destY) / 2 + customArcHeight;
    expect(mockScene.tweensList[0].y).toBe(midY);
  });
});