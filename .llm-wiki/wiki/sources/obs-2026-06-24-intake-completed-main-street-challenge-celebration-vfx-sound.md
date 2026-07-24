---
type: source
title: "Observation: Intake completed: Main Street challenge celebration VFX/sound"
slug: obs-2026-06-24-intake-completed-main-street-challenge-celebration-vfx-sound
status: observation
created: 2026-06-24
updated: 2026-06-24
relevance: medium
observed_at: 2026-06-24T13:36:23.421Z
tags: ["main-street", "intake", "challenge", "VFX", "audio"]
source_context: "Intake command for Main Street challenge celebration feature"
---
# 🔍 Observation: Intake completed: Main Street challenge celebration VFX/sound
Completed intake for a new feature (CG-0MQS46G5U001CYUG) to add celebration VFX (particle burst) and sound effects when challenges are completed in Main Street. The `processEndOfTurn()` function currently discards the return value of `evaluateChallenges()`, so the first implementation step is to capture newly completed challenge IDs, surface them to the UI, and trigger particle VFX (following the GymAudioFeedbackScene pattern) plus a new `sfx-challenge-complete` sound via the existing SoundManager/SFX_KEYS/tf-mapping infrastructure. Estimated Small effort (8.67h expected), Low risk.
*Relevance: medium*

*Context: Intake command for Main Street challenge celebration feature*

*Tags: main-street intake challenge VFX audio*
---
*Observed: 2026-06-24T13:36:23.421Z*