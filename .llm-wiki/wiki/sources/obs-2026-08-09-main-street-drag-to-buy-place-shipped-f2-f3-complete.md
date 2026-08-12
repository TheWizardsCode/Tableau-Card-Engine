---
type: source
title: "Observation: Main Street drag-to-buy/place shipped (F2+F3 complete)"
tags:
  - main-street
  - drag-drop
  - core-engine
status: observation
created: 2026-08-09
updated: 2026-08-09
slug: obs-2026-08-09-main-street-drag-to-buy-place-shipped-f2-f3-complete
relevance: high
observed_at: 2026-08-09T00:20:41.683Z
source_context: Implementing CG-0MSKSAREE007AYSZ F2/F3
---

# ⭐ Observation: Main Street drag-to-buy/place shipped (F2+F3 complete)

CG-0MSKSAREE007AYSZ children F2 (CG-0MSKT0RIV0039LX0, Main Street drag-to-buy/place) and F3 (CG-0MSKT0RJC003VA7Z, docs) are complete and pushed to dev (f4f73acb, 55897e74). Design: business-card market containers get container-level input (registerDraggable with local hitArea rect); click-vs-drag coexistence via pointerup distance check against input.dragDistanceThreshold (5); drop zones registered ONLY on empty street slots (setRectangleDropZone + canAccept validation); pickup veto + invalid drop both use the F1 module's default illegal feedback (container-safe shake + sfx-illegal-move). SFX_KEYS.ILLEGAL_MOVE added to MainStreetConstants; illegal-move WAV loaded from assets/audio/default (raw + namespaced keys, BC pattern). Tests: tests/main-street/drag.test.ts (16 unit) + drag.browser.test.ts (5 browser).

*Relevance: high*
*Context: Implementing CG-0MSKSAREE007AYSZ F2/F3*
*Tags: main-street drag-drop core-engine*

---
*Observed: 2026-08-09T00:20:41.683Z*
