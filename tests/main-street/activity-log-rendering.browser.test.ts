/**
 * Main Street: Activity Log Scroll Bounds Tests
 *
 * Verifies that the Activity Log scrollable content area computes
 * correct scroll bounds using actual rendered content heights,
 * accounting for word-wrapped entries.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container' });
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number, fallbackMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let left = n;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const fallback = setTimeout(finish, fallbackMs);

    const tick = () => {
      if (settled) return;
      left -= 1;
      if (left <= 0) {
        clearTimeout(fallback);
        finish();
      } else {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  });
}

describe('MainStreet Activity Log scroll bounds', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('content container is positioned below the title bar', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(10);

    const { LOG_TITLE_H } = await import(
      '../../example-games/main-street/scenes/MainStreetConstants'
    );

    // Content container should be positioned at LOG_TITLE_H + 2 (2px gap below title)
    expect(scene.logContentContainer.y).toBe(LOG_TITLE_H + 2);
  });

  it('scroll bounds use actual content height (logTotalContentH - visibleH) for entries with word-wrap', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(10);

    const { LOG_TITLE_H } = await import(
      '../../example-games/main-street/scenes/MainStreetConstants'
    );

    const longText = 'This is a very long activity log entry that should word-wrap across multiple lines due to its length exceeding the content width';

    // Add 50 entries with long text to trigger word-wrap
    for (let i = 0; i < 50; i++) {
      scene.state.activityLog.push({
        text: `${longText} #${i}`,
        type: 'neutral',
        turn: 1,
      });
    }

    // Force a re-render — this recomputes logTotalContentH and logMaxScroll
    scene.msRenderer.refreshLog();
    await waitFrames(3);

    // logTotalContentH should reflect actual rendered heights, not fixed line height
    expect(scene.logTotalContentH).toBeDefined();
    expect(typeof scene.logTotalContentH).toBe('number');
    expect(scene.logTotalContentH).toBeGreaterThan(0);

    const visibleH = Math.max(1, scene.layout.logH - LOG_TITLE_H - 4);

    // The scroll max should be computed from actual total content height
    // This is the KEY fix: logMaxScroll = logTotalContentH - visibleH
    // instead of the old formula: hiddenCount * LOG_LINE_H (18px)
    const expectedScrollMax = Math.max(0, scene.logTotalContentH - visibleH);
    expect(scene.logMaxScroll).toBeCloseTo(expectedScrollMax, 0);
  });

  it('scroll bounds are larger with word-wrapped entries compared to fixed line height estimate', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(10);

    const { LOG_TITLE_H, LOG_LINE_H } = await import(
      '../../example-games/main-street/scenes/MainStreetConstants'
    );

    const longText = 'This is a very long activity log entry that should word-wrap across multiple lines due to its length exceeding the content width';

    // Add entries with long text (word-wrap = tall entries)
    for (let i = 0; i < 50; i++) {
      scene.state.activityLog.push({
        text: `${longText} #${i}`,
        type: 'neutral',
        turn: 1,
      });
    }

    scene.msRenderer.refreshLog();
    await waitFrames(3);

    const visibleH = Math.max(1, scene.layout.logH - LOG_TITLE_H - 4);
    const maxDisplayEntries = Math.max(1, Math.ceil(visibleH / LOG_LINE_H));
    const hiddenCount = Math.max(0, scene.state.activityLog.length - maxDisplayEntries);

    // Old scroll max estimate (using fixed line height)
    const oldScrollMax = hiddenCount * LOG_LINE_H;
    // New scroll max (using actual content height)
    const newScrollMax = scene.logMaxScroll;

    // With word-wrapped entries, new scroll max should be >= old scroll max
    // (since entries are taller than LOG_LINE_H)
    expect(newScrollMax).toBeGreaterThanOrEqual(oldScrollMax);
  });

  it('scroll offset is clamped to valid range when content height decreases', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(10);

    // Add many entries, then refresh, then add fewer entries
    for (let i = 0; i < 50; i++) {
      scene.state.activityLog.push({
        text: `Entry ${i}`,
        type: 'neutral',
        turn: 1,
      });
    }

    scene.msRenderer.refreshLog();
    await waitFrames(3);

    // Simulate scroll offset near bottom
    scene.logScrollOffset = scene.logMaxScroll;

    // Now truncate the log (simulates game restart)
    scene.state.activityLog = scene.state.activityLog.slice(0, 3);
    scene.msRenderer.refreshLog();
    await waitFrames(3);

    // With only 3 entries, all should fit — scroll max should be 0
    expect(scene.logMaxScroll).toBe(0);
    expect(scene.logScrollOffset).toBe(0);
  });

  it('auto-scroll snaps to bottom when new entries are added at the bottom', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(10);

    const { LOG_TITLE_H } = await import(
      '../../example-games/main-street/scenes/MainStreetConstants'
    );

    // Simulate being at the bottom
    scene.logAutoScroll = true;

    // Add new entries
    for (let i = 0; i < 5; i++) {
      scene.state.activityLog.push({
        text: `New entry ${i}`,
        type: 'neutral',
        turn: 1,
      });
    }

    scene.msRenderer.refreshLog();
    await waitFrames(3);

    const visibleH = Math.max(1, scene.layout.logH - LOG_TITLE_H - 4);

    // When auto-scroll is active, logScrollOffset should be at or near the bottom
    if (scene.logTotalContentH > visibleH) {
      expect(scene.logScrollOffset).toBeCloseTo(scene.logMaxScroll, 0);
    } else {
      // If all entries fit, scroll should be at 0
      expect(scene.logScrollOffset).toBe(0);
    }
  });

  it('text objects are correctly parented to logContentContainer', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(10);

    // Add a few entries
    for (let i = 0; i < 5; i++) {
      scene.state.activityLog.push({
        text: `Entry ${i}`,
        type: 'neutral',
        turn: 1,
      });
    }
    scene.msRenderer.refreshLog();
    await waitFrames(3);

    const textEntries = scene.logContentContainer.list.filter(
      (obj: any) => obj instanceof Phaser.GameObjects.Text,
    );
    expect(textEntries.length).toBeGreaterThan(0);

    // Every text object must have logContentContainer as its parent
    for (const txt of textEntries) {
      expect(txt.parentContainer).toBe(scene.logContentContainer);
    }
  });

  it('mask is applied to the content container', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(10);

    // The content container should have a mask that clips scrollable content
    expect(scene.logContentContainer.mask).toBeDefined();
    expect(scene.logContentContainer.mask).toBeTruthy();

    // Verify the mask graphics exists
    expect(scene.logMaskGraphics).toBeDefined();

    // Verify the contentMask was created
    expect(scene.logContentMask).toBeDefined();
  });

  it('mask clips content when scrolled to bottom (coordinate verification)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(15);

    // Add enough entries to overflow the log
    for (let i = 0; i < 100; i++) {
      scene.state.activityLog.push({
        text: `Entry ${i} - with some wrapping text to ensure overflow`,
        type: 'neutral',
        turn: 1,
      });
    }
    scene.msRenderer.refreshLog();
    await waitFrames(5);

    const { LOG_TITLE_H } = await import(
      '../../example-games/main-street/scenes/MainStreetConstants'
    );

    // Simulate being at the bottom of the log
    scene.logScrollOffset = scene.logMaxScroll;
    scene.msRenderer.refreshLog();
    await waitFrames(5);

    // Container should have shifted up by logMaxScroll
    expect(scene.logContentContainer.y).toBeLessThan(LOG_TITLE_H + 2);

    // The container should be at LOG_TITLE_H + 2 - logMaxScroll
    const expectedY = LOG_TITLE_H + 2 - scene.logMaxScroll;
    expect(scene.logContentContainer.y).toBeCloseTo(expectedY, 0);

    // The MASK geometry should cover from logY + LOG_TITLE_H downward.
    // At scroll=bottom, the container has shifted up, so most entries
    // are now ABOVE the mask top. The mask should clip them.
    const maskTopY = scene.layout.logY + LOG_TITLE_H;
    const containerWorldY = scene.layout.logY + scene.logContentContainer.y;

    // When scrolled to bottom, the ENTIRE container top should be
    // above the mask top (since we shifted up by logMaxScroll which
    // is totalContentH - visibleH, so only the last visibleH pixels
    // of content are within the mask)
    expect(containerWorldY).toBeLessThan(maskTopY);
  });

  it('does not position content above the log display area when entries first overflow', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(10);

    const { LOG_TITLE_H } = await import(
      '../../example-games/main-street/scenes/MainStreetConstants'
    );

    // ── Phase 1: Few entries that fit ──
    // This simulates the initial game setup where a handful of entries exist.
    for (let i = 0; i < 5; i++) {
      scene.state.activityLog.push({
        text: `Entry ${i}`,
        type: 'neutral',
        turn: 1,
      });
    }
    scene.msRenderer.refreshLog();
    await waitFrames(3);

    // All entries fit — container at default position, no scroll
    expect(scene.logScrollOffset).toBe(0);
    expect(scene.logContentContainer.y).toBe(LOG_TITLE_H + 2);

    // ── Phase 2: Add enough entries to overflow ──
    // This simulates gameplay adding enough entries that they exceed visibleH.
    // After the fix, logAutoScroll should STILL be false (it was never
    // re-enabled in the "all fit" branch), so scrollOffset stays at 0.
    for (let i = 0; i < 50; i++) {
      scene.state.activityLog.push({
        text: `Overflow entry ${i}`,
        type: 'neutral',
        turn: 1,
      });
    }
    scene.msRenderer.refreshLog();
    await waitFrames(3);

    // Scroll offset should remain 0 — no auto-scroll on initial overflow
    expect(scene.logScrollOffset).toBe(0);
    expect(scene.logAutoScroll).toBe(false);

    // The container should NOT be shifted up — content should start
    // right below the title bar.
    expect(scene.logContentContainer.y).toBe(LOG_TITLE_H + 2);

    // Verify all text objects have non-negative Y within the container
    const textEntries = scene.logContentContainer.list.filter(
      (obj: any) => obj instanceof Phaser.GameObjects.Text,
    );
    expect(textEntries.length).toBeGreaterThan(0);

    for (const txt of textEntries) {
      // Every text's local Y should be >= 0 (no entry positioned above
      // the container origin). Combined with the container being at
      // LOG_TITLE_H + 2 (not shifted up), this means no content renders
      // above the title bar.
      expect(txt.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('renders all log entries and uses mask clipping for off-screen entries', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    await waitFrames(10);

    const longText = 'Long text that wraps ' + 'wrap '.repeat(8);
    const entryCount = 100;

    // Add entries with word-wrap
    for (let i = 0; i < entryCount; i++) {
      scene.state.activityLog.push({
        text: `${longText} #${i}`,
        type: 'neutral',
        turn: 1,
      });
    }

    scene.msRenderer.refreshLog();
    await waitFrames(3);

    const textEntries = scene.logContentContainer.list.filter(
      (obj: any) => obj instanceof Phaser.GameObjects.Text,
    );

    // All entries should be rendered in the container (no windowing).
    // The mask clips off-screen entries; scrolling shifts the container.
    // logTotalContentH should reflect the true total height.
    expect(textEntries.length).toBeGreaterThanOrEqual(entryCount);
    expect(scene.logTotalContentH).toBeGreaterThan(scene.layout.logH);
  });
});
