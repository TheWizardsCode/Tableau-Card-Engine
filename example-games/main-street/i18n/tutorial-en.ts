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
 * To add a new language variant:
 *  1. Create `tutorial-<lang>.ts` with the translated bundle.
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
 * English locale bundle for all 13 tutorial step strings.
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
  [tutorialKey('T3', 'body')]:
    'Buy the **Laundromat** card from the Development row for $6. It is the cheapest card and earns money each turn. Place cards on your street to earn income.',

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
  [tutorialKey('T7', 'body')]:
    'Buy the **Grand Opening Sale** card from the investments row.\n' +
    'You can hold one event card and play it when the time is right.',

  // ── T8: Upgrade Concept ─────────────────────────────────────
  [tutorialKey('T8', 'title')]:
    'Upgrade Concept',
  [tutorialKey('T8', 'body')]:
    'Upgrades make a business better. Strong upgrades earn more money over time.',

  // ── T9: Your Hand ───────────────────────────────────────────
  [tutorialKey('T9', 'title')]:
    'Your Hand',
  [tutorialKey('T9', 'body')]:
    'You can hold one event card at a time.\n' +
    'When you buy an event, it appears here.\n' +
    'Click the card in your hand to play it.',

  // ── T10: Action Controls ────────────────────────────────────
  [tutorialKey('T10', 'title')]:
    'Action Controls',
  [tutorialKey('T10', 'body')]:
    'Use the buttons at the bottom:\n' +
    '• End Turn — collect income and advance\n' +
    '• Undo / Redo — go back or forward\n' +
    '• Hint — get a suggested move\n' +
    '• Refresh — swap the investment row (costs coins)',

  // ── T11: Challenges ─────────────────────────────────────────
  [tutorialKey('T11', 'title')]:
    'Challenges',
  [tutorialKey('T11', 'body')]:
    'Each game gives you challenges for bonus points. See them in the Challenge Tracker.\n\n' +
    'Completing challenges unlocks new cards for future games!',

  // ── T12: Scoring ────────────────────────────────────────────
  [tutorialKey('T12', 'title')]:
    'Scoring',
  [tutorialKey('T12', 'body')]:
    'Your score appears at the top of the screen.\n\n' +
    'Final Score = Coins + Reputation + Challenge bonuses\n\n' +
    'Reach the target score before running out of turns to win!',

  // ── T13: Tutorial Complete ──────────────────────────────────
  [tutorialKey('T13', 'title')]:
    'Tutorial Complete',
  [tutorialKey('T13', 'body')]:
    'Great job! You are ready to play a full game. Find the tutorial again in the settings menu.',
} as const;

// Re-export helpers
// tutorialKey is already exported above;
// modalKey and overlayKey are new exports above.

