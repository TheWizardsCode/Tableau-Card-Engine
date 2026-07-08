/**
 * GymLayoutOwnershipScene Browser Integration Tests
 *
 * Validates that the layout ownership demo scene boots correctly and
 * demonstrates the visibility ownership runtime behavior:
 *  - Mode switching changes target visibility
 *  - Group toggles modify visibility rules
 *  - Status text updates reflect the current state
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
    const demoLabels = [
      'Shell Title',
      'Shell Menu',
      'Scene Card 1',
      'Scene Card 2',
      'Shared Action',
      'Shared Help',
    ];
    for (const label of demoLabels) {
      const obj = findTextObject(scene, text => text === label);
      expect(obj).toBeTruthy();
      expect(obj?.visible).toBe(true);
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

    // Find and click the shell mode button
    const shellBtn = findTextObject(scene, text => text.includes('Shell'));
    expect(shellBtn).toBeTruthy();
    shellBtn?.emit('pointerdown');

    // Shell and shared should be visible, scene objects hidden
    expect(findTextObject(scene, text => text === 'Shell Title')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === 'Shell Menu')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === 'Scene Card 1')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === 'Scene Card 2')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === 'Shared Action')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === 'Shared Help')?.visible).toBe(true);

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

    // Find and click the scene mode button
    const sceneBtn = findTextObject(scene, text => text.includes('Scene'));
    expect(sceneBtn).toBeTruthy();
    sceneBtn?.emit('pointerdown');

    // Shell objects hidden, scene objects visible
    expect(findTextObject(scene, text => text === 'Shell Title')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === 'Shell Menu')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === 'Scene Card 1')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === 'Scene Card 2')?.visible).toBe(true);

    // Shared still visible in scene-only
    expect(findTextObject(scene, text => text === 'Shared Action')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === 'Shared Help')?.visible).toBe(true);

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
    const ungroupedCard = findTextObject(scene, text => text === 'Ungrouped #1');
    expect(ungroupedCard).toBeTruthy();

    // In composed mode, ungrouped targets should be hidden by default
    expect(ungroupedCard?.visible).toBe(false);

    // Diagnostic warning should be displayed
    const issueText = findTextObject(scene, text => text.startsWith('⚠'));
    expect(issueText).toBeTruthy();
    expect(issueText?.text).toContain('ungrouped');
  });

  it('supports mode cycling back to composed', async () => {
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
    const shellBtn = findTextObject(scene, text => text.includes('Shell'));
    const sceneBtn = findTextObject(scene, text => text.includes('Scene'));
    const composedBtn = findTextObject(scene, text => text.includes('Composed'));

    expect(shellBtn).toBeTruthy();
    expect(sceneBtn).toBeTruthy();
    expect(composedBtn).toBeTruthy();

    shellBtn?.emit('pointerdown');
    expect(findTextObject(scene, text => text.includes('Mode: shell-only'))?.visible).toBe(true);

    sceneBtn?.emit('pointerdown');
    expect(findTextObject(scene, text => text.includes('Mode: scene-only'))?.visible).toBe(true);

    composedBtn?.emit('pointerdown');
    expect(findTextObject(scene, text => text.includes('Mode: composed'))?.visible).toBe(true);
  });
});
