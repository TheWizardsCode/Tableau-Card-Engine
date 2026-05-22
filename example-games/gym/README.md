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
| Deck & Seeded RNG | `GymDeckRngScene` | Create/shuffle/draw with deterministic seeded randomness; flip and deal animations |
| Hand & Pile Interactions | `GymHandPileScene` | Move cards with deal/place/discard/move/shake animations; bottom-anchored arc hand layout with live radius and per-card rotation sliders; drop-zone highlights; flip support |
| Overlay & UI Config | `GymOverlayUiScene` | Open/close overlays; toggle feedback intensity; GeometryMask scrollable content |
| Undo / Redo | `GymUndoRedoScene` | Execute, undo, and redo actions; pop text feedback on undo/redo |
| Transcript Recording | `GymTranscriptScene` | Record game events, inspect transcripts; pop text feedback |
| Save / Load State | `GymSaveLoadScene` | Save and restore state; RenderTexture snapshot; handle malformed payloads |
| Audio & Feedback Config | `GymAudioFeedbackScene` | Toggle mute, adjust volume, map events to sounds; pop text; particle celebration |
| Shader & Blend Spike | `GymGraphicsShaderSpikeScene` | Sprite tinting, blend modes, shader feasibility evaluation |
| Lighting Spike | `GymGraphicsLightingSpikeScene` | Point light, shadow evaluation, WebGL fallback behavior |
| Screen Layout Language (SLL) | `GymSllScene` | Demonstrates shell-only, scene-only, pixel override, and composed shell+scene layouts, maps zones+anchors across viewport/DPR profiles, and visualizes merged overlays |

## SLL Demo

Open **Screen Layout Language (SLL)** from the Gym Router to explore direct SLL usage and composed shell + scene layouts:

- Cycles between the shell-only example, the scene-only example, the pixel override example, and the composed shell + scene example in `example-games/gym/layouts/`
- Uses `composeResolvedLayouts`, `parseScreenLayoutDocument`, `validateScreenLayoutDocument`, and `normalizedToPixels`
- Anchors the base help icon from the shell layout for shell-only and composed views, while the pure scene-only view hides the shared help chrome so the scene-owned layout stays uncluttered
- Keeps the demo action control hidden in shell-only mode so the shell example focuses on shell-owned chrome
- Toggles an overlay that shows merged zone bounds and anchor points for the active layout
- Simulates multiple viewport/DPR profiles (desktop and portrait) to inspect mapping behavior

### Composed shell + scene usage

The composed demo uses a shared shell layout and a scene layout at runtime:

```ts
const resolved = composeResolvedLayouts(shellLayout, sceneLayout, viewport, dpr, {
  policy: 'sceneWins',
});

const title = resolved.zones.shell.anchors.title;
const help = resolved.zones.shell.anchors.help;
const action = resolved.zones.shared.anchors.action;
```

Recommended local files:

- `example-games/gym/layouts/gym-shell.layout.json` (shell-only and composed shell source)
- `example-games/gym/layouts/gym-scene.layout.json` (scene-only source)

## Running Tests

```bash
# Run the full suite (unit + browser)
npm test

# Run only Gym-related tests
npx vitest run tests/gym/
```

## Reduced Motion

All Gym scenes support reduced-motion mode. When enabled (via browser preferences or SettingsStore), animations are shortened or replaced with instant state changes, and particle effects are suppressed. This is controlled by the `reducedMotion` property on `GymSceneBase`, which reads from both the SettingsStore and the browser's `prefers-reduced-motion` media query.

Headless tests can force reduced-motion by calling `scene.setReducedMotionProperty(true)`.

## Scene Transitions

The Gym Router supports optional animated scene transitions (fade) when navigating to a demo scene. Toggle transitions on/off via the "Transitions" button in the top-right corner of the router. Transitions are skipped when reduced-motion is enabled.

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

## Reusable UI Components

The Gym scenes use and demonstrate several reusable UI components from `src/ui/` that can be used in any card game:

### HandView (`src/ui/HandView.ts`)

Displays a player's hand of cards as a horizontal row of interactive sprites with selection highlighting and event emission.

```ts
import { HandView } from '@ui/HandView';

const handView = new HandView(scene, {
  baseX: 60,
  baseY: 130,
  spacing: 20,
  arcRadius: 60,
  showLabels: false,
});
handView.setCards(myHand);
handView.on('cardclick', (idx) => handView.setSelected(idx));

// Live curvature updates (0 = straight line)
handView.setArcRadius(120);

// After mutating your hand array:
handView.setCards(myHand);
handView.setSelected(null);

// Cleanup
handView.destroy();
```

**API**: `setCards(cards)`, `getCards()`, `addCard(card, opts?)`, `removeCard(index, opts?)`, `setSelected(index|null)`, `getSelected()`, `setArcRadius(radius)`, `getArcRadius()`, `setMaxRotationDegrees(degrees)`, `getMaxRotationDegrees()`, `on(event, cb)`, `off(event, cb)`, `getSpriteAt(index)`, `getSprites()`, `getCardCenters()`, `setReducedMotion(bool)`, `destroy()`.

### PileView (`src/ui/PileView.ts`)

Displays a card pile (deck, discard, etc.) as a single sprite showing the top card, with a count label below and click events.

```ts
import { PileView } from '@ui/PileView';

const deckView = new PileView(scene, { x: 500, y: 150, label: 'Deck' });
deckView.setPile(myDrawPile);
deckView.onClick(() => { /* draw logic */ deckView.update(); });

// Cleanup
deckView.destroy();
```

**API**: `setPile(pile)`, `peek()`, `update()`, `onClick(cb)`, `getCountText()`, `getSprite()`, `getPile()`, `destroy()`.