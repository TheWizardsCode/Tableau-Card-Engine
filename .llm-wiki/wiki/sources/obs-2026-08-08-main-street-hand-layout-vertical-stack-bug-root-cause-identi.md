---
type: source
title: "Observation: Main Street hand layout vertical-stack bug root cause identified"
tags:
  - main-street
  - hand-layout
  - intake
  - bug
status: observation
created: 2026-08-08
updated: 2026-08-08
slug: obs-2026-08-08-main-street-hand-layout-vertical-stack-bug-root-cause-identi
relevance: high
observed_at: 2026-08-08T20:40:22.319Z
source_context: /intake Main Street hand layout vertical should be horizontal
---

# ⭐ Observation: Main Street hand layout vertical-stack bug root cause identified

Intake for CG-0MSKU0BE5003I2ZD (Main Street: hand layout is vertical, should be horizontal). Root cause confirmed via browser tests + pixel analysis on dev AND deployed builds: MainStreetRenderer.ts creates two HandViews with mismatched baseY — handBusinessView (business cards) at baseY=handY=620 (correct horizontal row), but handView (held event card) at baseY=handY+handCardH/2=660, 40px below. When a player holds both an event card (heldEvent) and business cards, the held event card renders below the business hand, overlapping the 80px-tall cards vertically — a vertical stack instead of one horizontal row. Files: example-games/main-street/scenes/MainStreetRenderer.ts (lines ~120-200), MainStreetLayoutAdapter.ts (handY=620, handX=40, handCenterX=410, handCardW=140, handCardH=80). Effort Small / Risk Low. Note: buy-transfer-destination.test.ts pins held-event y to handY+handCardH/2 and will need updating.

*Relevance: high*
*Context: /intake Main Street hand layout vertical should be horizontal*
*Tags: main-street hand-layout intake bug*

---
*Observed: 2026-08-08T20:40:22.319Z*
