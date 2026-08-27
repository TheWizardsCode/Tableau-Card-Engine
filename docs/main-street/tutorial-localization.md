# Tutorial Localization Guide

The Main Street tutorial system externalises all user-facing copy through the
core engine's [i18n module](../../src/core-engine/I18n.ts). This means tutorial
text can be translated and reviewed without editing gameplay code.

## Architecture

Tutorial step definitions in [`TutorialFlow.ts`](../../example-games/main-street/TutorialFlow.ts)
no longer contain inline string literals for titles and bodies. Instead, each
step carries an i18n **key**:

```ts
// Before (hardcoded)
{ id: 'T1', title: 'Welcome to Main Street', body: '...' }

// After (i18n key)
{ id: 'T1', titleKey: 'tutorial.T1.title', bodyKey: 'tutorial.T1.body' }
```

The actual string values are stored in **locale bundles** — currently just
English in [`tutorial-en.ts`](../../example-games/main-street/i18n/tutorial-en.ts).

At runtime, the overlay manager ([`MainStreetTutorialHints`](../../example-games/main-street/scenes/MainStreetTutorialHints.ts))
calls `t(key)` to resolve the active locale's string for each step. The
English bundle is registered at module load time, so it is always available
as a fallback.

### Card-data placeholders

Step bodies that reference card facts (card **name**, **cost**, or **income
bonus**) MUST use placeholder tokens instead of hardcoded values.  The
placeholders are substituted with live values from `card-data.csv` at render
time, so rebalancing card data never leaves the tutorial stale.

| Placeholder | Resolved from | Example |
|-------------|---------------|---------|
| `{cardName}` | card's `name` column | `Laundromat` |
| `{cost}` | card's `cost` column via `formatCurrency()` | `€4` |
| `{bonus}` | event card's `coinDelta` as `+N coins` | `+2 coins` |

Example (T3 body in `tutorial-en.ts`):

```ts
[tutorialKey('T3', 'body')]:
  'Buy the **{cardName}** card from the Development row for {cost}. ...',
```

#### How placeholders are resolved

1. `resolveTutorialStepText(step)` in `TutorialFlow.ts` calls
   `resolveTutorialCardParams(step)`.
2. The step's `requiredCardId` (purchase-gated steps like T3/T9) or
   `referencedCardId` (text-only references like T7/T9) provides the card
   lookup key (e.g. `biz-laundromat-0`).
3. `getBaseTypeId()` strips the copy suffix (`biz-laundromat`) and
   `getCsvRows()` finds the matching row in the live `card-data.csv`.
4. `formatCurrency()` formats the cost and the params are passed to
   `t(key, params)` in the core i18n module, which interpolates the
   `{token}` placeholders.
5. If a referenced card is missing from the CSV, resolution **throws** —
   the tutorial fails loudly rather than rendering raw `{token}` text.

The overlay manager renders the resolved text in both DOM and Phaser modes
via `resolveTutorialStepText(step)`, so both render paths stay in sync with
card data.

### Key naming convention

All tutorial step keys follow the pattern:

```
tutorial.<STEP_ID>.<field>
```

Where:
- `<STEP_ID>` is the step identifier (e.g. `T1`, `T3`, `T13`)
- `<field>` is `title` or `body`

Examples:
- `tutorial.T1.title`
- `tutorial.T3.body`
- `tutorial.T13.title`

The `tutorialKey()` helper function constructs these keys:

```ts
import { tutorialKey } from '../../example-games/main-street/i18n/tutorial-en';

tutorialKey('T3', 'title'); // → 'tutorial.T3.title'
```

### Offer modal and overlay button keys

The tutorial offer modal and overlay button labels are also externalized:

| Key pattern | Description | Example value (English) |
|------------|-------------|------------------------|
| `tutorial.modal.title` | Offer modal title | `Welcome to Main Street!` |
| `tutorial.modal.body` | Offer modal body text | `Would you like a tour to learn the basics of Main Street?` |
| `tutorial.modal.skipBtn` | Skip button label | `Skip` |
| `tutorial.modal.startBtn` | Start Tutorial button | `Start Tutorial` |
| `tutorial.overlay.dismiss` | Dismiss overlay button | `Dismiss` |
| `tutorial.overlay.next` | Next step button | `Next >` |
| `tutorial.overlay.exit` | Exit tutorial button | `Exit Tutorial` |
| `tutorial.overlay.startFullGame` | Start full game button | `Let's play!` |

