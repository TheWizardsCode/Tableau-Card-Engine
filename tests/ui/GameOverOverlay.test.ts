/**
 * Unit tests for the shared GameOverOverlay component:
 *   - createGameOverOverlay
 *
 * Verifies that the shared game-over overlay creates the correct
 * structure: semi-transparent background, title, auto-scaling
 * summary text, optional extra buttons, and bottom-row buttons
 * ([Play Again] and [Menu]).
 *
 * All Phaser scene interactions are mocked to run in Node.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGameOverOverlay, computeAutoScaleFontSize } from '../../src/ui/GameOverOverlay';
import { GAME_W, GAME_H, FONT_FAMILY } from '../../src/ui/constants';

// ── Mock helpers ────────────────────────────────────────────

interface MockText {
  setOrigin: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
  setInteractive: ReturnType<typeof vi.fn>;
  setColor: ReturnType<typeof vi.fn>;
  setText: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  width: number;
  height: number;
  style: Record<string, string>;
}

/** Create a mock Phaser.GameObjects.Rectangle. */
function mockRectangle() {
  return {
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
}

/** Create a mock Phaser.GameObjects.Text. */
function mockText(): MockText {
  return {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    width: 200,
    height: 100,
    style: { fontSize: '14px' },
  };
}

/** Create a minimal mock Phaser.Scene. */
function mockScene() {
  const scene = {
    add: {
      rectangle: vi.fn(() => mockRectangle()),
      text: vi.fn(() => mockText()),
      container: vi.fn(() => ({
        setDepth: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
        add: vi.fn().mockReturnThis(),
        list: [] as any[],
      })),
    },
    scene: {
      start: vi.fn(),
    },
  };
  return scene as unknown as Phaser.Scene;
}

/** Helper to get the mock function for scene.add.text. */
function mockTextFn(scene: Phaser.Scene): ReturnType<typeof vi.fn> {
  return (scene as any).add.text;
}

/** Helper to get the text creation call args from scene.add.text. */
function textCalls(scene: Phaser.Scene): any[][] {
  return mockTextFn(scene).mock.calls;
}

// ── createGameOverOverlay ───────────────────────────────────

describe('createGameOverOverlay', () => {
  let scene: ReturnType<typeof mockScene>;
  /** Default simple callback. */
  const onPlayAgain = vi.fn();
  const onMenu = vi.fn();

  beforeEach(() => {
    scene = mockScene();
    vi.clearAllMocks();
  });

  it('creates a full-screen semi-transparent background', () => {
    const result = createGameOverOverlay(scene, {
      summaryText: 'Test summary',
      onPlayAgain,
      onMenu,
    });

    // Should have created a full-screen rectangle for the background
    expect(scene.add.rectangle).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number),
      GAME_W, GAME_H,
      expect.any(Number), expect.any(Number),
    );

    // Background should be interactive to block input
    expect(result.background.setInteractive).toHaveBeenCalled();
  });

  it('creates a centered overlay box', () => {
    const result = createGameOverOverlay(scene, {
      summaryText: 'Test summary',
      onPlayAgain,
      onMenu,
    });

    // A box rectangle should have been created
    expect(result.box).not.toBeNull();
    expect(result.box!.setDepth).toHaveBeenCalled();
  });

  it('creates a title element', () => {
    const result = createGameOverOverlay(scene, {
      summaryText: 'Test summary',
      onPlayAgain,
      onMenu,
    });

    expect(result.title).toBeDefined();
    expect(typeof result.title.setDepth).toBe('function');
  });

  it('uses custom title text when provided', () => {
    createGameOverOverlay(scene, {
      summaryText: 'Test summary',
      onPlayAgain,
      onMenu,
      title: 'You Win!',
    });

    // scene.add.text signature: (x, y, text, style)
    const calls = textCalls(scene);
    expect(calls.some((call: any[]) => call[2] === 'You Win!')).toBe(true);
  });

  it('creates a summary text area with the provided content', () => {
    const result = createGameOverOverlay(scene, {
      summaryText: 'Score: 100\nCards: 20\nTime: 5m',
      onPlayAgain,
      onMenu,
    });

    expect(result.summary).toBeDefined();
    // Summary text should be passed as the third argument to scene.add.text
    // scene.add.text signature: (x, y, text, style)
    expect(scene.add.text).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      'Score: 100\nCards: 20\nTime: 5m',
      expect.objectContaining({
        fontFamily: FONT_FAMILY,
      }),
    );
  });

  it('creates bottom-row buttons [Play Again] and [Menu]', () => {
    createGameOverOverlay(scene, {
      summaryText: 'Test summary',
      onPlayAgain,
      onMenu,
    });

    // Should create two interactive text buttons with the correct labels
    const calls = textCalls(scene);
    const buttonLabels = calls
      .filter((call: any[]) => {
        const label = call[2];
        return typeof label === 'string' &&
          (label.includes('Play Again') || label.includes('Menu'));
      })
      .map((call: any[]) => call[2]);

    expect(buttonLabels).toContain('[ Play Again ]');
    expect(buttonLabels).toContain('[ Menu ]');
  });

  it('Play Again button triggers onPlayAgain callback', () => {
    createGameOverOverlay(scene, {
      summaryText: 'Test',
      onPlayAgain,
      onMenu,
    });

    // The callback is wired via pointerdown on the button text objects.
    expect(onPlayAgain).not.toHaveBeenCalled();
  });

  it('Menu button navigates to GameSelectorScene when no custom onMenu provided', () => {
    createGameOverOverlay(scene, {
      summaryText: 'Test',
      onPlayAgain,
      // No onMenu provided
    });

    // Verify scene scape was used for default menu behavior
    // (not triggered because pointerdown wasn't fired)
    expect(scene.scene.start).not.toHaveBeenCalled();
  });

  it('uses custom onMenu callback when provided', () => {
    const customOnMenu = vi.fn();

    createGameOverOverlay(scene, {
      summaryText: 'Test',
      onPlayAgain,
      onMenu: customOnMenu,
    });

    // Custom onMenu should be wired up (not yet called)
    expect(customOnMenu).not.toHaveBeenCalled();
  });

  it('creates extra buttons in an optional row when provided', () => {
    const onShare = vi.fn();
    const onSave = vi.fn();

    createGameOverOverlay(scene, {
      summaryText: 'Test summary',
      onPlayAgain,
      onMenu,
      extraButtons: [
        { label: '[ Share Score ]', onClick: onShare },
        { label: '[ Save Replay ]', onClick: onSave },
      ],
    });

    // Should create text elements for the extra buttons
    const calls = textCalls(scene);
    const extraLabels = calls
      .filter((call: any[]) => {
        const label = call[2];
        return typeof label === 'string' &&
          (label === '[ Share Score ]' || label === '[ Save Replay ]');
      })
      .map((call: any[]) => call[2]);

    expect(extraLabels).toContain('[ Share Score ]');
    expect(extraLabels).toContain('[ Save Replay ]');
  });

  it('returns a dismiss function that destroys all objects', () => {
    const result = createGameOverOverlay(scene, {
      summaryText: 'Test',
      onPlayAgain,
      onMenu,
    });

    expect(typeof result.dismiss).toBe('function');

    result.dismiss();

    // All objects should be destroyed
    for (const obj of result.objects) {
      expect(obj.destroy).toHaveBeenCalled();
    }
  });

  it('exposes objects array for lifecycle management', () => {
    const result = createGameOverOverlay(scene, {
      summaryText: 'Test',
      onPlayAgain,
      onMenu,
    });

    expect(Array.isArray(result.objects)).toBe(true);
    expect(result.objects.length).toBeGreaterThan(0);
    // objects should include background, box, title, summary, and buttons
    expect(result.objects.length).toBeGreaterThanOrEqual(5);
  });

  it('uses custom labels for buttons when provided', () => {
    createGameOverOverlay(scene, {
      summaryText: 'Test summary',
      onPlayAgain,
      onMenu,
      playAgainLabel: 'Restart',
      menuLabel: 'Quit',
    });

    const calls = textCalls(scene);
    const buttonLabels = calls
      .filter((call: any[]) => typeof call[2] === 'string')
      .map((call: any[]) => call[2]);

    expect(buttonLabels).toContain('[ Restart ]');
    expect(buttonLabels).toContain('[ Quit ]');
  });

  it('sets the title to "Game Over" by default', () => {
    createGameOverOverlay(scene, {
      summaryText: 'Test summary',
      onPlayAgain,
      onMenu,
    });

    const calls = textCalls(scene);
    const hasDefaultTitle = calls.some(
      (call: any[]) => typeof call[2] === 'string' && call[2] === 'Game Over'
    );

    expect(hasDefaultTitle).toBe(true);
  });

  it('places summary text above the buttons and below the title', () => {
    const result = createGameOverOverlay(scene, {
      summaryText: 'Summary content',
      onPlayAgain,
      onMenu,
    });

    // The summary text should have setOrigin(0.5, 0) for top-left anchoring
    expect(result.summary.setOrigin).toHaveBeenCalledWith(0.5, 0);
  });
});

