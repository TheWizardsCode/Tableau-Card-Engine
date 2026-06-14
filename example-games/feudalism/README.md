# Feudalism

A digital implementation of the Feudalism board game, built using the
Tableau Card Engine.

## Overview

Feudalism is a worker-placement / card-drafting game where players
purchase development cards, collect resource tokens, and gain influence
to become the most powerful lord in medieval Ireland.

## Engine usage

### No HandView / PileView migration needed

Feudalism does **not** use `HandView` or `PileView` from
`src/ui/`. This is by design — the game's card model has no traditional
hands or piles:

- **Market cards** are displayed individually (4 per tier row), each as
  a custom container with bonus bar, cost chips, and point values.
- **Reserved cards** (up to 3 per player) are shown as small static
  cards in the player area.
- **Purchased cards** are tracked only by count and never rendered.
- **Token supply** and **patron tiles** use custom rendering (circles
  with crop-icon graphics and rectangles, respectively).

The game renders all cards via bespoke rendering code in
`FeudalismRenderer.ts` which creates custom container objects for each
market card, reserved card, patron tile, and token. This approach is
appropriate for feudalism because the visual presentation of each card
is unique (with tier-specific styling, bonus indicators, cost chips)
and does not fit the standard hand/pile abstraction.

### What IS migrated

The following components use shared engine code:

- **Overlay system**: `OverlayManager` from `@ui` for action menus and
  the game-over overlay.
- **Scene base**: `CardGameScene` from `@ui` for game loop management,
  sound system, help panel, and settings panel.
- **Renderer helpers**: `createGameZone` from `@ui/Renderer` for section
  box backgrounds.
- **Selection manager**: `SingleSelectionManager` and `attachSelection`
  from `@ui` for market card selection with hover/visual feedback.
- **Action buttons**: `createFeudalismActionButton` from
  `@ui/Renderer/adapters/FeudalismAdapter`.

### Related work

- **CG-0MPDWYUMC007YNN5** — Port Feudalism to HandView/PileView
  (resolved: not applicable, see above)
- **CG-0MQ6IEM9F001JTQD** — Phase 3: Port high-risk games to shared
  HandView/PileView
- **CG-0MPDS1QWN004KKNJ** — Reference implementation of HandView/PileView
  (Gym migration)
