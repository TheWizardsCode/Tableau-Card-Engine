/**
 * Main Street: Market Operations (barrel)
 *
 * **This module is a barrel file.** All exports are re-exported from
 * per-concern sub-modules to preserve backward compatibility with existing
 * imports — consumers should import from `MainStreetMarket` and not need
 * to change when sub-modules evolve.
 *
 * | Sub-module                   | Responsibility |
 * |------------------------------|----------------|
 * | `MainStreetMarketTypes`      | Shared result/breakdown interfaces (leaf) |
 * | `MainStreetMarketUtils`      | Pure market query helpers (leaf) |
 * | `MainStreetMarketRefill`     | Refill, refresh, cycling, incident deck |
 * | `MainStreetMarketSell`       | Sell, close, refunds |
 * | `MainStreetMarketHand`       | Hand add/move/play/discard |
 * | `MainStreetMarketPurchase`   | Purchase legality + execution |
 *
 * @module
 */

// ── Types ───────────────────────────────────────────────────
export type {
  PurchaseResult,
  RefreshResult,
  SellRefundBreakdown,
  SellResult,
  CloseResult,
} from './MainStreetMarketTypes';

// ── Utils ───────────────────────────────────────────────────
export {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  findTargetBusinessSlot,
  getUpgradeBranchesForBusiness,
} from './MainStreetMarketUtils';

// ── Refill ──────────────────────────────────────────────────
export {
  refillMarket,
  canRefreshMarket,
  refreshMarketCost,
  refreshMarket,
  cycleMarketCards,
  replenishIncidentDeck,
  cheatReplaceMarketCard,
} from './MainStreetMarketRefill';

// ── Sell ────────────────────────────────────────────────────
export {
  computeSellRefund,
  sellBusiness,
  canSellBusiness,
  canCloseBusiness,
  closeBusiness,
} from './MainStreetMarketSell';

// ── Hand ────────────────────────────────────────────────────
export {
  canAddToHand,
  moveToHand,
  playBusinessFromHand,
  discardFromHand,
} from './MainStreetMarketHand';

// ── Purchase ────────────────────────────────────────────────
export {
  canPurchaseBusiness,
  canPurchaseUpgrade,
  canPurchaseEvent,
  canPlayEvent,
  purchaseBusiness,
  playUpgradeFromHand,
  playEventFromHand,
  purchaseUpgrade,
  canBuyAndPlaceUpgrade,
  buyAndPlaceUpgrade,
  purchaseEvent,
  canPurchaseStaff,
  purchaseStaffCard,
} from './MainStreetMarketPurchase';
