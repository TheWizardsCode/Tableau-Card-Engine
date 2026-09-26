import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { TooltipManager } from '../../src/ui/Tooltip';

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
});
