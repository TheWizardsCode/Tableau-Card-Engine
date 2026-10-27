/**
 * Unit tests for the illegal-move reason toast view
 * (`src/ui/illegalMoveToastView.ts`).
 *
 * The Phaser text/time/event surface is mocked: each test drives the toast
 * through its public API and asserts the rendered text, depth/wrap/stroke,
 * dwell timer, replace-on-show, early dismissal and scene-shutdown cleanup.
 */

import { describe, expect, it, vi } from 'vitest';

// The toast renders through `@ui/Renderer` (createHudText), whose module
// imports Phaser. The unit project runs in Node, so stub the Phaser module —
// the same pattern as tests/ui/renderer.test.ts.
vi.mock('phaser', () => ({ default: {} }));
import {
  dismissIllegalMoveToast,
  showIllegalMoveToast,
} from '../../src/ui/illegalMoveToastView';
import {
  GAME_W,
  ILLEGAL_MOVE_TOAST_COLOR,
  ILLEGAL_MOVE_TOAST_DEPTH,
  ILLEGAL_MOVE_TOAST_DWELL_MS,
  ILLEGAL_MOVE_TOAST_FONT_SIZE,
  ILLEGAL_MOVE_TOAST_MAX_WIDTH,
  ILLEGAL_MOVE_TOAST_STROKE_COLOR,
  ILLEGAL_MOVE_TOAST_STROKE_THICKNESS,
  ILLEGAL_MOVE_TOAST_Y,
} from '../../src/ui/constants';

// ── Mock helpers ────────────────────────────────────────────

interface MockTimer {
  delay: number;
  callback: () => void;
  remove: ReturnType<typeof vi.fn>;
  fired: boolean;
}

interface MockToastText {
  text: string;
  depth: number | null;
  wrapWidth: number | null;
  stroke: [string, number] | null;
  setText: ReturnType<typeof vi.fn>;
  setOrigin: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
  setWordWrapWidth: ReturnType<typeof vi.fn>;
  setStroke: ReturnType<typeof vi.fn>;
  setInteractive: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  destroyed: boolean;
}

interface MockToastScene {
  scene: any;
  texts: MockToastText[];
  timers: MockTimer[];
  shutdownHandlers: Record<string, Array<() => void>>;
  addTextCalls: any[][];
}

function createMockText(): MockToastText {
  const text: MockToastText = {
    text: '',
    depth: null,
    wrapWidth: null,
    stroke: null,
    destroyed: false,
    setText: vi.fn((value: string) => { text.text = value; return text; }),
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn((value: number) => { text.depth = value; return text; }),
    setWordWrapWidth: vi.fn((value: number) => { text.wrapWidth = value; return text; }),
    setStroke: vi.fn((color: string, thickness: number) => {
      text.stroke = [color, thickness];
      return text;
    }),
    setInteractive: vi.fn().mockReturnThis(),
    destroy: vi.fn(() => { text.destroyed = true; }),
  };
  return text;
}

function createMockScene(options: { withTime?: boolean } = {}): MockToastScene {
  const texts: MockToastText[] = [];
  const timers: MockTimer[] = [];
  const shutdownHandlers: Record<string, Array<() => void>> = {};
  const addTextCalls: any[][] = [];
  const withTime = options.withTime ?? true;

  const scene: any = {
    add: {
      text: vi.fn((...args: any[]) => {
        addTextCalls.push(args);
        const text = createMockText();
        text.text = String(args[2]);
        texts.push(text);
        return text;
      }),
    },
    events: {
      once: vi.fn((event: string, handler: () => void) => {
        (shutdownHandlers[event] ??= []).push(handler);
      }),
    },
  };
  if (withTime) {
    scene.time = {
      delayedCall: vi.fn((delay: number, callback: () => void) => {
        const timer: MockTimer = { delay, callback, remove: vi.fn(), fired: false };
        timers.push(timer);
        return timer;
      }),
    };
  }

  return { scene, texts, timers, shutdownHandlers, addTextCalls };
}

/** Fire everything registered for a scene event (e.g. 'shutdown'). */
function emitSceneEvent(mock: MockToastScene, event: string): void {
  for (const handler of mock.shutdownHandlers[event] ?? []) handler();
}

// ── Tests ───────────────────────────────────────────────────

