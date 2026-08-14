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
2. The step's `requiredCardId` (purchase-gated steps like T3/T8) or
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
  communicating **exactly one point** (17-step flow editorial rule)
- **Word count:** Each step body under 50 words (soft boundary — conciseness preferred)
- **Concepts:** At most 1–2 distinct gameplay concepts per step (soft boundary)
- **Plain language:** Short sentences, common words, active voice, no jargon without explanation
- **Consistency:** Use consistent terminology across all steps (e.g. "Coins" not "gold", "turns" not "days")

### Content rules for the 17-step flow

- Do NOT mention time-limited play (the "25 turns" sentence was removed from T1).
- Do NOT describe incident cards as "blue" or list their impacts in Upcoming Incidents.
- Do NOT mention matching cards in the Place a Business step.

### Step flow (17 steps, T1–T17)

| # | ID | Title | Gate | Highlight zone |
|---|----|-------|------|----------------|
| 1 | T1 | Welcome to Main Street | confirm | centerModal |
| 2 | T2 | Development Row | confirm | developmentRow (dev row only) |
| 3 | T3 | Buy the Laundromat | action (select-business) | laundromatCard (card-level) |
| 4 | T4 | Your Hand | confirm | hand |
| 5 | T5 | Place a Business | action (place-business) | streetGrid |
| 6 | T6 | Upcoming Incidents | confirm | incidentQueue |
| 7 | T7 | End Turn | action (end-turn) | endTurnButton |
| 8 | T8 | Investments | confirm | investmentsRow |
| 9 | T9 | Buy the Local Festival | action (buy-event) | festivalCard (card-level) |
| 10 | T10 | Optimizing for Events | action (buy-and-place) | developmentRow |
| 11 | T11 | End this turn | action (end-turn) | endTurnButton |
| 12 | T12 | Costs and Reputation | confirm (informative) | developmentRow |
| 13 | T13 | Build a Library | action (buy-and-place + synergy) | developmentRow |
| 14 | T14 | Triggering Events | action (play-event) | hand |
| 15 | T15 | Success and Failure | confirm | hud (scoring bar) |
| 16 | T16 | Challenges | confirm | challengePanel |
| 17 | T17 | Tutorial Complete | confirm | completionModal |

T12 (Costs and Reputation) is an informative step that introduces the Library's
running cost vs reputation trade-off; the buy-and-place action and the Culture
synergy rule (place the Library next to the Bookshop) moved to T13. Gate
count: 9 confirm + 8 action = 17.

Card-level highlight zones (`laundromatCard`, `festivalCard`) are resolved through
`resolveMarketCardAnchor()` in `MainStreetTutorialHints.ts` using the deterministic
tutorial-scenario market slots, not hardcoded pixel positions.

### Scenario budget (Easy / 16 coins)

The tutorial runs the **Easy** preset with a **16-coin starting budget** (raised
from the standard Easy 12 for the 17-step flow). The walkthrough spends exactly:

| Step | Action | Coins In | Coins Out | Balance |
|------|--------|----------|-----------|---------|
| T1   | Start (Easy, 16 coins) | 16 | 0 | 16 |
| T3   | Buy Laundromat ($4) | 0 | 4 | 12 |
| T7   | End Turn + income | 0.625 | 0 | 12.625 |
| T9   | Buy Local Festival ($3) | 0 | 3 | 9.625 |
| T10  | Buy-and-place Bookshop ($3) | 0 | 3 | 6.625 |
| T11  | End Turn + income | 1.25 | 0 | 7.875 |
| T12  | Confirm (no cost) | 0 | 0 | 7.875 |
| T13  | Buy Library ($7) | 0 | 7 | 0.875 |

T14+ are confirm-only steps (no cost), so the balance never drops below 0.875.
The authoritative walkthrough lives in the `Coin Budget (Easy / 16 coins)` table
in `example-games/main-street/TutorialScenario.ts`.

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
t(tutorialKey('T2', 'title')); // → 'Resource HUD' (English fallback)
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
