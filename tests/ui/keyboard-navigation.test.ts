/**
 * Unit tests for the shared keyboard navigation helpers
 * (`src/ui/keyboard-navigation.ts`, CG-0MWR0BKIT0084ZID; GDD G11 / gap B7).
 *
 * Everything here runs in a plain Node environment: Phaser is type-only and
 * both keyboards and scene lifecycles are injected as `{ on, off }` seams. The
 * suite pins the AC5 contract — digit selection (including out-of-range),
 * arrow wrap in both directions, Enter/Space activation, focus traversal and
 * wrap, topmost-only Escape, inertness while a modal is open, opaque/blocked
 * modes, and disposer/shutdown teardown with no listener left behind.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type Phaser from 'phaser';

import {
  attachChoiceNavigation,
  attachOverlayFocus,
  isManagedOverlayOpen,
  managedOverlayDepth,
  resolveChoiceKeyAction,
  resolveOverlayKeyAction,
  wrapIndex,
  type KeyboardSeam,
  type LifecycleSeam,
  type OverlayFocusable,
} from '../../src/ui/keyboard-navigation';

// ── Fakes ───────────────────────────────────────────────────

type AnyHandler = (...args: any[]) => void;

interface FakeEmitter {
  on(event: string, handler: AnyHandler): void;
  off(event: string, handler: AnyHandler): void;
  emit(event: string, ...args: any[]): void;
  count(event?: string): number;
}

function createFakeEmitter(): FakeEmitter {
  const handlers = new Map<string, Set<AnyHandler>>();
  return {
    on(event, handler) {
      const set = handlers.get(event) ?? new Set<AnyHandler>();
      set.add(handler);
      handlers.set(event, set);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event, ...args) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args);
    },
    count(event) {
      if (event !== undefined) return handlers.get(event)?.size ?? 0;
      let total = 0;
      for (const set of handlers.values()) total += set.size;
      return total;
    },
  };
}

interface FakeScene {
  scene: Phaser.Scene;
  keyboard: FakeEmitter;
  events: FakeEmitter;
}

function createFakeScene(): FakeScene {
  const keyboard = createFakeEmitter();
  const events = createFakeEmitter();
  const scene = {
    input: { keyboard: keyboard as unknown as KeyboardSeam },
    events: events as unknown as LifecycleSeam,
  } as unknown as Phaser.Scene;
  return { scene, keyboard, events };
}

/** Minimal keydown event; no `preventDefault` (the helper must guard for it). */
function key(name: string, shiftKey = false): KeyboardEvent {
  return { key: name, shiftKey } as unknown as KeyboardEvent;
}

interface FocusSpy extends OverlayFocusable {
  onActivate: () => void;
  setFocusVisual: (focused: boolean) => void;
}

function createFocusable(): FocusSpy {
  return {
    onActivate: vi.fn() as unknown as () => void,
    setFocusVisual: vi.fn() as unknown as (focused: boolean) => void,
  };
}

/** Every disposer created during a test, torn down even when a test throws. */
const liveDisposers: Array<() => void> = [];

function track<T extends () => void>(disposer: T): T {
  liveDisposers.push(disposer);
  return disposer;
}

afterEach(() => {
  while (liveDisposers.length > 0) liveDisposers.pop()!();
  // A leaked frame would make the next test's choice navigation inert, so the
  // shared stack must be empty after every test.
  expect(managedOverlayDepth()).toBe(0);
});

// ── Pure reducers ───────────────────────────────────────────

describe('wrapIndex', () => {
  it('wraps negative and overflowing indices into the range', () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(4, 3)).toBe(1);
  });

  it('returns 0 for an empty range', () => {
    expect(wrapIndex(5, 0)).toBe(0);
    expect(wrapIndex(-5, -2)).toBe(0);
  });
});

