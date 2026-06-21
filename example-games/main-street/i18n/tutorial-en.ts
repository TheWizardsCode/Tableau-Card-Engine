/**
 * Main Street Tutorial — English locale bundle.
 *
 * Contains all user-facing string values for the T1–T13 tutorial steps.
 * The i18n keys follow the naming convention `tutorial.<stepId>.title` and
 * `tutorial.<stepId>.body`.
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
 * English locale bundle for all 13 tutorial step strings.
 *
 * Maps i18n keys (e.g. `tutorial.T1.title`) to English string values.
 */
export const TUTORIAL_EN_BUNDLE: Record<string, string> = {
  // ── T1: Welcome ─────────────────────────────────────────────
  [tutorialKey('T1', 'title')]:
    'Welcome to Main Street',
  [tutorialKey('T1', 'body')]:
    'Build the best Main Street in 20 turns. I\'ll guide your first few actions.\n\n' +
    'This is "Scenario: Tutorial" — Easy difficulty, 25 turns, and a lower score target.',

  // ── T2: Resource HUD ────────────────────────────────────────
  [tutorialKey('T2', 'title')]:
    'Resource HUD',
  [tutorialKey('T2', 'body')]:
    'Track Coins, Reputation, and Score here. Running out of reputation or coins can end your run.',

  // ── T3: Development Row ─────────────────────────────────────
  [tutorialKey('T3', 'title')]:
    'Development Row',
  [tutorialKey('T3', 'body')]:
    'Click any card from the Development row to buy it.\n' +
    'Cards go on your street to earn income.\n\n' +
    'Buy the **Laundromat** card (cost $6) — it is the cheapest card and will earn you income each turn.\n\n' +
    'The bottom row shows Investment cards with one-time effects.',

  // ── T4: Place a Business ────────────────────────────────────
  [tutorialKey('T4', 'title')]:
    'Place a Business',
  [tutorialKey('T4', 'body')]:
    'Place this business in a highlighted slot. Adjacent matching types create synergy bonuses.',

  // ── T5: Upcoming Incidents ──────────────────────────────────
  [tutorialKey('T5', 'title')]:
    'Upcoming Incidents',
  [tutorialKey('T5', 'body')]:
    'Blue cards show incidents that will hit at the end of each turn — plan around them!\n' +
    'Negative incidents (Tax Audit, Vandalism) cost coins or reputation.\n' +
    'Positive ones help you. Queue scrolls left: the leftmost card fires next.',

  // ── T6: End Turn ────────────────────────────────────────────
  [tutorialKey('T6', 'title')]:
    'End Turn',
  [tutorialKey('T6', 'body')]:
    'End Turn resolves income and incidents, then starts a new market day.',

  // ── T7: Held Event Card ─────────────────────────────────────
  [tutorialKey('T7', 'title')]:
    'Held Event Card',
  [tutorialKey('T7', 'body')]:
    'Buy the **Grand Opening Sale** event card from the investments row.\n' +
    'You can hold one event card and play it when timing is best.',

  // ── T8: Upgrade Concept ─────────────────────────────────────
  [tutorialKey('T8', 'title')]:
    'Upgrade Concept',
  [tutorialKey('T8', 'body')]:
    'Upgrades improve an existing business. Strong upgrades compound over remaining turns.',

  // ── T9: Your Hand ───────────────────────────────────────────
  [tutorialKey('T9', 'title')]:
    'Your Hand',
  [tutorialKey('T9', 'body')]:
    'You can hold one Investment event at a time.\n' +
    'When you buy an event it appears here.\n' +
    'Click the card in your hand to play it for its one-time effect.',

  // ── T10: Action Controls ────────────────────────────────────
  [tutorialKey('T10', 'title')]:
    'Action Controls',
  [tutorialKey('T10', 'body')]:
    'Use the buttons along the bottom to:\n' +
    '• End Turn — collect income and advance the day\n' +
    '• Undo / Redo — step back a market action\n' +
    '• Hint — get a suggested move\n' +
    '• Refresh — swap the investment row (costs coins)\n\n' +
    'You can also press the keyboard shortcut for End Turn (configurable in Settings).',

  // ── T11: Challenges ─────────────────────────────────────────
  [tutorialKey('T11', 'title')]:
    'Challenges',
  [tutorialKey('T11', 'body')]:
    'Each run gives you challenges to complete for bonus points (visible in the Challenge Tracker).\n\n' +
    'Completing challenges unlocks new cards for future games —' +
    ' the more challenges you complete across runs, the more businesses,' +
    ' upgrades, and events you will have access to!',

  // ── T12: Scoring ────────────────────────────────────────────
  [tutorialKey('T12', 'title')]:
    'Scoring',
  [tutorialKey('T12', 'body')]:
    'Your score is shown at the top of the screen.\n\n' +
    'Final Score = Coins + Reputation × multiplier + Challenges × bonus\n\n' +
    'Reach the target score within the turn limit to win the game — good luck!',

  // ── T13: Tutorial Complete ──────────────────────────────────
  [tutorialKey('T13', 'title')]:
    'Tutorial Complete',
  [tutorialKey('T13', 'body')]:
    'Great job! You\'re ready for a full run. Tutorial can be replayed from menu/settings.',
} as const;
