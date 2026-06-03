# Main Street test notes

## Market Offer Engine — Extraction Parity Tests

`market-extraction-parity.test.ts` (CG-0MPWZ5R1M001MZ3B) locks in current Main Street
market behavior before the `MarketOfferEngine` is extracted into `src/card-system`.
These tests serve as the regression oracle during migration.

### Covered scenarios

| Category | Functions under test | Count |
|---|---|---|
| Market row retrieval | `findTargetBusinessSlot`, `getAffordableUpgradeCards` | 10 |
| Positive-path buy eligibility | `canPurchaseBusiness`, `canPurchaseUpgrade`, `canPurchaseEvent` | 3 |
| Negative-path buy eligibility | `canPurchaseBusiness`, `canPurchaseUpgrade`, `canPurchaseEvent`, `canRefreshInvestments` | 12 |
| Positive-path purchase results | `purchaseBusiness`, `purchaseUpgrade`, `purchaseEvent`, `refreshInvestments` | 5 |
| Invalid row/slot selection | `purchaseBusiness`, `purchaseUpgrade`, `purchaseEvent`, `refreshInvestments` | 7 |
| Refill policy — incident queue | `refillIncidentQueue` | 5 |
| Refill policy — exhaustion | `refillInvestmentsMarket`, `refillBusinessMarket`, `refillAllMarkets` | 3 |
| Refill policy — reshuffle from discard | `reshuffleIfNeeded` (business/upgrade/event decks) | 5 |
| Multi-turn integration | `executeDayStart`, `processEndOfTurn`, `executeAction` | 7 |

**Total: 57 tests**

### Known gaps

- These tests use Main Street's current implementation as the oracle; they do not yet validate
  against a future `src/card-system/MarketOfferEngine` module (follow-up work).
- Audio/feedback side effects of market operations are not covered here (see
  `GymAudioFeedback.test.ts`).
- Browser-level UI rendering of the market is covered by separate layout tests.

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
