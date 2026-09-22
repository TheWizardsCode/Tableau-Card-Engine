/**
 * Main Street: Seasonal & Irish-Holiday Event Card Windows (CG-0MTT0K9RX0004QTE / F5)
 *
 * Verifies the week-gated content in `card-data.csv`:
 * - Harvest Festival restricted to weeks 38–41 (parent AC 5)
 * - Summer Fest restricted to weeks 23–35 (parent AC 6)
 * - The 7 new Irish-holiday event cards exist with their declared windows
 *   (parent AC 7) and are only offerable inside their windows
 * - The HUD's `weekLabel` helper renders "Week W · Year Y" (Feature 5 AC 1)
 *
 * @module tests/main-street/IrishHolidayCards
 */
import { describe, it, expect } from 'vitest';

import {
  type EventCard,
  isCardAvailableInWeek,
  getEventTemplates,
} from '../../example-games/main-street/MainStreetCards';
import { weekLabel } from '../../example-games/main-street/MainStreetFormatting';

// ── Fixtures ────────────────────────────────────────────────

/** Irish-holiday cards authored as part of the annual calendar (AC 7). */
const IRISH_HOLIDAY_CONTRACTS: Array<{
  id: string;
  name: string;
  start: number;
  end: number;
}> = [
  { id: 'evt-st-brigids', name: "St Brigid's Day", start: 5, end: 5 },
  { id: 'evt-st-patricks', name: "St Patrick's Day", start: 11, end: 12 },
  { id: 'evt-easter', name: 'Easter', start: 13, end: 17 },
  { id: 'evt-may-day', name: 'May Day / Bealtaine', start: 18, end: 18 },
  { id: 'evt-lughnasadh', name: 'Lughnasadh', start: 31, end: 31 },
  { id: 'evt-samhain', name: 'Samhain / Halloween', start: 44, end: 44 },
  { id: 'evt-christmas', name: 'Christmas', start: 51, end: 52 },
];

function templateById(id: string): EventCard {
  const card = getEventTemplates().find((c: EventCard) => c.id === id);
  expect(card, `event template ${id} should exist in card-data.csv`).toBeDefined();
  return card as EventCard;
}

// ── Tests ───────────────────────────────────────────────────

describe('Harvest Festival and Summer Fest windows (AC 5/6)', () => {
  it('evt-harvest-festival is restricted to weeks 38-41', () => {
    const card = templateById('evt-harvest-festival');
    expect(card.availableWeekStart).toBe(38);
    expect(card.availableWeekEnd).toBe(41);
    // Inside the window → offerable.
    expect(isCardAvailableInWeek(card, 38)).toBe(true);
    expect(isCardAvailableInWeek(card, 40)).toBe(true);
    expect(isCardAvailableInWeek(card, 41)).toBe(true);
    // Outside the window → not offerable (neither early nor late).
    expect(isCardAvailableInWeek(card, 37)).toBe(false);
    expect(isCardAvailableInWeek(card, 42)).toBe(false);
    expect(isCardAvailableInWeek(card, 28)).toBe(false);
  });

  it('evt-summer-fest is restricted to weeks 23-35', () => {
    const card = templateById('evt-summer-fest');
    expect(card.availableWeekStart).toBe(23);
    expect(card.availableWeekEnd).toBe(35);
    expect(isCardAvailableInWeek(card, 23)).toBe(true);
    expect(isCardAvailableInWeek(card, 28)).toBe(true);
    expect(isCardAvailableInWeek(card, 35)).toBe(true);
    expect(isCardAvailableInWeek(card, 22)).toBe(false);
    expect(isCardAvailableInWeek(card, 36)).toBe(false);
    expect(isCardAvailableInWeek(card, 40)).toBe(false);
  });
});

describe('Irish-holiday event cards (AC 7)', () => {
  it('adds each of the 7 contracted holiday cards with a declared window', () => {
    for (const contract of IRISH_HOLIDAY_CONTRACTS) {
      const card = templateById(contract.id);
      expect(card.name).toBe(contract.name);
      expect(card.availableWeekStart, `${contract.id} start`).toBe(contract.start);
      expect(card.availableWeekEnd, `${contract.id} end`).toBe(contract.end);
    }
  });

  it('each holiday card is only offerable inside its window', () => {
    for (const contract of IRISH_HOLIDAY_CONTRACTS) {
      const card = templateById(contract.id);
      // At the exact window boundaries the card is available.
      expect(
        isCardAvailableInWeek(card, contract.start),
        `${contract.id} at start week ${contract.start}`,
      ).toBe(true);
      expect(
        isCardAvailableInWeek(card, contract.end),
        `${contract.id} at end week ${contract.end}`,
      ).toBe(true);
      // The week just before and just after are not available.
      expect(
        isCardAvailableInWeek(card, contract.start - 1),
        `${contract.id} before its window`,
      ).toBe(false);
      expect(
        isCardAvailableInWeek(card, contract.end + 1),
        `${contract.id} after its window`,
      ).toBe(false);
    }
  });

  it('keeps generic events year-round (no window)', () => {
    // A representative set of generic economic/administrative incidents must
    // remain always-available so incident resolution is never starved.
    for (const id of ['evt-tax', 'evt-award', 'evt-rainy', 'evt-recession', 'evt-service-week']) {
      const card = templateById(id);
      expect(card.availableWeekStart, `${id} start`).toBeUndefined();
      expect(card.availableWeekEnd, `${id} end`).toBeUndefined();
      expect(isCardAvailableInWeek(card, 1)).toBe(true);
      expect(isCardAvailableInWeek(card, 26)).toBe(true);
      expect(isCardAvailableInWeek(card, 52)).toBe(true);
    }
  });
});

describe('weekLabel (Feature 5 AC 1 / HUD)', () => {
  it('renders "Week W · Year Y"', () => {
    expect(weekLabel(12, 1)).toBe('Week 12 · Year 1');
    expect(weekLabel(1, 3)).toBe('Week 1 · Year 3');
    expect(weekLabel(52, 10)).toBe('Week 52 · Year 10');
  });
});