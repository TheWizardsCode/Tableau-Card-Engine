/**
 * Main Street: Game Constants
 *
 * All numeric constants that govern game balance, market sizing, grid layout,
 * scoring thresholds, and economy ratios. No types or data — constants only.
 *
 * @module
 */

// ── Grid Layout ─────────────────────────────────────────────

/** Number of slots in the street grid (1×1 legacy alias; prefer worldSlotCount for expanded grids). */
export const GRID_SIZE = 10;
/** Slots per street (5×2) — re-exported for GridTopology helpers. */
export const STREET_COLS = 5;
export const STREET_ROWS = 2;

// ── Expanded street-lattice world geometry ──────────────────
//
// The board is a city-block grid of 5×2 street cells separated by ROADS
// (CG-0MT5Y1X5T001M4S6). Each street **owns** its own 10 plots — neighbouring
// streets do NOT share seam plots — so the world grid is the contiguous
// rectangle `(STREET_COLS·cols) × (STREET_ROWS·rows)` laid out at a stride of
// exactly (STREET_COLS, STREET_ROWS). Roads are a separate visual layer drawn
// in the gaps between street blocks (see `MainStreetMapView`); they never
// consume world slots.
//
// These helpers live with the constants (rather than in `MainStreetAdjacency`)
// so the adjacency resolver, the state lattice resize and the map view all
// share one definition without an import cycle.

/** Horizontal stride (world columns) between adjacent street-cell origins. */
export const WORLD_STRIDE_X = STREET_COLS;
/** Vertical stride (world rows) between adjacent street-cell origins. */
export const WORLD_STRIDE_Y = STREET_ROWS;

/** Width in world columns of a `cols`-wide street lattice. */
export function worldWidth(cols: number): number {
  return WORLD_STRIDE_X * cols;
}

/** Height in world rows of a `rows`-tall street lattice. */
export function worldHeight(rows: number): number {
  return WORLD_STRIDE_Y * rows;
}

/**
 * Number of world (placeable) slots for a `cols`×`rows` street lattice:
 * `STREET_COLS · STREET_ROWS · cols · rows` — 10 plots per street, no sharing.
 *
 * 10, 20, 20, 40, 60, 90 for 1×1, 2×1, 1×2, 2×2, 3×2, 3×3.
 */
export function worldSlotCount(streetCols: number, streetRows: number): number {
  if (!Number.isInteger(streetCols) || !Number.isInteger(streetRows) || streetCols <= 0 || streetRows <= 0) {
    throw new Error(`worldSlotCount: dimensions must be positive integers, got ${streetCols}×${streetRows}`);
  }
  return worldWidth(streetCols) * worldHeight(streetRows);
}

// ── Turn & Scoring ──────────────────────────────────────────

/**
 * Legacy default turn cap (20). Kept for backward compatibility; default
 * difficulty presets no longer impose a turn limit (CG-0MSLXJCHH001DLIO) —
 * turn limits are opt-in via an explicit `config.maxTurns`.
 */
export const MAX_TURNS = 20;

/** Score required for a win via score threshold (Medium preset default, retuned to 120 by CG-0MT3J8FXG006RCOA). */
export const WIN_THRESHOLD = 12000;

/** Starting coin balance (Medium preset default). */
export const STARTING_COINS = 600;

/** Starting reputation. */
export const STARTING_REPUTATION = 300;

/** Points awarded per completed challenge. */
export const CHALLENGE_BONUS_POINTS = 1000;

// ── Market Sizing ───────────────────────────────────────────

/**
 * Total number of cards visible in the single-row marketplace.
 * The market is one line of exactly 3 cards (CG-0MSTOATDT009BRX2 replaced
 * the legacy two-row model: 4 business slots + 3 investment slots).
 */
export const MARKET_TOTAL_SLOTS = 3;

/** Minimum number of business cards in the single-row market (community-space counts as business). */
export const MARKET_BUSINESS_MIN = 1;

/** Maximum number of business cards in the single-row market (community-space counts as business). */
export const MARKET_BUSINESS_MAX = 2;

/** Maximum number of upgrade cards in the single-row market. */
export const MARKET_UPGRADE_MAX = 1;

/** Maximum number of event cards in the single-row market. */
export const MARKET_EVENT_MAX = 1;

/** Maximum number of staff cards per market row (CG-0MT3KZNQB0053K55). */
export const MARKET_STAFF_MAX = 1;

/**
 * Legacy: number of Incident cards in the pre-deck incident queue. The
 * face-down incident deck replaced the visible queue (CG-0MSTOATDP000JNHH);
 * retained for backward compatibility and the deterministic tutorial
 * scenario (TutorialScenario.ts builds exactly this many deck cards).
 */
export const INCIDENT_QUEUE_SIZE = 2;

/**
 * Fixed coin cost to re-roll the single-row market (CG-0MSTOATDT009BRX2),
 * replacing the legacy per-row refresh costs (€2 each).
 * The Accountant's `refreshCostDiscount` (Group F) applies to this cost.
 */
export const REFRESH_MARKET_COST = 500;

/**
 * @deprecated Synergy is now percentage-based. Each BusinessCard and
 * CommunitySpaceCard has its own `synergyCoinBonus` rate (default 0.5 = 50%)
 * and `synergyRepBonus` (default 0). The difficulty preset
 * `synergyBonusPerNeighbor` value acts as a multiplier on the per-card
 * percentage rate.
 *
 * Kept for backward compatibility with existing test code.
 */
export const SYNERGY_BONUS_PER_NEIGHBOR = 1;

// ── Multi-Use Card Economy Ratios ───────────────────────────

/** Cost ratio when placing a card from hand to tableau (80% of purchase cost). */
export const PLACE_COST_RATIO = 0.8;

/** Value ratio when selling a card (75% of purchase value). */
export const SELL_VALUE_RATIO = 0.75;
