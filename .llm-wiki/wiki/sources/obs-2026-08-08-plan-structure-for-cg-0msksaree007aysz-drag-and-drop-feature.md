---
type: source
title: "Observation: Plan structure for CG-0MSKSAREE007AYSZ drag-and-drop feature"
tags:
  - planning
  - main-street
  - drag-drop
  - core-engine
status: observation
created: 2026-08-08
updated: 2026-08-08
slug: obs-2026-08-08-plan-structure-for-cg-0msksaree007aysz-drag-and-drop-feature
relevance: high
observed_at: 2026-08-08T20:07:12.802Z
source_context: Planning CG-0MSKSAREE007AYSZ (Main Street drag-and-drop)
---

# ⭐ Observation: Plan structure for CG-0MSKSAREE007AYSZ drag-and-drop feature

Planned Main Street drag-to-buy/place work item (CG-0MSKSAREE007AYSZ) into 3 child features: F1 core-engine drag-drop module (CG-0MSKT0NQP0018KK6, src/ui/dragDrop.ts based on Beleaguered Castle's setupDragAndDrop pattern), F2 Main Street integration (CG-0MSKT0RIV0039LX0), F3 docs (CG-0MSKT0RJC003VA7Z). Dep edges F2→F1, F3→F1, BC refactor CG-0MSKSLDXQ008F5Y3→F1. Key facts verified: MS market cards are Containers with transparent hitArea + pointerdown (MainStreetRenderer.ts:1106); direct buy-to-slot exists via canPurchaseBusiness/purchaseBusiness/buyBusinessCommand (MainStreetMarket.ts:136/521, MainStreetCommands.ts:113); shakeIllegalMove plays COMMON_SFX_KEYS.ILLEGAL_MOVE automatically; BC uses dragDistanceThreshold=5 for click-vs-drag coexistence.

*Relevance: high*
*Context: Planning CG-0MSKSAREE007AYSZ (Main Street drag-and-drop)*
*Tags: planning main-street drag-drop core-engine*

---
*Observed: 2026-08-08T20:07:12.802Z*
