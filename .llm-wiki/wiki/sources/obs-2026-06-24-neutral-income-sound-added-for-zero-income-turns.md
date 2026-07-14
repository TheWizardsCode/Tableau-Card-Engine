---
type: source
title: "Observation: Neutral income sound added for zero-income turns"
slug: obs-2026-06-24-neutral-income-sound-added-for-zero-income-turns
status: observation
created: 2026-06-24
updated: 2026-06-24
relevance: medium
observed_at: 2026-06-24T11:39:05.027Z
tags: ["main-street", "audio", "sound"]
source_context: "Implementing CG-0MQK4EGJ0001JN6N: No sound on some turns"
---
# 🔍 Observation: Neutral income sound added for zero-income turns
Added a neutral sound effect (sfx-income-neutral) that plays when turn-end net income is 0 in Main Street. Previously only positive income (delta > 0) triggered the coin-pop sound. The neutral sound is played directly via soundManager.play() in MainStreetAnimator.animateHudValueChanges when coin delta equals 0. The tf factory key is 'income-neutral-chime'. Preload reuses click.wav as the fallback WAV asset. No core engine changes were needed — the sound is played directly rather than through a new game event. Commit a5ea5229 pushed to dev.
*Relevance: medium*

*Context: Implementing CG-0MQK4EGJ0001JN6N: No sound on some turns*

*Tags: main-street audio sound*
---
*Observed: 2026-06-24T11:39:05.027Z*