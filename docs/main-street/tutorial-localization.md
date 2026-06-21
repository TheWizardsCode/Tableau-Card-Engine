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

### Key naming convention

All tutorial keys follow the pattern:

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

## Updating Tutorial Copy

### Changing existing text

1. Open [`i18n/tutorial-en.ts`](../../example-games/main-street/i18n/tutorial-en.ts).
2. Find the key for the step you want to update (e.g. `tutorial.T3.body`).
3. Change the string value.
4. The change takes effect immediately — no gameplay code changes needed.

### Verification

Run the i18n tests to confirm all keys resolve:

```bash
npx vitest run tests/main-street/tutorial-i18n.test.ts
npx vitest run tests/main-street/tutorial-text-updates.test.ts
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

## Test Coverage

The following test files cover tutorial localization:

| Test file | What it verifies |
|-----------|-----------------|
| `tests/main-street/tutorial-i18n.test.ts` | All keys exist in English bundle; locale switching; `resolveTutorialStepText()` correctness |
| `tests/main-street/tutorial-text-updates.test.ts` | Specific text content via i18n (e.g. "Development Row", "Laundromat") |
| `tests/main-street/tutorial-flow.test.ts` | Step definitions have non-empty `titleKey`/`bodyKey`; `resolveTutorialStepText()` returns non-empty text |

## Overview of Relevant Files

| File | Purpose |
|------|---------|
| `example-games/main-street/TutorialFlow.ts` | Step definitions (keys only), controller logic |
| `example-games/main-street/i18n/tutorial-en.ts` | English locale bundle with all title/body values |
| `example-games/main-street/scenes/MainStreetTutorialHints.ts` | Overlay manager — resolves keys via `t()` at render time |
| `src/core-engine/I18n.ts` | Core i18n lookup module |
| `tests/main-street/tutorial-i18n.test.ts` | i18n-specific test coverage |
