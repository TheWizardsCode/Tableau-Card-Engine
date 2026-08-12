---
type: source
title: "Main Street merged-hand plan: review found 2 completeness gaps"
status: insight
category: planning
created: 2026-08-08
updated: 2026-08-08
slug: main-street-merge-hand-plan-review-gaps
---

# Main Street merged-hand plan: review found 2 completeness gaps

Planning CG-0MSKU0BE5003I2ZD (Main Street merge business hand + held event into one horizontal 3-card hand) auto-completed via the skip path (effort Small, risk Low). The six-stage review found two description completeness gaps that were fixed before plan_complete:

1. **Key Files omissions** — `MainStreetSvgTextureManager.ts` (visible-template collection, ~line 123) and `MainStreetInputManager.ts` (hinted-card id, ~line 80) both reference `state.heldEvent` but weren't in the Key Files list; also ~14 unit test files set/assert `heldEvent` (activity-log, ai-strategy, expanded-card-pool, game-state, hint, integration, market, market-extraction-parity, refresh-development, save-load, smoke-scenario, svg-texture-cache-invalidation, tutorial-scenario, turnflow) plus `tests/e2e/main-street-headless.e2e.test.ts`.
2. **Type-widening implication** — `state.hand` must widen from `BusinessCard[]` to `(BusinessCard | EventCard)[]` in both `MainStreetState` and `MainStreetSerializedState`, and `placeFromHand`/`sellFromHand` must defensively reject EventCard indices (events are played, never placed on the street or sold).

Key design anchors for implementation: events appended LAST in `state.hand` so business indices 0..n-1 stay valid; single `HandView` at shared baseY; `customClickFn` dispatches by merged index; `getInsertionPosition` remains the single source of truth for buy-transfer destinations. maxHandSize stays Option B (start 2, growable via handSlotsAdded). Related wiki: [[obs-2026-08-08-cg-0msku0be5003i2zd-scope-expanded-to-merge-hands-3-card-any]], [[obs-2026-08-08-main-street-merged-hand-maxhandsize-option-b-start-2-growabl]].

*Category: planning*

---
*Captured: 2026-08-08*

## Related

_Add links to related pages._
