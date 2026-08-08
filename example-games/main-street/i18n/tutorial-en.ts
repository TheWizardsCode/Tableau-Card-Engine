/**
 * Main Street Tutorial — English locale bundle.
 *
 * Contains all user-facing string values for:
 * - T1–T13 tutorial step titles and bodies
 * - Tutorial offer modal (title, body, skip/start buttons)
 * - Tutorial overlay buttons (dismiss, next, exit, start full game)
 *
 * The i18n keys follow these conventions:
 * - Step text: `tutorial.<stepId>.title` and `tutorial.<stepId>.body`
 * - Modal: `tutorial.modal.<field>`
 * - Overlay: `tutorial.overlay.<field>`
 *
 * ## Card-data placeholders
 *
 * Step bodies that reference card facts (name, cost, income bonus) MUST use
 * `{cardName}` / `{cost}` / `{bonus}` placeholders instead of hardcoded
 * values.  `resolveTutorialStepText()` in `TutorialFlow.ts` substitutes the
 * live values from `card-data.csv` at render time, so rebalancing card data
 * never leaves the tutorial stale.  Never hardcode a card name, cost, or
 * income figure in a step string.
 *
 * Placeholders resolved from card data:
 * - `{cardName}` — the card's `name` column.
 * - `{cost}` — the card's `cost` column, formatted via `formatCurrency()`.
 * - `{bonus}` — an event card's `coinDelta` as `+N coins` (used by T7).
 *
 * To add a new language variant:
 *  1. Create `tutorial-<lang>.ts` with the translated bundle (keeping the
 *     same placeholder tokens in the same positions).
 *  2. Import and call `registerLocale('<lang>', bundle)` at startup.
 *
 * @module
 */

/**
 * The i18n key prefix for tutorial step strings.
 * Each step's title is at `${KEY_PREFIX}.<stepId>.title`
 * Each step's body  is at `${KEY_PREFIX}.<stepId>.body`
 *
 * Offer modal keys:
 *   ${KEY_PREFIX}.modal.title
 *   ${KEY_PREFIX}.modal.body
 *   ${KEY_PREFIX}.modal.skipBtn
 *   ${KEY_PREFIX}.modal.startBtn
 *
 * Overlay button keys:
 *   ${KEY_PREFIX}.overlay.dismiss
 *   ${KEY_PREFIX}.overlay.next
 *   ${KEY_PREFIX}.overlay.exit
 *   ${KEY_PREFIX}.overlay.startFullGame
 */
export const TUTORIAL_I18N_KEY_PREFIX = 'tutorial';

/**
 * Build the i18n key for a tutorial step's title.
 * @example `tutorialKey('T3', 'title')` → `'tutorial.T3.title'`
 */
export function tutorialKey(stepId: string, field: 'title' | 'body'): string {
  return `${TUTORIAL_I18N_KEY_PREFIX}.${stepId}.${field}`;
}

/**
 * Helper to build keys for tutorial modal and overlay UI strings.
 * @example modalKey('title') → 'tutorial.modal.title'
 * @example overlayKey('dismiss') → 'tutorial.overlay.dismiss'
 */
export function modalKey(field: string): string {
  return `${TUTORIAL_I18N_KEY_PREFIX}.modal.${field}`;
}

/**
 * Helper to build keys for tutorial overlay button labels.
 * @example overlayKey('dismiss') → 'tutorial.overlay.dismiss'
 */
export function overlayKey(field: string): string {
  return `${TUTORIAL_I18N_KEY_PREFIX}.overlay.${field}`;
}

/**
 * English locale bundle for all 14 tutorial step strings.
 *
 * Maps i18n keys (e.g. `tutorial.T1.title`) to English string values.
 */
