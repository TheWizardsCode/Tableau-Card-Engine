import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { TooltipManager } from '../../src/ui/Tooltip';

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
          const tooltipDiv = this.findTooltipDiv();
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

        private findTooltipDiv(): HTMLElement | null {
          const allDivs = document.querySelectorAll('body > div');
          for (const el of allDivs) {
            const div = el as HTMLElement;
            if (
              div.style.position === 'absolute' &&
              div.style.pointerEvents === 'none' &&
              div.style.zIndex === '2147483647'
            ) {
              return div;
            }
          }
          return null;
        }
      }

      game = new Phaser.Game({ type: Phaser.CANVAS,
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

          const tooltipDiv = this.findTooltipDiv();
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

        private findTooltipDiv(): HTMLElement | null {
          const allDivs = document.querySelectorAll('body > div');
          for (const el of allDivs) {
            const div = el as HTMLElement;
            if (
              div.style.position === 'absolute' &&
              div.style.pointerEvents === 'none' &&
              div.style.zIndex === '2147483647'
            ) {
              return div;
            }
          }
          return null;
        }
      }

      game = new Phaser.Game({ type: Phaser.CANVAS,
        width: 200,
        height: 200,
        parent: 'game-container',
        scene: [TooltipContentScene],
      });
    });
  }, 10000);
});
