/**
 * Main Street: Reader's Café Upgrade Tests
 *
 * Validates the Bookshop upgrade is renamed from "Library" to "Reader's Café"
 * with a reputation bonus representing Entertainment synergy.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  type UpgradeCard,
  createUpgradeDeck,
  createBusinessDeck,
  CARD_TEMPLATE_NAMES,
} from '../../example-games/main-street/MainStreetCards';

// Single-copy deck for template validation
const singleUpgDeck = createUpgradeDeck(1);

/** Returns the first (template) upgrade with a given base ID (sans -N suffix). */
function findUpgTemplate(baseId: string): UpgradeCard | undefined {
  return singleUpgDeck.find(c => c.id.replace(/-\d+$/, '') === baseId);
}

// ── Reader's Café Upgrade ──────────────────────────────────

describe('Reader\'s Café Upgrade (upg-readers-cafe)', () => {
  const upg = findUpgTemplate('upg-readers-cafe');

  it('should exist in the deck', () => {
    expect(upg).toBeDefined();
  });

  it('should target Bookshop', () => {
    expect(upg!.targetBusiness).toBe('Bookshop');
  });

  it('should have the display name "Upgrade to Reader\'s Café"', () => {
    expect(upg!.name).toBe("Upgrade to Reader's Café");
  });

  it('should have a reputationBonus for Entertainment synergy', () => {
    // reputationBonus is optional; if undefined, treat as 0
    const repBonus = (upg as any).reputationBonus;
    expect(typeof repBonus).toBe('number');
    expect(repBonus).toBeGreaterThan(0);
  });

  it('should have cost 300 and incomeBonus 100', () => {
    expect(upg!.cost).toBe(300);
    expect(upg!.incomeBonus).toBe(100);
  });

  it('should have requiredLevel 0 (can be applied to base Bookshop)', () => {
    expect(upg!.requiredLevel ?? 0).toBe(0);
  });

  it('should have a non-empty description mentioning Reader\'s Café', () => {
    expect(upg!.description.length).toBeGreaterThan(0);
    expect(upg!.description.toLowerCase()).toContain('caf');
  });

  it('should be registered in CARD_TEMPLATE_NAMES', () => {
    expect(CARD_TEMPLATE_NAMES.has('upg-readers-cafe')).toBe(true);
  });
});

// ── Old Library Upgrade Removed ─────────────────────────────

describe('Old Library upgrade removed', () => {
  it('should no longer have upg-library in the upgrade deck', () => {
    const oldUpg = findUpgTemplate('upg-library');
    expect(oldUpg).toBeUndefined();
  });

  it('should no longer have upg-library in CARD_TEMPLATE_NAMES', () => {
    expect(CARD_TEMPLATE_NAMES.has('upg-library')).toBe(false);
  });
});

// ── Bookshop Still Exists ──────────────────────────────────

describe('Bookshop business card unchanged', () => {
  const singleBizDeck = createBusinessDeck(1);

  it('should still have upgradePath pointing to Bookshop', () => {
    const bookshop = singleBizDeck.find(c => c.id.replace(/-\d+$/, '') === 'biz-bookshop');
    expect(bookshop).toBeDefined();
    expect(bookshop!.upgradePath).toBe('Bookshop');
  });
});