export const TUTORIAL_EN_BUNDLE: Record<string, string> = {
  // ── Offer Modal ────────────────────────────────────────────
  [modalKey('title')]:
    'Welcome to Main Street!',
  [modalKey('body')]:
    'Would you like a tour to learn the basics of Main Street?',
  [modalKey('skipBtn')]:
    'Skip',
  [modalKey('startBtn')]:
    'Start Tutorial',

  // ── Overlay Buttons ────────────────────────────────────────
  [overlayKey('dismiss')]:
    'Dismiss',
  [overlayKey('next')]:
    'Next >',
  [overlayKey('exit')]:
    'Exit Tutorial',
  [overlayKey('startFullGame')]:
    'Start Full Game',


  // ── T1: Welcome ─────────────────────────────────────────────
  [tutorialKey('T1', 'title')]:
    'Welcome to Main Street',
  [tutorialKey('T1', 'body')]:
    'Build the best Main Street! You have 25 turns to reach the score target. I\'ll guide your first few actions.',

  // ── T2: Resource HUD ────────────────────────────────────────
  [tutorialKey('T2', 'title')]:
    'Resource HUD',
  [tutorialKey('T2', 'body')]:
    'Watch your Coins, Reputation, and Score here. Running out of coins or reputation can end your game.',

  // ── T3: Development Row ─────────────────────────────────────
  [tutorialKey('T3', 'title')]:
    'Development Row',
  // {cardName}/{cost} are resolved from card-data.csv at render time via
  // resolveTutorialStepText() — do NOT hardcode the card name or price here.
  [tutorialKey('T3', 'body')]:
    'Buy the **{cardName}** card from the Development row for {cost}. ' +
    'It earns income each turn. Place cards on your street to earn income.',

  // ── T4: Place a Business ────────────────────────────────────
  [tutorialKey('T4', 'title')]:
    'Place a Business',
  [tutorialKey('T4', 'body')]:
    'Place this card in a highlighted slot. Matching cards next to each other give bonus income.',

  // ── T5: Upcoming Incidents ──────────────────────────────────
  [tutorialKey('T5', 'title')]:
    'Upcoming Incidents',
  [tutorialKey('T5', 'body')]:
    'Blue cards show events that happen at the end of each turn. Plan around them!\n' +
    'Bad events cost coins or reputation. Good events help you. The leftmost card happens next.',

  // ── T6: End Turn ────────────────────────────────────────────
  [tutorialKey('T6', 'title')]:
    'End Turn',
  [tutorialKey('T6', 'body')]:
    'End Turn collects your income and starts the next day. Events happen after income.',

  // ── T7: Held Event Card ─────────────────────────────────────
  [tutorialKey('T7', 'title')]:
    'Held Event Card',
  // {cardName}/{bonus} resolved from card-data.csv (evt-festival) at render time.
  [tutorialKey('T7', 'body')]:
    'Buy the **{cardName}** card from the investments row.\n' +
    'Investment cards are most powerful when you time them right. The {cardName} ' +
    'gives {bonus} to all **Culture** businesses — so you will want a Culture business ' +
    'on your street before you play it.\n' +
    'You can hold event cards in your hand and play them when the time is right.',

  // ── T8: Culture Business Purchase ───────────────────────────
  [tutorialKey('T8', 'title')]:
    'Culture Business',
  // {cardName}/{cost} resolved from card-data.csv (biz-bookshop) at render time.
  [tutorialKey('T8', 'body')]:
    'Now buy the **{cardName}** from the Development row for {cost}.\n' +
    'It is a **Culture** business, which means the investment card you just bought ' +
    'will boost it when you play the event.\n' +
    'Having the right businesses on your street makes your investment cards stronger!\n' +
    'This card will be placed automatically.',

  // ── T9: Place from Hand ──────────────────────────────────
  [tutorialKey('T9', 'title')]:
    'Place from Hand',
  // {cardName} resolved from card-data.csv (biz-bookshop) at render time.
  [tutorialKey('T9', 'body')]:
    'The {cardName} is now in your hand.\n' +
    'Click an empty street slot to place it.\n\n' +
    'Tip: You can hold multiple cards in your hand\n' +
    'before deciding where to place them.',

  // ── T10: Your Hand ──────────────────────────────────────────
  [tutorialKey('T10', 'title')]:
    'Your Hand',
  [tutorialKey('T10', 'body')]:
    'You can hold event and business cards together in your hand (up to your hand size).\n' +
    'When you buy an event, it appears here.\n' +
    'Click the card in your hand to play it.',

  // ── T11: Action Controls ────────────────────────────────────
  [tutorialKey('T11', 'title')]:
    'Action Controls',
  [tutorialKey('T11', 'body')]:
    'Use the buttons at the bottom:\n' +
    '• End Turn — collect income and advance\n' +
    '• Undo / Redo — go back or forward\n' +
    '• Hint — get a suggested move\n' +
    '• Refresh — swap the investment row (costs coins)',

  // ── T12: Challenges ─────────────────────────────────────────
  [tutorialKey('T12', 'title')]:
    'Challenges',
  [tutorialKey('T12', 'body')]:
    'Each game gives you challenges for bonus points. See them in the Challenge Tracker.\n\n' +
    'Completing challenges unlocks new cards for future games!',

  // ── T13: Scoring ────────────────────────────────────────────
  [tutorialKey('T13', 'title')]:
    'Scoring',
  [tutorialKey('T13', 'body')]:
    'Your score appears at the top of the screen.\n\n' +
    'Final Score = Coins + Reputation + Challenge bonuses\n\n' +
    'Reach the target score before running out of turns to win!',

  // ── T14: Tutorial Complete ──────────────────────────────────
  [tutorialKey('T14', 'title')]:
    'Tutorial Complete',
  [tutorialKey('T14', 'body')]:
    'Great job! You are ready to play a full game. Find the tutorial again in the settings menu.',
} as const;

// Re-export helpers
// tutorialKey is already exported above;
// modalKey and overlayKey are new exports above.