Helper functions:

```ts
import { modalKey, overlayKey } from '../../example-games/main-street/i18n/tutorial-en';

modalKey('title');     // → 'tutorial.modal.title'
overlayKey('dismiss'); // → 'tutorial.overlay.dismiss'
```

## Updating Tutorial Copy

### Plain-language guidelines

Tutorial text follows these editorial principles:

- **Reading level:** ~10-year-old reading level (Flesch-Kincaid Grade Level ≤ 5-6)
- **Sentence limit:** **≤3 sentences per text box** (titles and bodies), each box
  communicating **exactly one point** (23-step flow editorial rule)
- **Word count:** Each step body under 50 words (soft boundary — conciseness preferred)
- **Concepts:** At most 1–2 distinct gameplay concepts per step (soft boundary)
- **Plain language:** Short sentences, common words, active voice, no jargon without explanation
- **Consistency:** Use consistent terminology across all steps (e.g. "Coins" not "gold", "turns" not "days")

### Content rules for the 23-step two-turn flow

- Do NOT mention time-limited play (the "25 turns" sentence was removed from T1).
- Do NOT describe incident cards as "blue" or list their impacts in Upcoming Incidents.
- Do NOT mention matching cards in the Place a Business step.

### Step flow (23 steps, T1–T23)

| # | ID | Title | Gate | Highlight zone |
|---|----|-------|------|----------------|
| 1 | T1 | Welcome to Main Street | confirm | centerModal |
| 2 | T2 | The Market Row | confirm | developmentRow (single market row) |
| 3 | T3 | Move the Laundromat to hand | action (select-business) | laundromatCard (card-level) |
| 4 | T4 | Your Hand | confirm | hand |
| 5 | T5 | Upcoming Incidents | confirm | incidentQueue |
| 6 | T6 | End Turn (day 1 → 2) | action (end-turn) | endTurnButton |
| 7 | T7 | Place the Laundromat (listed $4) | action (place-business) | streetGrid |
| 8 | T8 | More than Businesses | confirm | investmentsRow (aliases the single market row) |
| 9 | T9 | Buy the Local Festival | action (buy-event) | festivalCard (card-level) |
| 10 | T10 | End this turn (day 2 → 3) | action (end-turn) | endTurnButton |
| 11 | T11 | Move the Bookshop to hand | action (select-business) | developmentRow |
| 12 | T12 | Costs and Reputation | confirm (informative) | developmentRow |
| 13 | T13 | Community Favour | action (community-favour, rep→coins) | actionButtons (action bar) |
| 14 | T14 | End this turn (day 3 → 4) | action (end-turn) | endTurnButton |
| 15 | T15 | Place the Bookshop (listed $3) | action (place-business) | streetGrid |
| 16 | T16 | End this turn (day 4 → 5) | action (end-turn) | endTurnButton |
| 17 | T17 | Move the Library to hand | action (select-business) | developmentRow |
| 18 | T18 | End this turn (day 5 → 6) | action (end-turn) | endTurnButton |
| 19 | T19 | Build a Library next to the Bookshop (listed $7) | action (place-business + synergy) | streetGrid |
| 20 | T20 | Triggering Events | action (play-event) | hand |
| 21 | T21 | Success and Failure | confirm | hud (scoring bar) |
| 22 | T22 | Challenges | confirm | challengePanel |
| 23 | T23 | Tutorial Complete | confirm | completionModal |

