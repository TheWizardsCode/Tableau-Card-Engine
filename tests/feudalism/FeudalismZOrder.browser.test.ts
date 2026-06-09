/**
 * Feudalism z-order browser tests.
 *
 * Validates that Feudalism's container depth ordering follows the expected
 * convention: HUD / overlay elements > gameplay containers > UI overlay.
 *
 * Feudalism does NOT use explicit depth values on its gameplay containers
 * (patron, market, supply, player, AI, action, discard) — it relies on
 * Phaser's default creation-order depth sorting.  The overlay system
 * assigns depth 10–20 to its elements.
 *
 * Expected ordering (bottom → top):
 *   1. sectionBoxContainer      – background section boxes
 *   2. marketContainer          – market card displays
 *   3. patronContainer          – patron cards
 *   4. supplyContainer          – resource supply tokens
 *   5. playerContainer          – player area
 *   6. aiContainer              – AI area
 *   7. actionContainer          – action buttons
 *   8. discardContainer         – discard area
 *   9. Overlay elements (depth 10–20)
 *  10. HUD elements (depth ≥ 1000, when implemented)
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createFeudalismGame } = await import(
    '../../example-games/feudalism/createFeudalismGame'
  );
  const game = createFeudalismGame();
  await waitForScene(game, 'FeudalismScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = n;
    const tick = () => {
      remaining--;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Get renderer containers from the FeudalismScene via the private
 * feudRenderer field (test-only access).
 */
function getRendererContainers(scene: Phaser.Scene): Record<string, Phaser.GameObjects.Container> {
  const feudRenderer = (scene as any).feudRenderer;
  return {
    sectionBoxContainer: feudRenderer.sectionBoxContainer as Phaser.GameObjects.Container,
    marketContainer: feudRenderer.marketContainer as Phaser.GameObjects.Container,
    patronContainer: feudRenderer.patronContainer as Phaser.GameObjects.Container,
    supplyContainer: feudRenderer.supplyContainer as Phaser.GameObjects.Container,
    playerContainer: feudRenderer.playerContainer as Phaser.GameObjects.Container,
    aiContainer: feudRenderer.aiContainer as Phaser.GameObjects.Container,
    actionContainer: feudRenderer.actionContainer as Phaser.GameObjects.Container,
    discardContainer: feudRenderer.discardContainer as Phaser.GameObjects.Container,
  };
}

describe('Feudalism container z-order', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('all gameplay containers exist after boot', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const containers = getRendererContainers(scene);

    for (const [name, container] of Object.entries(containers)) {
      expect(container, `${name} should exist`).toBeDefined();
      expect(container, `${name} should be a Container`).toBeInstanceOf(Phaser.GameObjects.Container);
    }
  });

  it('gameplay containers use default depth (0) — rely on creation order', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const containers = getRendererContainers(scene);

    for (const [name, container] of Object.entries(containers)) {
      expect((container as any).depth ?? 0, `${name} should use default depth`).toBe(0);
    }
  });

  it('actionContainer is created after player/AI containers (renders on top)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const containers = getRendererContainers(scene);
    const children = scene.children.list as Phaser.GameObjects.GameObject[];

    const actionIdx = children.indexOf(containers.actionContainer);
    const playerIdx = children.indexOf(containers.playerContainer);
    const aiIdx = children.indexOf(containers.aiContainer);

    expect(actionIdx).toBeGreaterThan(playerIdx);
    expect(actionIdx).toBeGreaterThan(aiIdx);
  });

  it('sectionBoxContainer is created before gameplay containers (renders underneath)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const containers = getRendererContainers(scene);
    const children = scene.children.list as Phaser.GameObjects.GameObject[];

    const sectionBoxIdx = children.indexOf(containers.sectionBoxContainer);
    const marketIdx = children.indexOf(containers.marketContainer);
    const playerIdx = children.indexOf(containers.playerContainer);

    expect(sectionBoxIdx).toBeLessThan(marketIdx);
    expect(sectionBoxIdx).toBeLessThan(playerIdx);
  });

  it('overlay elements (depth 10+) render above gameplay containers', async () => {
    game = await bootGame();
    await waitFrames(3);
    const scene = game.scene.getScene('FeudalismScene') as any;

    // Trigger the discard overlay dialog which creates depth-11 elements
    // directly via the renderer (the scene method is private).
    const feudRenderer = (scene as any).feudRenderer;
    feudRenderer.showDiscardDialog(1, () => {});
    await waitFrames(3);

    // Find all objects with depth >= 10 (overlay elements)
    const overlayObjects: Phaser.GameObjects.GameObject[] = [];
    function walk(parent: Phaser.GameObjects.GameObject[]) {
      for (const child of parent) {
        const d = (child as any).depth ?? 0;
        if (d >= 10) overlayObjects.push(child);
        if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
          walk((child as any).list);
        }
      }
    }
    walk(scene.children.list);

    // There should be at least one overlay object with depth >= 10
    expect(overlayObjects.length).toBeGreaterThan(0);

    // All gameplay containers have depth 0, so overlay objects should be above
    const containers = getRendererContainers(scene);
    for (const obj of overlayObjects) {
      const objDepth = (obj as any).depth ?? 0;
      for (const [name, container] of Object.entries(containers)) {
        const cDepth = (container as any).depth ?? 0;
        expect(objDepth, `Overlay object (depth ${objDepth}) should be above ${name} (depth ${cDepth})`)
          .toBeGreaterThan(cDepth);
      }
    }

    // Clean up overlay
    scene.overlayManager?.dismiss?.();
  });

  it('zone metadata is set on Feudalism containers (created via createGameZone)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const containers = getRendererContainers(scene);

    // Feudalism containers are created via createGameZone, so they should have
    // zone metadata properties (__zoneWidth, __zoneHeight, __zoneName).
    for (const [name, container] of Object.entries(containers)) {
      expect((container as any).__zoneWidth, `${name} should have __zoneWidth`).toBeDefined();
      expect((container as any).__zoneHeight, `${name} should have __zoneHeight`).toBeDefined();
      expect((container as any).__zoneName, `${name} should have __zoneName`).toBe(name);
    }
  });
});
