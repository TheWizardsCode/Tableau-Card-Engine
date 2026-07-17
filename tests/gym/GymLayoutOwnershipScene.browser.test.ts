/**
 * GymLayoutOwnershipScene Browser Integration Tests
 *
 * Validates that the layout ownership demo scene boots correctly and
 * demonstrates the visibility ownership runtime behavior:
 *  - Mode switching changes target visibility
 *  - Group toggles modify visibility rules
 *  - Status text updates reflect the current state
 *
 * Position assertions use tolerant range-based checks (±5px) to keep
 * the spec stable across headless Chromium runs. The expected values are
 * derived from the scene constants:
 *   GRID_X=20, GRID_Y=160, CARD_W=260, CARD_H=60, CARD_GAP=12
 * Each card text is created at (x + CARD_W/2, y + CARD_H/2) with origin
 * (0.5), so assertions check the computed center.
 *
 * @module tests/gym/GymLayoutOwnershipScene.browser
 */

import { describe, expect, it, afterEach } from 'vitest';
import Phaser from 'phaser';
import { GymLayoutOwnershipScene } from '../../example-games/gym/scenes/GymLayoutOwnershipScene';
import { GYM_LAYOUT_OWNERSHIP_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

function findTextObject(scene: Phaser.Scene, textMatch: (text: string) => boolean): Phaser.GameObjects.Text | null {
  return (
    scene.children.list.find(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text && textMatch(String(child.text)),
    ) ?? null
  );
}

describe('GymLayoutOwnershipScene browser integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;

    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  it('boots and shows the initial composed mode state', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#0a1420',
      scene: [GymLayoutOwnershipScene],
    });

    await waitForScene(game, GYM_LAYOUT_OWNERSHIP_KEY);
    const scene = game.scene.getScene(GYM_LAYOUT_OWNERSHIP_KEY) as Phaser.Scene;

    // Verify scene header is visible
    const headerText = findTextObject(scene, text => text === 'Layout Ownership Runtime');
    expect(headerText).toBeTruthy();
    expect(headerText?.visible).toBe(true);

    // Mode buttons should be visible
    const shellBtn = findTextObject(scene, text => text.includes('[ Mode: Shell ]') || text.includes('▶ Shell'));
    expect(shellBtn).toBeTruthy();

    // Status line should show composed mode
    const statusText = findTextObject(scene, text => text.includes('Mode: composed'));
    expect(statusText).toBeTruthy();

    // All 6 demo objects (shell title, shell menu, scene card 1, scene card 2,
    // shared action, shared help) should be visible in composed mode
    // Position expectations from scene constants: center at (x+CARD_W/2, y+CARD_H/2)
    // Shell Title:  GRID_X=20, GRID_Y=160         -> center (150, 190)
    // Shell Menu:   GRID_X+272=292, GRID_Y=160      -> center (422, 190)
    // Scene Card 1: GRID_X=20, GRID_Y+72=232        -> center (150, 262)
    // Scene Card 2: GRID_X+272=292, GRID_Y+72=232   -> center (422, 262)
    // Shared Action: GRID_X=20, GRID_Y+144=304      -> center (150, 334)
    // Shared Help:  GRID_X+272=292, GRID_Y+144=304  -> center (422, 334)
    const demoLabels: Array<{ label: string; expectedX: number; expectedY: number }> = [
      { label: 'Shell Title', expectedX: 150, expectedY: 190 },
      { label: 'Shell Menu', expectedX: 422, expectedY: 190 },
      { label: 'Scene Card 1', expectedX: 150, expectedY: 262 },
      { label: 'Scene Card 2', expectedX: 422, expectedY: 262 },
      { label: 'Shared Action', expectedX: 150, expectedY: 334 },
      { label: 'Shared Help', expectedX: 422, expectedY: 334 },
    ];
    for (const { label, expectedX, expectedY } of demoLabels) {
      const obj = findTextObject(scene, text => text === label);
      expect(obj).toBeTruthy();
      expect(obj?.visible).toBe(true);
      // Tolerant range assertions keep the spec stable across headless
      // Chromium runs while still proving elements land where expected.
      expect(obj?.x).toBeGreaterThan(expectedX - 5);
      expect(obj?.x).toBeLessThan(expectedX + 5);
      expect(obj?.y).toBeGreaterThan(expectedY - 5);
      expect(obj?.y).toBeLessThan(expectedY + 5);
    }
  });

  it('switches to shell-only mode (scene objects hidden)', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#0a1420',
      scene: [GymLayoutOwnershipScene],
    });

    await waitForScene(game, GYM_LAYOUT_OWNERSHIP_KEY);
    const scene = game.scene.getScene(GYM_LAYOUT_OWNERSHIP_KEY) as Phaser.Scene;

    // Find and click the shell mode button (use '[ Mode:' prefix to distinguish from demo objects)
    const shellBtn = findTextObject(scene, text => text.startsWith('[ Mode: Shell ]'));
    expect(shellBtn).toBeTruthy();
    shellBtn?.emit('pointerdown');

    // Shell and shared should be visible, scene objects hidden
    // Positions should remain unchanged from their initial placement
    const shellLabels: Array<{ label: string; expectedX: number; expectedY: number }> = [
      { label: 'Shell Title', expectedX: 150, expectedY: 190 },
      { label: 'Shell Menu', expectedX: 422, expectedY: 190 },
      { label: 'Shared Action', expectedX: 150, expectedY: 334 },
      { label: 'Shared Help', expectedX: 422, expectedY: 334 },
    ];
    for (const { label, expectedX, expectedY } of shellLabels) {
      const obj = findTextObject(scene, text => text === label);
      expect(obj).toBeTruthy();
      expect(obj?.visible).toBe(true);
      expect(obj?.x).toBeGreaterThan(expectedX - 5);
      expect(obj?.x).toBeLessThan(expectedX + 5);
      expect(obj?.y).toBeGreaterThan(expectedY - 5);
      expect(obj?.y).toBeLessThan(expectedY + 5);
    }

    // Scene objects should be hidden
    expect(findTextObject(scene, text => text === 'Scene Card 1')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === 'Scene Card 2')?.visible).toBe(false);

    // Status should reflect shell-only mode
    const statusText = findTextObject(scene, text => text.includes('Mode: shell-only'));
    expect(statusText).toBeTruthy();
  });

  it('switches to scene-only mode (shell objects hidden)', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#0a1420',
      scene: [GymLayoutOwnershipScene],
    });

    await waitForScene(game, GYM_LAYOUT_OWNERSHIP_KEY);
    const scene = game.scene.getScene(GYM_LAYOUT_OWNERSHIP_KEY) as Phaser.Scene;

    // Find and click the scene mode button (use '[ Mode:' prefix to distinguish from demo objects)
    const sceneBtn = findTextObject(scene, text => text.startsWith('[ Mode: Scene ]'));
    expect(sceneBtn).toBeTruthy();
    sceneBtn?.emit('pointerdown');

    // Shell objects hidden, scene objects visible
    const sceneLabels: Array<{ label: string; expectedX: number; expectedY: number }> = [
      { label: 'Scene Card 1', expectedX: 150, expectedY: 262 },
      { label: 'Scene Card 2', expectedX: 422, expectedY: 262 },
      { label: 'Shared Action', expectedX: 150, expectedY: 334 },
      { label: 'Shared Help', expectedX: 422, expectedY: 334 },
    ];
    for (const { label, expectedX, expectedY } of sceneLabels) {
      const obj = findTextObject(scene, text => text === label);
      expect(obj).toBeTruthy();
      expect(obj?.visible).toBe(true);
      expect(obj?.x).toBeGreaterThan(expectedX - 5);
      expect(obj?.x).toBeLessThan(expectedX + 5);
      expect(obj?.y).toBeGreaterThan(expectedY - 5);
      expect(obj?.y).toBeLessThan(expectedY + 5);
    }

    // Shell objects should be hidden
    expect(findTextObject(scene, text => text === 'Shell Title')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === 'Shell Menu')?.visible).toBe(false);

    // Status should reflect scene-only mode
    const statusText = findTextObject(scene, text => text.includes('Mode: scene-only'));
    expect(statusText).toBeTruthy();
  });

  it('registers ungrouped targets with diagnostic warning', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#0a1420',
      scene: [GymLayoutOwnershipScene],
    });

    await waitForScene(game, GYM_LAYOUT_OWNERSHIP_KEY);
    const scene = game.scene.getScene(GYM_LAYOUT_OWNERSHIP_KEY) as Phaser.Scene;

    // Click the "+ Ungrouped" button to add an ungrouped target
    const addBtn = findTextObject(scene, text => text.includes('+ Ungrouped'));
    expect(addBtn).toBeTruthy();

    addBtn?.emit('pointerdown');

    // An ungrouped card should now be visible in the scene area
    // (idx = registeredTargets.length + 1; there are 6 demo cards, so ungrouped #7)
    // Position: x = 20 + idx * (CARD_W + 8) = 20 + 7*268 = 1896
    // Center: text.x = 1896 + CARD_W/2 = 2026, text.y = 500 + CARD_H/2 = 530
    const ungroupedCard = findTextObject(scene, text => text === 'Ungrouped #7');
    expect(ungroupedCard).toBeTruthy();
    expect(ungroupedCard?.x).toBeGreaterThan(2021);
    expect(ungroupedCard?.x).toBeLessThan(2031);
    expect(ungroupedCard?.y).toBeGreaterThan(525);
    expect(ungroupedCard?.y).toBeLessThan(535);

    // In composed mode, ungrouped targets should be hidden by default
    expect(ungroupedCard?.visible).toBe(false);

    // Diagnostic warning should be displayed
    const issueText = findTextObject(scene, text => text.startsWith('⚠'));
    expect(issueText).toBeTruthy();
    expect(issueText?.text).toContain('ungrouped');
  });

  it('supports mode cycling back to composed with correct positions', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#0a1420',
      scene: [GymLayoutOwnershipScene],
    });

    await waitForScene(game, GYM_LAYOUT_OWNERSHIP_KEY);
    const scene = game.scene.getScene(GYM_LAYOUT_OWNERSHIP_KEY) as Phaser.Scene;

    // Switch to shell-only, then scene-only, then back to composed
    const shellBtn = findTextObject(scene, text => text.startsWith('[ Mode: Shell ]'));
    const sceneBtn = findTextObject(scene, text => text.startsWith('[ Mode: Scene ]'));
    const composedBtn = findTextObject(scene, text => text.startsWith('[ Mode: Composed ]'));

    expect(shellBtn).toBeTruthy();
    expect(sceneBtn).toBeTruthy();
    expect(composedBtn).toBeTruthy();

    shellBtn?.emit('pointerdown');
    expect(findTextObject(scene, text => text.includes('Mode: shell-only'))?.visible).toBe(true);
    // Object positions unchanged after mode switch
    expect(findTextObject(scene, text => text === 'Shell Title')?.x).toBeGreaterThan(145);
    expect(findTextObject(scene, text => text === 'Shell Title')?.x).toBeLessThan(155);

    sceneBtn?.emit('pointerdown');
    expect(findTextObject(scene, text => text.includes('Mode: scene-only'))?.visible).toBe(true);
    expect(findTextObject(scene, text => text === 'Scene Card 1')?.x).toBeGreaterThan(145);
    expect(findTextObject(scene, text => text === 'Scene Card 1')?.x).toBeLessThan(155);

    composedBtn?.emit('pointerdown');
    expect(findTextObject(scene, text => text.includes('Mode: composed'))?.visible).toBe(true);
    // After full cycle back to composed, all 6 objects should be at correct positions
    const allLabels: Array<{ label: string; expectedX: number; expectedY: number }> = [
      { label: 'Shell Title', expectedX: 150, expectedY: 190 },
      { label: 'Shell Menu', expectedX: 422, expectedY: 190 },
      { label: 'Scene Card 1', expectedX: 150, expectedY: 262 },
      { label: 'Scene Card 2', expectedX: 422, expectedY: 262 },
      { label: 'Shared Action', expectedX: 150, expectedY: 334 },
      { label: 'Shared Help', expectedX: 422, expectedY: 334 },
    ];
    for (const { label, expectedX, expectedY } of allLabels) {
      const obj = findTextObject(scene, text => text === label);
      expect(obj).toBeTruthy();
      expect(obj?.visible).toBe(true);
      expect(obj?.x).toBeGreaterThan(expectedX - 5);
      expect(obj?.x).toBeLessThan(expectedX + 5);
      expect(obj?.y).toBeGreaterThan(expectedY - 5);
      expect(obj?.y).toBeLessThan(expectedY + 5);
    }
  });
});
