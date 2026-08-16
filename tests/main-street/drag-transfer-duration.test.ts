/**
 * Drag-and-drop transfer duration helper tests.
 *
 * Covers `computeDragTransferDuration` — the pure distance→duration mapping
 * used by the Main Street drag-and-drop buy path (CG-0MST2LS3E004BTPO):
 * the transfer animation duration is proportional to the drop-to-slot
 * distance, clamped to a configured minimum (near-slot drops still animate)
 * and a maximum of 1500ms (never slower than the fixed default used by
 * click/AI flows).
 *
 * @module tests/main-street/drag-transfer-duration
 */

import { describe, it, expect } from 'vitest';

import {
  computeDragTransferDuration,
  DRAG_TRANSFER_MS_PER_PX,
  DRAG_TRANSFER_DURATION_MIN_MS,
  DRAG_TRANSFER_DURATION_MAX_MS,
} from '../../example-games/main-street/scenes/MainStreetConstants';

describe('computeDragTransferDuration', () => {
  it('is proportional to the distance travelled (k ms per px)', () => {
    const k = DRAG_TRANSFER_MS_PER_PX;
    expect(computeDragTransferDuration(100)).toBe(k * 100);
    expect(computeDragTransferDuration(200)).toBe(k * 200);
    // A longer drop takes longer than a shorter drop.
    expect(computeDragTransferDuration(300)).toBeGreaterThan(computeDragTransferDuration(100));
  });

  it('clamps at the configured minimum so a drop on its slot still animates', () => {
    expect(computeDragTransferDuration(0)).toBe(DRAG_TRANSFER_DURATION_MIN_MS);
    expect(computeDragTransferDuration(10)).toBe(DRAG_TRANSFER_DURATION_MIN_MS);
  });

  it('clamps at 1500ms (never slower than the fixed default)', () => {
    expect(computeDragTransferDuration(1000)).toBe(DRAG_TRANSFER_DURATION_MAX_MS);
    expect(computeDragTransferDuration(5000)).toBe(DRAG_TRANSFER_DURATION_MAX_MS);
  });

  it('keeps the minimum below the maximum so the range is non-degenerate', () => {
    expect(DRAG_TRANSFER_DURATION_MIN_MS).toBeLessThan(DRAG_TRANSFER_DURATION_MAX_MS);
  });
});
