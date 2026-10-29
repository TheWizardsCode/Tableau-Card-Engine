/**
 * Node-environment import-guard tests for the framework-free `@ui` helper
 * graph (CG-0MVQQ2M8E003FQMZ).
 *
 * Downstream game unit suites import `@ui/shakeIllegalMove`, `@ui/dragDrop`
 * and `@ui/illegalMoveToastView` in a plain Node environment (no `window`).
 * Each of those entry points must resolve **without evaluating Phaser** at
 * import time — a Phaser value import crashes at `phaser/dist/phaser.esm.js`
 * with `ReferenceError: window is not defined`, which is exactly the
 * regression this suite guards against.
 *
 * The guard mechanism: a file-scoped `vi.mock('phaser', …)` whose factory
 * **throws** when Phaser is actually imported. If (and only if) some module in
 * a guard target's import graph evaluates Phaser, the import below throws and
 * the test fails — so a reintroduced Phaser value import can never silently
 * pass. The mock is deliberately file-scoped: `vi.mock` applies per test file
 * only, so it cannot mask or disturb other unit tests, and it must never be
 * moved into a global setup file.
 *
 * Negative control: importing a known Phaser-bearing module
 * (`@ui/Renderer` — `new Phaser.Geom.Rectangle(...)` at module scope) under
 * the same mock **fails**, proving the guard has teeth (a guard that passes
 * because the mock never fires would otherwise be worthless).
 *
 * The broader documented Phaser-free node surface + static import-graph check
 * is tracked separately: CG-0MVS9HBN3009HIQN.
 */

import { describe, expect, it, vi } from 'vitest';

/** Distinctive marker so the negative control can attribute the failure. */
const PHASER_EVALUATED = 'phaser evaluated at import time under node guard';

/**
 * How many times the throwing mock factory actually ran.
 *
 * `vi.hoisted` keeps this counter usable from inside the hoisted `vi.mock`
 * factory. The guard targets must leave it at `0` (Phaser never imported); the
 * negative control must push it up by one (the mock is genuinely wired, so the
 * rejection is attributable to Phaser evaluation and not to an unrelated
 * module-resolution error).
 */
const phaserMock = vi.hoisted(() => ({ calls: 0 }));

vi.mock('phaser', () => {
  phaserMock.calls += 1;
  throw new Error(PHASER_EVALUATED);
});

// Static imports must succeed: these graphs never evaluate Phaser.
import * as toastView from '../../src/ui/illegalMoveToastView';
import * as shakeIllegalMove from '../../src/ui/shakeIllegalMove';
import * as dragDrop from '../../src/ui/dragDrop';
import * as toastModel from '../../src/ui/illegalMoveToast';

describe('Phaser-free @ui helper graph (node import guard)', () => {
  it('runs in a Node environment without `window`', () => {
    expect(typeof window).toBe('undefined');
  });

  it('imports @ui/illegalMoveToastView without evaluating Phaser', () => {
    expect(typeof toastView.showIllegalMoveToast).toBe('function');
    expect(typeof toastView.dismissIllegalMoveToast).toBe('function');
  });

  it('imports @ui/shakeIllegalMove without evaluating Phaser', () => {
    expect(typeof shakeIllegalMove.shakeIllegalMove).toBe('function');
  });

  it('imports @ui/dragDrop without evaluating Phaser', () => {
    expect(typeof dragDrop.createDragDropManager).toBe('function');
    expect(dragDrop.DEFAULT_DRAG_DEPTH).toBe(1000);
  });

  it('imports @ui/illegalMoveToast (framework-free model) without evaluating Phaser', () => {
    expect(typeof toastModel.IllegalMoveToastModel).toBe('function');
  });

  it('never evaluates Phaser for any guard target', () => {
    // The throwing factory above has not run at all: none of the static imports
    // above (nor the model module) touched Phaser, not even for its types.
    expect(phaserMock.calls).toBe(0);
  });

  it('negative control: a Phaser-bearing @ui module fails under the same mock', async () => {
    // `@ui/Renderer` (`createHudText`) evaluates `new Phaser.Geom.Rectangle(...)`
    // at module scope. If the guard's throwing mock has teeth, this import must
    // reject *and* the factory must have run — proving the positive results
    // above are not vacuous.
    const callsBefore = phaserMock.calls;

    await expect(import('../../src/ui/Renderer')).rejects.toThrow();

    expect(phaserMock.calls).toBeGreaterThan(callsBefore);
  });
});
