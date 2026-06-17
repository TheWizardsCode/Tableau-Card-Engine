/**
 * GymHudComponentsScene browser integration tests.
 *
 * Validates that:
 *  - The scene boots without errors
 *  - Interactive buttons open/close HelpPanel and SettingsPanel
 *  - The HelpButton (?) and SettingsButton (⚙) toggle controls exist
 *  - Multiple open/close cycles work without errors
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymHudComponentsScene } from '../../example-games/gym/scenes/GymHudComponentsScene';
import { GYM_HUD_COMPONENTS_KEY } from '../../example-games/gym/GymRegistry';
import { GAME_W, GAME_H } from '../../src/ui/constants';
import { waitForScene } from '../helpers/waitForScene';

describe('GymHudComponentsScene browser integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) {
      game.destroy(true, false);
    }
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  /**
   * Bootstrap the scene for each test.
   */
  async function bootScene(): Promise<GymHudComponentsScene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({ type: Phaser.CANVAS,
      width: GAME_W,
      height: GAME_H,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymHudComponentsScene],
    });

    await waitForScene(game, GYM_HUD_COMPONENTS_KEY);
    const s = game.scene.getScene(GYM_HUD_COMPONENTS_KEY);
    expect(s).toBeTruthy();
    expect(s!.sys.isActive()).toBe(true);
    return s as GymHudComponentsScene;
  }

  /**
   * Find a text object in the scene by exact text match.
   */
  function findText(scene: Phaser.Scene, text: string): Phaser.GameObjects.Text | null {
    return (
      scene.children.list.find(
        (child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text && child.text === text,
      ) ?? null
    );
  }

  /**
   * Find a text object containing the given substring.
   */
  function findTextContaining(scene: Phaser.Scene, substring: string): Phaser.GameObjects.Text | null {
    return (
      scene.children.list.find(
        (child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text && child.text.includes(substring),
      ) ?? null
    );
  }

  /**
   * Advance rendering by N frames
   */
  async function advanceFrames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  // ── AC 1: Scene boots correctly ──────────────────────────

  it('boots the GymHudComponentsScene without errors', async () => {
    const scene = await bootScene();
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
  });

  // ── AC 2: Control buttons exist ──────────────────────────

  it('renders all interactive control buttons', async () => {
    const scene = await bootScene();

    const openHelpBtn = findText(scene, '[ Open HelpPanel ]');
    expect(openHelpBtn).toBeTruthy();

    const toggleHelpBtn = findText(scene, '[ Toggle HelpPanel ]');
    expect(toggleHelpBtn).toBeTruthy();

    const openSettingsBtn = findText(scene, '[ Open Settings ]');
    expect(openSettingsBtn).toBeTruthy();

    const toggleSettingsBtn = findText(scene, '[ Toggle Settings ]');
    expect(toggleSettingsBtn).toBeTruthy();
  });

  // ── AC 3: HelpPanel opens and closes via buttons ─────────

  it('opens HelpPanel when Open HelpPanel button is clicked', async () => {
    const scene = await bootScene();

    const openBtn = findText(scene, '[ Open HelpPanel ]');
    expect(openBtn).toBeTruthy();
    openBtn!.emit('pointerdown');
    await advanceFrames(10);

    // After opening, the input blocker rectangle at depth 900 should exist
    const blocker = scene.children.list.find(
      (child): child is Phaser.GameObjects.Rectangle =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.depth === 900,
    );
    expect(blocker).toBeTruthy();
    expect(scene.isHelpOpen).toBe(true);
  });

  it('closes HelpPanel when Close HelpPanel button is clicked', async () => {
    const scene = await bootScene();

    // Open first
    const openBtn = findText(scene, '[ Open HelpPanel ]');
    expect(openBtn).toBeTruthy();
    openBtn!.emit('pointerdown');
    await advanceFrames(5);
    expect(scene.isHelpOpen).toBe(true);

    // Now close
    const closeBtn = findText(scene, '[ Close HelpPanel ]');
    expect(closeBtn).toBeTruthy();
    closeBtn!.emit('pointerdown');
    await advanceFrames(10);

    expect(scene.isHelpOpen).toBe(false);

    // Input blocker should be gone
    const blocker = scene.children.list.find(
      (child): child is Phaser.GameObjects.Rectangle =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.depth === 900,
    );
    expect(blocker).toBeFalsy();
  });

  // ── AC 4: SettingsPanel opens and closes via buttons ─────

  it('opens SettingsPanel when Open Settings button is clicked', async () => {
    const scene = await bootScene();

    const openBtn = findText(scene, '[ Open Settings ]');
    expect(openBtn).toBeTruthy();
    openBtn!.emit('pointerdown');
    await advanceFrames(10);

    // After opening, the input blocker rectangle at depth 900 should exist
    const blocker = scene.children.list.find(
      (child): child is Phaser.GameObjects.Rectangle =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.depth === 900,
    );
    expect(blocker).toBeTruthy();
    expect(scene.isSettingsOpen).toBe(true);
  });

  it('closes SettingsPanel when Close Settings button is clicked', async () => {
    const scene = await bootScene();

    // Open first
    const openBtn = findText(scene, '[ Open Settings ]');
    expect(openBtn).toBeTruthy();
    openBtn!.emit('pointerdown');
    await advanceFrames(5);
    expect(scene.isSettingsOpen).toBe(true);

    // Now close
    const closeBtn = findText(scene, '[ Close Settings ]');
    expect(closeBtn).toBeTruthy();
    closeBtn!.emit('pointerdown');
    await advanceFrames(10);

    expect(scene.isSettingsOpen).toBe(false);

    // Input blocker should be gone
    const blocker = scene.children.list.find(
      (child): child is Phaser.GameObjects.Rectangle => child instanceof Phaser.GameObjects.Rectangle && child.depth === 900,
    );
    expect(blocker).toBeFalsy();
  });

  // ── AC 5: Toggle buttons work ────────────────────────────

  it('toggles HelpPanel open and closed', async () => {
    const scene = await bootScene();

    const toggleBtn = findText(scene, '[ Toggle HelpPanel ]');
    expect(toggleBtn).toBeTruthy();

    // Toggle open
    toggleBtn!.emit('pointerdown');
    await advanceFrames(10);
    expect(scene.isHelpOpen).toBe(true);

    // Toggle closed
    toggleBtn!.emit('pointerdown');
    await advanceFrames(10);
    expect(scene.isHelpOpen).toBe(false);
  });

  it('toggles SettingsPanel open and closed', async () => {
    const scene = await bootScene();

    const toggleBtn = findText(scene, '[ Toggle Settings ]');
    expect(toggleBtn).toBeTruthy();

    // Toggle open
    toggleBtn!.emit('pointerdown');
    await advanceFrames(10);
    expect(scene.isSettingsOpen).toBe(true);

    // Toggle closed
    toggleBtn!.emit('pointerdown');
    await advanceFrames(10);
    expect(scene.isSettingsOpen).toBe(false);
  });

  // ── AC 6: Multiple open/close cycles ─────────────────────

  it('supports multiple open/close cycles for both panels without errors', async () => {
    const scene = await bootScene();

    const openHelp = findText(scene, '[ Open HelpPanel ]')!;
    const closeHelp = findText(scene, '[ Close HelpPanel ]')!;
    const openSettings = findText(scene, '[ Open Settings ]')!;
    const closeSettings = findText(scene, '[ Close Settings ]')!;

    for (let cycle = 0; cycle < 3; cycle++) {
      // Open HelpPanel
      openHelp.emit('pointerdown');
      await advanceFrames(5);
      expect(scene.isHelpOpen, `HelpPanel open cycle ${cycle}`).toBe(true);

      // Open SettingsPanel
      openSettings.emit('pointerdown');
      await advanceFrames(5);
      expect(scene.isSettingsOpen, `SettingsPanel open cycle ${cycle}`).toBe(true);

      // Close HelpPanel
      closeHelp.emit('pointerdown');
      await advanceFrames(5);
      expect(scene.isHelpOpen, `HelpPanel close cycle ${cycle}`).toBe(false);

      // Close SettingsPanel
      closeSettings.emit('pointerdown');
      await advanceFrames(10);
      expect(scene.isSettingsOpen, `SettingsPanel close cycle ${cycle}`).toBe(false);
    }
  });

  // ── AC 7: Depth layering info is displayed ───────────────

  it('displays depth layering information text', async () => {
    const scene = await bootScene();

    const depthText = findTextContaining(scene, 'Depth:');
    expect(depthText).toBeTruthy();
    expect(depthText!.text).toContain('blocker=900');
    expect(depthText!.text).toContain('? btn=1101');
    expect(depthText!.text).toContain('⚙ btn=1102');
  });

  // ── AC 8: Event log exists ───────────────────────────────

  it('displays an Event Log section', async () => {
    const scene = await bootScene();

    const eventLogHeader = findTextContaining(scene, 'Event Log');
    expect(eventLogHeader).toBeTruthy();
  });

  // ── AC 9: Both panels can be open simultaneously ─────────

  it('allows HelpPanel and SettingsPanel to be open simultaneously', async () => {
    const scene = await bootScene();

    const openHelp = findText(scene, '[ Open HelpPanel ]')!;
    const openSettings = findText(scene, '[ Open Settings ]')!;

    // Open both panels
    openHelp.emit('pointerdown');
    await advanceFrames(5);
    openSettings.emit('pointerdown');
    await advanceFrames(10);

    expect(scene.isHelpOpen).toBe(true);
    expect(scene.isSettingsOpen).toBe(true);

    // Both input blockers should exist (or at least one shared blocker)
    const blockers = scene.children.list.filter(
      (child): child is Phaser.GameObjects.Rectangle =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.depth === 900,
    );
    expect(blockers.length).toBeGreaterThanOrEqual(1);
  });
});
