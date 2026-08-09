---
type: source
title: "Observation: Main Street merged hand: maxHandSize Option B, start 2, growable"
tags:
  - main-street
  - hand-layout
  - maxHandSize
  - decision
status: observation
created: 2026-08-08
updated: 2026-08-08
slug: obs-2026-08-08-main-street-merged-hand-maxhandsize-option-b-start-2-growabl
relevance: medium
observed_at: 2026-08-08T21:08:08.564Z
source_context: Recording maxHandSize decision for merged Main Street hand
---

# 🔍 Observation: Main Street merged hand: maxHandSize Option B, start 2, growable

Operator confirmed the maxHandSize open question for CG-0MSKU0BE5003I2ZD (Main Street merged hand): **Option B** — the merged hand starts at maxHandSize = 2 (current default, MainStreetState.ts createInitialState) and grows via upgrade cards' handSlotsAdded (MainStreetMarket.ts ~line 859). There is NO hard 3-card cap — the earlier '3 card limit' figure was illustrative. maxHandSize semantics unchanged; it now applies to the combined business+event hand in all purchase-legality checks (canPurchaseBusiness uses hand.length >= maxSize at MainStreetMarket.ts ~line 566). Description updated; comment CG-C0MSKV824K004VPD3 records the decision.

*Relevance: medium*
*Context: Recording maxHandSize decision for merged Main Street hand*
*Tags: main-street hand-layout maxHandSize decision*

---
*Observed: 2026-08-08T21:08:08.564Z*