Every purchase is a **two-turn plan-ahead flow** (CG-0MT53NXGZ004H5AE): move a
card to hand on day N (its one action), End Turn, then place it from hand on day
N+1 at its **listed cost** (another action). No same-day composite step exists,
so no +50% premium is ever scripted. T12 (Costs and Reputation) is an
informative step that introduces the Library's running cost vs reputation
trade-off; the Culture synergy rule (place the Library next to the Bookshop) is
taught by T19. T13 teaches the Community Favour rep→coins exchange
(CG-0MSTOATDQ005XDET) — useful but not strictly required in the two-turn budget.
Gate count: 9 confirm + 14 action = 23.

Card-level highlight zones (`laundromatCard`, `festivalCard`) are resolved through
`resolveMarketCardAnchor()` in `MainStreetTutorialHints.ts` using the deterministic
tutorial-scenario market slots, not hardcoded pixel positions.

### Scenario budget (Easy / 12 coins)

The tutorial runs the **Easy** preset with a **12-coin starting budget**. The
two-turn flow places each card the day after its move at **listed cost** (no
same-day premium), so every balance stays positive (CG-0MT53NXGZ004H5AE):

| Step | Action | Coins In | Coins Out | Balance |
|------|--------|----------|-----------|---------|
| T1   | Start (Easy, 12 coins) | 12 | 0 | 12 |
| T3   | Move Laundromat to hand (free) | 0 | 0 | 12 |
| T6   | End Turn (held-card cost -1) | 0 | 1 | 11 |
| T7   | Place Laundromat (listed $4) | 0 | 4 | 7 |
| T9   | Move Local Festival to hand (free) | 0 | 0 | 7 |
| T10  | End Turn + income (~2.15) | 2.154 | 0 | 9.154 |
| T11  | Move Bookshop to hand (free) | 0 | 0 | 9.154 |
| T13  | Community Favour (2 rep → 3 coins) | 3 | 0 | 12.154 |
| T14  | End Turn + income (~1.33) | 1.333 | 0 | 13.487 |
| T15  | Place Bookshop (listed $3) | 0 | 3 | 10.487 |
| T16  | End Turn + income (~3.91) | 3.911 | 0 | 14.398 |
| T17  | Move Library to hand (free) | 0 | 0 | 14.398 |
| T18  | End Turn + income (~3.92) | 3.918 | 0 | 18.316 |
| T19  | Place Library (listed $7) | 0 | 7 | 11.316 |
| T20  | Play Local Festival ($3, +4 culture) | 1 | 0 | 12.316 |

All placements are at listed cost because each follows an End Turn
(plan-ahead). The deterministic 5-incident deck (Community Award ×3, Rainy Day
×2 — both non-negative on the tutorial street) never drains the balance. The
authoritative walkthrough lives in the `Coin Budget (Easy / 12 coins)` table in
`example-games/main-street/TutorialScenario.ts`.

### Changing existing text

1. Open [`i18n/tutorial-en.ts`](../../example-games/main-street/i18n/tutorial-en.ts).
2. Find the key for the string you want to update (e.g. `tutorial.T3.body`).
3. Change the string value.
4. The change takes effect immediately — no gameplay code changes needed.

**Never hardcode card facts.** If the text references a card's name, cost, or
income bonus, keep the `{cardName}` / `{cost}` / `{bonus}` placeholder tokens
in place and let the resolver inject the live values from `card-data.csv`.
Hardcoding a value (e.g. writing `€4` or `Laundromat` directly) will go stale
whenever the card is rebalanced.  Do not change a card's name or price in
the tutorial text — change `card-data.csv` instead; the tutorial follows
automatically.

For offer modal or button label changes:

1. Open [`i18n/tutorial-en.ts`](../../example-games/main-street/i18n/tutorial-en.ts).
2. Find the relevant `tutorial.modal.*` or `tutorial.overlay.*` key.
3. Update the value.
4. The change takes effect immediately.

### Verification

Run the i18n tests to confirm all keys resolve:

```bash
npx vitest run tests/main-street/tutorial-i18n.test.ts
npx vitest run tests/main-street/tutorial-text-updates.test.ts
npx vitest run tests/main-street/tutorial-flow.test.ts
```

The build will also fail if any step key is missing from the English bundle.

## Adding a New Language

