/**
 * Main Street: Market Result Types
 *
 * Shared result/breakdown interfaces returned by market operations
 * (purchase, refresh, sell, close). Types only — leaf module.
 *
 * @module
 */

import type { BusinessCard, CommunitySpaceCard, AnyCard } from './MainStreetCards';

export interface PurchaseResult {
  /** The card that was purchased. */
  card: AnyCard;
  /** Coins spent. */
  cost: number;
  /** Whether the market slot was refilled from the deck. */
  refilled: boolean;
}

/** Result returned after refreshing the single market row. */

export interface RefreshResult {
  replaced: AnyCard[];
  cost: number;
}

export interface SellRefundBreakdown {
  /** The base refund: Math.ceil((card.cost + totalUpgradeCost) * 1.5). */
  baseRefund: number;
  /** Synergy income component: Math.max(0, currentIncome - effectiveBase). */
  synergyIncomeComponent: number;
  /** Synergy reputation component: Math.max(0, currentRep - (repPerTurn + repBonus)). */
  synergyRepComponent: number;
  /** Total refund (sum of all components). */
  totalRefund: number;
}

/** Result returned after selling a business from the street grid. */

export interface SellResult {
  /** The card that was sold. */
  card: BusinessCard | CommunitySpaceCard;
  /** Coins refunded to the player. */
  refund: number;
  /** The slot index of the sold card. */
  slotIndex: number;
}

export interface CloseResult {
  /** The card that was closed (removed from the grid). */
  card: BusinessCard | CommunitySpaceCard;
  /** The slot index the closed card occupied. */
  slotIndex: number;
}

