# Main Street test notes

## Layout regression maintenance

The browser test `MainStreetLayoutAnchors.browser.test.ts` asserts explicit numeric bounds for:

- Activity Log placement (upper-right, within viewport)
- End Turn button placement (lower-right, within viewport)
- Non-overlap ordering (End Turn below Activity Log)

If an intentional UX/layout redesign changes these zones:

1. Update the expected bounds in `MainStreetLayoutAnchors.browser.test.ts`.
2. Re-run:

```bash
npx vitest run tests/main-street/MainStreetLayoutAnchors.browser.test.ts --project browser
```

3. Run full validation before commit:

```bash
npm run build
npm test
```

## Replay assertion maintenance

`tests/e2e/replay-main-street.e2e.test.ts` asserts canonical screenshot dimensions for replay output (1280x720).
If replay resolution intentionally changes, update that assertion and mention the change in the work item/PR summary.
