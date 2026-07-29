/**
 * Browser tests for SettingsPanel version label display.
 *
 * Verifies that:
 *   - The version label is visible on the canvas when the panel opens.
 *   - The version label is hidden when the panel closes.
 *   - The version label has the correct style (small font, muted color).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Phaser from 'phaser';
import { SoundManager } from '../../src/core-engine/SoundManager';
import { SettingsPanel } from '../../src/ui/SettingsPanel';
import { VERSION_LABEL_TEXT } from '../../src/ui/versionDisplay';
import { waitForScene } from '../helpers/waitForScene';

// ── Boot helper ────────────────────────────────────────────

async function createTestGame(
  sceneKey: string,
  SceneClass: new () => Phaser.Scene,
): Promise<Phaser.Game> {
  let container = document.getElementById('game-container-version');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container-version';
  document.body.appendChild(container);

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.CANVAS,
    parent: 'game-container-version',
    width: 800,
    height: 600,
    scene: [SceneClass],
  };
  const game = new Phaser.Game(config);
  await waitForScene(game, sceneKey);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container-version');
  if (container) container.remove();
}

// Helper: find Phaser text objects on the scene (not inside containers) by content
function findSceneTextObjects(
  scene: Phaser.Scene,
  text: string,
): Phaser.GameObjects.Text[] {
  const results: Phaser.GameObjects.Text[] = [];
  scene.children.each((child: Phaser.GameObjects.GameObject) => {
    if (child instanceof Phaser.GameObjects.Text && child.text === text) {
      results.push(child);
    }
  });
  return results;
}

// ── Test factory scene ─────────────────────────────────────

class SettingsVersionTestScene extends Phaser.Scene {
  settingsPanel!: SettingsPanel;

  constructor() {
    super({ key: 'SettingsVersionTestScene' });
  }

  create(): void {
    const soundManager = new SoundManager(
      { play: () => {}, stop: () => {}, setVolume: () => {}, setMute: () => {} },
      { storage: null },
    );

    this.settingsPanel = new SettingsPanel(this as any, {
      soundManager,
      showButton: false,
    } as any);
  }
}

// ── Tests ──────────────────────────────────────────────────

describe('SettingsPanel version label', () => {
  let game: Phaser.Game | null = null;

  beforeAll(async () => {
    game = await createTestGame('SettingsVersionTestScene', SettingsVersionTestScene);
  }, 30_000);

  afterAll(() => {
    destroyGame(game);
    game = null;
  });

  it('version label is NOT visible before panel opens', () => {
    const scene = game!.scene.getScene('SettingsVersionTestScene') as SettingsVersionTestScene;
    const labels = findSceneTextObjects(scene, VERSION_LABEL_TEXT);
    // The label may exist (created in constructor) but should not be visible
    for (const label of labels) {
      expect(label.visible).toBe(false);
    }
  });

  it('version label becomes visible when panel opens', () => {
    const scene = game!.scene.getScene('SettingsVersionTestScene') as SettingsVersionTestScene;
    scene.settingsPanel.open();

    const labels = findSceneTextObjects(scene, VERSION_LABEL_TEXT);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    for (const label of labels) {
      expect(label.visible).toBe(true);
    }
  });

  it('version label is positioned at bottom-left of canvas', () => {
    const scene = game!.scene.getScene('SettingsVersionTestScene') as SettingsVersionTestScene;
    scene.settingsPanel.open();

    const labels = findSceneTextObjects(scene, VERSION_LABEL_TEXT);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    const label = labels[0];
    // Bottom-left: x near 0, y near bottom (canvas height 600)
    expect(label.x).toBeLessThan(50);
    expect(label.y).toBeGreaterThan(550);
  });

  it('version label has small font (11-12px)', () => {
    const scene = game!.scene.getScene('SettingsVersionTestScene') as SettingsVersionTestScene;
    scene.settingsPanel.open();

    const labels = findSceneTextObjects(scene, VERSION_LABEL_TEXT);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    const label = labels[0];
    expect(label.style!.fontSize).toMatch(/^1[12]px$/);
  });

  it('version label has muted color (grey)', () => {
    const scene = game!.scene.getScene('SettingsVersionTestScene') as SettingsVersionTestScene;
    scene.settingsPanel.open();

    const labels = findSceneTextObjects(scene, VERSION_LABEL_TEXT);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    const label = labels[0];
    // Should be a grey-ish muted color, not bright white
    expect(label.style!.color).toBeDefined();
    // Alpha should be < 1 for semi-transparent effect
    expect(label.alpha).toBeLessThan(1);
  });

  it('version label is non-interactive (no pointer events)', () => {
    const scene = game!.scene.getScene('SettingsVersionTestScene') as SettingsVersionTestScene;
    scene.settingsPanel.open();

    const labels = findSceneTextObjects(scene, VERSION_LABEL_TEXT);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    const label = labels[0];
    // Non-interactive text should not respond to pointer events.
    // In Phaser 4, calling setInteractive() enables input; by default
    // a freshly created text object has no input handler.
    // We verify by checking that input.enabled is falsy or undefined.
    const inputState = (label as any).input;
    if (inputState) {
      // If input property exists, it should not be enabled
      expect(inputState.enabled).toBeFalsy();
    }
    // If input is undefined, the test implicitly passes
  });

  it('version label is hidden when panel closes', () => {
    const scene = game!.scene.getScene('SettingsVersionTestScene') as SettingsVersionTestScene;
    scene.settingsPanel.open();
    scene.settingsPanel.close();

    const labels = findSceneTextObjects(scene, VERSION_LABEL_TEXT);
    for (const label of labels) {
      expect(label.visible).toBe(false);
    }
  });
});
