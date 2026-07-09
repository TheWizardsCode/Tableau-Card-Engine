import { describe, it, expect } from 'vitest';
import { layoutCardPositions } from '../../src/ui/layoutCardPositions';

describe('layoutCardPositions', () => {
  // ── Edge cases ─────────────────────────────────────────

  it('returns empty positions for count 0', () => {
    const result = layoutCardPositions({
      count: 0,
      cardWidth: 120,
      centerX: 640,
    });
    expect(result.positions).toEqual([]);
    expect(result.step).toBe(0);
  });

  it('returns single centered position for count 1', () => {
    const result = layoutCardPositions({
      count: 1,
      cardWidth: 120,
      centerX: 640,
    });
    expect(result.positions).toEqual([640]);
    expect(result.step).toBe(0);
  });

  // ── No gap, no compression ────────────────────────────

  it('lays out cards edge-to-edge with no gap', () => {
    const result = layoutCardPositions({
      count: 3,
      cardWidth: 100,
      centerX: 500,
    });
    // ideal step = 100, idealWidth = 100 + 2*100 = 300
    // startX = 500 - 300/2 + 100/2 = 500 - 150 + 50 = 400
    expect(result.step).toBe(100);
    expect(result.positions).toEqual([400, 500, 600]);
  });

  // ── With gap, no compression ──────────────────────────

  it('lays out cards with gap', () => {
    const result = layoutCardPositions({
      count: 3,
      cardWidth: 100,
      gap: 10,
      centerX: 500,
    });
    // ideal step = 110, idealWidth = 100 + 2*110 = 320
    // startX = 500 - 320/2 + 100/2 = 500 - 160 + 50 = 390
    expect(result.step).toBe(110);
    expect(result.positions).toEqual([390, 500, 610]);
  });

  it('positions are centered around centerX', () => {
    const result = layoutCardPositions({
      count: 4,
      cardWidth: 120,
      gap: 8,
      centerX: 640,
    });
    // ideal step = 128, idealWidth = 120 + 3*128 = 504
    // startX = 640 - 504/2 + 120/2 = 640 - 252 + 60 = 448
    expect(result.step).toBe(128);
    expect(result.positions).toEqual([448, 576, 704, 832]);

    // Verify symmetry around centerX
    const avg =
      result.positions.reduce((a, b) => a + b, 0) / result.positions.length;
    expect(avg).toBe(640);
  });

  // ── With compression ──────────────────────────────────

  it('compresses step when idealWidth exceeds maxWidth', () => {
    const result = layoutCardPositions({
      count: 12,
      cardWidth: 120,
      gap: 8,
      centerX: 640,
      maxWidth: 1200,
    });
    // idealStep = 128, idealWidth = 120 + 11*128 = 1528 > 1200
    // compressed step = (1200 - 120) / 11 = 1080/11 ≈ 98.18
    const expectedStep = (1200 - 120) / 11;
    expect(result.step).toBeCloseTo(expectedStep, 10);
    expect(result.positions).toHaveLength(12);

    // actualWidth = 120 + 11 * step = 1200
    const actualWidth = 120 + 11 * result.step;
    expect(actualWidth).toBeCloseTo(1200, 10);

    // Verify positions are centered
    const avg =
      result.positions.reduce((a, b) => a + b, 0) / result.positions.length;
    expect(avg).toBeCloseTo(640, 10);
  });

  it('does not compress when idealWidth is within maxWidth', () => {
    const result = layoutCardPositions({
      count: 3,
      cardWidth: 100,
      gap: 10,
      centerX: 500,
      maxWidth: 1000,
    });
    // idealStep = 110, idealWidth = 100 + 2*110 = 320 < 1000
    expect(result.step).toBe(110);
    expect(result.positions).toEqual([390, 500, 610]);
  });

  it('does not compress when idealWidth equals maxWidth', () => {
    const result = layoutCardPositions({
      count: 5,
      cardWidth: 100,
      gap: 0,
      centerX: 500,
      maxWidth: 500,
    });
    // idealStep = 100, idealWidth = 100 + 4*100 = 500 === maxWidth
    expect(result.step).toBe(100);
    expect(result.positions).toHaveLength(5);
  });

  // ── Equivalence with The Mind algorithm ───────────────

  it('produces the same result as The Mind renderHumanHand pattern', () => {
    // Reproduce The Mind's original layout algorithm for comparison
    const CARD_W = 120;
    const CARD_GAP = 8;
    const MAX_HAND_WIDTH = 1200; // GAME_W - 80
    const GAME_W = 1280;
    const count: number = 15; // many cards, triggers compression

    // The Mind's original algorithm:
    const idealWidth =
      count * CARD_W + (count - 1) * CARD_GAP;
    const tmStep =
      idealWidth <= MAX_HAND_WIDTH
        ? CARD_W + CARD_GAP
        : (MAX_HAND_WIDTH - CARD_W) / (count - 1 || 1);
    const tmActualWidth =
      count === 1 ? CARD_W : CARD_W + (count - 1) * tmStep;
    const tmStartX = (GAME_W - tmActualWidth) / 2 + CARD_W / 2;
    const tmPositions: number[] = [];
    for (let i = 0; i < count; i++) {
      tmPositions.push(tmStartX + i * tmStep);
    }

    // Our helper:
    const result = layoutCardPositions({
      count,
      cardWidth: CARD_W,
      gap: CARD_GAP,
      centerX: GAME_W / 2,
      maxWidth: MAX_HAND_WIDTH,
    });

    expect(result.step).toBeCloseTo(tmStep, 10);
    expect(result.positions).toHaveLength(tmPositions.length);
    for (let i = 0; i < count; i++) {
      expect(result.positions[i]).toBeCloseTo(tmPositions[i], 10);
    }
  });

  it('produces the same result for The Mind when not compressed', () => {
    const CARD_W = 120;
    const CARD_GAP = 8;
    const MAX_HAND_WIDTH = 1200;
    const GAME_W = 1280;
    const count = 5; // few cards, no compression

    // Original algorithm:
    const idealWidth = count * CARD_W + (count - 1) * CARD_GAP;
    const tmStep =
      idealWidth <= MAX_HAND_WIDTH ? CARD_W + CARD_GAP : 0; // won't compress
    const tmActualWidth = CARD_W + (count - 1) * tmStep;
    const tmStartX = (GAME_W - tmActualWidth) / 2 + CARD_W / 2;
    const tmPositions: number[] = [];
    for (let i = 0; i < count; i++) {
      tmPositions.push(tmStartX + i * tmStep);
    }

    const result = layoutCardPositions({
      count,
      cardWidth: CARD_W,
      gap: CARD_GAP,
      centerX: GAME_W / 2,
      maxWidth: MAX_HAND_WIDTH,
    });

    expect(result.step).toBe(tmStep);
    expect(result.positions).toEqual(tmPositions);
  });

  // ── Equivalence with SushiGo refreshHand pattern ──────

  it('produces the same result as SushiGo refreshHand pattern', () => {
    const HAND_CARD_W = 110;
    const HAND_GAP = 8;
    const GAME_W = 1280;
    const count = 7;

    // SushiGo's original algorithm (no compression):
    const totalW = count * HAND_CARD_W + (count - 1) * HAND_GAP;
    const sgStartX = (GAME_W - totalW) / 2 + HAND_CARD_W / 2;
    const sgStep = HAND_CARD_W + HAND_GAP;
    const sgPositions: number[] = [];
    for (let i = 0; i < count; i++) {
      sgPositions.push(sgStartX + i * sgStep);
    }

    const result = layoutCardPositions({
      count,
      cardWidth: HAND_CARD_W,
      gap: HAND_GAP,
      centerX: GAME_W / 2,
    });

    expect(result.step).toBe(sgStep);
    expect(result.positions).toEqual(sgPositions);
  });

  // ── Two cards ─────────────────────────────────────────

  it('handles exactly 2 cards', () => {
    const result = layoutCardPositions({
      count: 2,
      cardWidth: 100,
      gap: 20,
      centerX: 500,
    });
    // step = 120, actualWidth = 100 + 120 = 220
    // startX = 500 - 220/2 + 100/2 = 500 - 110 + 50 = 440
    expect(result.step).toBe(120);
    expect(result.positions).toEqual([440, 560]);
  });

  // ── Non-centered (arbitrary centerX) ──────────────────

  it('works with arbitrary centerX', () => {
    const result = layoutCardPositions({
      count: 3,
      cardWidth: 80,
      gap: 0,
      centerX: 200,
    });
    // step = 80, actualWidth = 80 + 2*80 = 240
    // startX = 200 - 240/2 + 80/2 = 200 - 120 + 40 = 120
    expect(result.positions).toEqual([120, 200, 280]);
  });
});
