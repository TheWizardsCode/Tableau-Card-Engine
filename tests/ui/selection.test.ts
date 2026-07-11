import { describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { attachSelection, createSingleSelectionManager } from '../../src/ui/selection';

describe('selection helpers', () => {
  it('attachSelection tracks selected and hovered state transitions', () => {
    const onStateChange = vi.fn();
    const target = {} as Phaser.GameObjects.GameObject;

    const controller = attachSelection(target, { onStateChange });

    controller.select();
    controller.setHovered(true);
    controller.setHovered(false);
    controller.deselect();

    expect(controller.isSelected()).toBe(false);
    expect(controller.isHovered()).toBe(false);
    expect(onStateChange).toHaveBeenCalled();
  });

  it('single selection manager clears on non-target pointerdown', () => {
    const events: Record<string, (...args: any[]) => void> = {};
    const scene = {
      input: {
        on: (event: string, handler: (...args: any[]) => void) => {
          events[event] = handler;
        },
        off: vi.fn(),
      },
    } as unknown as Phaser.Scene;

    const manager = createSingleSelectionManager(scene);

    const targetA = {} as Phaser.GameObjects.GameObject;
    const targetB = {} as Phaser.GameObjects.GameObject;

    const a = attachSelection(targetA);
    const b = attachSelection(targetB);

    manager.registerTarget(targetA);
    manager.registerTarget(targetB);

    manager.select(a);
    expect(a.isSelected()).toBe(true);

    manager.select(b);
    expect(a.isSelected()).toBe(false);
    expect(b.isSelected()).toBe(true);

    events.pointerdown?.({} as Phaser.Input.Pointer, []);
    expect(b.isSelected()).toBe(false);

    manager.destroy();
    expect((scene.input.off as any)).toHaveBeenCalled();
  });
});
