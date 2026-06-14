# UI Adapter Guide

Customising HandView and PileView for non-standard card models (tokens, resource icons, expedition cards).

## Overview

`HandView` and `PileView` are built for standard playing cards (rank + suit), but both support a `CardTextureResolver` callback that lets games render any visual model — resource tokens, crop icons, expedition markers, etc.

## CardTextureResolver

```ts
type CardTextureResolver = (card: unknown) => string;
```

A function that maps any card-like object to a texture key. When provided to HandView or PileView, it is called **instead of** `getCardTexture()` for every visible card.

### HandView

```ts
// At construction
const handView = new HandView(scene, {
  x: 400, y: 550,
  cardTextureFn: (card: unknown) => {
    const c = card as { resourceType: string };
    return `card-${c.resourceType}`;
  },
});

// Or dynamically
handView.setCards(cards, { cardTextureFn: (card) => myResolver(card) });
```

### PileView

```ts
const pileView = new PileView(scene, {
  x: 200, y: 150,
  label: 'Resource Pile',
  cardTextureFn: (card: unknown) => {
    const c = card as { type: string; color: string };
    return `token-${c.type}-${c.color}`;
  },
});
```

### Important notes

- The resolver receives the **raw card object** (not a `Card` instance). Type guard or cast as needed.
- The resolver must return a valid texture key that has been preloaded via `preloadCardAssets` or generated at runtime (see `TokenPileView` below).
- The resolver is called on every `update()` call (PileView) or `setCards()` call (HandView).

## TokenPileView

For games that need to render non-card objects (resource tokens, crop icons, etc.) in a pile, use `TokenPileView`. It is a specialised PileView variant that accepts any array of objects and renders them as circular tokens with optional icon overlays.

### API

```ts
import { TokenPileView } from '@ui/TokenPileView';
```

#### Constructor

```ts
const tokenPile = new TokenPileView(scene, {
  x: 300,
  y: 200,
  label: 'Resources',
  tokenRadius: 20,
  // Optional: callback to render each token object
  tokenRenderer: (token: unknown, container: Phaser.GameObjects.Container) => {
    const t = token as { type: string; count: number };
    // Draw icon, count text, etc.
  },
});
```

#### Key methods

| Method | Description |
|--------|-------------|
| `setTokens(items: unknown[], count?: number)` | Set the token objects and total count |
| `update()` | Refresh the display from current state |
| `getContainer()` | Return the container for external animation |
| `destroy()` | Clean up display objects |

#### Example: Feudalism resource pile

```ts
import { TokenPileView } from '@ui/TokenPileView';

// In scene boot:
const resourcePile = new TokenPileView(this.scene, {
  x: 100,
  y: 100,
  label: 'Supply',
  tokenRadius: 14,
  tokenRenderer: (token, container) => {
    const t = token as { type: string; count: number };
    // Render token bubble with icon and count
  },
});

// Later, update from game state:
resourcePile.setTokens(playerTokens, tokenCount(playerTokens));
resourcePile.update();
```

### TokenRenderer callback

The `tokenRenderer` callback is called for each token object to produce the visual representation. It receives:

- `token` — The raw token object (any shape, as provided in the array)
- `container` — A Phaser container to add display objects to

The callback is responsible for drawing the token bubble, icon, and count text. This gives full flexibility for games like Feudalism where token visuals are complex (circle + crop icon + count overlay).

## Migration checklist

- [ ] Identify all non-standard card/token types in the game
- [ ] Create texture keys or rendering logic for each type
- [ ] Add a `CardTextureResolver` to HandView or PileView
- [ ] For complex tokens, consider `TokenPileView`
- [ ] Update tests to cover the custom resolver
- [ ] Verify existing standard-card behaviour is unchanged
