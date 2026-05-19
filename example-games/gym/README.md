# TCE Gym

The **Gym** is an interactive demonstration suite for the Tableau Card Engine (TCE). It provides one scene per major engine feature so developers, QA engineers, and designers can quickly validate APIs, observe behavior, and run deterministic smoke tests.

## Quick Start

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open `http://localhost:3000` and select **Gym** from the game selector. From the Gym Router, choose any demo scene to explore.

## Demo Scenes

| Scene | Key | What it Demonstrates |
|---|---|---|
| Deck & Seeded RNG | `GymDeckRngScene` | Create/shuffle/draw with deterministic seeded randomness |
| Hand & Pile Interactions | `GymHandPileScene` | Move cards between hand and piles; legal/illegal action feedback |
| Overlay & UI Config | `GymOverlayUiScene` | Open/close overlays; toggle feedback intensity |
| Undo / Redo | `GymUndoRedoScene` | Execute, undo, and redo actions; history stack and boundary conditions |
| Transcript Recording | `GymTranscriptScene` | Record game events, inspect transcripts, verify deterministic ordering |
| Save / Load State | `GymSaveLoadScene` | Save and restore state; handle malformed payloads safely |
| Audio & Feedback Config | `GymAudioFeedbackScene` | Toggle mute, adjust volume, map events to sounds, handle invalid keys |

## Running Tests

```bash
# Run the full suite (unit + browser)
npm test

# Run only Gym-related tests
npx vitest run tests/gym/
```

## Adding a New Scene

1. Create a new scene class in `scenes/` extending `GymSceneBase`.
2. Add a scene key constant to `GymRegistry.ts`.
3. Add a `GymSceneEntry` to the `GYM_SCENE_CATALOGUE` array.
4. Export the scene class from `index.ts`.
5. Register the scene class in `main.ts`.
6. Add a smoke test in `tests/gym/`.

## Architecture

- **GymRouterScene**: Landing page with navigation cards for all demo scenes.
- **GymSceneBase**: Abstract base providing standard header, label, button, and divider helpers.
- **GymRegistry**: Central catalogue of scene keys, titles, and descriptions.

Each demo scene uses core-engine APIs directly (SeededRng, UndoRedoManager, TranscriptRecorderBase, SaveLoadStore, SoundManager, etc.) without duplicating engine code.