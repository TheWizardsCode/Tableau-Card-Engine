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
