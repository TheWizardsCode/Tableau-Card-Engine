/**
 * Main Street Tutorial — English locale bundle.
 *
 * Contains all user-facing string values for:
 * - T1–T23 tutorial step titles and bodies
 * - Tutorial offer modal (title, body, skip/start buttons)
 * - Tutorial overlay buttons (dismiss, next, exit, start full game)
 *
 * The i18n keys follow these conventions:
 * - Step text: `tutorial.<stepId>.title` and `tutorial.<stepId>.body`
 * - Modal: `tutorial.modal.<field>`
 * - Overlay: `tutorial.overlay.<field>`
 *
 * ## Editorial rules (23-step flow, two-turn plan-ahead)
 *
 * - **≤3 sentences per text box** (titles and bodies), exactly one point per box.
 * - Do NOT mention time-limited play (the "25 turns" sentence was removed).
 * - Do NOT describe incident cards as "blue" or list their impacts.
 * - Do NOT mention matching cards in the Place a Business step.
 * - Do NOT promise same-turn placement at listed cost: every purchase is a
 *   two-turn flow (CG-0MT53NXGZ004H5AE) — move to hand today (one action),
 *   End Turn, place tomorrow at LISTED cost. Same-day placement after a move
 *   costs the +50% premium (CG-0MT24X0SX007RLHN) and is never scripted.
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
    'The Market Row',
  [tutorialKey('T2', 'body')]:
    'This row shows the cards on offer this week. Hover a card for more details.',

  // ── T3: Buy the Laundromat ─────────────────────────────────
  [tutorialKey('T3', 'title')]:
    'Buy the Laundromat',
  // {cardName}/{cost} are resolved from card-data.csv at render time via
  // resolveTutorialStepText() — do NOT hardcode the card name or price here.
  // Cost-at-play (CG-0MSTOATDT009BRX2): picking the card up is free; the
  // price is paid when the card is placed on the street. Two-turn plan-ahead
  // (CG-0MT53NXGZ004H5AE): taking the card uses today's ONE action; you'll
  // end the turn and place it tomorrow at its LISTED cost. Same-turn
  // placement after the move would cost +50% premium (CG-0MSTOF1N5005PK2R).
  [tutorialKey('T3', 'body')]:
    "Click the **{cardName}** card to buy it — taking it is free now, but it uses today's **one action**. You'll end the turn and place it tomorrow for its listed **{cost}**.",

  // ── T4: Your Hand ──────────────────────────────────────────
  [tutorialKey('T4', 'title')]:
    'Your Hand',
  [tutorialKey('T4', 'body')]:
    'Cards you take wait here in your hand. They earn nothing until placed. Place them tomorrow — the listed price costs an action then, and it is far cheaper than rushing today.',

  // ── T5: Upcoming Incidents (moved before the first End Turn) ──
  // Face-down incident deck (CG-0MSTOATDP000JNHH): incidents are hidden in
  // a deck — the player sees only the remaining count; the top card is
  // revealed and resolved at the end of each turn. A peek staff member
  // (staff-lookout) can look at the top card once per turn as an action.
  // CG-0MT53NXGZ004H5AE moved this informational step before T6 End Turn.
  [tutorialKey('T5', 'title')]:
    'Upcoming Incidents',
  [tutorialKey('T5', 'body')]:
    'Incidents hide in a face-down deck \u2014 you see only how many are left, not what is next. The top card is revealed and resolved at the end of each turn. Some help you, some hurt you; a peek staff member can look at the top card once per turn.',

  // ── T6: End Turn (day 1 → day 2) ───────────────────────────
  [tutorialKey('T6', 'title')]:
    'End Turn',
  [tutorialKey('T6', 'body')]:
    'End the day to collect income and start the next one. The card you took waits in your hand overnight.',

  // ── T7: Place a Business (day 2 — listed cost) ─────────────
  [tutorialKey('T7', 'title')]:
    'Place a Business',
  [tutorialKey('T7', 'body')]:
    'The card waited in your hand overnight. Click it in your hand, then click an empty slot on the street to place it and pay its listed **cost**. It starts earning income right away.',

  // ── T8: Investments ────────────────────────────────────────
  [tutorialKey('T8', 'title')]:
    'More than Businesses',
  [tutorialKey('T8', 'body')]:
    'The market row can also hold upgrade cards, which improve businesses you own, and event cards, which boost your street when played.',

  // ── T9: Buy the Local Festival ─────────────────────────────
  [tutorialKey('T9', 'title')]:
    'Buy the Local Festival',
  // {cardName}/{cost}/{bonus} resolved from card-data.csv (evt-festival) at render time.
  [tutorialKey('T9', 'body')]:
    'Click the **{cardName}** card to add it to your hand — free now, and you pay **{cost}** when you play it. It waits in your hand for the right moment.',

  // ── T10: End this turn (day 2 → day 3) ────────────────────
  [tutorialKey('T10', 'title')]:
    'End this turn',
  // {cardName} resolved from card-data.csv (evt-festival) at render time.
  // Emphasizes deliberately holding the festival for a more opportune moment (CG-0MSOKG89N001LDT4).
  [tutorialKey('T10', 'body')]:
    'We could play the **{cardName}** now, but we\'re going to wait for a more opportune moment. End this turn for now.',

  // ── T11: Move the Bookshop to hand (day 3, split 1 of 2) ──
  [tutorialKey('T11', 'title')]:
    'Move the Bookshop to hand',
  // {cardName}/{cost} resolved from card-data.csv (biz-bookshop) at render time.
  // Two-turn plan-ahead (CG-0MT53NXGZ004H5AE): taking the Bookshop to hand
  // uses today's one action; placing it today would cost +50% premium
  // (CG-0MT24X0SX007RLHN), so we End the turn and place at listed cost
  // tomorrow (T15). Post-CG-0MSXIQIPJ000NDTL: no auto-select after the move.
  [tutorialKey('T11', 'body')]:
    'The **{cardName}** is a Culture business that makes your festival stronger. Move it to your hand for today\'s **one action** — you\'ll place it tomorrow at its listed **{cost}**, not a same-day premium.',

  // ── T12: Costs and Reputation ──────────────────────────────
  [tutorialKey('T12', 'title')]:
    'Costs and Reputation',
  // {cardName} = cs-library — resolved from card-data.csv at render time.
  // Informative step (confirm gate): focuses exclusively on the Library's
  // running cost vs reputation trade-off. NO synergy mention here — the
  // Culture adjacency bonus is taught by the T19 action step.
  [tutorialKey('T12', 'body')]:
    'Some businesses cost coins to run but bring in customers. The **{cardName}** builds your reputation.',

  // ── T13: Community Favour (CG-0MSTOATDQ005XDET) ─────────────
  // Teaches the free once-per-turn rep→coins exchange. In the two-turn
  // budget the conversion is NOT strictly required (income already covers
  // the Library), so the copy teaches the mechanic without a
  // "REQUIRED for the Library" claim (CG-0MT53NXGZ004H5AE).
  [tutorialKey('T13', 'title')]:
    'Community Favour',
  [tutorialKey('T13', 'body')]:
    'You can also turn reputation into coins: click the **2r → 3c** button in the action bar below — a FREE **Community Favour** exchange, once per turn.',

  // ── T14: End this turn (day 3 → day 4) ─────────────────────
  [tutorialKey('T14', 'title')]:
    'End this turn',
  // {cardName} resolved from card-data.csv (biz-bookshop) at render time.
  [tutorialKey('T14', 'body')]:
    'The **{cardName}** waits in your hand. End this turn to continue to tomorrow.',

  // ── T15: Place the Bookshop (day 4, split 2 of 2) ──────────
  [tutorialKey('T15', 'title')]:
    'Place the Bookshop',
  // {cardName}/{cost} resolved from card-data.csv (biz-bookshop) at render time.
  // Listed-cost placement from hand (plan-ahead); no same-day premium.
  [tutorialKey('T15', 'body')]:
    'Click the **{cardName}** in your hand, then click an empty slot on the street to place it at its listed **{cost}**. It starts earning income right away.',

  // ── T16: End this turn (day 4 → day 5) ─────────────────────
  [tutorialKey('T16', 'title')]:
    'End this turn',
  [tutorialKey('T16', 'body')]:
    'End the day to collect income from your street and start the next one.',

  // ── T17: Move the Library to hand (day 5, split 1 of 2) ────
  [tutorialKey('T17', 'title')]:
    'Move the Library to hand',
  // {cardName}/{cost} resolved from card-data.csv (cs-library) at render time.
  // Two-turn plan-ahead (CG-0MT53NXGZ004H5AE): moving the Library to hand
  // uses today's one action; it will be placed next day at listed $7 next to
  // the Bookshop (culture adjacency). Only ONE Culture partner is needed to
  // trigger the festival at T20, so holding it a day is safe.
  [tutorialKey('T17', 'body')]:
    'The **{cardName}** brings a Culture bonus when placed next to other Culture cards. Click it to move it to your hand — that\'s today\'s **one action**.',

  // ── T18: End this turn (day 5 → day 6) ─────────────────────
  [tutorialKey('T18', 'title')]:
    'End this turn',
  [tutorialKey('T18', 'body')]:
    'End the day to collect income and reach the Library\'s placement day.',

  // ── T19: Build a Library next to the Bookshop (day 6, split 2 of 2) ──
  [tutorialKey('T19', 'title')]:
    'Build a Library',
  // {cardName} = cs-library, {synergyCardName} = biz-bookshop — resolved from
  // card-data.csv at render time. The synergy system: placing the Library next
  // to the Bookshop (a Culture business) earns the Culture adjacency bonus.
  // Adjacency is 8-way (Chebyshev): placing the Library diagonally next to the
  // Bookshop counts just as much as orthogonally. Listed-cost placement from
  // hand (plan-ahead) — no same-day premium for the $7 card.
  [tutorialKey('T19', 'body')]:
    'Click the **{cardName}** in your hand, then click a slot **next to {synergyCardName}** — orthogonally or diagonally — to place it at its listed cost and gain the Culture bonus.',

  // ── T20: Triggering Events ─────────────────────────────────
  [tutorialKey('T20', 'title')]:
    'Triggering Events',
  // {cardName} resolved from card-data.csv (evt-festival) at render time.
  [tutorialKey('T20', 'body')]:
    'Two Culture businesses on your street power the festival. Click the **{cardName}** in your hand to play it.',

  // ── T21: Success and Failure ───────────────────────────────
  [tutorialKey('T21', 'title')]:
    'Success and Failure',
  [tutorialKey('T21', 'body')]:
    'The bar shows your coins, reputation, score, and target. Hover each to see how it is calculated.',

  // ── T22: Challenges ────────────────────────────────────────
  [tutorialKey('T22', 'title')]:
    'Challenges',
  [tutorialKey('T22', 'body')]:
    'Each game gives you challenges for bonus points. See them in the Challenge Tracker. Completing challenges unlocks new cards for future games!',

  // ── T23: Tutorial Complete ─────────────────────────────────
  [tutorialKey('T23', 'title')]:
    'Tutorial Complete',
  [tutorialKey('T23', 'body')]:
    'There are many more things to discover as you play, but you have the basics now. Let\'s play.',

} as const;

// Re-export helpers
// tutorialKey is already exported above;
// modalKey and overlayKey are new exports above.