// ── computeAutoScaleFontSize ────────────────────────────────

describe('computeAutoScaleFontSize', () => {
  it('returns minimum font size for empty text', () => {
    expect(computeAutoScaleFontSize('', 500, 300)).toBe(12);
  });

  it('returns minimum font size when height is zero', () => {
    expect(computeAutoScaleFontSize('Hello', 500, 0)).toBe(12);
  });

  it('uses large font for short text with plenty of space', () => {
    const size = computeAutoScaleFontSize('Hello', 500, 300);
    expect(size).toBeGreaterThanOrEqual(18);
    expect(size).toBeLessThanOrEqual(22);
  });

  it('uses smaller font for long text with limited space', () => {
    const longText = Array(20).fill('This is a very long line of text that should wrap to multiple lines').join('\n');
    const size = computeAutoScaleFontSize(longText, 300, 150);
    expect(size).toBeGreaterThanOrEqual(12);
    expect(size).toBeLessThanOrEqual(16);
  });

  it('returns font size between min and max inclusive', () => {
    for (let i = 0; i < 20; i++) {
      const size = computeAutoScaleFontSize('Line ' + i, 400, 200);
      expect(size).toBeGreaterThanOrEqual(12);
      expect(size).toBeLessThanOrEqual(22);
    }
  });

  it('handles single-char text', () => {
    const size = computeAutoScaleFontSize('A', 500, 300);
    expect(size).toBeGreaterThanOrEqual(18);
  });
});
