/**
 * synergyLineEndpoints -- shared synergy-line geometry for Main Street.
 *
 * The synergy "wyndergy" lines between adjacent synergistic businesses are
 * clipped to the two facing slot rectangles instead of running slot-centre to
 * slot-centre (CG-0MSVM3WCD007BRQP). This module is the single source of
 * truth for that geometry, shared by:
 *
 * - `MainStreetRenderer.drawSynergyLines()` (static persistent lines), and
 * - `MainStreetAnimator.animateSynergyFormation()` (the draw-in animation).
 *
 * Because both callers consume the SAME helper, the animated line can never
 * drift from the static line (the animator's old "mirrors the renderer"
 * duplication is gone — see the doc comment removal in MainStreetAnimator.ts).
 *
 * Pure TypeScript (no Phaser, no scene dependency) so the geometry is
 * unit-testable headless in `tests/main-street/synergy-visuals.test.ts`.
 *
 * @module example-games/main-street/scenes/synergyLineEndpoints
 */

/**
 * Subset of `SceneLayout` (see MainStreetConstants.ts) needed to resolve a
 * slot rect. `SceneLayout` is structurally assignable to this type, so the
 * renderer/animator pass the full scene layout straight through.
 */
export interface SynergyLineLayout {
  streetX: number;
  streetTop: number;
  slotW: number;
  slotH: number;
  slotGap: number;
  streetRowGap: number;
  streetCols: number;
}

/** A point on the street grid (world coordinates). */
export interface SynergyLinePoint {
  x: number;
  y: number;
}

/**
 * Clipped segment for a synergy pair.
 *
 * `p1` lies on `pair.fromIndex`'s slot-rect boundary and `p2` on
 * `pair.toIndex`'s boundary, both on the straight centre-to-centre line.
 * `mid` is the segment midpoint (for the animator's spark/"Synergy!" pop).
 */
export interface SynergyLineEndpoints {
  p1: SynergyLinePoint;
  p2: SynergyLinePoint;
  mid: SynergyLinePoint;
}

/**
 * Computes the clipped endpoints of a synergy pair's link line.
 *
 * The line is the straight segment between the two slot centres, clipped to
 * the boundary of each slot rect. The clip is the intersection of the
 * centre-to-centre ray with the rect boundary ("exit" point of the first
 * rect, "entry" point of the second):
 *
 * - Orthogonally adjacent pairs: the ray hits the facing edge first, so the
 *   line runs edge-to-edge (right edge → left edge, or bottom edge → top
 *   edge), at the perpendicular centre coordinate.
 * - Diagonally adjacent pairs: the ray hits the nearer edge within a
 *   sub-pixel of the geometric corner (e.g. for the 140×80 slots with 20px
 *   gap, the bottom edge 0.43px from the bottom-right corner) — visually
 *   corner-to-corner.
 * - Extended-range pairs (`synergyRangeBonus` ≥ 1): the same clip applies to
 *   the longer segment — it is clipped to the two card boundaries and still
 *   crosses intermediate cells (the routing-around-cards question is out of
 *   scope; documented in the CG-0MSVM3WCD007BRQP intake brief).
 *
 * Clipping targets the SLOT rect (not the visual card rect, which is inset
 * 2px via `renderW/H = slotW − 4`); this matches the existing slot-centre
 * layout math so the lines sit on the slot grid.
 *
 * @param pair    Synergy pair (slot indices; `sharedSynergy` is ignored by
 *                the geometry but kept for signature parity).
 * @param layout  Layout values (scene `layout` or a fixture).
 * @returns The clipped endpoints plus the segment midpoint.
 */
export function synergyLineEndpoints(
  pair: { fromIndex: number; toIndex: number; sharedSynergy?: string },
  layout: SynergyLineLayout,
): SynergyLineEndpoints {
  const { streetX, streetTop, slotW, slotH, slotGap, streetRowGap, streetCols } = layout;

  const slotCentre = (idx: number): SynergyLinePoint => ({
    x: streetX + (idx % streetCols) * (slotW + slotGap) + slotW / 2,
    y: streetTop + Math.floor(idx / streetCols) * (slotH + streetRowGap) + slotH / 2,
  });

  const a = slotCentre(pair.fromIndex);
  const b = slotCentre(pair.toIndex);

  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // Degenerate self-pair guard (pairs are normally distinct slots).
  if (dx === 0 && dy === 0) {
    return { p1: a, p2: b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  // Fraction of the centre-to-centre vector that reaches the FIRST boundary
  // of a rect along that axis. Both rects share the same size, so one `t`
  // clips both endpoints symmetrically about the segment midpoint.
  const halfW = slotW / 2;
  const halfH = slotH / 2;
  const t = Math.min(
    dx !== 0 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY,
    dy !== 0 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY,
  );

  const p1 = { x: a.x + dx * t, y: a.y + dy * t };
  const p2 = { x: b.x - dx * t, y: b.y - dy * t };

  return {
    p1,
    p2,
    mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
  };
}