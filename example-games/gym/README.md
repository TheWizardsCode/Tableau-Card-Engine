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
| Screen Layout Language (SLL) | `GymSllScene` | Starts on the composed shell+scene layout, then cycles through shell-only, scene-only, and pixel override examples while mapping zones+anchors across viewport/DPR profiles and visualizing merged overlays |

## SLL Demo

Open **Screen Layout Language (SLL)** from the Gym Router to explore direct SLL usage and composed shell + scene layouts:

- Starts with the composed shell + scene example, then cycles through the shell-only example, the scene-only example, and the pixel override example in `example-games/gym/layouts/`
- Uses `composeResolvedLayouts`, `parseScreenLayoutDocument`, `validateScreenLayoutDocument`, and `normalizedToPixels`
- Uses the shared core-engine `VisibilityOwnershipController` to toggle shell, shared, and scene UI groups instead of hard-coding layout-name checks in the scene
- Anchors the base help icon from the shell layout for shell-only and composed views, while the pure scene-only view hides the shared shell chrome so the scene-owned layout stays uncluttered
- Keeps the demo action control hidden in shell-only mode so the shell example focuses on shell-owned chrome
- Hides the `SLL Title Anchor` demo label in shell-only mode so the shell example remains focused on shared shell chrome, while the scene-only and composed views keep that title label lower so it does not collide with the shell contents
- Adds a `Toggle Shell` control that hides/restores shared shell chrome without changing the selected layout
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
- **GymSceneBase**: Abstract base providing standard header (title, `[ Menu ]`, `[ < Prev ]`, `[ Next > ]` buttons), label, button, and divider helpers.
- **GymRegistry**: Central catalogue of scene keys, titles, and descriptions, plus the `getAdjacentGymSceneKey` navigation helper.

## Navigating Between Demo Scenes

Each Gym demo scene includes **Prev** and **Next** navigation buttons in the header bar, positioned to the right of the `[ Menu ]` button. These cycle through the scene catalogue with wrap-around:

- `[ < Prev ]` — jumps to the previous scene in the catalogue (wraps to the last scene when on the first).
- `[ Next > ]` — jumps to the next scene in the catalogue (wraps to the first scene when on the last).

The Gym Router landing page is unaffected since it does not extend `GymSceneBase`.

Each demo scene uses core-engine APIs directly (SeededRng, UndoRedoManager, TranscriptRecorderBase, SaveLoadStore, SoundManager, etc.) without duplicating engine code.

## Reusable UI Components

The Gym scenes use and demonstrate several reusable UI components from `src/ui/` that can be used in any card game:

### HandView (`src/ui/HandView.ts`)

Displays a player's hand of cards as a horizontal row (default) or vertical cascade of interactive sprites with selection highlighting and event emission.

**Horizontal layout (default):**
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

**Vertical cascade layout:**
```ts
const cascade = new HandView(scene, {
  baseX: 200,
  baseY: 100,       // Y position of the top card
  spacing: 42,       // vertical centre-to-centre distance (negative overlap)
  layoutDirection: 'vertical',
});
cascade.setCards(tableauCards);
cascade.on('cardclick', (idx) => cascade.setSelected(idx)); // selects cards [0..idx]
cascade.getCascadeRange(); // { from: 0, to: idx }
```

**Animated insertion**: `animateAddCard(card, options)` adds a card to the hand with a dealing animation, computing the destination using HandView's own layout algorithm so the animation lands exactly where the card will appear. This is the preferred way to draw cards into a hand — it avoids destination-coordinate mismatches by centralising the layout math.

```ts
// Draw a card from the deck position with a 400ms animation
await handView.animateAddCard(drawnCard, {
  sourceX: deckX,     // where the animation starts
  sourceY: deckY,
  duration: 400,       // optional, default 400ms
});

// Reduced-motion is handled automatically — no tween is created
handView.setReducedMotion(true);
await handView.animateAddCard(drawnCard, { sourceX: deckX, sourceY: deckY });
// Card is placed instantly, Promise resolves immediately
```

When using `animateAddCard`, the caller should also update its own model array (e.g., `this.hand.push(card)`) after the Promise resolves, and update any pile views that may have changed.

**API**: `setCards(cards)`, `getCards()`, `addCard(card, opts?)`, `animateAddCard(card, animOpts)`, `removeCard(index, opts?)`, `setSelected(index|null)`, `getSelected()`, `getCascadeRange()`, `setArcRadius(radius)`, `getArcRadius()`, `setMaxRotationDegrees(degrees)`, `getMaxRotationDegrees()`, `on(event, cb)`, `off(event, cb)`, `getSpriteAt(index)`, `getSprites()`, `getCardCenters()`, `setReducedMotion(bool)`, `destroy()`.

