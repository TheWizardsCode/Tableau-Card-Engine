import { describe, expect, it, vi } from 'vitest';

import { createParameterizedOverlay, overlayCenterY } from '../../src/ui/ParameterizedOverlay';

function mockRectangle() {
  return {
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function mockText() {
  const handlers: Record<string, () => void> = {};
  const text = {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
      return text;
    }),
    destroy: vi.fn(),
    _handlers: handlers,
  };
  return text;
}

function mockScene() {
  return {
    add: {
      rectangle: vi.fn(() => mockRectangle()),
      text: vi.fn(() => mockText()),
    },
  } as unknown as Phaser.Scene;
}

describe('createParameterizedOverlay', () => {
  it('creates background, title, details and button objects', () => {
    const scene = mockScene();
    const clicked = vi.fn();

    const objects = createParameterizedOverlay(scene, {
      title: 'You Win!',
      titleColor: '#88ff88',
      detailText: 'Details',
      titleY: 200,
      detailY: 230,
      titleDepth: 12,
      detailDepth: 12,
      background: { depth: 10, alpha: 0.75 },
      box: { width: 400, height: 240, alpha: 0.9 },
      buttons: [
        {
          label: '[ Play Again ]',
          x: 300,
          y: 320,
          onClick: clicked,
        },
      ],
    });

    expect(objects.length).toBeGreaterThanOrEqual(5);

    const button = objects[objects.length - 1] as any;
    expect(button.on).toHaveBeenCalledWith('pointerdown', expect.any(Function));

    const handlers = button._handlers;
    handlers.pointerdown();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('computes center offset helper from game center', () => {
    expect(overlayCenterY(0)).toBeGreaterThan(0);
  });
});
