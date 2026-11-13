/**
 * Browser tests for the generic `extraToggles` hook in {@link SettingsPanel}.
 *
 * The engine must stay game-agnostic, so a game injects its own boolean
 * settings (e.g. Main Street's *Auto advance turn*) through the optional
 * `extraToggles` config. These tests pin the contract:
 *   - omitting the hook renders no game-supplied controls (strictly optional),
 *   - one control is rendered per entry, styled like the built-in toggles,
 *   - activating a control flips the value through `set()` and then re-reads
 *     `get()` (so a game may veto or normalise a change),
 *   - `refreshExtraToggles()` picks up a change made outside the panel,
 *   - several entries are independent.
 */

import { describe, it, expect } from 'vitest';
import Phaser from 'phaser';
import { SoundManager } from '../../src/core-engine/SoundManager';
import { SettingsPanel } from '../../src/ui/SettingsPanel';
import type { ExtraToggleConfig } from '../../src/ui/SettingsPanel';
import { waitForScene } from '../helpers/waitForScene';

// ── Harness ────────────────────────────────────────────────

/** The rendered controls for one game-supplied toggle (internal panel view). */
interface ExtraToggleView {
  config: ExtraToggleConfig;
  label: Phaser.GameObjects.Text;
  toggleBg: Phaser.GameObjects.Rectangle;
  statusText: Phaser.GameObjects.Text;
  hitArea: Phaser.GameObjects.Zone;
}

interface PanelHarness {
  game: Phaser.Game;
  panel: SettingsPanel;
  views: ExtraToggleView[];
}

async function startPanel(
  key: string,
  extraToggles: readonly ExtraToggleConfig[] | undefined,
): Promise<PanelHarness> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  class TestScene extends Phaser.Scene {
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
        ...(extraToggles ? { extraToggles } : {}),
      } as any);
      this.settingsPanel.open();
    }
  }

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'game-container',
    width: 800,
    height: 600,
    scene: [TestScene],
  });
  await waitForScene(game, key);

  const scene = game.scene.getScene(key) as any;
  const panel = scene.settingsPanel as SettingsPanel;
  return {
    game,
    panel,
    views: ((panel as any)._extraToggleViews ?? []) as ExtraToggleView[],
  };
}

