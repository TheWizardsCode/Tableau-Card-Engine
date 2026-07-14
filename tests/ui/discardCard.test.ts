import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  discardCard,
  DEFAULT_DISCARD_DURATION,
  type DiscardCardOptions,
} from '../../src/ui/discardCard';

// ── Mock scene factory ─────────────────────────────────────

interface MockTweenConfig {
  targets: unknown;
  duration: number;
  ease?: string;
  onComplete?: () => void;
  onStart?: () => void;
  onUpdate?: () => void;
  x?: number;
  y?: number;
  alpha?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

/**
 * Create a mock Phaser scene with synchronous tween completion.
 *
 * Applies tween destination values to the target before firing onComplete
 * synchronously, so chained tweens (move → flip → complete) resolve during
 * the discardCard call itself.
 */
const createMockScene = () => {
  const tweens: MockTweenConfig[] = [];

  return {
    tweens: {
      add: (config: MockTweenConfig) => {
        tweens.push(config);
        // Apply tween target values to the target (simulate a complete tween)
        if (config.x !== undefined) {
          (config.targets as any).x = config.x;
        }
        if (config.y !== undefined) {
          (config.targets as any).y = config.y;
        }
        if (config.alpha !== undefined) {
          (config.targets as any).alpha = config.alpha;
        }
        if (config.scaleX !== undefined) {
          (config.targets as any).scaleX = config.scaleX;
        }
        if (config.scaleY !== undefined) {
          (config.targets as any).scaleY = config.scaleY;
        }
        // Fire onComplete synchronously so chained tweens resolve immediately
        config.onComplete?.();
        return { stop: vi.fn() };
      },
    },
    tweensList: tweens,
  };
};

// Mock target object
const createMockTarget = (initialX = 100, initialY = 100) => {
  let _textureKey = 'card_face';
  let _depth = 0;
  return {
    x: initialX,
    y: initialY,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    get depth() { return _depth; },
    set depth(v: number) { _depth = v; },
    get texture() { return { key: _textureKey }; },
    setTexture: vi.fn((key: string) => { _textureKey = key; }),
    setDepth: vi.fn((d: number) => { _depth = d; }),
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
  };
};

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

  // ═══════════════════════════════════════════════════════════
  // Destination animation (animate to discard pile)
  // ═══════════════════════════════════════════════════════════

  describe('destination animation', () => {
    beforeEach(() => {
      target = createMockTarget(500, 400);
      mockScene = createMockScene() as any;
    });

    it('moves card to destination when destX/destY are provided', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        destroyAfter: false,
      };

      discardCard(opts);

      // Target should have moved to destination
      expect(target.x).toBe(700);
      expect(target.y).toBe(250);
      // Rotation should animate to 0 (match pile orientation)
      expect(mockScene.tweensList[0].rotation).toBe(0);
    });

    it('emits card:discarded event on completion with destination animation', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        gameEvents: mockGameEvents as any,
        cardId: 'test-card-1',
        playerIndex: 0,
        destroyAfter: false,
      };

      discardCard(opts);

      expect(mockGameEvents.emit).toHaveBeenCalledWith('card:discarded', {
        cardId: 'test-card-1',
        playerIndex: 0,
      });
    });

    it('moves card to destination and flips on arrival when flipOnArrivalTexture is provided', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        flipOnArrivalTexture: 'card_back',
        destroyAfter: false,
      };

      discardCard(opts);

      // Target should have moved to destination
      expect(target.x).toBe(700);
      expect(target.y).toBe(250);
      // Texture should have been flipped to card_back
      expect(target.setTexture).toHaveBeenCalledWith('card_back');
      // Scale should be restored after flip open
      expect(target.scaleX).toBe(1);
      // Rotation should animate to 0 (match pile orientation) during move phase
      expect(mockScene.tweensList[0].rotation).toBe(0);
    });

    it('destination animation creates three tweens (move, flip-close, flip-open) when flipOnArrivalTexture is provided', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        flipOnArrivalTexture: 'card_back',
        destroyAfter: false,
      };

      discardCard(opts);

      // Should have 3 tweens: move, flip-close, flip-open
      expect(mockScene.tweensList.length).toBe(3);
      // First tween should move to destination and rotate to 0
      expect(mockScene.tweensList[0].x).toBe(700);
      expect(mockScene.tweensList[0].y).toBe(250);
      expect(mockScene.tweensList[0].rotation).toBe(0);
      // Second tween should flip close (scaleX → 0)
      expect(mockScene.tweensList[1].scaleX).toBe(0);
      // Third tween should flip open (scaleX → 1)
      expect(mockScene.tweensList[2].scaleX).toBe(1);
    });

    it('destination animation creates one tween when no flipOnArrivalTexture', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        destroyAfter: false,
      };

      discardCard(opts);

      // Should have 1 tween: move only
      expect(mockScene.tweensList.length).toBe(1);
      expect(mockScene.tweensList[0].x).toBe(700);
      expect(mockScene.tweensList[0].y).toBe(250);
      expect(mockScene.tweensList[0].rotation).toBe(0);
    });

    it('destination animation emits event and destroys on completion', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        gameEvents: mockGameEvents as any,
        cardId: 'test-card-1',
        destroyAfter: true,
      };

      discardCard(opts);

      expect(mockGameEvents.emit).toHaveBeenCalledWith('card:discarded', {
        cardId: 'test-card-1',
        playerIndex: undefined,
      });
      expect(target.destroy).toHaveBeenCalled();
    });

    it('destination animation with reduced motion snaps to destination instantly', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        flipOnArrivalTexture: 'card_back',
        reducedMotion: true,
        destroyAfter: false,
      };

      discardCard(opts);

      // Target should snap to destination
      expect(target.x).toBe(700);
      expect(target.y).toBe(250);
      // Should flip immediately
      expect(target.setTexture).toHaveBeenCalledWith('card_back');
    });

    it('destination animation with reduced motion still emits event', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        gameEvents: mockGameEvents as any,
        cardId: 'test-card-1',
        reducedMotion: true,
        destroyAfter: false,
      };

      discardCard(opts);

      expect(mockGameEvents.emit).toHaveBeenCalledWith('card:discarded', {
        cardId: 'test-card-1',
        playerIndex: undefined,
      });
    });

    it('uses Quad.easeOut easing for destination animation', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        destroyAfter: false,
      };

      discardCard(opts);

      // Move tween should use Quad.easeOut
      expect(mockScene.tweensList[0].ease).toBe('Quad.easeOut');
    });

    it('sets depth on target during destination animation when depth option is provided', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        flipOnArrivalTexture: 'card_back',
        depth: 10,
        destroyAfter: false,
      };

      discardCard(opts);

      // Depth should have been set
      expect(target.setDepth).toHaveBeenCalledWith(10);
    });

    it('restores original depth when destroyAfter is false', () => {
      // Set initial depth
      target.depth = 3;

      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        depth: 10,
        destroyAfter: false,
      };

      discardCard(opts);

      // Depth should have been restored to original
      expect(target.depth).toBe(3);
    });

    it('sets depth and destroys without restoring when destroyAfter is true', () => {
      const opts: DiscardCardOptions = {
        scene: mockScene as any,
        target: target as any,
        destX: 700,
        destY: 250,
        depth: 10,
        destroyAfter: true,
      };

      discardCard(opts);

      expect(target.setDepth).toHaveBeenCalledWith(10);
      expect(target.destroy).toHaveBeenCalled();
    });
  });
});