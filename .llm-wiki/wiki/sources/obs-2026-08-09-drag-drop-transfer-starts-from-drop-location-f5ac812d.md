---
type: source
title: "Observation: Drag-drop transfer starts from drop location (f5ac812d)"
tags:
  - main-street
  - drag-drop
  - animation
status: observation
created: 2026-08-09
updated: 2026-08-09
slug: obs-2026-08-09-drag-drop-transfer-starts-from-drop-location-f5ac812d
relevance: high
observed_at: 2026-08-09T00:56:07.096Z
source_context: Fixing CG-0MSL2WE0Q007HN8L drag-drop transfer origin
---

# ⭐ Observation: Drag-drop transfer starts from drop location (f5ac812d)

Fixed CG-0MSL2WE0Q007HN8L (pushed f5ac812d): the Main Street drag-to-buy transfer animation used to create its visual at the market card's slot origin (getMarketCardCenter) even though the dragged container had followed the pointer to the drop location — the card visibly jumped back to the market row before flying to the street slot. Fix: MainStreetAnimator.animateTransferFromMarket gained an optional source {x,y} (defaults to market centre so click/AI flows are unchanged); MainStreetTurnController.onDragDropBusiness captures payload.gameObject.x/y — the container position at drop, which equals the pointer drop position since handleDrag sets object x/y to pointer coords — BEFORE s.refreshAll() recreates the container at its anchor. Regression coverage: unit test asserts opts.source == drop position; browser test samples scene.activeTransferVisuals ~300ms after drop (within the 1500ms tween, before the transfer completes and destroys the visual) and asserts the visual y is near the street slot centre and far from the market row.

*Relevance: high*
*Context: Fixing CG-0MSL2WE0Q007HN8L drag-drop transfer origin*
*Tags: main-street drag-drop animation*

---
*Observed: 2026-08-09T00:56:07.096Z*
