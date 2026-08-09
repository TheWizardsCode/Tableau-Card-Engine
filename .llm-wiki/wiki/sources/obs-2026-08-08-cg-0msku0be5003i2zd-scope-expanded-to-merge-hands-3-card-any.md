---
type: source
title: "Observation: CG-0MSKU0BE5003I2ZD scope expanded to merge hands + 3-card any-mix limit"
tags:
  - main-street
  - hand-layout
  - merge
  - heldEvent
  - work-item
status: observation
created: 2026-08-08
updated: 2026-08-08
slug: obs-2026-08-08-cg-0msku0be5003i2zd-scope-expanded-to-merge-hands-3-card-any
relevance: high
observed_at: 2026-08-08T21:04:26.651Z
source_context: Updating work item CG-0MSKU0BE5003I2ZD after operator merge decision
---

# ⭐ Observation: CG-0MSKU0BE5003I2ZD scope expanded to merge hands + 3-card any-mix limit

Operator expanded the scope of CG-0MSKU0BE5003I2ZD (Main Street hand layout) from a display-only baseY fix to a full merge: two HandViews (business hand at y=620 + held event hand at y=660) fold into a SINGLE HandView rendering one horizontal row of up to 3 cards, any combination of business and/or event — the 'max 1 held Investment event' rule (heldEvent !== null check in canPurchaseEvent, MainStreetMarket.ts ~line 240) is removed. State-model impact: MainStreetState.heldEvent: EventCard | null likely removed (20+ references across State, Engine, Market, Commands, AiStrategy, Hint, MonteCarlo, TutorialScenario); events appended after business cards in state.hand so business indices 0..n-1 stay valid. Open question for operator: does maxHandSize (default 2, growable via upgrade handSlotsAdded) stay a hard 3-cap or grow beyond 3? Updated effort estimate: Small→ ~14h recommended (O=3, M=6, P=10), risk Low. Title changed to 'Main Street: merge business hand + held event into one horizontal 3-card hand'.

*Relevance: high*
*Context: Updating work item CG-0MSKU0BE5003I2ZD after operator merge decision*
*Tags: main-street hand-layout merge heldEvent work-item*

---
*Observed: 2026-08-08T21:04:26.651Z*
