/**
 * Action counter placement browser test (CG-0MUFAITX70081W41).
 *
 * The actions-remaining counter renders in the action cluster (right-aligned
 * above the End Turn / Cancel button) and is visible in every action-cluster
 * phase: `market`, `applicant`, `placing-from-hand`, `placing-business`.
 * It is never rendered inside the HUD strip.
 *
 * @module tests/main-street/action-counter.browser
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '@core-tests/helpers/waitForScene';

const TUTORIAL_STATE_KEY = 'tce-main-street-tutorial-state';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame();
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

interface SceneHandle extends Phaser.Scene {
  state: { actionsRemaining: number; bankedActions: number };
  uiPhase: string;
  actionContainer: Phaser.GameObjects.Container;
  hudContainer: Phaser.GameObjects.Container;
  refreshActionButtons: () => void;
  refreshHud: () => void;
}

/** Find the action-counter text object inside a container (or null). */
function findCounterText(container: Phaser.GameObjects.Container): Phaser.GameObjects.Text | null {
  for (const obj of container.list) {
    if (obj instanceof Phaser.GameObjects.Text && /\d+\s+actions?\s+left/i.test(obj.text ?? '')) {
      return obj;
    }
    const inner = obj as Phaser.GameObjects.Container;
    if (inner.type === 'Container' && Array.isArray(inner.list)) {
      const found = findCounterText(inner);
      if (found) return found;
    }
  }
  return null;
}

/** Find the End Turn / Cancel button container (rightmost action button). */
function findRightmostButton(container: Phaser.GameObjects.Container): Phaser.GameObjects.Container | null {
  let best: Phaser.GameObjects.Container | null = null;
  for (const obj of container.list) {
    const c = obj as Phaser.GameObjects.Container;
    if (c.type !== 'Container' || !Array.isArray(c.list)) continue;
    if (!best || c.x > best.x) best = c;
  }
  return best;
}

describe('MainStreet action counter placement', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    try { (window as any).localStorage?.removeItem(TUTORIAL_STATE_KEY); } catch (_) { /* ignore */ }
    destroyGame(game);
    game = null;
  });

  const phases: Array<{ phase: string; label: string }> = [
    { phase: 'market', label: 'market' },
    { phase: 'applicant', label: 'applicant' },
    { phase: 'placing-from-hand', label: 'placing-from-hand' },
    { phase: 'placing-business', label: 'placing-business' },
  ];

  for (const { phase, label } of phases) {
    it(`shows the counter in the action cluster during the ${label} phase`, async () => {
      game = await bootGame();
      const scene = game.scene.getScene('MainStreetScene') as unknown as SceneHandle;
      scene.state.actionsRemaining = 2;
      scene.state.bankedActions = 1;
      scene.uiPhase = phase;
      scene.refreshActionButtons();

      const counter = findCounterText(scene.actionContainer);
      expect(counter, `counter missing in ${label}`).not.toBeNull();
      expect(counter!.text).toContain('left');
      expect(counter!.text).toContain('banked');

      // Right-aligned with the rightmost action button and stacked above it.
      const button = findRightmostButton(scene.actionContainer);
      expect(button).not.toBeNull();
      const bg = button!.list.find(
        (c: any) => c.type === 'Rectangle',
      ) as Phaser.GameObjects.Rectangle | undefined;
      expect(bg).toBeTruthy();
      const buttonRight = button!.x + bg!.width / 2;
      expect(counter!.getRightCenter().x).toBeCloseTo(buttonRight, 0);
      expect(counter!.getBottomCenter().y).toBeLessThanOrEqual(button!.y);

      // Never rendered in the HUD strip.
      expect(findCounterText(scene.hudContainer)).toBeNull();
    }, 30_000);
  }

  it('uses green text with actions remaining and red at zero', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as unknown as SceneHandle;

    scene.state.actionsRemaining = 2;
    scene.state.bankedActions = 0;
    scene.uiPhase = 'market';
    scene.refreshActionButtons();
    const green = findCounterText(scene.actionContainer);
    expect(green).not.toBeNull();
    expect(green!.style.color).toBe('#aaffaa');
    expect(green!.text).toBe('2 actions left');

    scene.state.actionsRemaining = 0;
    scene.refreshActionButtons();
    const red = findCounterText(scene.actionContainer);
    expect(red).not.toBeNull();
    expect(red!.style.color).toBe('#ff6666');
  }, 30_000);

  it('does not leak the counter across refreshes', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as unknown as SceneHandle;
    scene.state.actionsRemaining = 1;
    scene.state.bankedActions = 0;
    scene.uiPhase = 'market';

    scene.refreshActionButtons();
    const countInAction = (): number =>
      scene.actionContainer.list.length;
    const before = countInAction();
    scene.refreshActionButtons();
    expect(countInAction()).toBe(before);

    // refreshHud does not add a counter to the HUD strip.
    scene.refreshHud();
    expect(findCounterText(scene.hudContainer)).toBeNull();
  }, 30_000);
});
