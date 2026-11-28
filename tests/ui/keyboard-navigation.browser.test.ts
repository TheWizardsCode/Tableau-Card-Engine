/**
 * Browser test for the shared keyboard navigation helpers
 * (`src/ui/keyboard-navigation.ts`, CG-0MWR0BKIT0084ZID; GDD G11 / gap B7).
 *
 * The headless suite pins the pure/index contract through injected seams; this
 * file proves the **real** wiring against a live Phaser scene:
 *
 *  1. `attachOverlayFocus` installs its listener on the real
 *     `scene.input.keyboard` (no injected seam), so real `keydown` events move
 *     focus;
 *  2. the focused item's `setFocusVisual(true)` produces a visible change on a
 *     text button that is parented into `hudContainer` (the real focus state,
 *     not just a callback);
 *  3. Tab/Shift+Tab, Enter/Space and Escape drive traversal, activation and
 *     topmost-only closure through the real keyboard plugin;
 *  4. `attachChoiceNavigation` listens on the same real keyboard and selects by
 *     digit, and is inert while the overlay helper is attached;
 *  5. disposal restores the keyboard listener count — no listener is left
 *     behind.
 *
 * @module tests/ui/keyboard-navigation.browser.test.ts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import {
  attachChoiceNavigation,
  attachOverlayFocus,
  createOverlayBackground,
  type OverlayFocusable,
} from '../../src/ui';
import { waitForScene } from '../helpers/waitForScene';

const SCENE_KEY = 'KeyboardNavigationHarness';
const VIEWPORT = { width: 900, height: 600 };
const DEFAULT_COLOUR = '#ffffff';
const FOCUS_COLOUR = '#ffd166';

class KeyboardHarnessScene extends Phaser.Scene {
  hudContainer!: Phaser.GameObjects.Container;
  buttons: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: SCENE_KEY });
  }

  create(): void {
    this.hudContainer = this.add.container(0, 0).setDepth(1000);

    // A real managed overlay: backdrop + box, with the interactive controls
    // parented into the shared HUD container (the project's overlay pattern).
    const overlay = createOverlayBackground(
      this,
      { depth: 199, alpha: 0.6 },
      { width: 480, height: 260, color: 0x000000, alpha: 1, depth: 200 },
    );
    this.hudContainer.add(overlay.objects);

    const labels = ['[ Continue ]', '[ Save ]', '[ Quit ]'];
    this.buttons = labels.map((label, index) => {
      const text = this.add
        .text(VIEWPORT.width / 2, 250 + index * 50, label, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: DEFAULT_COLOUR,
        })
        .setOrigin(0.5)
        .setDepth(201);
      this.hudContainer.add(text);
      return text;
    });
  }
}

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    parent: container,
    scene: [KeyboardHarnessScene],
    audio: { noAudio: true },
  });
  await waitForScene(game, SCENE_KEY);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function getScene(game: Phaser.Game): KeyboardHarnessScene {
  const scene = game.scene.getScene(SCENE_KEY) as KeyboardHarnessScene;
  expect(scene).toBeDefined();
  return scene;
}

/** Build a focusable text button whose visible focus state is its colour. */
function createFocusable(text: Phaser.GameObjects.Text): OverlayFocusable {
  return {
    onActivate: vi.fn(),
    setFocusVisual: (focused: boolean) => {
      text.setColor(focused ? FOCUS_COLOUR : DEFAULT_COLOUR);
    },
  };
}

/** Fire a key through the real Phaser keyboard plugin. */
function pressKey(scene: Phaser.Scene, key: string, shiftKey = false): void {
  const keyboard = scene.input.keyboard;
  expect(keyboard).toBeTruthy();
  keyboard!.emit(
    'keydown',
    new KeyboardEvent('keydown', { key, shiftKey }),
  );
}

describe('keyboard navigation browser wiring', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('traverses, activates and escapes through the real scene.input.keyboard, rendering focus', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const keyboard = scene.input.keyboard!;

    const [first, second, third] = scene.buttons;
    const focusables = scene.buttons.map(createFocusable);
    const onFocusChange = vi.fn();
    const onEscape = vi.fn();

    const baseline = keyboard.listenerCount('keydown');

    const dispose = attachOverlayFocus(scene, focusables, {
      onEscape,
      onFocusChange,
    });

    // Real listener installed on the real keyboard plugin.
    expect(keyboard.listenerCount('keydown')).toBe(baseline + 1);

    // A managed overlay is open and the first item is visibly focused.
    expect(first.style.color).toBe(FOCUS_COLOUR);
    expect(first.parentContainer).toBe(scene.hudContainer);
    expect(onFocusChange).toHaveBeenLastCalledWith(0);

    pressKey(scene, 'Tab');
    expect(second.style.color).toBe(FOCUS_COLOUR);
    expect(first.style.color).toBe(DEFAULT_COLOUR);
    expect(onFocusChange).toHaveBeenLastCalledWith(1);

    pressKey(scene, 'Tab');
    expect(third.style.color).toBe(FOCUS_COLOUR);
    expect(second.style.color).toBe(DEFAULT_COLOUR);
    expect(onFocusChange).toHaveBeenLastCalledWith(2);

    // Shift+Tab walks backwards.
    pressKey(scene, 'Tab', true);
    expect(second.style.color).toBe(FOCUS_COLOUR);
    expect(onFocusChange).toHaveBeenLastCalledWith(1);

    // Enter activates the focused item.
    pressKey(scene, 'Enter');
    expect(focusables[1].onActivate).toHaveBeenCalledTimes(1);
    expect(focusables[0].onActivate).not.toHaveBeenCalled();
    expect(focusables[2].onActivate).not.toHaveBeenCalled();

    // Space activates it too.
    pressKey(scene, ' ');
    expect(focusables[1].onActivate).toHaveBeenCalledTimes(2);

    // Escape closes the topmost managed overlay.
    pressKey(scene, 'Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);

    // Disposal clears the visible focus and removes the listener.
    dispose();
    expect(second.style.color).toBe(DEFAULT_COLOUR);
    expect(keyboard.listenerCount('keydown')).toBe(baseline);
  });

  it('selects choices through the real keyboard and is inert while an overlay is open', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const keyboard = scene.input.keyboard!;
    const onChoose = vi.fn();
    const onHighlight = vi.fn();
    const baseline = keyboard.listenerCount('keydown');

    const overlayDisposer = attachOverlayFocus(
      scene,
      [createFocusable(scene.buttons[0])],
      { onEscape: vi.fn() },
    );

    const choiceDisposer = attachChoiceNavigation(scene, {
      count: 3,
      onChoose,
      onHighlight,
    });

    // While the managed overlay is open, digits do nothing for the choice list.
    pressKey(scene, '2');
    expect(onChoose).not.toHaveBeenCalled();

    overlayDisposer();
    onHighlight.mockClear();

    // With the overlay closed, a digit selects (and chooses) the option.
    pressKey(scene, '2');
    expect(onHighlight).toHaveBeenLastCalledWith(1);
    expect(onChoose).toHaveBeenLastCalledWith(1);

    // Arrow wrap and Enter activation work through the same real keyboard.
    pressKey(scene, 'ArrowUp');
    expect(onHighlight).toHaveBeenLastCalledWith(0);
    pressKey(scene, 'Enter');
    expect(onChoose).toHaveBeenLastCalledWith(0);

    choiceDisposer();
    expect(keyboard.listenerCount('keydown')).toBe(baseline);
  });
});