1. Create a new locale bundle file, e.g. `example-games/main-street/i18n/tutorial-fr.ts`:

   ```ts
   import { tutorialKey } from './tutorial-en';

   export const TUTORIAL_FR_BUNDLE: Record<string, string> = {
     [tutorialKey('T1', 'title')]: 'Bienvenue à Main Street',
     [tutorialKey('T1', 'body')]: 'Construisez la meilleure rue...',
     // ... all other steps
   };
   ```

   **Keep placeholder tokens in translated strings.**  Any step that uses
   `{cardName}` / `{cost}` / `{bonus}` in English must keep the same tokens
   in the same positions in the translation — the resolver substitutes the
   live card-data values regardless of locale.  The surrounding prose can
   be translated freely; the tokens themselves must match exactly.

2. Register the bundle at a suitable startup point. The overlay manager
   currently registers English at module load time. You can register additional
   locales alongside it, or switch the active locale based on a user setting:

   ```ts
   import { registerLocale } from '../../../src/core-engine/I18n';
   import { TUTORIAL_FR_BUNDLE } from '../i18n/tutorial-fr';

   registerLocale('fr', TUTORIAL_FR_BUNDLE);
   ```

3. Switch the active locale:

   ```ts
   import { setLocale } from '../../../src/core-engine/I18n';
   setLocale('fr');
   ```

   All tutorial `t(key)` calls will now resolve to the French bundle.
   Any keys not present in the French bundle will fall back to English.

### Partial translations

Locale bundles can be partial — missing keys automatically fall back to
the English bundle. This lets translators incrementally localise steps
without needing to provide every string upfront.

Example (French with only T1 translated):

```ts
registerLocale('fr', {
  [tutorialKey('T1', 'title')]: 'Bienvenue à Main Street',
});
setLocale('fr');
t(tutorialKey('T1', 'title')); // → 'Bienvenue à Main Street'
t(tutorialKey('T2', 'title')); // → 'The Market Row' (English fallback)
```

> **Note:** fallback strings that contain placeholder tokens (e.g. a partial
> French bundle falling back to the English T3 body) are still interpolated
> with live card data — placeholder resolution happens after the locale
> lookup, so card facts are always current regardless of which locale bundle
> supplied the string.

## Test Coverage

The following test files cover tutorial localization:

| Test file | What it verifies |
|-----------|-----------------|
| `tests/main-street/tutorial-i18n.test.ts` | All keys exist in English bundle; locale switching; `resolveTutorialStepText()` correctness; per-locale placeholder interpolation |
| `tests/main-street/tutorial-text-updates.test.ts` | Data-driven text content (T3 cost matches `card-data.csv`; no raw `{token}` text; changed cost ⇒ updated text; deterministic resolution; T7/T8/T9 placeholders) |
| `tests/main-street/tutorial-flow.test.ts` | Step definitions have non-empty `titleKey`/`bodyKey`; `resolveTutorialStepText()` returns non-empty text |
| `tests/core-engine/I18n.test.ts` | Core `t(key, params)` interpolation: substitution, missing-placeholder failure, locale fallback |

## Overview of Relevant Files

| File | Purpose |
|------|---------|
| `example-games/main-street/TutorialFlow.ts` | Step definitions (keys + `requiredCardId`/`referencedCardId`), controller logic, `resolveTutorialStepText()` data-driven resolution |
| `example-games/main-street/i18n/tutorial-en.ts` | English locale bundle with all title/body values; `{cardName}`/`{cost}`/`{bonus}` placeholders for card facts |
| `example-games/main-street/MainStreetCards.ts` | Live card templates parsed from `card-data.csv` (`getCsvRows()`, `getBaseTypeId()`) |
| `example-games/main-street/scenes/MainStreetTutorialHints.ts` | Overlay manager — resolves via `resolveTutorialStepText()` at render time (DOM + Phaser) |
| `src/core-engine/I18n.ts` | Core i18n lookup + `t(key, params)` placeholder interpolation |
| `tests/main-street/tutorial-i18n.test.ts` | i18n-specific test coverage |
| `tests/core-engine/I18n.test.ts` | Interpolation unit tests |