describe('showIllegalMoveToast', () => {
  it('renders the reason verbatim with the shared toast styling constants', () => {
    const mock = createMockScene();
    const reason = 'That slot can only take a business card you can afford.';

    const handle = showIllegalMoveToast({ scene: mock.scene, text: reason });

    expect(handle).toBeDefined();
    expect(mock.texts).toHaveLength(1);
    const text = mock.texts[0];
    expect(text.text).toBe(reason); // exact rules-layer copy (AC1/AC8)
    expect(mock.addTextCalls[0][0]).toBe(GAME_W / 2);
    expect(mock.addTextCalls[0][1]).toBe(ILLEGAL_MOVE_TOAST_Y);
    // createHudText(x, y, text, style) — the style carries colour + font size.
    expect(mock.addTextCalls[0][3]).toMatchObject({
      color: ILLEGAL_MOVE_TOAST_COLOR,
      fontSize: ILLEGAL_MOVE_TOAST_FONT_SIZE,
    });
    expect(text.depth).toBe(ILLEGAL_MOVE_TOAST_DEPTH);
    expect(text.wrapWidth).toBe(ILLEGAL_MOVE_TOAST_MAX_WIDTH);
    expect(text.stroke).toEqual([
      ILLEGAL_MOVE_TOAST_STROKE_COLOR,
      ILLEGAL_MOVE_TOAST_STROKE_THICKNESS,
    ]);
    expect(handle!.text).toBe(reason);
  });

  it('sits above the board/HUD but below game-state overlays', () => {
    // HUD container is 1000, OverlayManager game-state overlays are 2000.
    expect(ILLEGAL_MOVE_TOAST_DEPTH).toBeGreaterThan(1000);
    expect(ILLEGAL_MOVE_TOAST_DEPTH).toBeLessThan(2000);
  });

  it('never makes the toast interactive (non-blocking input, AC2)', () => {
    const mock = createMockScene();
    showIllegalMoveToast({ scene: mock.scene, text: 'Rejected.' });

    expect(mock.texts[0].setInteractive).not.toHaveBeenCalled();
  });

  it('schedules auto-dismissal after the default dwell', () => {
    const mock = createMockScene();
    showIllegalMoveToast({ scene: mock.scene, text: 'Rejected.' });

    expect(mock.timers).toHaveLength(1);
    expect(mock.timers[0].delay).toBe(ILLEGAL_MOVE_TOAST_DWELL_MS);

    mock.timers[0].callback();
    expect(mock.texts[0].destroy).toHaveBeenCalledOnce();
    expect(mock.texts[0].destroyed).toBe(true);
  });

  it('honours a custom dwell', () => {
    const mock = createMockScene();
    showIllegalMoveToast({ scene: mock.scene, text: 'Rejected.', dwellMs: 900 });

    expect(mock.timers[0].delay).toBe(900);
  });

  it('replaces the current toast instead of stacking (AC4)', () => {
    const mock = createMockScene();
    const firstHandle = showIllegalMoveToast({ scene: mock.scene, text: 'First reason.' });

    const secondHandle = showIllegalMoveToast({ scene: mock.scene, text: 'Second reason.' });

    // One live toast object only; its text is updated in place.
    expect(mock.texts).toHaveLength(1);
    expect(mock.texts[0].text).toBe('Second reason.');
    expect(mock.texts[0].destroy).not.toHaveBeenCalled();
    // The old timer is cancelled and a fresh dwell starts.
    expect(mock.timers).toHaveLength(2);
    expect(mock.timers[0].remove).toHaveBeenCalledWith(false);
    expect(mock.timers[1].remove).not.toHaveBeenCalled();
    expect(secondHandle!.text).toBe('Second reason.');
    expect(firstHandle!.text).toBe('Second reason.');
  });

  it('can be dismissed early through the handle (AC2)', () => {
    const mock = createMockScene();
    const handle = showIllegalMoveToast({ scene: mock.scene, text: 'Rejected.' });

    handle!.dismiss();

    expect(mock.texts[0].destroy).toHaveBeenCalledOnce();
    expect(mock.timers[0].remove).toHaveBeenCalledWith(false);
  });

  it('can be dismissed early through dismissIllegalMoveToast (AC2)', () => {
    const mock = createMockScene();
    showIllegalMoveToast({ scene: mock.scene, text: 'Rejected.' });

    dismissIllegalMoveToast(mock.scene);

    expect(mock.texts[0].destroyed).toBe(true);
  });

  it('dismissing a stale handle does not destroy a newer toast', () => {
    const mock = createMockScene();
    const staleHandle = showIllegalMoveToast({ scene: mock.scene, text: 'First.' })!;
    dismissIllegalMoveToast(mock.scene);
    showIllegalMoveToast({ scene: mock.scene, text: 'Second.' });

    staleHandle.dismiss();

    expect(mock.texts).toHaveLength(2);
    expect(mock.texts[1].destroyed).toBe(false);
    expect(mock.texts[1].text).toBe('Second.');
  });

  it('renders nothing for empty / whitespace-only text and clears a stale toast', () => {
    const mock = createMockScene();
    showIllegalMoveToast({ scene: mock.scene, text: 'Rejected.' });

    const handle = showIllegalMoveToast({ scene: mock.scene, text: '   ' });

    expect(handle).toBeUndefined();
    expect(mock.texts).toHaveLength(1);
    expect(mock.texts[0].destroyed).toBe(true);
  });

  it('destroys the toast on scene shutdown so it cannot leak across scenes (AC4)', () => {
    const mock = createMockScene();
    showIllegalMoveToast({ scene: mock.scene, text: 'Rejected.' });

    emitSceneEvent(mock, 'shutdown');

    expect(mock.texts[0].destroyed).toBe(true);
    expect(mock.timers[0].remove).toHaveBeenCalledWith(false);
  });

  it('re-binds shutdown cleanup after a scene restart', () => {
    const mock = createMockScene();
    showIllegalMoveToast({ scene: mock.scene, text: 'Before restart.' });
    emitSceneEvent(mock, 'shutdown');

    showIllegalMoveToast({ scene: mock.scene, text: 'After restart.' });
    const handlers = mock.shutdownHandlers['shutdown'];
    emitSceneEvent(mock, 'shutdown');

    expect(mock.texts[1].destroyed).toBe(true);
    // Two bindings in total: one per scene lifetime, not one per show.
    expect(handlers.length).toBeGreaterThanOrEqual(2);
  });

  it('degrades without throwing when the scene has no time plugin', () => {
    const mock = createMockScene({ withTime: false });

    expect(() =>
      showIllegalMoveToast({ scene: mock.scene, text: 'Rejected.' }),
    ).not.toThrow();
    expect(mock.texts).toHaveLength(1);
    expect(mock.texts[0].text).toBe('Rejected.');
  });

  it('degrades to undefined (no throw) when the scene cannot render text', () => {
    const scene = { add: {} } as any;

    expect(showIllegalMoveToast({ scene, text: 'Rejected.' })).toBeUndefined();
  });
});
