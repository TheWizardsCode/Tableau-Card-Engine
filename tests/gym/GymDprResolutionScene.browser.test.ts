/**
 * GymDprResolutionScene browser integration tests.
 *
 * Verifies that the scene rasterises the same SVG at DPR 1, 2 and 3 and that
 * the resulting texture canvases follow the native-resolution contract:
 * `qualityScale = Math.max(MIN_QUALITY_SCALE, dpr)` with
 * `MIN_QUALITY_SCALE = 2`.
 *
 * For a 140x80 logical card that means:
 *   - DPR 1 → 280x160
 *   - DPR 2 → 280x160
 *   - DPR 3 → 420x240
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymDprResolutionScene } from '../../example-games/gym/scenes/GymDprResolutionScene';
import { GYM_DPR_RESOLUTION_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

type PanelSize = { dpr: number; width: number; height: number };

/**
 * Poll until every panel has reported a non-zero texture size.
 */
async function waitForRenderedPanels(
  scene: GymDprResolutionScene,
  timeoutMs = 10_000,
): Promise<PanelSize[]> {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const sizes = scene.getPanelTextureSizes();
      if (sizes.length === 3 && sizes.every((s) => s.width > 0 && s.height > 0)) {
        resolve(sizes);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(
          new Error(
            `Timed out waiting for DPR panels to render. Last sizes: ${JSON.stringify(sizes)}`,
          ),
        );
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function findTextObject(
  scene: Phaser.Scene,
  predicate: (text: string) => boolean,
): Phaser.GameObjects.Text | null {
  return (
    scene.children.list.find(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text && predicate(child.text),
    ) ?? null
  );
}

describe('GymDprResolutionScene browser integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;

    const container = document.getElementById('game-container');
    if (container) {
      container.remove();
    }
  });

  async function boot(): Promise<GymDprResolutionScene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({ type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymDprResolutionScene],
    });

    await waitForScene(game, GYM_DPR_RESOLUTION_KEY);
    return game.scene.getScene(GYM_DPR_RESOLUTION_KEY) as GymDprResolutionScene;
  }

  it('rasterises the same SVG at the native resolution for DPR 1, 2 and 3', async () => {
    const scene = await boot();
    const sizes = await waitForRenderedPanels(scene);

    const byDpr = new Map(sizes.map((s) => [s.dpr, s]));
    expect(byDpr.get(1)).toMatchObject({ width: 280, height: 160 });
    expect(byDpr.get(2)).toMatchObject({ width: 280, height: 160 });
    expect(byDpr.get(3)).toMatchObject({ width: 420, height: 240 });
  });

  it('labels every panel with its quality scale and canvas dimensions', async () => {
    const scene = await boot();
    await waitForRenderedPanels(scene);

    const infoLabels = scene.children.list.filter(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text && child.text.startsWith('qualityScale'),
    );

    expect(infoLabels).toHaveLength(3);
    expect(infoLabels.some((t) => t.text.includes('×2\ncanvas = 280×160'))).toBe(true);
    expect(infoLabels.some((t) => t.text.includes('×3\ncanvas = 420×240'))).toBe(true);
  });

  it('toggles a 2x crop on every panel and resets it again', async () => {
    const scene = await boot();
    await waitForRenderedPanels(scene);

    const images = scene.getPanelImages().filter((img): img is Phaser.GameObjects.Image => img !== null);
    expect(images).toHaveLength(3);
    expect(images.every((img) => !img.isCropped)).toBe(true);
    expect(scene.isZoomActive).toBe(false);

    scene.toggleZoom();

    expect(scene.isZoomActive).toBe(true);
    expect(images.every((img) => img.isCropped)).toBe(true);

    scene.toggleZoom();

    expect(scene.isZoomActive).toBe(false);
    expect(images.every((img) => !img.isCropped)).toBe(true);
  });

  it('positions the three panels at distinct SLL anchor columns', async () => {
    const scene = await boot();
    await waitForRenderedPanels(scene);

    const images = scene
      .getPanelImages()
      .filter((img): img is Phaser.GameObjects.Image => img !== null);
    expect(images).toHaveLength(3);

    // Anchors live at x = 0.2 / 0.5 / 0.8 of the 1280px reference viewport.
    expect(images[0].x).toBeCloseTo(256, 0);
    expect(images[1].x).toBeCloseTo(640, 0);
    expect(images[2].x).toBeCloseTo(1024, 0);
  });

  it('renders a display-size label for the unzoomed full card', async () => {
    const scene = await boot();
    await waitForRenderedPanels(scene);

    const status = findTextObject(scene, (text) => text.includes('Full card shown'));
    expect(status).toBeTruthy();
    expect(status?.text).toContain('140×80');
  });
});
