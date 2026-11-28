/**
 * Browser tests for the SettingsPanel shared verbosity control.
 *
 * Verifies that:
 *   - the "Verbosity" control renders only when `hasVerbosity` is set;
 *   - it defaults to `false` (opt-in), so narration-free games show nothing;
 *   - the persisted value is reflected on build/open;
 *   - a selection persists through localStorage (`tce-verbosity`);
 *   - an invalid stored value falls back to `'full'`.
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
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

/**
 * Find all Text objects whose `text` matches, recursing into nested
 * containers (e.g. the settings panel's scrollable content container).
 */
function findTextObjects(
  container: Phaser.GameObjects.Container,
  text: string,
): Phaser.GameObjects.Text[] {
  const results: Phaser.GameObjects.Text[] = [];
  const visit = (c: Phaser.GameObjects.Container) => {
    c.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Text && child.text === text) {
        results.push(child);
      } else if (child instanceof Phaser.GameObjects.Container) {
        visit(child);
      }
    });
  };
  visit(container);
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
      this.settingsPanel.open();
    }
  };
}

const TestSettingsNoVerbosity = createSettingsTestScene(
  'TestSettingsNoVerbosity',
  { hasVerbosity: false },
);

const TestSettingsWithVerbosity = createSettingsTestScene(
  'TestSettingsWithVerbosity',
  { hasVerbosity: true },
);

const TestSettingsDefaultVerbosity = createSettingsTestScene(
  'TestSettingsDefaultVerbosity',
  {}, // hasVerbosity omitted → should default to false
);

function getPanelContainer(sceneKey: string, game: Phaser.Game): Phaser.GameObjects.Container {
  const scene = game.scene.getScene(sceneKey) as any;
  return scene.settingsPanel['container'] as Phaser.GameObjects.Container;
}

function getPanel(sceneKey: string, game: Phaser.Game): SettingsPanel {
  const scene = game.scene.getScene(sceneKey) as any;
  return scene.settingsPanel as SettingsPanel;
}

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('tce-verbosity');
  }
});

// ── Flag gating ────────────────────────────────────────────

describe('SettingsPanel verbosity control gating', () => {
  let game: Phaser.Game | null = null;

  afterAll(() => {
    destroyGame(game);
    game = null;
  });

  it('does NOT render the control when hasVerbosity is false', async () => {
    game = await createTestGame('TestSettingsNoVerbosity', TestSettingsNoVerbosity);
    const container = getPanelContainer('TestSettingsNoVerbosity', game);

    expect(findTextObjects(container, 'Verbosity').length).toBe(0);
    expect(findTextObjects(container, 'Full').length).toBe(0);
    expect(findTextObjects(container, 'Concise').length).toBe(0);
  }, 30_000);

  it('does NOT render the control when hasVerbosity is omitted (default false)', async () => {
    destroyGame(game);
    game = await createTestGame('TestSettingsDefaultVerbosity', TestSettingsDefaultVerbosity);
    const container = getPanelContainer('TestSettingsDefaultVerbosity', game);

    expect(findTextObjects(container, 'Verbosity').length).toBe(0);
  }, 30_000);

  it('renders the control plus both options when hasVerbosity is true', async () => {
    destroyGame(game);
    game = await createTestGame('TestSettingsWithVerbosity', TestSettingsWithVerbosity);
    const container = getPanelContainer('TestSettingsWithVerbosity', game);

    expect(findTextObjects(container, 'Verbosity').length).toBe(1);
    expect(findTextObjects(container, 'Full').length).toBe(1);
    expect(findTextObjects(container, 'Concise').length).toBe(1);
  }, 30_000);
});

// ── Persistence ────────────────────────────────────────────

describe('SettingsPanel verbosity persistence', () => {
  let game: Phaser.Game | null = null;

  afterAll(() => {
    destroyGame(game);
    game = null;
  });

  it('defaults to full when nothing is stored', async () => {
    game = await createTestGame('TestSettingsWithVerbosity', TestSettingsWithVerbosity);
    expect(getPanel('TestSettingsWithVerbosity', game).verbosity).toBe('full');
  }, 30_000);

  it('reflects the stored value on build/open', async () => {
    destroyGame(game);
    window.localStorage.setItem('tce-verbosity', 'concise');
    game = await createTestGame('TestSettingsWithVerbosity', TestSettingsWithVerbosity);
    expect(getPanel('TestSettingsWithVerbosity', game).verbosity).toBe('concise');
  }, 30_000);

  it('falls back to full for an invalid stored value', async () => {
    destroyGame(game);
    window.localStorage.setItem('tce-verbosity', 'garbage');
    game = await createTestGame('TestSettingsWithVerbosity', TestSettingsWithVerbosity);
    expect(getPanel('TestSettingsWithVerbosity', game).verbosity).toBe('full');
  }, 30_000);

  it('persists a selection through tce-verbosity', async () => {
    destroyGame(game);
    game = await createTestGame('TestSettingsWithVerbosity', TestSettingsWithVerbosity);
    const panel = getPanel('TestSettingsWithVerbosity', game);

    // Drive the option click handler directly (no public setter exists).
    (panel as any).handleVerbositySelect('concise');

    expect(panel.verbosity).toBe('concise');
    expect(window.localStorage.getItem('tce-verbosity')).toBe('concise');
  }, 30_000);

  it('re-reads the stored value when the panel opens', async () => {
    destroyGame(game);
    game = await createTestGame('TestSettingsWithVerbosity', TestSettingsWithVerbosity);
    const panel = getPanel('TestSettingsWithVerbosity', game);

    expect(panel.verbosity).toBe('full');

    // The preference changed while the panel was closed.
    window.localStorage.setItem('tce-verbosity', 'concise');
    panel.refreshVerbosity();

    expect(panel.verbosity).toBe('concise');
  }, 30_000);
});
