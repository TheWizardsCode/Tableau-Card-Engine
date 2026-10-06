/**
 * Browser tests for SettingsPanel live debug-tool descriptions.
 *
 * Verifies that function-valued `DebugToolsEntry.description` values:
 *   - are resolved on initial render (not rendered as the function source),
 *   - refresh while the panel is open without toggling it closed,
 *   - stop refreshing once the panel is closed.
 *
 * Also asserts the static-string path is unchanged. See CG-0MUTXAHPE003G4WG.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Phaser from 'phaser';
import { SoundManager } from '../../src/core-engine/SoundManager';
import { SettingsPanel } from '../../src/ui/SettingsPanel';
import type { DebugToolsEntry } from '../../src/ui/debug/DebugToolsRegistry';
import { waitForScene } from '../helpers/waitForScene';

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
    width: 900,
    height: 700,
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

function findTextObjects(
  container: Phaser.GameObjects.Container,
  predicate: (text: Phaser.GameObjects.Text) => boolean,
): Phaser.GameObjects.Text[] {
  const results: Phaser.GameObjects.Text[] = [];
  const visit = (c: Phaser.GameObjects.Container) => {
    c.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Text && predicate(child)) {
        results.push(child);
      } else if (child instanceof Phaser.GameObjects.Container) {
        visit(child);
      }
    });
  };
  visit(container);
  return results;
}

/** Shared live state mutated by the test's tool description closure. */
const liveState = { active: false };

const liveTool: DebugToolsEntry = {
  label: 'ToneForge',
  description: () => (liveState.active ? 'Active' : 'Inactive'),
  activate: () => {},
};

const staticTool: DebugToolsEntry = {
  label: 'Static Tool',
  description: 'Static description text',
  activate: () => {},
};

function createScene(key: string): new () => Phaser.Scene {
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
        debugTools: [liveTool, staticTool],
      });
      this.settingsPanel.open();
    }
  };
}

const LiveDescScene = createScene('TestSettingsLiveDesc');

function panelTexts(game: Phaser.Game): Phaser.GameObjects.Text[] {
  const scene = game.scene.getScene('TestSettingsLiveDesc') as any;
  const container = scene.settingsPanel['container'] as Phaser.GameObjects.Container;
  return findTextObjects(container, () => true);
}

describe('SettingsPanel live debug descriptions', () => {
  let game: Phaser.Game | null = null;

  beforeAll(async () => {
    game = await createTestGame('TestSettingsLiveDesc', LiveDescScene);
  }, 30_000);

  afterAll(() => {
    destroyGame(game);
    game = null;
  });

  it('resolves a function description on initial render', () => {
    liveState.active = false;
    const scene = game!.scene.getScene('TestSettingsLiveDesc') as any;
    scene.settingsPanel.open();

    const texts = panelTexts(game!);
    expect(texts.some((t) => t.text === 'Inactive')).toBe(true);
    // The function source must never be rendered.
    expect(texts.some((t) => t.text.includes('=>'))).toBe(false);
  });

  it('refreshes the description live while the panel stays open', async () => {
    liveState.active = false;
    const scene = game!.scene.getScene('TestSettingsLiveDesc') as any;
    scene.settingsPanel.open();

    expect(panelTexts(game!).some((t) => t.text === 'Inactive')).toBe(true);
    expect(scene.settingsPanel['_isOpen']).toBe(true);

    // Flip the closure state; the poll should refresh the text in place.
    liveState.active = true;
    await new Promise((r) => setTimeout(r, 800));

    const texts = panelTexts(game!);
    expect(texts.some((t) => t.text === 'Active')).toBe(true);
    expect(scene.settingsPanel['_isOpen']).toBe(true);
  });

  it('still renders static string descriptions unchanged', () => {
    const texts = panelTexts(game!);
    expect(texts.some((t) => t.text === 'Static description text')).toBe(true);
  });

  it('stops refreshing after the panel is closed', async () => {
    const scene = game!.scene.getScene('TestSettingsLiveDesc') as any;
    scene.settingsPanel.open();
    await new Promise((r) => setTimeout(r, 50));

    scene.settingsPanel.close();
    expect(scene.settingsPanel['_debugRefreshTimer']).toBeNull();
  });
});