describe('resolveChoiceKeyAction', () => {
  it('maps in-range digits to highlight + choose and rejects out-of-range digits', () => {
    expect(resolveChoiceKeyAction('1', 0, 3)).toEqual({
      index: 0,
      moveHighlight: true,
      activate: true,
    });
    expect(resolveChoiceKeyAction('3', 0, 3)).toEqual({
      index: 2,
      moveHighlight: true,
      activate: true,
    });
    expect(resolveChoiceKeyAction('4', 0, 3)).toBeNull();
    expect(resolveChoiceKeyAction('9', 0, 3)).toBeNull();
    expect(resolveChoiceKeyAction('0', 0, 3)).toBeNull();
    expect(resolveChoiceKeyAction('a', 0, 3)).toBeNull();
  });

  it('moves with all four arrows and wraps at both ends', () => {
    expect(resolveChoiceKeyAction('ArrowUp', 0, 3)).toEqual({
      index: 2,
      moveHighlight: true,
      activate: false,
    });
    expect(resolveChoiceKeyAction('ArrowLeft', 0, 3)).toEqual({
      index: 2,
      moveHighlight: true,
      activate: false,
    });
    expect(resolveChoiceKeyAction('ArrowDown', 2, 3)).toEqual({
      index: 0,
      moveHighlight: true,
      activate: false,
    });
    expect(resolveChoiceKeyAction('ArrowRight', 2, 3)).toEqual({
      index: 0,
      moveHighlight: true,
      activate: false,
    });
    // No current highlight: the first option is the base.
    expect(resolveChoiceKeyAction('ArrowDown', null, 3)).toEqual({
      index: 1,
      moveHighlight: true,
      activate: false,
    });
  });

  it('activates the current highlight with Enter/Space and does nothing without one', () => {
    expect(resolveChoiceKeyAction('Enter', 1, 3)).toEqual({
      index: 1,
      moveHighlight: false,
      activate: true,
    });
    expect(resolveChoiceKeyAction(' ', 2, 3)).toEqual({
      index: 2,
      moveHighlight: false,
      activate: true,
    });
    expect(resolveChoiceKeyAction('Spacebar', 0, 3)).toEqual({
      index: 0,
      moveHighlight: false,
      activate: true,
    });
    expect(resolveChoiceKeyAction('Enter', null, 3)).toBeNull();
  });

  it('honours the key-group opt-outs', () => {
    expect(resolveChoiceKeyAction('2', 0, 3, { digits: false })).toBeNull();
    expect(resolveChoiceKeyAction('ArrowDown', 0, 3, { arrows: false })).toBeNull();
    expect(resolveChoiceKeyAction('Enter', 0, 3, { activate: false })).toBeNull();
    // Enabled groups keep working when another is off.
    expect(resolveChoiceKeyAction('ArrowDown', 0, 3, { digits: false })).toEqual({
      index: 1,
      moveHighlight: true,
      activate: false,
    });
  });

  it('is inert for an empty option list', () => {
    expect(resolveChoiceKeyAction('1', null, 0)).toBeNull();
    expect(resolveChoiceKeyAction('ArrowDown', null, 0)).toBeNull();
    expect(resolveChoiceKeyAction('Enter', null, 0)).toBeNull();
  });
});

describe('resolveOverlayKeyAction', () => {
  it('walks focus forward and backward with wrap', () => {
    expect(resolveOverlayKeyAction('Tab', 0, 2)).toEqual({ kind: 'move', index: 1 });
    expect(resolveOverlayKeyAction('Tab', 1, 2)).toEqual({ kind: 'move', index: 0 });
    expect(resolveOverlayKeyAction('Tab', 0, 2, { shiftKey: true })).toEqual({
      kind: 'move',
      index: 1,
    });
    expect(resolveOverlayKeyAction('Tab', 1, 2, { shiftKey: true })).toEqual({
      kind: 'move',
      index: 0,
    });
  });

  it('activates the focused item and closes on Escape even with no focusables', () => {
    expect(resolveOverlayKeyAction('Enter', 1, 2)).toEqual({
      kind: 'activate',
      index: 1,
    });
    expect(resolveOverlayKeyAction(' ', 0, 2)).toEqual({
      kind: 'activate',
      index: 0,
    });
    expect(resolveOverlayKeyAction('Enter', null, 2)).toBeNull();
    expect(resolveOverlayKeyAction('Escape', null, 0)).toEqual({ kind: 'escape' });
    expect(resolveOverlayKeyAction('Esc', 0, 2)).toEqual({ kind: 'escape' });
  });

  it('ignores keys outside the focus contract', () => {
    expect(resolveOverlayKeyAction('ArrowDown', 0, 2)).toBeNull();
    expect(resolveOverlayKeyAction('1', 0, 2)).toBeNull();
    expect(resolveOverlayKeyAction('Tab', null, 0)).toBeNull();
  });
});