function stopPanel(game: Phaser.Game): void {
  game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/** Find every Text object whose content matches, recursing into containers. */
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

/** Build a toggle backed by a mutable record, recording every `set()` call. */
function makeToggle(
  label: string,
  state: Record<string, boolean>,
  setLog: Array<{ label: string; value: boolean }>,
  apply: (value: boolean) => void = (value) => {
    state[label] = value;
  },
): ExtraToggleConfig {
  return {
    label,
    get: () => state[label] === true,
    set: (value: boolean) => {
      setLog.push({ label, value });
      apply(value);
    },
  };
}

// ── Tests ──────────────────────────────────────────────────

describe('SettingsPanel extraToggles hook', () => {
  it('renders no game-supplied controls when the hook is omitted', async () => {
    const { game, panel, views } = await startPanel('ExtraTogglesOmitted', undefined);
    try {
      const container = (panel as any).container as Phaser.GameObjects.Container;
      expect(views).toHaveLength(0);
      expect(findTextObjects(container, 'Auto advance turn')).toHaveLength(0);
      // The engine's own toggles are unaffected.
      expect(findTextObjects(container, 'Reduced Motion')).toHaveLength(1);
      expect(findTextObjects(container, 'Tooltips')).toHaveLength(1);
    } finally {
      stopPanel(game);
    }
  });

  it('renders one labelled control per entry, styled like the built-in toggles', async () => {
    const state: Record<string, boolean> = { 'Auto advance turn': false, 'Show hints': true };
    const setLog: Array<{ label: string; value: boolean }> = [];
    const { game, panel, views } = await startPanel('ExtraTogglesRender', [
      makeToggle('Auto advance turn', state, setLog),
      makeToggle('Show hints', state, setLog),
    ]);
    try {
      const container = (panel as any).container as Phaser.GameObjects.Container;
      const reducedMotionLabel = (panel as any).reducedMotionLabel as Phaser.GameObjects.Text;
      // Built-in references: Reduced Motion defaults to off, Tooltips to on.
      const offBg = (panel as any).reducedMotionToggleBg as Phaser.GameObjects.Rectangle;
      const onBg = (panel as any).tooltipToggleBg as Phaser.GameObjects.Rectangle;

      expect(views.map((v) => v.config.label)).toEqual(['Auto advance turn', 'Show hints']);
      expect(findTextObjects(container, 'Auto advance turn')).toHaveLength(1);
      expect(findTextObjects(container, 'Show hints')).toHaveLength(1);

      // Off and on states mirror the built-in toggles' styling.
      expect(views[0].statusText.text).toBe('OFF');
      expect(views[0].toggleBg.fillColor).toBe(offBg.fillColor);
      expect(views[1].statusText.text).toBe('ON');
      expect(views[1].toggleBg.fillColor).toBe(onBg.fillColor);

      // Rows stack below the built-in toggles, in config order.
      expect(views[0].label.y).toBeGreaterThan(reducedMotionLabel.y);
      expect(views[1].label.y).toBeGreaterThan(views[0].label.y);
    } finally {
      stopPanel(game);
    }
  });

  it('flips the value through set() and re-reads get() when activated', async () => {
    const state: Record<string, boolean> = { 'Auto advance turn': false };
    const setLog: Array<{ label: string; value: boolean }> = [];
    const { game, views } = await startPanel('ExtraTogglesActivate', [
      makeToggle('Auto advance turn', state, setLog),
    ]);
    try {
      const view = views[0];

      view.hitArea.emit('pointerdown');
      expect(setLog).toEqual([{ label: 'Auto advance turn', value: true }]);
      expect(state['Auto advance turn']).toBe(true);
      expect(view.statusText.text).toBe('ON');

      view.hitArea.emit('pointerdown');
      expect(setLog).toEqual([
        { label: 'Auto advance turn', value: true },
        { label: 'Auto advance turn', value: false },
      ]);
      expect(view.statusText.text).toBe('OFF');
    } finally {
      stopPanel(game);
    }
  });

  it('shows the stored value when set() vetoes the change', async () => {
    const state: Record<string, boolean> = { 'Auto advance turn': false };
    const setLog: Array<{ label: string; value: boolean }> = [];
    const { game, views } = await startPanel('ExtraTogglesVetoed', [
      // A game that refuses to enable the setting keeps it off.
      makeToggle('Auto advance turn', state, setLog, () => {}),
    ]);
    try {
      views[0].hitArea.emit('pointerdown');
      expect(setLog).toEqual([{ label: 'Auto advance turn', value: true }]);
      expect(views[0].statusText.text).toBe('OFF');
    } finally {
      stopPanel(game);
    }
  });

  it('refreshExtraToggles() reflects a change made outside the panel', async () => {
    const state: Record<string, boolean> = { 'Auto advance turn': false };
    const setLog: Array<{ label: string; value: boolean }> = [];
    const { game, panel, views } = await startPanel('ExtraTogglesRefresh', [
      makeToggle('Auto advance turn', state, setLog),
    ]);
    try {
      expect(views[0].statusText.text).toBe('OFF');

      // Another surface (e.g. a game dialog) updates the same preference.
      state['Auto advance turn'] = true;
      expect(views[0].statusText.text).toBe('OFF');

      panel.refreshExtraToggles();
      expect(views[0].statusText.text).toBe('ON');

      state['Auto advance turn'] = false;
      panel.refreshExtraToggles();
      expect(views[0].statusText.text).toBe('OFF');
    } finally {
      stopPanel(game);
    }
  });

  it('keeps several game-supplied toggles independent', async () => {
    const state: Record<string, boolean> = { 'Auto advance turn': false, 'Show hints': false };
    const setLog: Array<{ label: string; value: boolean }> = [];
    const { game, views } = await startPanel('ExtraTogglesIndependent', [
      makeToggle('Auto advance turn', state, setLog),
      makeToggle('Show hints', state, setLog),
    ]);
    try {
      views[1].hitArea.emit('pointerdown');

      expect(state).toEqual({ 'Auto advance turn': false, 'Show hints': true });
      expect(views[0].statusText.text).toBe('OFF');
      expect(views[1].statusText.text).toBe('ON');
    } finally {
      stopPanel(game);
    }
  });
});
