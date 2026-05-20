# Main Street

Main Street now uses the shared **Screen Layout Language (SLL)** as its canonical layout source.

## Layout files and adapter

- Canonical layout JSON: `example-games/main-street/layouts/main-street.layout.json`
- Scene adapter: `example-games/main-street/scenes/MainStreetLayoutAdapter.ts`
- Renderer entrypoint: `example-games/main-street/scenes/MainStreetRenderer.ts`

`MainStreetRenderer.computeLayout()` computes legacy layout metrics first, then applies SLL zone overrides through `computeMainStreetLayoutWithSll(...)`.

## Migration behavior and fallback

Main Street uses `adaptLayoutWithFallback(...)` to keep migration safe:

- If SLL layout parsing/mapping succeeds, SLL-derived zone coordinates are used.
- If layout is missing/invalid or mapping fails, legacy `computeLayout` values are used.

This keeps existing gameplay and regression tests stable during rollout.

## Testing layout behavior

```bash
# Schema and mapping contracts
npx vitest run tests/ui/screen-layout-schema.test.ts tests/ui/screen-layout-mapping.test.ts --project unit

# Main Street browser/layout coverage
npx vitest run tests/main-street/MainStreetLayoutAnchors.browser.test.ts --project browser
npx vitest run tests/main-street/MainStreetScene.browser.test.ts --project browser

# Replay-based canonical resolution assertion
npx vitest run tests/e2e/replay-main-street.e2e.test.ts --project unit
```

## Follow-up work

Tutorial-specific layout migration is tracked separately in:

- **Adapt tutorial system to use layout description (CG-0MP7IZ4RK008065O)**
