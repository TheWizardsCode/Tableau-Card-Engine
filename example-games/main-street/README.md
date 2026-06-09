# Main Street

Main Street now uses the shared **Screen Layout Language (SLL)** as its canonical layout source.

## Layout files and adapter

- Canonical layout JSON: `example-games/main-street/layouts/main-street.layout.json`
- Tutorial layout JSON: `example-games/main-street/layouts/main-street-tutorial.layout.json`
  - Defines 7 bounding-box zones for tutorial highlight areas (HUD, market, street, etc.)
  - Uses optional `w`/`h` dimensions on `NormalizedRect` for zone extents
  - Composed with the base layout via `composeResolvedLayouts()` in the tutorial system
- Scene adapter: `example-games/main-street/scenes/MainStreetLayoutAdapter.ts`
- Renderer entrypoint: `example-games/main-street/scenes/MainStreetRenderer.ts`

`MainStreetRenderer.computeLayout()` computes legacy layout metrics first, then applies SLL zone overrides through `computeMainStreetLayoutWithSll(...)`.

## Migration behavior and fallback

Main Street uses `adaptLayoutWithFallback(...)` to keep migration safe:

- If SLL layout parsing/mapping succeeds, SLL-derived zone coordinates are used.
- If layout is missing/invalid or mapping fails, legacy `computeLayout` values are used.

This keeps existing gameplay and regression tests stable during rollout.

## Testing layout behavior

```bash
# Schema and mapping contracts
npx vitest run tests/ui/screen-layout-schema.test.ts tests/ui/screen-layout-mapping.test.ts --project unit

# Main Street browser/layout coverage
npx vitest run tests/main-street/MainStreetLayoutAnchors.browser.test.ts --project browser
npx vitest run tests/main-street/MainStreetScene.browser.test.ts --project browser

# Replay-based canonical resolution assertion
npx vitest run tests/e2e/replay-main-street.e2e.test.ts --project unit
```

## Follow-up work

The tutorial overlay system (`MainStreetTutorialHints.ts`) currently uses `zoneToAnchor()` with
per-zone pixel-math to compute highlight bounding boxes. A follow-up work item tracks migrating
this to resolve zones directly through the composed SLL layout:

- **Adapt tutorial system to use layout description (CG-0MP7IZ4RK008065O)**
  - Will refactor `zoneToAnchor()` to use `composeResolvedLayouts(baseLayout, tutorialLayout)`
  - Replaces hardcoded pixel-math with SLL-resolved bounding boxes
  - Zone names align with those in `main-street-tutorial.layout.json`

## Milestone 5: Tutorial, Onboarding, and Game Selector Integration

Main Street Milestone 5 (CG-0MOY5TOJK008JFJM) adds a first-time player onboarding experience:

### Tutorial State and Persistence

- **Module:** `TutorialState.ts` — typed schema (`MainStreetTutorialStateV1`), localStorage persistence, eligibility logic.
- **Storage key:** `tce-main-street-tutorial-state`
- **Statuses:** `not_seen`, `skipped`, `completed`
- **Legacy bridge:** compatible with existing `campaign.tutorialSeen` flag.

### Tutorial Offer Modal

- **Module:** `scenes/TutorialOfferModal.ts` — first-launch modal with Start/Skip options.
- Blocks gameplay until player chooses Start or Skip.
- Replay mode and test harnesses can suppress via `disableTutorial` or `replayMode` flags.

### Action-Gated Tutorial Flow

- **Module:** `TutorialFlow.ts` — T1-T10 step definitions with pure progression controller.
- Each step gates on a specific player action (confirm, select-business, place-business, end-turn, etc.)
- Invalid actions show: "Complete the highlighted step first."

### Help/Rules Panel

- Updated to 6 PRD-required sections: How to Play, Card Types, Synergy and Placement, Turn Flow, Win/Loss Conditions, Tools.
- Each section has <= 8 lines of concise English-only copy.

### Game Selector Integration

- Main Street registered with PRD-specified metadata in `main.ts` GAMES array.
- Tested via `tests/main-street/game-selector-integration.test.ts`.

### Deferred

- Optional statistics tracking deferred to future milestone (CG-0MPLR9E10003L6K6).
