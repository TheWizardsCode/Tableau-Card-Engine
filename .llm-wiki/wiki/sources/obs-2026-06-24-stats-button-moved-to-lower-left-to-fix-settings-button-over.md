---
type: source
title: "Observation: Stats button moved to lower-left to fix Settings button overlap"
slug: obs-2026-06-24-stats-button-moved-to-lower-left-to-fix-settings-button-over
status: observation
created: 2026-06-24
updated: 2026-06-24
relevance: medium
observed_at: 2026-06-24T15:36:12.954Z
---
# 🔍 Observation: Stats button moved to lower-left to fix Settings button overlap
The StatsButton in StatsOverlay.ts was positioned at (canvasWidth - 80, 32), exactly overlapping the SettingsButton (also at canvasWidth - 80, 32). Fixed by moving it to the lower-left corner at (MARGIN + radius, canvasHeight - MARGIN - radius) = (32, canvasHeight - 32). Also standardized the visual style (fill 0x333355, border 0xf0c040, text #f0c040, hover 0x4444aa) to match HelpButton and SettingsButton exactly.
*Relevance: medium*
---
*Observed: 2026-06-24T15:36:12.954Z*