# Lost Cities

Lost Cities is a 2-player card game where players compete to form profitable expeditions across 5 color lanes (Yellow, Blue, White, Green, Red).

## Overview

- **60-card deck** per game: 3 investment cards + 9 numbered cards (ranks 2-10) per color
- **3 rounds** per match, alternating starting player
- **Two-phase turns**: Play/Discard → Draw
- **Scoring**: Expedition score = sum of numbered cards × investment multiplier + 20 bonus (if all 5 colors used)

## HandView / PileView Migration

This game has been migrated to use the shared **HandView** and **PileView** UI components as part of the engine refactoring epic.

### Components Used

| Component | Usage |
|-----------|-------|
| `HandView` | Player hand (vertical layout, custom card texture resolver for Lost Cities cards) |
| `DrawPileView` | Draw pile (extends PileView, card-back texture with lazy rasterisation) |
| `PileView` | Discard piles (one per color, compact card display) |
| Bespoke sprites | Expedition lanes (multi-card vertical stacking with per-lane overlap) |
| Bespoke sprites | AI hand (face-down cards with async card-back texture updates) |

### Custom Texture Resolution

Lost Cities cards use a non-standard card model (expedition color + type instead of rank/suit). The migration uses:

- **`lcCardTextureFn`**: Resolves Lost Cities cards to their SVG asset keys (`lc-{color}-{type}`) via the texture cache
- **`lcCompactTextureFn`**: Resolves discard pile cards to compact-sized SVG asset keys
- **`lcDrawPileTextureFn`**: Returns the card-back texture key for the draw pile

### File Structure

```
lost-cities/
├── LostCitiesCards.ts         # Card model (LostCitiesCard interface)
├── LostCitiesGame.ts          # Pure game logic (no Phaser dependency)
├── LostCitiesRules.ts         # Legality checking
├── LostCitiesScoring.ts       # Scoring calculations
├── scenes/
│   ├── LostCitiesScene.ts     # Main Phaser scene
│   ├── LostCitiesRenderer.ts  # UI rendering (uses HandView/PileView)
│   ├── LostCitiesAnimator.ts  # Card animation helpers
│   └── LostCitiesTurnController.ts  # Turn flow and input handling
└── layouts/
    └── lost-cities.layout.json  # Screen Layout Language (SLL) definition
```

### Related Worklog Items

- **CG-0MPDWZ8OI0021TSQ**: Port Lost Cities to HandView/PileView
- **CG-0MPDS1QWN004KKNJ**: Extract reusable HandView and PileView components (Gym migration — reference implementation)
- **CG-0MPDWKITM006Y08I**: Port example-games to use shared HandView/PileView components (epic)
- **CG-0MQ6IEM9F001JTQD**: Phase 3: Port high-risk games to shared HandView/PileView
