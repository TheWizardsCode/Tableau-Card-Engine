---
type: source
title: "Observation: Browser-test pitfalls: IndexedDB checkpoint overlay blocker + canvas scaling"
tags:
  - testing
  - browser
  - vitest
  - phaser
  - main-street
status: observation
created: 2026-08-09
updated: 2026-08-09
slug: obs-2026-08-09-browser-test-pitfalls-indexeddb-checkpoint-overlay-blocker-c
relevance: high
observed_at: 2026-08-09T00:20:48.556Z
source_context: Debugging tests/main-street/drag.browser.test.ts flakiness
---

# ⭐ Observation: Browser-test pitfalls: IndexedDB checkpoint overlay blocker + canvas scaling

Debugging Main Street drag browser tests exposed two browser-test pitfalls: (1) The checkpoint resume overlay (CheckpointResumeOverlay, depth 2000, full-screen interactive Rectangle) blocks all pointer events when a saved checkpoint exists — SaveLoadStore persists to IndexedDB which survives across vitest browser runs, so a checkpoint saved by ANY other test (e.g. MainStreetScene's end-turn test) breaks later drag tests. Fix: clear localStorage + delete IndexedDB databases in the test boot before creating the game. (2) The vitest browser viewport (900x700) CSS-scales the game canvas (1280x720) and offsets it vertically — dispatchMouse must convert world coords to client coords via canvas.getBoundingClientRect() (clientX = rect.x + worldX/GAME_W*rect.width), otherwise clicks land on the HUD. Also: wait for market rendering to settle (SVG prewarm triggers a final refreshAll that rebuilds card containers mid-gesture).

*Relevance: high*
*Context: Debugging tests/main-street/drag.browser.test.ts flakiness*
*Tags: testing browser vitest phaser main-street*

---
*Observed: 2026-08-09T00:20:48.556Z*