// ── Choice navigation ───────────────────────────────────────

describe('attachChoiceNavigation', () => {
  it('highlights the first option on attach', () => {
    const { scene } = createFakeScene();
    const onHighlight = vi.fn();

    track(
      attachChoiceNavigation(scene, {
        count: 3,
        onChoose: vi.fn(),
        onHighlight,
      }),
    );

    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(onHighlight).toHaveBeenCalledWith(0);
  });

  it('selects via digit keys (highlight + choose) and ignores out-of-range digits', () => {
    const { scene, keyboard } = createFakeScene();
    const onChoose = vi.fn();
    const onHighlight = vi.fn();

    track(attachChoiceNavigation(scene, { count: 3, onChoose, onHighlight }));
    onHighlight.mockClear();

    keyboard.emit('keydown', key('3'));
    expect(onHighlight).toHaveBeenCalledWith(2);
    expect(onChoose).toHaveBeenCalledWith(2);

    onHighlight.mockClear();
    onChoose.mockClear();
    keyboard.emit('keydown', key('4'));
    keyboard.emit('keydown', key('0'));
    keyboard.emit('keydown', key('x'));
    expect(onHighlight).not.toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();

    // The highlight is still the in-range digit's index (2): Enter chooses it.
    keyboard.emit('keydown', key('Enter'));
    expect(onChoose).toHaveBeenCalledWith(2);
  });

  it('moves the highlight with arrows, wrapping in both directions', () => {
    const { scene, keyboard } = createFakeScene();
    const onChoose = vi.fn();
    const onHighlight = vi.fn();

    // Inject the keyboard so the assertions do not depend on scene wiring.
    track(
      attachChoiceNavigation(scene, {
        count: 3,
        onChoose,
        onHighlight,
      }),
    );
    onHighlight.mockClear();

    keyboard.emit('keydown', key('ArrowUp'));
    expect(onHighlight).toHaveBeenLastCalledWith(2);
    keyboard.emit('keydown', key('ArrowDown'));
    expect(onHighlight).toHaveBeenLastCalledWith(0);
    keyboard.emit('keydown', key('ArrowLeft'));
    expect(onHighlight).toHaveBeenLastCalledWith(2);
    keyboard.emit('keydown', key('ArrowRight'));
    expect(onHighlight).toHaveBeenLastCalledWith(0);

    expect(onChoose).not.toHaveBeenCalled();
  });

  it('activates the highlighted option with Enter/Space', () => {
    const { scene, keyboard } = createFakeScene();
    const onChoose = vi.fn();

    track(attachChoiceNavigation(scene, { count: 3, onChoose }));

    keyboard.emit('keydown', key('Enter'));
    expect(onChoose).toHaveBeenLastCalledWith(0);

    keyboard.emit('keydown', key('ArrowDown'));
    keyboard.emit('keydown', key(' '));
    expect(onChoose).toHaveBeenLastCalledWith(1);

    keyboard.emit('keydown', key('ArrowDown'));
    keyboard.emit('keydown', key('Spacebar'));
    expect(onChoose).toHaveBeenLastCalledWith(2);
  });

  it('honours key-group opt-outs at attach time', () => {
    const { scene, keyboard } = createFakeScene();
    const onChoose = vi.fn();
    const onHighlight = vi.fn();

    track(
      attachChoiceNavigation(scene, {
        count: 3,
        onChoose,
        onHighlight,
        keys: { digits: false, arrows: false, activate: false },
      }),
    );
    onHighlight.mockClear();

    keyboard.emit('keydown', key('2'));
    keyboard.emit('keydown', key('ArrowDown'));
    keyboard.emit('keydown', key('Enter'));

    expect(onHighlight).not.toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('is inert while isBlocked() is true', () => {
    const { scene, keyboard } = createFakeScene();
    const onChoose = vi.fn();
    let blocked = true;

    track(
      attachChoiceNavigation(scene, {
        count: 3,
        onChoose,
        isBlocked: () => blocked,
      }),
    );

    keyboard.emit('keydown', key('1'));
    keyboard.emit('keydown', key('ArrowDown'));
    keyboard.emit('keydown', key('Enter'));
    expect(onChoose).not.toHaveBeenCalled();

    blocked = false;
    keyboard.emit('keydown', key('1'));
    expect(onChoose).toHaveBeenCalledWith(0);
  });

  it('fails closed (inert) when the isBlocked() veto throws', () => {
    const { scene, keyboard } = createFakeScene();
    const onChoose = vi.fn();

    track(
      attachChoiceNavigation(scene, {
        count: 3,
        onChoose,
        isBlocked: () => {
          throw new Error('veto exploded');
        },
      }),
    );

    expect(() => keyboard.emit('keydown', key('1'))).not.toThrow();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('is inert while a managed overlay is open, then resumes after it closes', () => {
    const { scene, keyboard } = createFakeScene();
    const onChoose = vi.fn();
    const onHighlight = vi.fn();

    const overlayDisposer = attachOverlayFocus(
      scene,
      [createFocusable()],
      { onEscape: vi.fn() },
    );
    track(overlayDisposer);

    track(attachChoiceNavigation(scene, { count: 3, onChoose, onHighlight }));
    onHighlight.mockClear();

    expect(isManagedOverlayOpen()).toBe(true);
    keyboard.emit('keydown', key('2'));
    keyboard.emit('keydown', key('ArrowDown'));
    keyboard.emit('keydown', key('Enter'));
    expect(onHighlight).not.toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();

    overlayDisposer();
    keyboard.emit('keydown', key('2'));
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('does not throw for a scene without a keyboard plugin or a null scene', () => {
    const bareScene = { input: {} } as unknown as Phaser.Scene;

    expect(() =>
      attachChoiceNavigation(bareScene, { count: 2, onChoose: vi.fn() }),
    ).not.toThrow();

    const bareDisposer = attachChoiceNavigation(null, {
      count: 2,
      onChoose: vi.fn(),
    });
    expect(() => bareDisposer()).not.toThrow();
    expect(() => bareDisposer()).not.toThrow();
  });

  it('detaches its keyboard and shutdown listeners on disposal', () => {
    const { scene, keyboard, events } = createFakeScene();
    const onChoose = vi.fn();

    const dispose = attachChoiceNavigation(scene, { count: 2, onChoose });
    expect(keyboard.count('keydown')).toBe(1);
    expect(events.count('shutdown')).toBe(1);

    dispose();
    expect(keyboard.count('keydown')).toBe(0);
    expect(events.count('shutdown')).toBe(0);

    keyboard.emit('keydown', key('1'));
    expect(onChoose).not.toHaveBeenCalled();

    // Idempotent: a second call is a no-op.
    expect(() => dispose()).not.toThrow();
    expect(keyboard.count('keydown')).toBe(0);
  });

  it('tears down on scene shutdown', () => {
    const { scene, keyboard, events } = createFakeScene();
    const onChoose = vi.fn();

    track(attachChoiceNavigation(scene, { count: 2, onChoose }));

    events.emit('shutdown');
    expect(keyboard.count('keydown')).toBe(0);
    expect(events.count('shutdown')).toBe(0);

    keyboard.emit('keydown', key('1'));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('keeps navigating when a caller callback throws', () => {
    const { scene, keyboard } = createFakeScene();
    const onChoose = vi.fn(() => {
      throw new Error('onChoose exploded');
    });

    track(attachChoiceNavigation(scene, { count: 3, onChoose }));

    expect(() => keyboard.emit('keydown', key('1'))).not.toThrow();
    expect(onChoose).toHaveBeenCalledWith(0);
    expect(() => keyboard.emit('keydown', key('2'))).not.toThrow();
    expect(onChoose).toHaveBeenCalledWith(1);
  });
});

// ── Overlay focus ───────────────────────────────────────────

describe('attachOverlayFocus', () => {
  it('focuses the first focusable on attach and reports it', () => {
    const { scene } = createFakeScene();
    const first = createFocusable();
    const second = createFocusable();
    const onFocusChange = vi.fn();

    track(
      attachOverlayFocus(scene, [first, second], {
        onEscape: vi.fn(),
        onFocusChange,
      }),
    );

    expect(first.setFocusVisual).toHaveBeenCalledWith(true);
    expect(second.setFocusVisual).not.toHaveBeenCalled();
    expect(onFocusChange).toHaveBeenCalledWith(0);
    expect(isManagedOverlayOpen()).toBe(true);
  });

  it('traverses forward and backward with Tab/Shift+Tab, wrapping, and reports focus', () => {
    const { scene, keyboard } = createFakeScene();
    const first = createFocusable();
    const second = createFocusable();
    const third = createFocusable();
    const onFocusChange = vi.fn();

    track(
      attachOverlayFocus(scene, [first, second, third], {
        onEscape: vi.fn(),
        onFocusChange,
      }),
    );

    keyboard.emit('keydown', key('Tab'));
    expect(second.setFocusVisual).toHaveBeenLastCalledWith(true);
    expect(first.setFocusVisual).toHaveBeenLastCalledWith(false);
    expect(onFocusChange).toHaveBeenLastCalledWith(1);

    keyboard.emit('keydown', key('Tab'));
    expect(third.setFocusVisual).toHaveBeenLastCalledWith(true);
    expect(second.setFocusVisual).toHaveBeenLastCalledWith(false);
    expect(onFocusChange).toHaveBeenLastCalledWith(2);

    keyboard.emit('keydown', key('Tab'));
    expect(first.setFocusVisual).toHaveBeenLastCalledWith(true);
    expect(third.setFocusVisual).toHaveBeenLastCalledWith(false);
    expect(onFocusChange).toHaveBeenLastCalledWith(0);

    keyboard.emit('keydown', key('Tab', true));
    expect(third.setFocusVisual).toHaveBeenLastCalledWith(true);
    expect(first.setFocusVisual).toHaveBeenLastCalledWith(false);
    expect(onFocusChange).toHaveBeenLastCalledWith(2);
  });

  it('activates the focused item with Enter/Space', () => {
    const { scene, keyboard } = createFakeScene();
    const first = createFocusable();
    const second = createFocusable();

    track(
      attachOverlayFocus(scene, [first, second], { onEscape: vi.fn() }),
    );

    keyboard.emit('keydown', key('Enter'));
    expect(first.onActivate).toHaveBeenCalledTimes(1);

    keyboard.emit('keydown', key('Tab'));
    keyboard.emit('keydown', key(' '));
    expect(second.onActivate).toHaveBeenCalledTimes(1);

    keyboard.emit('keydown', key('Spacebar'));
    expect(second.onActivate).toHaveBeenCalledTimes(2);
  });

  it('closes only the topmost managed overlay on Escape and leaves it unhandled when none is open', () => {
    const { scene, keyboard } = createFakeScene();
    const onEscapeA = vi.fn();
    const onEscapeB = vi.fn();

    const disposeA = attachOverlayFocus(scene, [createFocusable()], {
      onEscape: onEscapeA,
    });
    track(disposeA);
    const disposeB = attachOverlayFocus(scene, [createFocusable()], {
      onEscape: onEscapeB,
    });
    track(disposeB);

    keyboard.emit('keydown', key('Escape'));
    expect(onEscapeB).toHaveBeenCalledTimes(1);
    expect(onEscapeA).not.toHaveBeenCalled();

    disposeB();
    keyboard.emit('keydown', key('Escape'));
    expect(onEscapeA).toHaveBeenCalledTimes(1);

    disposeA();
    // No managed overlay remains: the helper no longer observes Escape at all,
    // so SettingsPanel's own Escape toggle keeps working.
    expect(keyboard.count('keydown')).toBe(0);
    expect(() => keyboard.emit('keydown', key('Escape'))).not.toThrow();
    expect(onEscapeA).toHaveBeenCalledTimes(1);
    expect(onEscapeB).toHaveBeenCalledTimes(1);
  });

  it('keeps a lower modal inert for traversal and activation while a higher one is open', () => {
    const { scene, keyboard } = createFakeScene();
    const lowerA = createFocusable();
    const lowerB = createFocusable();
    const upperA = createFocusable();
    const upperB = createFocusable();
    const lowerFocusChange = vi.fn();
    const upperFocusChange = vi.fn();

    const disposeLower = attachOverlayFocus(scene, [lowerA, lowerB], {
      onEscape: vi.fn(),
      onFocusChange: lowerFocusChange,
    });
    track(disposeLower);

    const disposeUpper = attachOverlayFocus(scene, [upperA, upperB], {
      onEscape: vi.fn(),
      onFocusChange: upperFocusChange,
    });
    track(disposeUpper);

    lowerFocusChange.mockClear();
    upperFocusChange.mockClear();

    keyboard.emit('keydown', key('Tab'));
    keyboard.emit('keydown', key('Enter'));

    // Only the top modal moved and activated.
    expect(upperFocusChange).toHaveBeenLastCalledWith(1);
    expect(upperB.onActivate).toHaveBeenCalledTimes(1);
    expect(lowerFocusChange).not.toHaveBeenCalled();
    expect(lowerA.onActivate).not.toHaveBeenCalled();
    expect(lowerB.onActivate).not.toHaveBeenCalled();
  });

  it('handles Escape even when the overlay has no focusables', () => {
    const { scene, keyboard } = createFakeScene();
    const onEscape = vi.fn();

    track(attachOverlayFocus(scene, [], { onEscape }));

    keyboard.emit('keydown', key('Tab'));
    keyboard.emit('keydown', key('Enter'));
    keyboard.emit('keydown', key('Escape'));

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('clears the focus visual, detaches listeners and pops the frame on disposal', () => {
    const { scene, keyboard, events } = createFakeScene();
    const first = createFocusable();
    const second = createFocusable();

    const dispose = attachOverlayFocus(scene, [first, second], {
      onEscape: vi.fn(),
    });
    expect(managedOverlayDepth()).toBe(1);

    keyboard.emit('keydown', key('Tab'));
    expect(second.setFocusVisual).toHaveBeenLastCalledWith(true);

    dispose();

    expect(second.setFocusVisual).toHaveBeenLastCalledWith(false);
    expect(keyboard.count('keydown')).toBe(0);
    expect(events.count('shutdown')).toBe(0);
    expect(managedOverlayDepth()).toBe(0);
    expect(isManagedOverlayOpen()).toBe(false);

    // Idempotent.
    expect(() => dispose()).not.toThrow();
    expect(managedOverlayDepth()).toBe(0);
  });

  it('tears down on scene shutdown without firing onEscape', () => {
    const { scene, keyboard, events } = createFakeScene();
    const onEscape = vi.fn();
    const first = createFocusable();

    track(
      attachOverlayFocus(scene, [first], { onEscape, onFocusChange: vi.fn() }),
    );
    vi.mocked(first.setFocusVisual).mockClear();

    events.emit('shutdown');

    expect(onEscape).not.toHaveBeenCalled();
    expect(keyboard.count('keydown')).toBe(0);
    expect(events.count('shutdown')).toBe(0);
    expect(managedOverlayDepth()).toBe(0);
  });

  it('does not throw for a scene without a keyboard plugin or a null scene', () => {
    const bareScene = { input: {} } as unknown as Phaser.Scene;
    const focusable = createFocusable();

    const bareDisposer = attachOverlayFocus(bareScene, [focusable], {
      onEscape: vi.fn(),
      onFocusChange: vi.fn(),
    });
    expect(managedOverlayDepth()).toBe(1);

    const nullDisposer = attachOverlayFocus(null, [focusable], {
      onEscape: vi.fn(),
    });
    expect(managedOverlayDepth()).toBe(2);

    expect(() => nullDisposer()).not.toThrow();
    expect(managedOverlayDepth()).toBe(1);
    expect(() => bareDisposer()).not.toThrow();
    expect(managedOverlayDepth()).toBe(0);
  });

  it('keeps traversing when a focusable callback throws', () => {
    const { scene, keyboard } = createFakeScene();
    const first = createFocusable();
    const second = createFocusable();
    vi.mocked(first.setFocusVisual).mockImplementation(() => {
      throw new Error('visual exploded');
    });

    track(attachOverlayFocus(scene, [first, second], { onEscape: vi.fn() }));

    expect(() => keyboard.emit('keydown', key('Tab'))).not.toThrow();
    expect(second.setFocusVisual).toHaveBeenCalledWith(true);
  });
});