**New in vertical cascade mode:**
- `layoutDirection: 'vertical'` — renders cards stacked vertically from top to bottom.
- `baseY` positions the top card; `spacing` becomes vertical centre-to-centre distance.
- Selecting index `i` selects cards `[0..i]` (the clicked card and all cards above it).
- `getCascadeRange()` returns `{ from: 0, to: index }` when a selection is active.
- `arcRadius`, `maxWidth`, and `maxRotationDegrees` are ignored in vertical mode.
- Labels are positioned to the right of each card to avoid overlap with stacked cards.

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

## Shared Gym Utilities

The Gym provides shared utility functions (in [`src/ui/GymSceneUtils.ts`](../../src/ui/GymSceneUtils.ts)) that extract common rendering patterns from demo scenes. These are used internally by Gym scenes but can also be imported directly for custom scenes or testing.

### `createEventLog(scene, baseY, options?)`

Renders a centered header and scrollable log line area. Used by 7 Gym scenes to display event logs.

```ts
import { createEventLog } from '@ui/GymSceneUtils';

const eventLog = createEventLog(scene, 200, {
  headerText: '── Event Log ──',  // default
  maxLines: 14,                    // default
  lineHeight: 17,                  // default
  textColor: '#aaddaa',           // default
  fontSize: '11px',               // default
  lineX: 40,                       // default
});

// Later, update the display:
eventLog.render(myLogLines);

// Cleanup:
eventLog.destroy();
```

**Options**: `headerText`, `lineHeight`, `textColor`, `maxLines`, `fontSize`, `headerX`, `lineX`, `headerFontSize`, `headerColor`.

**Returns**: `{ header, lines, baseY, render(lines), destroy() }`.

### `createDeckGrid(scene, deck, options?)`

Renders a deck of cards as a compact face-up grid. Used by GymDeckRngScene.

```ts
import { createDeckGrid } from '@ui/GymSceneUtils';

const grid = createDeckGrid(scene, myDeck, {
  cols: 8,       // default
  gapX: 4,       // default
  gapY: 4,       // default
  centerX: 640,  // default: GAME_W / 2
  centerY: 370,  // default gym position
});

// Replace with a new shuffled deck:
grid.destroy();
const newGrid = createDeckGrid(scene, shuffledDeck);
```

**Options**: `gapX`, `gapY`, `cols`, `centerX`, `centerY`, `cardScale`.

**Returns**: `{ sprites[], destroy() }`.

### `createSlider(scene, x, y, options?)`

Creates a horizontal slider with track, fill bar, handle, and value text. Encapsulates drag logic. Used by GymHandPileScene's three live-control sliders.

```ts
import { createSlider } from '@ui/GymSceneUtils';

const slider = createSlider(scene, 100, 680, {
  initialValue: 0.5,
  minValue: 0,
  maxValue: 1,
  label: 'Volume',
  width: 150,
  textColor: '#88ff88',
});

// Wire value changes:
slider.onValueChange = (value) => {
  console.log('Slider value:', value);
};

// Wire scene input to slider drag:
scene.input.on('pointermove', (pointer) => {
  slider.handlePointerMove(pointer.x);
});
scene.input.on('pointerup', () => {
  slider.handlePointerUp();
});

// Programmatic set (does not fire onValueChange):
slider.setValue(0.75);
```

**Options**: `initialValue`, `minValue`, `maxValue`, `label`, `width`, `trackHeight`, `trackColor`, `fillColor`, `handleColor`, `fontSize`, `textColor`.

**Returns**: `{ value, track, fill, handle, valueText, hitArea, onValueChange, setValue(v), destroy(), handlePointerMove(px), handlePointerUp() }`.

### Migration Notes

The following Gym scenes were migrated to use these shared utilities:

- **Event log** (`createEventLog`): GymAudioFeedbackScene, GymGraphicsLightingSpikeScene, GymGraphicsShaderSpikeScene, GymOverlayUiScene, GymSaveLoadScene, GymTranscriptScene, GymUndoRedoScene
- **Deck grid** (`createDeckGrid`): GymDeckRngScene
- **Slider** (`createSlider`): GymHandPileScene (3 sliders: arc, spacing, rotation)

Each migration preserved the original visual parameters (header text, colors, line spacing, slider ranges) via options, so player-facing behavior is unchanged.