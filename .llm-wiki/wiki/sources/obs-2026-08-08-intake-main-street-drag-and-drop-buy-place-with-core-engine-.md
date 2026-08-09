---
type: source
title: "Observation: Intake: Main Street drag-and-drop buy/place with core-engine drag module"
tags:
  - intake
  - main-street
  - drag-drop
  - core-engine
  - beleaguered-castle
status: observation
created: 2026-08-08
updated: 2026-08-08
slug: obs-2026-08-08-intake-main-street-drag-and-drop-buy-place-with-core-engine-
relevance: medium
observed_at: 2026-08-08T19:57:29.128Z
source_context: Intake for Main Street drag-and-drop buy-and-place feature
---

# 🔍 Observation: Intake: Main Street drag-and-drop buy/place with core-engine drag module

Completed intake for CG-0MSKSAREE007AYSZ (Main Street drag-and-drop buy-and-place of business cards). Key decisions: (1) same illegal sound (COMMON_SFX_KEYS.ILLEGAL_MOVE via shakeIllegalMove) for both cannot-buy and invalid-drop cases; (2) drag coexists with the existing click-to-buy -> click-to-place flow; (3) only business-family cards in the Development row are draggable, not community-space. Drag-drop lifecycle will be extracted into a reusable core-engine module (src/ui/dragDrop.ts, based on Beleaguered Castle logic in BeleagueredCastleScene.ts setupDragAndDrop + BeleagueredCastleRenderer.ts makeDraggable/snapBack). Child work item CG-0MSKSLDXQ008F5Y3 refactors Beleaguered Castle onto the shared module. Main Street drag uses the existing direct buy-to-slot path (canPurchaseBusiness/buyBusinessCommand, currently used by AI only). sfx-illegal-move WAV exists at public/assets/audio/default/illegal-move.wav but Main Street does not currently load it (must be added, namespace-scoped). Effort Medium (~40h), Risk Low.

*Relevance: medium*
*Context: Intake for Main Street drag-and-drop buy-and-place feature*
*Tags: intake main-street drag-drop core-engine beleaguered-castle*

---
*Observed: 2026-08-08T19:57:29.128Z*
