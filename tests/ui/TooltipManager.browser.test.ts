import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { TooltipManager } from '../../src/ui/Tooltip';
import type { TooltipManagerConfig } from '../../src/ui/Tooltip';

/**
 * Advance the scene's *real* Phaser clock deterministically so the
 * hover-intent delay can be exercised without any real-time sleep.
 *
 * `preUpdate()` promotes a freshly scheduled timer into the active list
 * (normally done at the start of the next frame); `update()` then advances
 * the clock by `byMs` and fires the due timer.
 */
function advanceSceneClock(scene: Phaser.Scene, byMs: number): void {
  const clock = scene.time;
  clock.preUpdate(clock.now, 0);
  clock.update(clock.now + byMs, byMs);
}
/**
 * Find the shared DOM tooltip node by its stable attributes rather than
 * by `position` — the node uses `position: fixed` so it can never extend
 * the document's scrollable overflow area.
 */
function findTooltipDiv(): HTMLElement | null {
  const allDivs = document.querySelectorAll('body > div');
  for (const el of allDivs) {
    const div = el as HTMLElement;
    if (div.style.pointerEvents === 'none' && div.style.zIndex === '2147483647') {
      return div;
    }
  }
  return null;
}

describe('TooltipManager (browser integration)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) {
      game.destroy(true, false);
    }
    game = null;

    // Clean up any tooltip DOM elements
    const tooltips = document.querySelectorAll('div[style*="z-index"]');
    tooltips.forEach((el) => el.remove());

    const container = document.getElementById('game-container');
    if (container) {
      container.remove();
    }
  });

  /** Boot a minimal Phaser scene exposing a DOM-mode TooltipManager. */
  async function bootTooltipScene(): Promise<TooltipManager> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    return new Promise<TooltipManager>((resolve) => {
      class TooltipTestScene extends Phaser.Scene {
        constructor() {
          super('TooltipBrowserScene');
        }

        create() {
          resolve(new TooltipManager(this));
        }
      }

      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: 200,
        height: 200,
        parent: 'game-container',
        scene: [TooltipTestScene],
      });
    });
  }

  /** Boot a scene whose manager takes an explicit (delay) config. */
  async function bootConfiguredTooltipScene(
    config: TooltipManagerConfig,
  ): Promise<{ scene: Phaser.Scene; manager: TooltipManager }> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    return new Promise((resolve) => {
      class TooltipDelayScene extends Phaser.Scene {
        constructor() {
          super('TooltipDelayBrowserScene');
        }

        create() {
          resolve({
            scene: this,
            manager: new TooltipManager(this, undefined, config),
          });
        }
      }

      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: 200,
        height: 200,
        parent: 'game-container',
        scene: [TooltipDelayScene],
      });
    });
  }

  it('shows and hides a tooltip in a Phaser scene', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    const result = await new Promise<{ shown: boolean; hidden: boolean }>((resolve, reject) => {
      class TooltipTestScene extends Phaser.Scene {
        private tooltipManager!: TooltipManager;

        constructor() {
          super('TooltipTestScene');
        }

        create() {
          // Create tooltip manager without settings panel
          this.tooltipManager = new TooltipManager(this);

          // Show a tooltip
          this.tooltipManager.show('Test tooltip content', 100, 100);

          // Check that tooltip div is visible
          const tooltipDiv = findTooltipDiv();
          if (!tooltipDiv) {
            reject(new Error('Tooltip div not found after show()'));
            return;
          }

          const shown = tooltipDiv.style.display === 'block';
          if (!shown) {
            reject(new Error('Tooltip was not visible after show()'));
            return;
          }

          // Hide the tooltip
          this.tooltipManager.hide();

          const hidden = tooltipDiv.style.display === 'none';
          if (!hidden) {
            reject(new Error('Tooltip was not hidden after hide()'));
            return;
          }

          resolve({ shown, hidden });
        }
      }

      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: 200,
        height: 200,
        parent: 'game-container',
        scene: [TooltipTestScene],
      });
    });

    expect(result.shown).toBe(true);
    expect(result.hidden).toBe(true);
  }, 10000);

  it('tooltip content is set correctly', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    await new Promise<void>((resolve, reject) => {
      class TooltipContentScene extends Phaser.Scene {
        constructor() {
          super('TooltipContentScene');
        }

        create() {
          const tooltipManager = new TooltipManager(this);
          tooltipManager.show('Card: Sashimi\nScore: 3 points', 50, 50);

          const tooltipDiv = findTooltipDiv();
          if (!tooltipDiv) {
            reject(new Error('Tooltip div not found'));
            return;
          }

          if (tooltipDiv.textContent !== 'Card: Sashimi\nScore: 3 points') {
            reject(new Error(`Tooltip content mismatch: "${tooltipDiv.textContent}"`));
            return;
          }

          tooltipManager.destroy();
          resolve();
        }
      }

      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: 200,
        height: 200,
        parent: 'game-container',
        scene: [TooltipContentScene],
      });
    });
  }, 10000);

  it('anchors the tooltip with position: fixed', async () => {
    const manager = await bootTooltipScene();

    manager.show('Fixed tooltip', 50, 50);

    const tooltipDiv = findTooltipDiv();
    expect(tooltipDiv).not.toBeNull();
    expect(window.getComputedStyle(tooltipDiv!).position).toBe('fixed');

    manager.destroy();
  }, 10000);

  it('keeps the DOM tooltip fully inside the viewport at all four edges', async () => {
    const manager = await bootTooltipScene();
    const tooltipDiv = findTooltipDiv();
    expect(tooltipDiv).not.toBeNull();

    const corners = [
      { x: -5000, y: -5000 },
      { x: 5000, y: -5000 },
      { x: -5000, y: 5000 },
      { x: 5000, y: 5000 },
    ];

    for (const point of corners) {
      manager.show('Edge tooltip that must remain fully visible', point.x, point.y);

      const rect = tooltipDiv!.getBoundingClientRect();
      expect(rect.left, `left at ${JSON.stringify(point)}`).toBeGreaterThanOrEqual(0);
      expect(rect.top, `top at ${JSON.stringify(point)}`).toBeGreaterThanOrEqual(0);
      expect(rect.right, `right at ${JSON.stringify(point)}`).toBeLessThanOrEqual(window.innerWidth);
      expect(rect.bottom, `bottom at ${JSON.stringify(point)}`).toBeLessThanOrEqual(window.innerHeight);
    }

    manager.destroy();
  }, 10000);

  it('showing and hiding a DOM tooltip does not change the document scroll size', async () => {
    const manager = await bootTooltipScene();

    const root = document.documentElement;
    const beforeScrollWidth = root.scrollWidth;
    const beforeScrollHeight = root.scrollHeight;

    manager.show('A tooltip that must not extend the document', 5000, 5000);

    expect(root.scrollWidth).toBe(beforeScrollWidth);
    expect(root.scrollHeight).toBe(beforeScrollHeight);
    // No scrollbar was introduced by the tooltip.
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight);

    manager.hide();

    expect(root.scrollWidth).toBe(beforeScrollWidth);
    expect(root.scrollHeight).toBe(beforeScrollHeight);

    manager.destroy();
  }, 10000);

  // ── Hover-intent delay (advanced clock, no real-time sleeps) ───────

  it('does not render a delayed DOM tooltip until the clock advances', async () => {
    const { scene, manager } = await bootConfiguredTooltipScene({ delayMs: 5000 });
    const tooltipDiv = findTooltipDiv();
    expect(tooltipDiv).not.toBeNull();

    manager.show('Delayed tooltip', 100, 100);

    expect(tooltipDiv!.style.display).toBe('none');

    advanceSceneClock(scene, 5000);

    expect(tooltipDiv!.style.display).toBe('block');
    expect(tooltipDiv!.textContent).toBe('Delayed tooltip');

    manager.destroy();
  }, 10000);

  it('shows the latest content at the latest anchor when the delayed show fires', async () => {
    const { scene, manager } = await bootConfiguredTooltipScene({ delayMs: 5000 });
    const tooltipDiv = findTooltipDiv();
    expect(tooltipDiv).not.toBeNull();

    manager.show('first anchor', 10, 10);
    manager.show('second anchor', 100, 100);

    expect(tooltipDiv!.style.display).toBe('none');

    advanceSceneClock(scene, 5000);

    expect(tooltipDiv!.textContent).toBe('second anchor');
    expect(tooltipDiv!.style.display).toBe('block');

    // The overlay landed at the second anchor (canvas offset + 10 px hover gap).
    const firstAnchorLeft = parseFloat(tooltipDiv!.style.left);
    manager.hide();
    manager.show('first anchor', 10, 10);
    advanceSceneClock(scene, 5000);
    expect(parseFloat(tooltipDiv!.style.left)).toBeLessThan(firstAnchorLeft);

    manager.destroy();
  }, 10000);

  it('cancels a delayed DOM tooltip on hide() and on destroy()', async () => {
    const { scene, manager } = await bootConfiguredTooltipScene({ delayMs: 5000 });
    const tooltipDiv = findTooltipDiv();
    expect(tooltipDiv).not.toBeNull();

    manager.show('never shown', 50, 50);
    manager.hide();
    advanceSceneClock(scene, 5000);
    expect(tooltipDiv!.style.display).toBe('none');

    manager.show('never shown either', 50, 50);
    manager.destroy();
    advanceSceneClock(scene, 5000);
    expect(tooltipDiv!.style.display).toBe('none');
  }, 10000);

  it('keeps a shown delayed tooltip visible and following the pointer on re-anchor', async () => {
    const { scene, manager } = await bootConfiguredTooltipScene({ delayMs: 5000 });
    const tooltipDiv = findTooltipDiv();
    expect(tooltipDiv).not.toBeNull();

    manager.show('following the pointer', 10, 10);
    advanceSceneClock(scene, 5000);

    expect(tooltipDiv!.style.display).toBe('block');
    expect(tooltipDiv!.textContent).toBe('following the pointer');

    const startLeft = parseFloat(tooltipDiv!.style.left);
    const startTop = parseFloat(tooltipDiv!.style.top);

    manager.reanchor(120, 90);

    // Still the same visible overlay — no hide/re-show, no content reset.
    expect(tooltipDiv!.style.display).toBe('block');
    expect(tooltipDiv!.textContent).toBe('following the pointer');
    const firstLeft = parseFloat(tooltipDiv!.style.left);
    const firstTop = parseFloat(tooltipDiv!.style.top);
    expect(firstLeft).toBeGreaterThan(startLeft);
    expect(firstTop).toBeGreaterThan(startTop);

    manager.reanchor(150, 110);

    expect(tooltipDiv!.style.display).toBe('block');
    expect(parseFloat(tooltipDiv!.style.left)).toBeGreaterThan(firstLeft);
    expect(parseFloat(tooltipDiv!.style.top)).toBeGreaterThan(firstTop);

    // Advancing the clock cannot fire a second dwell: none was armed.
    advanceSceneClock(scene, 5000);
    expect(tooltipDiv!.style.display).toBe('block');

    manager.destroy();
  }, 10000);

  it('does not reveal a tooltip when re-anchored with nothing shown', async () => {
    const { manager } = await bootConfiguredTooltipScene({ delayMs: 5000 });
    const tooltipDiv = findTooltipDiv();
    expect(tooltipDiv).not.toBeNull();

    manager.reanchor(80, 60);

    expect(tooltipDiv!.style.display).toBe('none');
    expect(tooltipDiv!.textContent).toBe('');

    manager.destroy();
  }, 10000);

  it('gates the Phaser render mode behind the delay', async () => {
    const renders: number[] = [];
    const { scene, manager } = await bootConfiguredTooltipScene({
      delayMs: 5000,
      phaserRender: (container) => {
        renders.push(scene.time.now);
        container.setDepth(800);
        return container;
      },
    });

    manager.show('', 50, 50, { cardName: 'Delayed phaser tooltip' });
    expect(renders).toHaveLength(0);

    advanceSceneClock(scene, 5000);
    expect(renders).toHaveLength(1);

    manager.destroy();
  }, 10000);
});
