/**
 * Main Street: Animator Timing Constants
 *
 * Income-phase and card-processing choreography timing constants
 * (CG-0MT23O6W8003AXWJ / CG-0MTR766U6003RZ88). No runtime logic.
 *
 * @module
 */

// ── Income phase animation timing (CG-0MT23O6W8003AXWJ) ────────────────
// Tune these constants to adjust the phased income choreography pacing.

/** Gap between income phase starts (~2-3s apart per AC1). */
export const INCOME_PHASE_GAP_MS = 2200;
/** How long each phase's on-screen label stays visible. */
export const INCOME_PHASE_LABEL_MS = 1400;
/** Duration of a coin flight tween (fallback when no per-card duration is passed). */
export const INCOME_FLIGHT_MS = 600;
/**
 * Stagger between successive synergy-line coin flights / icons
 * (CG-0MTV6LZEA003YS3E): each synergy pair animates in both directions, one
 * stream per line, offset by this amount so the parallel flights stay readable.
 */
export const INCOME_FLIGHT_STAGGER_MS = 60;
/** Stagger between grid-to-HUD collection flights within one card. */
export const INCOME_COLLECT_STAGGER_MS = 80;

// ── Sequential card-processing timing (CG-0MTR766U6003RZ88) ────────────
// These constants govern the one-card-at-a-time animation model: each slot
// completes fully before the next begins, with decreasing delay and
// increasing speed between successive cards.

/** Starting delay before each card's animation (base/synergy/rep phases). */
export const INCOME_BASE_CARD_DELAY_MS = 500;
/** How much the inter-card delay decreases per successive card. */
export const INCOME_CARD_DELAY_DECREMENT_MS = 80;
/** Minimum inter-card delay (floor). */
export const INCOME_MIN_CARD_DELAY_MS = 120;
/** Base flight duration for a coin icon. */
export const INCOME_FLIGHT_BASE_MS = 550;
/** How much flight duration decreases per successive card. */
export const INCOME_FLIGHT_DECREMENT_MS = 50;
/** Minimum flight duration (floor). */
export const INCOME_FLIGHT_MIN_MS = 350;
/** Stagger between individual coin icons within one card's animation.
 * Audit (CG-0MTR766U6003RZ88): slowed by 50% from 100→150 for better pacing.
 * This value is dynamic per turn — it starts here and decreases by 20% after
 * each card completes, resetting to this base at the start of each turn. */
export const INCOME_CARD_COIN_STAGGER_MS = 150;
/** Minimum stagger within a card's icon sequence. */
export const INCOME_CARD_COIN_MIN_STAGGER_MS = 50;
/** Pause multiplier when a card's coin grid is full (5× current stagger). */
export const INCOME_CARD_FULL_PAUSE_MULTIPLIER = 5;
/** Stagger reduction factor after each card (20% reduction = ×0.8). */
export const INCOME_CARD_STAGGER_REDUCTION = 0.8;

/** Phase keys for the phased income animation (base → … → collect). */

