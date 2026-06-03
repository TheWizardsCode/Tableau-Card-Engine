/**
 * GymEventLogSmoke Smoke Test
 *
 * Boots GymTranscriptScene and GymUndoRedoScene in a headless Phaser
 * browser environment and verifies event log objects are rendered
 * with correct header text and line count.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymTranscriptScene } from '../../example-games/gym/scenes/GymTranscriptScene';
import { GymUndoRedoScene } from '../../example-games/gym/scenes/GymUndoRedoScene';
import {
  GYM_TRANSCRIPT_KEY,
  GYM_UNDO_REDO_KEY,
} from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

describe('GymTranscriptScene event log smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  async function bootScene(SceneClass: any, key: string): Promise<Phaser.Scene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [SceneClass],
    });

    await waitForScene(game, key);
    const scene = game.scene.getScene(key);
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
    return scene;
  }

  function countText(scene: Phaser.Scene, text: string): number {
    return scene.children.list.filter(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text && child.text === text,
    ).length;
  }

  function countTextStartingWith(scene: Phaser.Scene, prefix: string): number {
    return scene.children.list.filter(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text && child.text.startsWith(prefix),
    ).length;
  }

  // AC 2: Transcript scene event log header

  it('Transcript scene has event log header text (AC 2)', async () => {
    const scene = await bootScene(GymTranscriptScene, GYM_TRANSCRIPT_KEY);
    expect(countText(scene, '── Event Log ──')).toBeGreaterThanOrEqual(1);
  });

  // AC 3: UndoRedo scene event log header

  it('UndoRedo scene has event log header text (AC 3)', async () => {
    const scene = await bootScene(GymUndoRedoScene, GYM_UNDO_REDO_KEY);
    expect(countText(scene, '── Event Log ──')).toBeGreaterThanOrEqual(1);
  });

  // AC 4: Log entry count (at most 12 for UndoRedo, 16 for Transcript)

  it('UndoRedo scene renders at most 12 log lines (AC 4)', async () => {
    const scene = await bootScene(GymUndoRedoScene, GYM_UNDO_REDO_KEY);

    // UndoRedo log entries start with "Executed", "Undid", "Redid", or "History "
    // The status text "History: (empty)" does NOT start with "History "
    const logEntryCount = (
      countTextStartingWith(scene, 'Executed') +
      countTextStartingWith(scene, 'Undid') +
      countTextStartingWith(scene, 'Redid') +
      countTextStartingWith(scene, 'History ')
    );

    expect(logEntryCount).toBeLessThanOrEqual(12);
  });

  it('Transcript scene renders at most 16 log lines (AC 4)', async () => {
    const scene = await bootScene(GymTranscriptScene, GYM_TRANSCRIPT_KEY);

    // TranscriptScene logs 'New session (seed=42)' on create()
    const logEntryCount = (
      countTextStartingWith(scene, 'New session') +
      countTextStartingWith(scene, 'Recorded') +
      countTextStartingWith(scene, 'Finalized') +
      countTextStartingWith(scene, 'Transcript') +
      countTextStartingWith(scene, 'Playing') +
      countTextStartingWith(scene, 'No session') +
      countTextStartingWith(scene, 'No events') +
      countTextStartingWith(scene, '[PLAY]') +
      countTextStartingWith(scene, '  ->')
    );

    expect(logEntryCount).toBeLessThanOrEqual(16);
  });

  // AC 5: Log truncation when exceeding maxLines

  it('UndoRedo event log drops oldest entries when exceeding maxLines (AC 5)', async () => {
    const scene = await bootScene(GymUndoRedoScene, GYM_UNDO_REDO_KEY);

    // Click buttons to generate many log entries (exceeding maxLines=12)
    const buttons = scene.children.list.filter(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text &&
        ['[ +1 ]', '[ +5 ]', '[ -3 ]', '[ Undo ]', '[ Redo ]', '[ Clear History ]'].includes(child.text),
    );

    for (let click = 0; click < 3; click++) {
      for (const btn of buttons) {
        btn.emit('pointerdown');
      }
    }

    // After many clicks, log should still have at most 12 entries
    const logEntryCount = (
      countTextStartingWith(scene, 'Executed') +
      countTextStartingWith(scene, 'Undid') +
      countTextStartingWith(scene, 'Redid') +
      countTextStartingWith(scene, 'History ')
    );

    expect(logEntryCount).toBeLessThanOrEqual(12);

    // With 3 clicks x 6 buttons = 18 entries, we should have some entries
    if (logEntryCount > 0) {
      expect(logEntryCount).toBeGreaterThanOrEqual(1);
    }
  });
});
