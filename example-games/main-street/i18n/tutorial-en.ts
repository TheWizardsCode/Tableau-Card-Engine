/**
 * Main Street Tutorial — English locale bundle.
 *
 * Contains all user-facing string values for:
 * - T1–T17 tutorial step titles and bodies
 * - Tutorial offer modal (title, body, skip/start buttons)
 * - Tutorial overlay buttons (dismiss, next, exit, start full game)
 *
 * The i18n keys follow these conventions:
 * - Step text: `tutorial.<stepId>.title` and `tutorial.<stepId>.body`
 * - Modal: `tutorial.modal.<field>`
 * - Overlay: `tutorial.overlay.<field>`
 *
 * ## Editorial rules (17-step flow)
 *
 * - **≤3 sentences per text box** (titles and bodies), exactly one point per box.
 * - Do NOT mention time-limited play (the "25 turns" sentence was removed).
 * - Do NOT describe incident cards as "blue" or list their impacts.
 * - Do NOT mention matching cards in the Place a Business step.
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
 * - `{bonus}` — an event card's `coinDelta` as `+N coins` (used by T9).
 * - `{synergyCardName}` — a second card's name, when the step references a
 *   synergy partner (used by T13: Library next to Bookshop).
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
 * English locale bundle for all 17 tutorial step strings.
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
    "Let's play!",


  // ── T1: Welcome ─────────────────────────────────────────────
  [tutorialKey('T1', 'title')]:
    'Welcome to Main Street',
  [tutorialKey('T1', 'body')]:
    'Build the best Main Street! I\'ll guide your first few actions.',

  // ── T2: Development Row (informative) ──────────────────────
  [tutorialKey('T2', 'title')]:
    'Development Row',
  [tutorialKey('T2', 'body')]:
    'This row shows businesses you can buy. Hover a card for more details.',

  // ── T3: Buy the Laundromat ─────────────────────────────────
  [tutorialKey('T3', 'title')]:
    'Buy the Laundromat',
  // {cardName}/{cost} are resolved from card-data.csv at render time via
  // resolveTutorialStepText() — do NOT hardcode the card name or price here.
  [tutorialKey('T3', 'body')]:
    'Click the **{cardName}** card to buy it for {cost}.',

  // ── T4: Your Hand ──────────────────────────────────────────
  [tutorialKey('T4', 'title')]:
    'Your Hand',
  [tutorialKey('T4', 'body')]:
    'Cards you buy wait here in your hand. You can play them any time. They earn nothing until placed.',

  // ── T5: Place a Business ───────────────────────────────────
  [tutorialKey('T5', 'title')]:
    'Place a Business',
  [tutorialKey('T5', 'body')]:
    'Click an empty slot to open the business. It starts earning income right away.',

  // ── T6: Upcoming Incidents ─────────────────────────────────
  [tutorialKey('T6', 'title')]:
    'Upcoming Incidents',
  [tutorialKey('T6', 'body')]:
    'The event at the top happens at the end of this turn; the ones below happen next turn. Some help you, some hurt you. Hover one for details.',

  // ── T7: End Turn ───────────────────────────────────────────
  [tutorialKey('T7', 'title')]:
    'End Turn',
  [tutorialKey('T7', 'body')]:
    'Click the End Turn button to collect income and start the next day.',

  // ── T8: Investments ────────────────────────────────────────
  [tutorialKey('T8', 'title')]:
    'Investments',
  [tutorialKey('T8', 'body')]:
    'Upgrade cards improve businesses you own. Event cards boost your street when played.',

  // ── T9: Buy the Local Festival ─────────────────────────────
  [tutorialKey('T9', 'title')]:
    'Buy the Local Festival',
  // {cardName}/{cost}/{bonus} resolved from card-data.csv (evt-festival) at render time.
  [tutorialKey('T9', 'body')]:
    'Click the **{cardName}** card to buy it for {cost}. It waits in your hand for the right moment.',

  // ── T10: Optimizing for Events ─────────────────────────────
  [tutorialKey('T10', 'title')]:
    'Optimizing for Events',
  // {cardName}/{cost} resolved from card-data.csv (biz-bookshop) at render time.
  // Revised to clarify drag-and-drop as a one-step buy-and-place option (CG-0MSOKG7HE001NMMM).
  [tutorialKey('T10', 'body')]:
    'The **{cardName}** is a Culture business. Culture businesses make your festival stronger. Drag it to an empty spot on your street to buy and place it in one action — or click to buy it first, then place it later.',

  // ── T11: End this turn ────────────────────────────────────
  [tutorialKey('T11', 'title')]:
    'End this turn',
  // {cardName} resolved from card-data.csv (evt-festival) at render time.
  // Emphasizes deliberately holding the festival for a more opportune moment (CG-0MSOKG89N001LDT4).
  [tutorialKey('T11', 'body')]:
    'We could play the **{cardName}** now, but we\'re going to wait for a more opportune moment. End this turn for now.',

  // ── T12: Costs and Reputation ──────────────────────────────
  [tutorialKey('T12', 'title')]:
    'Costs and Reputation',
  // {cardName} = cs-library — resolved from card-data.csv at render time.
  // Informative step (confirm gate): focuses exclusively on the Library's
  // running cost vs reputation trade-off. NO synergy mention here — the
  // Culture adjacency bonus is taught by the T13 action step.
  [tutorialKey('T12', 'body')]:
    'Some businesses cost coins to run but bring in customers. The **{cardName}** builds your reputation.',

  // ── T13: Build a Library ───────────────────────────────────
  [tutorialKey('T13', 'title')]:
    'Build a Library',
  // {cardName} = cs-library, {synergyCardName} = biz-bookshop — resolved from
  // card-data.csv at render time. The synergy system: placing the Library next
  // to the Bookshop (a Culture business) earns the Culture adjacency bonus.
  // Adjacency is 8-way (Chebyshev): placing the Library diagonally next to the
  // Bookshop counts just as much as orthogonally.
  [tutorialKey('T13', 'body')]:
    'The **{cardName}** brings a Culture bonus when placed next to other Culture cards. Buy it and place it next to **{synergyCardName}** — orthogonally or diagonally — to gain the bonus.',

  // ── T14: Triggering Events ─────────────────────────────────
  [tutorialKey('T14', 'title')]:
    'Triggering Events',
  // {cardName} resolved from card-data.csv (evt-festival) at render time.
  [tutorialKey('T14', 'body')]:
    'Two Culture businesses on your street power the festival. Click the **{cardName}** in your hand to play it.',

  // ── T15: Success and Failure ───────────────────────────────
  [tutorialKey('T15', 'title')]:
    'Success and Failure',
  [tutorialKey('T15', 'body')]:
    'The bar shows your coins, reputation, score, and target. Hover each to see how it is calculated.',

  // ── T16: Challenges ────────────────────────────────────────
  [tutorialKey('T16', 'title')]:
    'Challenges',
  [tutorialKey('T16', 'body')]:
    'Each game gives you challenges for bonus points. See them in the Challenge Tracker. Completing challenges unlocks new cards for future games!',

  // ── T17: Tutorial Complete ─────────────────────────────────
  [tutorialKey('T17', 'title')]:
    'Tutorial Complete',
  [tutorialKey('T17', 'body')]:
    'Great job! You are ready to play a full game. Find the tutorial again in the settings menu.',
} as const;

// Re-export helpers
// tutorialKey is already exported above;
// modalKey and overlayKey are new exports above.
