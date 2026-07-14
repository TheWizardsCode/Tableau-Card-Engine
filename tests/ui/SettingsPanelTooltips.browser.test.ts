/**
 * Browser tests for SettingsPanel tooltips toggle conditional display.
 *
 * Verifies that:
 *   - When hasTooltips: true (default), the tooltips toggle UI is present.
 *   - When hasTooltips: false, the tooltips toggle UI is NOT present.
 *   - The reduced motion and end-turn key controls still render correctly
 *     when the tooltips toggle is hidden.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Phaser from 'phaser';
import { SoundManager } from '../../src/core-engine/SoundManager';
import { SettingsPanel } from '../../src/ui/SettingsPanel';
import { waitForScene } from '../helpers/waitForScene';

// ── Boot helper ────────────────────────────────────────────

async function createTestGame(
  sceneKey: string,
  SceneClass: new () => Phaser.Scene,
): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.CANVAS,
    parent: 'game-container',
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
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

// ── Helper: find text objects by content in a container ────

function findTextObjects(
  container: Phaser.GameObjects.Container,
  text: string,
): Phaser.GameObjects.Text[] {
  const results: Phaser.GameObjects.Text[] = [];
  container.each((child: Phaser.GameObjects.GameObject) => {
    if (child instanceof Phaser.GameObjects.Text && child.text === text) {
      results.push(child);
    }
  });
  return results;
}

// ── Test factory for scenes ────────────────────────────────

function createSettingsTestScene(
  key: string,
  panelConfig: Partial<ConstructorParameters<typeof SettingsPanel>[1]>,
): new () => Phaser.Scene {
  return class extends Phaser.Scene {
    settingsPanel!: SettingsPanel;

    constructor() {
      super({ key });
    }

    create(): void {
      const soundManager = new SoundManager(
        { play: () => {}, stop: () => {}, setVolume: () => {}, setMute: () => {} },
        { storage: null },
      );

      this.settingsPanel = new SettingsPanel(this, {
        soundManager,
        showButton: false,
        ...panelConfig,
      } as any);
      // Open the panel to ensure it's visible for testing
      this.settingsPanel.open();
    }
  };
}

const TestSettingsNoTooltips = createSettingsTestScene(
  'TestSettingsNoTooltips',
  { hasTooltips: false },
);

const TestSettingsWithTooltips = createSettingsTestScene(
  'TestSettingsWithTooltips',
  { hasTooltips: true },
);

const TestSettingsDefault = createSettingsTestScene(
  'TestSettingsDefault',
  {}, // hasTooltips omitted → should default to true
);

// ── Tests ──────────────────────────────────────────────────

describe('SettingsPanel tooltips toggle conditional display', () => {
  describe('when hasTooltips is false', () => {
    let game: Phaser.Game | null = null;

    beforeAll(async () => {
      game = await createTestGame('TestSettingsNoTooltips', TestSettingsNoTooltips);
    }, 30_000);

    afterAll(() => {
      destroyGame(game);
      game = null;
    });

    it('does NOT display the "Tooltips" label in the settings panel', () => {
      const scene = game!.scene.getScene('TestSettingsNoTooltips') as any;
      const container = scene.settingsPanel['container'] as Phaser.GameObjects.Container;
      const tooltipLabels = findTextObjects(container, 'Tooltips');
      expect(tooltipLabels.length).toBe(0);
    });

    it('still displays the "Reduced Motion" label', () => {
      const scene = game!.scene.getScene('TestSettingsNoTooltips') as any;
      const container = scene.settingsPanel['container'] as Phaser.GameObjects.Container;
      const reducedMotionLabels = findTextObjects(container, 'Reduced Motion');
      expect(reducedMotionLabels.length).toBe(1);
    });

    it('still displays the "End Turn Key" label', () => {
      const scene = game!.scene.getScene('TestSettingsNoTooltips') as any;
      const container = scene.settingsPanel['container'] as Phaser.GameObjects.Container;
      const endTurnLabels = findTextObjects(container, 'End Turn Key');
      expect(endTurnLabels.length).toBe(1);
    });
  });

  describe('when hasTooltips is true', () => {
    let game: Phaser.Game | null = null;

    beforeAll(async () => {
      game = await createTestGame('TestSettingsWithTooltips', TestSettingsWithTooltips);
    }, 30_000);

    afterAll(() => {
      destroyGame(game);
      game = null;
    });

    it('displays the "Tooltips" label in the settings panel', () => {
      const scene = game!.scene.getScene('TestSettingsWithTooltips') as any;
      const container = scene.settingsPanel['container'] as Phaser.GameObjects.Container;
      const tooltipLabels = findTextObjects(container, 'Tooltips');
      expect(tooltipLabels.length).toBe(1);
    });

    it('displays the "Reduced Motion" label', () => {
      const scene = game!.scene.getScene('TestSettingsWithTooltips') as any;
      const container = scene.settingsPanel['container'] as Phaser.GameObjects.Container;
      const reducedMotionLabels = findTextObjects(container, 'Reduced Motion');
      expect(reducedMotionLabels.length).toBe(1);
    });
  });

  describe('when hasTooltips is omitted (defaults to true)', () => {
    let game: Phaser.Game | null = null;

    beforeAll(async () => {
      game = await createTestGame('TestSettingsDefault', TestSettingsDefault);
    }, 30_000);

    afterAll(() => {
      destroyGame(game);
      game = null;
    });

    it('displays the "Tooltips" label by default', () => {
      const scene = game!.scene.getScene('TestSettingsDefault') as any;
      const container = scene.settingsPanel['container'] as Phaser.GameObjects.Container;
      const tooltipLabels = findTextObjects(container, 'Tooltips');
      expect(tooltipLabels.length).toBe(1);
    });
  });
});
