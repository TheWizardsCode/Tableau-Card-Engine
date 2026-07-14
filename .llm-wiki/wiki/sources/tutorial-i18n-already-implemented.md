---
type: source
title: "Main Street tutorial i18n externalization already implemented"
slug: tutorial-i18n-already-implemented
status: insight
created: 2026-06-24
updated: 2026-06-24
---
# Main Street tutorial i18n externalization already implemented
Work item **CG-0MP415DUV0032SKK** (Main Street tutorial localization and i18n externalization) was already fully implemented in commit `76450222` which was already in the `dev` branch ancestry. Upon investigation:

- The core engine's `I18n.ts` module provides `t()`, `registerLocale()`, `setLocale()`, and `resetI18n()` APIs
- Tutorial step definitions in `TutorialFlow.ts` use `titleKey`/`bodyKey` i18n key references instead of hardcoded strings
- `example-games/main-street/i18n/tutorial-en.ts` contains all 13 tutorial steps + modal + overlay button strings, registered at module load
- `tests/main-street/tutorial-i18n.test.ts` has 16 tests verifying all keys exist, locale switching works, and `resolveTutorialStepText()` works correctly
- `docs/main-street/tutorial-localization.md` documents how to edit copy and add translations

The work item was stale (still `plan_complete` despite being implemented). Audit confirmed all 5 acceptance criteria met. Updated to `in_review` status.

---
*Captured: 2026-06-24*
## Related
_Add links to related pages._