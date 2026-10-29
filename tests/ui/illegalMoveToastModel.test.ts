/**
 * Unit tests for IllegalMoveToastModel -- the framework-free text/timing model
 * behind the illegal-move reason toast.
 *
 * Covers the ACs that are pure enough to test without a Phaser scene: default
 * and custom dwell, show/replace, early dismissal, expiry via tick, empty
 * text handling and the verbatim-text contract.
 */

import { describe, expect, it } from 'vitest';
import {
  IllegalMoveToastModel,
  type IllegalMoveToastModelOptions,
} from '../../src/ui/illegalMoveToast';
import { ILLEGAL_MOVE_TOAST_DWELL_MS } from '../../src/ui/constants';

function makeModel(options?: IllegalMoveToastModelOptions): IllegalMoveToastModel {
  return new IllegalMoveToastModel(options);
}

describe('IllegalMoveToastModel', () => {
  it('defaults the dwell to the shared constant (2500 ms)', () => {
    expect(makeModel().dwellMs).toBe(ILLEGAL_MOVE_TOAST_DWELL_MS);
    expect(ILLEGAL_MOVE_TOAST_DWELL_MS).toBe(2500);
  });

  it('accepts a custom dwell', () => {
    expect(makeModel({ dwellMs: 1200 }).dwellMs).toBe(1200);
  });

  it('falls back to the default for non-finite or non-positive dwells', () => {
    expect(makeModel({ dwellMs: 0 }).dwellMs).toBe(ILLEGAL_MOVE_TOAST_DWELL_MS);
    expect(makeModel({ dwellMs: -5 }).dwellMs).toBe(ILLEGAL_MOVE_TOAST_DWELL_MS);
    expect(makeModel({ dwellMs: Number.NaN }).dwellMs).toBe(ILLEGAL_MOVE_TOAST_DWELL_MS);
    expect(makeModel({ dwellMs: Number.POSITIVE_INFINITY }).dwellMs).toBe(ILLEGAL_MOVE_TOAST_DWELL_MS);
    expect(makeModel({ dwellMs: undefined as unknown as number }).dwellMs).toBe(ILLEGAL_MOVE_TOAST_DWELL_MS);
  });

  it('starts hidden with no text and zero remaining', () => {
    const model = makeModel();
    expect(model.visible).toBe(false);
    expect(model.text).toBeNull();
    expect(model.remaining).toBe(0);
  });

  it('show makes the toast visible with the exact text (verbatim, AC8)', () => {
    const model = makeModel();
    const reason = 'The market slot is blocked by the guard figure.';
    expect(model.show(reason)).toBe(true);
    expect(model.visible).toBe(true);
    expect(model.text).toBe(reason);
    expect(model.remaining).toBe(ILLEGAL_MOVE_TOAST_DWELL_MS);
  });

  it('tick consumes the dwell and reports expiry exactly once', () => {
    const model = makeModel({ dwellMs: 1000 });
    model.show('reason');
    expect(model.tick(600)).toBe(false);
    expect(model.visible).toBe(true);
    expect(model.remaining).toBe(400);
    expect(model.tick(600)).toBe(true);
    expect(model.visible).toBe(false);
    expect(model.text).toBeNull();
    expect(model.remaining).toBe(0);
    // tick after expiry is a no-op
    expect(model.tick(600)).toBe(false);
  });

  it('tick ignores non-positive or non-finite deltas', () => {
    const model = makeModel({ dwellMs: 1000 });
    model.show('reason');
    model.tick(-100);
    expect(model.remaining).toBe(1000);
    model.tick(Number.NaN);
    expect(model.remaining).toBe(1000);
    model.tick(0);
    expect(model.remaining).toBe(1000);
  });

  it('replace-on-show restarts the dwell and swaps the text (AC4)', () => {
    const model = makeModel({ dwellMs: 2500 });
    model.show('first rejection');
    model.tick(2000);
    expect(model.visible).toBe(true);

    // A second rejection inside the dwell window replaces rather than stacks.
    const replaced = model.show('second rejection');
    expect(replaced).toBe(true);
    expect(model.text).toBe('second rejection');
    expect(model.remaining).toBe(2500); // timer restarted, not stacked
    model.tick(2400);
    expect(model.visible).toBe(true);
    model.tick(200);
    expect(model.visible).toBe(false);
  });

  it('dismiss hides the toast early (AC2)', () => {
    const model = makeModel({ dwellMs: 2500 });
    model.show('reason');
    expect(model.visible).toBe(true);
    model.dismiss();
    expect(model.visible).toBe(false);
    expect(model.text).toBeNull();
    expect(model.remaining).toBe(0);
  });

  it('show with empty or whitespace text dismisses and returns false', () => {
    const model = makeModel();
    model.show('a visible reason');
    expect(model.show('')).toBe(false);
    expect(model.visible).toBe(false);
    expect(model.show('   ')).toBe(false);
    expect(model.visible).toBe(false);
  });

  it('tick when hidden is a no-op', () => {
    const model = makeModel({ dwellMs: 1000 });
    expect(model.tick(5000)).toBe(false);
    expect(model.visible).toBe(false);
  });
});
