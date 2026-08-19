/**
 * Main Street: Undo/Redo Feedback Notification Tests
 *
 * Unit tests for `MainStreetAnimator.animateUndoRedo` — the brief
 * "Undid: <action>" / "Redid: <action>" pop above the hint bar plus the UI
 * click SFX that play when `MainStreetTurnController.performUndo` /
 * `performRedo` reverse/reapply a command.
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The tests assert observable behaviour via
 * the public animator API: the `CLICK` SFX key, the `popTextOrIcon` call
 * (label, position near the hint bar, duration/rise/scale), and the
 * reduced-motion / replay-mode degradation (spec AC3).
 *
 * @module tests/main-street/undo-redo-animator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phaser is browser-only; the animator only uses it for type annotations.
vi.mock('phaser', () => ({ default: {} }));

// Mock src/ui so importing the animator does not load Phaser-dependent UI code.
const { popTextOrIcon, moveGameObject } = vi.hoisted(() => ({
  popTextOrIcon: vi.fn((_opts?: unknown) => Promise.resolve()),
  moveGameObject: vi.fn((_opts?: unknown) => ({})),
}));

vi.mock('../../src/ui', () => ({
  FONT_FAMILY: 'sans-serif',
  popTextOrIcon,
  moveGameObject,
}));

import { MainStreetAnimator } from '../../example-games/main-street/scenes/MainStreetAnimator';
import { SFX_KEYS } from '../../example-games/main-street/scenes/MainStreetConstants';

// ── Mock scene helpers ──────────────────────────────────────

function createMockScene(overrides: Record<string, unknown> = {}) {
  const scene = {
    layout: { gameW: 960, gameH: 720 },
    settingsPanel: null,
    replayMode: false,
    soundManager: { play: vi.fn() },
    ...overrides,
  };
  return { scene };
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateUndoRedo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('undo: pops "Undid: <description>" above the hint bar and plays the click SFX', () => {
    const { scene } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateUndoRedo({ action: 'undo', description: 'Buy Bakery for 12 coins' });

    // UI click SFX (reuse-first — CLICK is already loaded).
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.CLICK);

    // Notification pop near the hint bar (bottom-centre), rising upward.
    expect(popTextOrIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Undid: Buy Bakery for 12 coins',
        x: 480,          // gameW / 2
        y: 660,          // gameH - 60 (just above the hint bar)
        duration: 1200,
        riseY: -16,
        scale: 1.1,
        reducedMotion: false,
      }),
    );
  });

  it('redo: pops "Redid: <description>" and plays the click SFX', () => {
    const { scene } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateUndoRedo({ action: 'redo', description: 'Place Bakery at slot 3' });

    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.CLICK);
    expect(popTextOrIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Redid: Place Bakery at slot 3',
        reducedMotion: false,
      }),
    );
  });

  it('degrades under reduced motion: notification via the pop fallback, click SFX retained', () => {
    const { scene } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateUndoRedo({ action: 'undo', description: 'Sell Diner' });

    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.CLICK);
    expect(popTextOrIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Undid: Sell Diner',
        reducedMotion: true,
      }),
    );
  });

  it('is a no-op in replay/headless mode (documented exemption)', () => {
    const { scene } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);

    animator.animateUndoRedo({ action: 'undo', description: 'Buy Grocery' });
    animator.animateUndoRedo({ action: 'redo', description: 'Buy Grocery' });

    expect(scene.soundManager.play).not.toHaveBeenCalled();
    expect(popTextOrIcon).not.toHaveBeenCalled();
  });
});
