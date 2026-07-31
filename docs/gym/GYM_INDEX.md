# TCE Gym -- Scene Index

This page is the centralized index for all Gym demo scenes. Each entry links to the scene's source code and describes the core-engine features it demonstrates.

## Running the Gym

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and select **Gym** from the game selector. Use the router scene to navigate between demos.

## Running Tests

```bash
# Full suite (unit + browser)
npm test

# Gym unit tests only
npx vitest run tests/gym/*.test.ts

# Gym browser smoke tests only
npx vitest run --project browser tests/gym/*.browser.test.ts
```

## Demo Scenes

| Scene | Key | Core APIs | Source | Tests |
|---|---|---|---|---|
| Deck & Seeded RNG | `GymDeckRngScene` | `createStandardDeck`, `shuffleArray`, `createSeededRng` | [`scenes/GymDeckRngScene.ts`](../../example-games/gym/scenes/GymDeckRngScene.ts) | [`GymDeckRng.test.ts`](../../tests/gym/GymDeckRng.test.ts) |
| Hand & Pile Interactions | `GymHandPileScene` | `Pile`, `createStandardDeck`, `createSeededRng`, `HandView.setMaxRotationDegrees`, `HandView.setSelectionLift` | [`scenes/GymHandPileScene.ts`](../../example-games/gym/scenes/GymHandPileScene.ts) | [`GymRegistry.test.ts`](../../tests/gym/GymRegistry.test.ts), [`GymHandPileRotation.test.ts`](../../tests/gym/GymHandPileRotation.test.ts), [`GymHandPileRaise.test.ts`](../../tests/gym/GymHandPileRaise.test.ts) |
| Overlay & UI Config | `GymOverlayUiScene` | `createOverlayBackground`, `dismissOverlay` | [`scenes/GymOverlayUiScene.ts`](../../example-games/gym/scenes/GymOverlayUiScene.ts) | [`GymSceneSmoke.browser.test.ts`](../../tests/gym/GymSceneSmoke.browser.test.ts) |
| Undo / Redo | `GymUndoRedoScene` | `UndoRedoManager`, `CompoundCommand` | [`scenes/GymUndoRedoScene.ts`](../../example-games/gym/scenes/GymUndoRedoScene.ts) | [`GymUndoRedo.test.ts`](../../tests/gym/GymUndoRedo.test.ts) |
| Transcript Recording | `GymTranscriptScene` | `TranscriptRecorderBase`, `createSeededRng` | [`scenes/GymTranscriptScene.ts`](../../example-games/gym/scenes/GymTranscriptScene.ts) | [`GymTranscript.test.ts`](../../tests/gym/GymTranscript.test.ts) |
| Save / Load State | `GymSaveLoadScene` | `SaveLoadStore`, `serializeWithVersion`, `deserializeWithVersion`, `RenderTexture.saveTexture()`, `RenderTexture.snapshot()`, snapshot persistence via base64 data URL | [`scenes/GymSaveLoadScene.ts`](../../example-games/gym/scenes/GymSaveLoadScene.ts) | [`GymSaveLoad.test.ts`](../../tests/gym/GymSaveLoad.test.ts) |
| Audio & Feedback Config | `GymAudioFeedbackScene` | `SoundManager`, `GameEventEmitter`, `EventSoundMapping` | [`scenes/GymAudioFeedbackScene.ts`](../../example-games/gym/scenes/GymAudioFeedbackScene.ts) | [`GymAudioFeedback.test.ts`](../../tests/gym/GymAudioFeedback.test.ts) |
| Shader & Blend Spike | `GymGraphicsShaderSpikeScene` | Sprite tinting, blend modes, shader feasibility | [`scenes/GymGraphicsShaderSpikeScene.ts`](../../example-games/gym/scenes/GymGraphicsShaderSpikeScene.ts) | [`GymSceneSmoke.browser.test.ts`](../../tests/gym/GymSceneSmoke.browser.test.ts) |
| Lighting Spike | `GymGraphicsLightingSpikeScene` | Point light, shadow evaluation, WebGL fallback | [`scenes/GymGraphicsLightingSpikeScene.ts`](../../example-games/gym/scenes/GymGraphicsLightingSpikeScene.ts) | [`GymSceneSmoke.browser.test.ts`](../../tests/gym/GymSceneSmoke.browser.test.ts) |
| Screen Layout Language (SLL) | `GymSllScene` | `validateScreenLayoutDocument`, `parseScreenLayoutDocument`, `normalizedToPixels`, `getZoneRect`, `anchorPoint` | [`scenes/GymSllScene.ts`](../../example-games/gym/scenes/GymSllScene.ts) | [`GymSllLayout.test.ts`](../../tests/gym/GymSllLayout.test.ts), [`GymSllScene.browser.test.ts`](../../tests/gym/GymSllScene.browser.test.ts) |

## Scene Navigation

All Gym demo scenes that extend `GymSceneBase` include `[ < Prev ]` and `[ Next > ]` buttons in the header bar, positioned to the right of the `[ Menu ]` button. These cycle through the `GYM_SCENE_CATALOGUE` with wrap-around navigation.

The `getAdjacentGymSceneKey()` helper in `GymRegistry.ts` provides the scene key for the previous or next scene. Unit tests in `GymSceneHeaderNavigation.test.ts` verify wrap-around behaviour and that the Router scene is excluded.

## Deterministic Headless Tests

All Gym scenes are validated by deterministic headless smoke tests in [`GymHeadlessDeterminism.test.ts`](../../tests/gym/GymHeadlessDeterminism.test.ts), which assert:

- **Seeded RNG**: Same seed produces identical shuffle/draw sequences; different seeds produce different sequences.
- **Pile lifecycle**: LIFO push/pop order, clear, isEmpty, size, peek.
- **Hand/Pile interaction**: Drawing, discarding, and recalling cards between zones with deterministic outcomes.
- **Undo/Redo**: Execute → undo → redo round-trips, compound commands, redo stack invalidation.
- **Transcript recording**: Same seed produces identical event sequences; TranscriptRecorderBase captures and finalizes correctly.
- **Sound mapping**: Event-to-sound mapping produces consistent call ordering; mute suppresses all playback.
- **Save/Load**: Round-trip with versioned serialization; version mismatch throws; missing saves return null.

## Browser Smoke Tests

[`GymSceneSmoke.browser.test.ts`](../../tests/gym/GymSceneSmoke.browser.test.ts) verifies that every Gym scene boots without errors in a headless Chromium environment and renders an active canvas.

[`GymRouterScene.browser.test.ts`](../../tests/gym/GymRouterScene.browser.test.ts) verifies the router scene renders navigation cards and that all scene keys resolve to registered Phaser scenes.

[`GymSllScene.browser.test.ts`](../../tests/gym/GymSllScene.browser.test.ts) verifies the SLL scene publishes a deterministic scene-ready marker and that anchor-derived UI elements land within expected pixel ranges.

## Adding a New Scene

1. Create a new scene class in `example-games/gym/scenes/` extending `GymSceneBase`.
2. Add a scene key constant to `example-games/gym/GymRegistry.ts`.
3. Add a `GymSceneEntry` to the `GYM_SCENE_CATALOGUE` array in `GymRegistry.ts`.
4. Export the scene class from `example-games/gym/index.ts`.
5. Register the scene in `main.ts`.
6. Add unit tests in `tests/gym/`.
7. Add a browser smoke test entry in `tests/gym/GymSceneSmoke.browser.test.ts`.
8. Add a headless deterministic test entry in `tests/gym/GymHeadlessDeterminism.test.ts` (if applicable).
9. Update this index page.