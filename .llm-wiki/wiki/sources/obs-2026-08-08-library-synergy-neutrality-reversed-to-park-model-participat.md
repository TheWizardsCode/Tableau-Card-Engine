---
type: source
title: "Observation: Library synergy neutrality reversed to Park-model participation"
tags:
  - main-street
  - synergy
  - library
  - bookshop
  - intake
  - balance
status: observation
created: 2026-08-08
updated: 2026-08-08
slug: obs-2026-08-08-library-synergy-neutrality-reversed-to-park-model-participat
relevance: high
observed_at: 2026-08-08T20:02:24.812Z
source_context: Intake for CG-0MSKS963N000ZSTU (Library synergy line not drawn)
---

# ⭐ Observation: Library synergy neutrality reversed to Park-model participation

Intake CG-0MSKS963N000ZSTU: operator reported "Library next to Bookshop should trigger synergy bonus but line not drawn". Investigation showed this was INTENTIONAL: commit 5266c677 (from CG-0MRXYGM9B006I3PE AC3) set cs-library synergyCoinBonus=0, synergyRepBonus=0 in example-games/main-street/card-data.csv making it fully synergy-neutral (MainStreetAdjacency skips cards whose effective coin AND rep bonuses are both 0). Park (cs-park) keeps empty fields → default 0.5 rate → participates. Operator chose option 1: revert to full participation (Park model) — empty the 0/0 fields, no engine change needed. Bookshop+Library → +0.25 coins/turn, line drawn. Trade-off: Library may now receive rep synergy from Culture neighbors with rep bonus (e.g. Art Gallery +0.1/turn). Tests to flip: tests/main-street/community-space-types.test.ts and community-space-ongoing-cost.test.ts. Regenerate csv-checksum.json via node scripts/generate-main-street-card-svgs.mjs. Docs: docs/main-street/card-catalog.md + balancing-methodology.md.

*Relevance: high*
*Context: Intake for CG-0MSKS963N000ZSTU (Library synergy line not drawn)*
*Tags: main-street synergy library bookshop intake balance*

---
*Observed: 2026-08-08T20:02:24.812Z*
