---
type: source
title: "Observation: Main Street merged hand: heldEvent folded into shared hand"
tags:
  - main-street
  - hand-view
  - heldEvent
  - merge
status: observation
created: 2026-08-08
updated: 2026-08-08
slug: obs-2026-08-08-main-street-merged-hand-heldevent-folded-into-shared-hand
relevance: high
observed_at: 2026-08-08T23:24:11.250Z
source_context: "Implementing CG-0MSKU0BE5003I2ZD: merge business hand + held event into one horizontal 3-card hand"
---

# ⭐ Observation: Main Street merged hand: heldEvent folded into shared hand

CG-0MSKU0BE5003I2ZD implemented: Main Street now uses a single merged HandView for the player hand — one horizontal row holding any mix of business and event cards up to maxHandSize (starts 2, growable via staff card handSlotsAdded). The old heldEvent field was removed from MainStreetState/MainStreetSerializedState with legacy-save migration folding heldEvent into hand. canPurchaseEvent no longer has a max-1-event rule; hand capacity (canAddToHand) is the only limit. placeFromHand/sellFromHand and legality checks defensively reject EventCard indices (events are played, never placed/sold). playHeldEvent(state, handIndex?) and resolveHeldInvestment resolve the first (or indexed) event in hand. Both getBusinessHandInsertionPosition and getEventHandInsertionPosition delegate to the single handView.getInsertionPosition. Commit 559bde78 on dev. All tests green, audit Ready to close: Yes.

*Relevance: high*
*Context: Implementing CG-0MSKU0BE5003I2ZD: merge business hand + held event into one horizontal 3-card hand*
*Tags: main-street hand-view heldEvent merge*

---
*Observed: 2026-08-08T23:24:11.250Z*
