/**
 * GymDeckRngScene browser integration tests.
 *
 * Validates that:
 *  - The full 52-card deck is displayed face-up in a compact grid on load
 *  - Shuffle produces a different visual card arrangement
 *  - Seed adjustment controls work correctly
 *  - Draw/Flip Last/Deal/Reset controls are removed
 *  - Event log is removed
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymDeckRngScene } from '../../example-games/gym/scenes/GymDeckRngScene';
import { GYM_DECK_RNG_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

describe('GymDeckRngScene browser integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  /**
   * Bootstrap the scene for each test.
   */
  async function bootScene(): Promise<Phaser.Scene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({ type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymDeckRngScene],
    });

    await waitForScene(game, GYM_DECK_RNG_KEY);
    const scene = game.scene.getScene(GYM_DECK_RNG_KEY);
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
    return scene;
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
   * Get the (x, y, textureKey) tuples for all Image objects in the scene,
   * sorted by grid position (row-major: left-to-right, top-to-bottom).
   */
  function getCardSnapshot(scene: Phaser.Scene): { x: number; y: number; textureKey: string }[] {
    return scene.children.list
      .filter((child): child is Phaser.GameObjects.Image => child instanceof Phaser.GameObjects.Image)
      .sort((a, b) => {
        // Sort by row (y) first, then column (x) — grid positions
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > 5) return yDiff; // different rows
        return a.x - b.x; // same row, sort by column
      })
      .map((img) => ({
        x: Math.round(img.x),
        y: Math.round(img.y),
        textureKey: img.texture.key,
      }));
  }

  // ── AC 1 & 6: Full 52-card deck displayed face-up ─────────

  it('renders exactly 52 card sprites on scene load (AC 1, 6)', async () => {
    const scene = await bootScene();

    const sprites = getCardSnapshot(scene);

    // All 52 cards should be visible as Image objects
    expect(sprites.length).toBe(52);

    // Cards should be face-up (using card face textures, not 'back')
    for (const sprite of sprites) {
      expect(sprite.textureKey).not.toBe('back');
    }
  });

  // ── AC 2: Draw / Flip Last / Deal / Reset controls removed ─

  it('does not contain removed controls (AC 2)', async () => {
    const scene = await bootScene();

    // These controls should NOT exist in the scene
    const removedControls = ['[ Draw ]', '[ Flip Last ]', '[ Deal ]', '[ Reset ]'];
    for (const label of removedControls) {
      expect(findText(scene, label)).toBeNull();
    }
  });

  // ── AC 4 & 5: Seed & Shuffle controls present, event log absent ─

  it('retains seed controls and shuffle, removes event log (AC 4, 5)', async () => {
    const scene = await bootScene();

    // Seed controls should exist
    expect(findText(scene, '[ -1 ]')).toBeTruthy();
    expect(findText(scene, '[ +1 ]') || findText(scene, '[+1]')).toBeTruthy();
    expect(findText(scene, '[ Reset Seed ]')).toBeTruthy();
    expect(findText(scene, '[ Shuffle ]')).toBeTruthy();

    // Event log-specific text should NOT exist (log entries format)
    // The old event log used lines like "Drew <card>" or longer text entries
    const eventLogIndicators = scene.children.list.filter(
      (child) =>
        child instanceof Phaser.GameObjects.Text &&
        (child.text.startsWith('Drew ') ||
          child.text.startsWith('Dealt ') ||
          child.text.startsWith('Flipped ') ||
          child.text.startsWith('Shuffled ')),
    );
    expect(eventLogIndicators.length).toBe(0);

    // Status text should show card count, not event log
    const statusText = scene.children.list.find(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text &&
        child.text.includes('cards displayed'),
    );
    expect(statusText).toBeTruthy();
    expect(statusText!.text).toContain('52');
  });

  // ── AC 3 & 9: Shuffle clears and redraws full grid ─────────

  it('shuffle button clears and redraws all 52 cards (AC 3)', async () => {
    const scene = await bootScene();

    // Get initial card sprite count
    const beforeCount = getCardSnapshot(scene).length;
    expect(beforeCount).toBe(52);

    // Get initial texture arrangement
    const texturesBefore = getCardSnapshot(scene).map((s) => s.textureKey);

    // Click Shuffle button
    const shuffleBtn = findText(scene, '[ Shuffle ]');
    expect(shuffleBtn).toBeTruthy();
    shuffleBtn!.emit('pointerdown');

    // Allow a frame for re-render
    await new Promise((r) => requestAnimationFrame(r));

    // Verify 52 sprites still present after shuffle
    const afterSprites = getCardSnapshot(scene);
    expect(afterSprites.length).toBe(52);

    // Verify visual arrangement changed (different textures at grid positions)
    const texturesAfter = afterSprites.map((s) => s.textureKey);
    let sameCount = 0;
    for (let i = 0; i < 52; i++) {
      if (texturesBefore[i] === texturesAfter[i]) sameCount++;
    }
    // Very unlikely same seed produces identical texture layout
    expect(sameCount).toBeLessThan(52);

    // Count unique textures — should still be 52 unique cards
    const uniqueTextures = new Set(texturesAfter);
    expect(uniqueTextures.size).toBe(52);
  });

  // ── AC 4: Seed adjustment works ───────────────────────────

  it('seed adjustment controls modify displayed seed value', async () => {
    const scene = await bootScene();

    // Seed display should start at 42 (DEFAULT_SEED)
    const seedLabel = findText(scene, '42');
    expect(seedLabel).toBeTruthy();

    // Find seed text by checking the "Seed:" label's relative position
    const seedPrefix = findText(scene, 'Seed:');
    expect(seedPrefix).toBeTruthy();

    // Click +1
    const plusBtn = findText(scene, '[ +1 ]');
    expect(plusBtn).toBeTruthy();
    plusBtn!.emit('pointerdown');
    await new Promise((r) => requestAnimationFrame(r));
    expect(findText(scene, '43')).toBeTruthy();

    // Click -1 twice (should go to 41)
    const minusBtn = findText(scene, '[ -1 ]');
    expect(minusBtn).toBeTruthy();
    minusBtn!.emit('pointerdown');
    minusBtn!.emit('pointerdown');
    await new Promise((r) => requestAnimationFrame(r));
    expect(findText(scene, '41')).toBeTruthy();

    // Reset seed
    const resetBtn = findText(scene, '[ Reset Seed ]');
    expect(resetBtn).toBeTruthy();
    resetBtn!.emit('pointerdown');
    await new Promise((r) => requestAnimationFrame(r));
    expect(findText(scene, '42')).toBeTruthy();
  });

  // ── AC 3 & 4: Seed changes auto-shuffle deterministically ──

  it('same seed produces identical arrangement; different seed different (+/- auto-shuffle)', async () => {
    const scene = await bootScene();

    // Scene loads shuffled with seed 42 → capture arrangement
    const arrangements1 = getCardSnapshot(scene).map((s) => s.textureKey);

    // Click +1 → seed 43, auto-shuffles → different arrangement
    const plusBtn = findText(scene, '[ +1 ]');
    expect(plusBtn).toBeTruthy();
    plusBtn!.emit('pointerdown');
    await new Promise((r) => requestAnimationFrame(r));
    const arrangements2 = getCardSnapshot(scene).map((s) => s.textureKey);

    // Seed 43 should produce different arrangement from seed 42
    let sameCount = 0;
    for (let i = 0; i < 52; i++) {
      if (arrangements1[i] === arrangements2[i]) sameCount++;
    }
    expect(sameCount).toBeLessThan(52);

    // Reset Seed → seed 42, auto-shuffles → should reproduce seed 42 arrangement exactly
    const resetBtn = findText(scene, '[ Reset Seed ]');
    expect(resetBtn).toBeTruthy();
    resetBtn!.emit('pointerdown');
    await new Promise((r) => requestAnimationFrame(r));
    const arrangements3 = getCardSnapshot(scene).map((s) => s.textureKey);

    expect(arrangements3).toEqual(arrangements1);
  });
});
