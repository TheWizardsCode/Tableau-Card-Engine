/**
 * Unit tests for createDefaultResumeOverlay (CheckpointResumeOverlay.ts).
 *
 * Exercises:
 * - Background rectangle creation with correct dimensions/color/alpha
 * - Background input blocking (setInteractive)
 * - All overlay objects destroyed on Resume click
 * - All overlay objects destroyed on New Game click
 * - Text and buttons rendered with correct content
 * - Existing text/button behavior preserved
 *
 * Test-first: defines the API contract that this work item
 * (CG-0MQM9Z4MY000NOS1) must implement.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createDefaultResumeOverlay,
  type ResumeOverlayScene,
} from '../../src/core-engine/CheckpointResumeOverlay';

// ── Mock helpers ────────────────────────────────────────────

/** Create a mock rectangle object matching the minimal OverlayRect interface. */
function mockRect() {
  return {
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

/** Create a mock text object matching the OverlayText interface. */
function mockText() {
  const handlers: Record<string, Function> = {};
  return {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
      return { _handlers: handlers };
    }),
    destroy: vi.fn(),
    _handlers: handlers,
  };
}

/** Create a minimal mock scene matching ResumeOverlayScene. */
function mockScene(): ResumeOverlayScene {
  return {
    add: {
      rectangle: vi.fn(() => mockRect() as any),
      text: vi.fn(() => mockText() as any),
    },
  } as unknown as ResumeOverlayScene;
}

/** Capture all text objects created during a call to createDefaultResumeOverlay. */
function getTexts(scene: ResumeOverlayScene): ReturnType<typeof mockText>[] {
  const results = (scene.add.text as any).mock.results;
  return results.map((r: any) => r.value);
}

/** Capture the rectangle object created during a call to createDefaultResumeOverlay. */
function getRect(scene: ResumeOverlayScene): ReturnType<typeof mockRect> {
  const results = (scene.add.rectangle as any).mock.results;
  return results[0].value;
}

// ── Tests ───────────────────────────────────────────────────

describe('createDefaultResumeOverlay', () => {
  // ── Background rectangle ───────────────────────────────

  it('creates a full-screen background rectangle with standard overlay style', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    expect(scene.add.rectangle).toHaveBeenCalledWith(
      // Center of game viewport (1280x720)
      640, 360,
      // Full-screen dimensions
      1280, 720,
      // Standard overlay color and alpha
      0x000000, 0.75,
    );
  });

  it('sets background rectangle depth below text depth', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const rect = getRect(scene);
    expect(rect.setDepth).toHaveBeenCalledWith(expect.any(Number));
    
    // Background depth should be less than text depth (2001)
    const depthArg = (rect.setDepth as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(depthArg).toBeLessThan(2001);
  });

  it('makes the background rectangle interactive to block pointer events', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const rect = getRect(scene);
    expect(rect.setInteractive).toHaveBeenCalled();
  });

  // ── Text and buttons ───────────────────────────────────

  it('creates title, info text, resume button, and new game button', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    expect(scene.add.text).toHaveBeenCalledTimes(4);
  });

  it('renders the resume title text', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const titleCall = (scene.add.text as any).mock.calls[0];
    expect(titleCall[2]).toBe('Resume Saved Game?');
  });

  it('renders the info text', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const infoCall = (scene.add.text as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(infoCall[2]).toContain('A checkpoint was found');
  });

  it('renders the Resume button', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const resumeCall = (scene.add.text as ReturnType<typeof vi.fn>).mock.calls[2];
    expect(resumeCall[2]).toBe('[ Resume ]');
  });

  it('renders the New Game button', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const newGameCall = (scene.add.text as ReturnType<typeof vi.fn>).mock.calls[3];
    expect(newGameCall[2]).toBe('[ New Game ]');
  });

  it('sets all text objects to depth 2001', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const texts = getTexts(scene);
    for (const t of texts) {
      expect(t.setDepth).toHaveBeenCalledWith(2001);
    }
  });

  it('makes buttons interactive with hand cursor', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const texts = getTexts(scene);
    // Resume button (index 2) and New Game button (index 3) should be interactive
    expect(texts[2].setInteractive).toHaveBeenCalledWith({ useHandCursor: true });
    expect(texts[3].setInteractive).toHaveBeenCalledWith({ useHandCursor: true });
  });

  // ── Destruction on Resume ──────────────────────────────

  it('destroys background and all text objects when Resume is clicked', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const texts = getTexts(scene);
    const rect = getRect(scene);

    // Trigger pointerdown on the Resume button (third text = index 2)
    texts[2]._handlers['pointerdown']();

    expect(rect.destroy).toHaveBeenCalledTimes(1);
    for (const t of texts) {
      expect(t.destroy).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onResume callback when Resume is clicked', () => {
    const scene = mockScene();
    const onResume = vi.fn();
    createDefaultResumeOverlay(scene, null, onResume, vi.fn());

    const texts = getTexts(scene);
    texts[2]._handlers['pointerdown']();

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  // ── Destruction on New Game ────────────────────────────

  it('destroys background and all text objects when New Game is clicked', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const texts = getTexts(scene);
    const rect = getRect(scene);

    // Trigger pointerdown on the New Game button (fourth text = index 3)
    texts[3]._handlers['pointerdown']();

    expect(rect.destroy).toHaveBeenCalledTimes(1);
    for (const t of texts) {
      expect(t.destroy).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onNewGame callback when New Game is clicked', () => {
    const scene = mockScene();
    const onNewGame = vi.fn();
    createDefaultResumeOverlay(scene, null, vi.fn(), onNewGame);

    const texts = getTexts(scene);
    texts[3]._handlers['pointerdown']();

    expect(onNewGame).toHaveBeenCalledTimes(1);
  });

  // ── Hover effects ──────────────────────────────────────

  it('registers hover effects on the Resume button', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const resumeBtn = (scene.add.text as ReturnType<typeof vi.fn>).mock.results[2].value;

    expect(resumeBtn.on).toHaveBeenCalledWith('pointerover', expect.any(Function));
    expect(resumeBtn.on).toHaveBeenCalledWith('pointerout', expect.any(Function));
  });

  it('registers hover effects on the New Game button', () => {
    const scene = mockScene();
    createDefaultResumeOverlay(scene, null, vi.fn(), vi.fn());

    const newGameBtn = (scene.add.text as ReturnType<typeof vi.fn>).mock.results[3].value;

    expect(newGameBtn.on).toHaveBeenCalledWith('pointerover', expect.any(Function));
    expect(newGameBtn.on).toHaveBeenCalledWith('pointerout', expect.any(Function));
  });

  // ── State parameter ────────────────────────────────────

  it('accepts and ignores the _state parameter (compatibility)', () => {
    const scene = mockScene();
    // Should not throw regardless of state value
    expect(() => {
      createDefaultResumeOverlay(scene, { game: 'test' }, vi.fn(), vi.fn());
    }).not.toThrow();
  });
});
