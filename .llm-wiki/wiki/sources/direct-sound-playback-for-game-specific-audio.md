---
type: source
title: "Direct sound playback for game-specific audio events"
slug: direct-sound-playback-for-game-specific-audio
status: insight
created: 2026-06-24
updated: 2026-06-24
category: audio
---
# Direct sound playback for game-specific audio events
When adding game-specific sounds that don't need to be shared across games or don't require the declarative event-to-sound mapping system, playing them directly via `soundManager.play(SFX_KEY)` is simpler than adding new event types to the core engine's `GameEventMap`. This avoids polluting the core engine with game-specific concerns while still benefiting from the SoundManager's namespacing, volume, mute, and synth integration. The Key pattern: define the SFX key constant in the game's constants file, add it to the synth/tf mapping if needed, preload the audio asset, and call `soundManager.play()` directly.
*Category: audio*
---
*Captured: 2026-06-24*
## Related
_Add links to related pages._