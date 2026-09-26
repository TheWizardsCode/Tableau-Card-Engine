/**
 * Event tooltip / card-data consistency test (CG-0MTW1EN0D003CSA0, AC1)
 *
 * `MainStreetFormatting.buildCardTooltipInfo()` renders an event card's
 * `Effect:` text next to flat `Coins:` / `Rep:` detail lines. After the
 * ×100 integer-economy migration (CG-0MTIO1M15001E9Y6) those two surfaces
 * must never state contradictory amounts: the detail line must equal the
 * card's `coinDelta` / `reputationDelta`, except for percentage-based coin
 * effects (e.g. the Tax Audit) where the applied `coinPercentDelta` replaces
 * the ignored flat delta.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import { buildCardTooltipInfo } from '../../example-games/main-street/MainStreetFormatting';
import { MEDIUM_PRESET } from '../../example-games/main-street/MainStreetDifficulty';
import { getEventTemplates } from '../../example-games/main-street/MainStreetCards';

const events = getEventTemplates();
const byId = new Map(events.map(event => [event.id, event]));

function tooltipFor(id: string): string {
  const event = byId.get(id);
  if (!event) throw new Error(`Missing event template ${id}`);
  return buildCardTooltipInfo(event, MEDIUM_PRESET, { includeEventDetail: true });
}

describe('Event tooltip detail lines agree with card data (AC1)', () => {
  it('All/RandomBusiness events render detail values equal to the data columns', () => {
    for (const event of events) {
      if (event.target === 'SpecificSynergy') continue;

      const tooltip = buildCardTooltipInfo(event, MEDIUM_PRESET, { includeEventDetail: true });
      const coins = /Coins: ([+\-]?[0-9]+%?)/.exec(tooltip);
      const rep = /Rep: ([+\-]?\d+)/.exec(tooltip);

      expect(coins, `${event.id}: Coins detail line`).not.toBeNull();
      expect(rep, `${event.id}: Rep detail line`).not.toBeNull();

      if (event.coinPercentDelta !== undefined) {
        const expectedPct = `${event.coinPercentDelta < 0 ? '-' : '+'}${Math.round(
          Math.abs(event.coinPercentDelta) * 100,
        )}%`;
        expect(coins![1], `${event.id}: percentage coin detail`).toBe(expectedPct);
      } else {
        expect(Number(coins![1]), `${event.id}: coinDelta`).toBe(Math.round(event.coinDelta));
      }
      expect(Number(rep![1]), `${event.id}: reputationDelta`).toBe(Math.round(event.reputationDelta));
    }
  });

  it('evt-charity-drive states the same +1350 reputation in effect text and tooltip', () => {
    const tooltip = tooltipFor('evt-charity-drive');
    expect(tooltip).toContain('Effect: +1350 reputation');
    expect(tooltip).toContain('Rep: +1350');
  });

  it('evt-harvest-festival states +600 coins / +450 reputation and shows no flat detail line', () => {
    const tooltip = tooltipFor('evt-harvest-festival');
    expect(tooltip).toContain('+600 coins to each Food business');
    expect(tooltip).toContain('+450 reputation');
    // SpecificSynergy coinDelta is a per-match value, so the flat detail
    // lines are intentionally suppressed.
    expect(tooltip).not.toContain('Coins:');
    expect(tooltip).not.toContain('Rep:');
  });

  it('evt-tax renders its percentage coin effect instead of the ignored flat delta', () => {
    const tooltip = tooltipFor('evt-tax');
    expect(tooltip).toContain('Lose 45% of your banked coins.');
    expect(tooltip).toContain('Coins: -45%');
    expect(tooltip).not.toContain('Coins: -300');
  });
});
