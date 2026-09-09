/**
 * Week-Window Data Model for Event Cards (CG-0MTT0K9RX0004QTE / F1)
 *
 * Tests for the week-window CSV schema and isCardAvailableInWeek helper:
 * - undefined window → year-round (always available)
 * - isCardAvailableInWeek returns true when week is in [start, end]
 * - isCardAvailableInWeek returns false when week is outside the window
 * - DurationEventCard inherits the optional fields
 * - Type guard works correctly
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  type EventCard,
  type DurationEventCard,
  isDurationEventCard,
  isCardAvailableInWeek,
  getEventTemplates,
  loadTemplatesFromCsv,
  resetTemplatesToDefault,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Build a minimal EventCard with optional window fields. */
function makeEventCard(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event' as const,
    id: overrides.id ?? 'evt-test',
    name: overrides.name ?? 'Test Event',
    trigger: overrides.trigger ?? 'Incident',
    cost: 0,
    effect: 'test effect',
    target: 'All',
    coinDelta: 0,
    reputationDelta: 0,
    ...overrides,
  };
}

/** Build a DurationEventCard with optional window fields. */
function makeDurationEventCard(overrides: Partial<DurationEventCard> = {}): DurationEventCard {
  return {
    family: 'event' as const,
    id: overrides.id ?? 'evt-duration-test',
    name: overrides.name ?? 'Duration Test Event',
    trigger: overrides.trigger ?? 'Incident',
    cost: 100,
    effect: 'test duration effect',
    target: 'All',
    coinDelta: 0,
    reputationDelta: 0,
    duration: 5,
    effectType: 'income-multiplier',
    multiplier: 0.8,
    ...overrides,
  };
}

// ── isCardAvailableInWeek tests ─────────────────────────────

describe('isCardAvailableInWeek', () => {
  it('returns true for a card with no window (year-round)', () => {
    const card = makeEventCard();
    expect(isCardAvailableInWeek(card, 1)).toBe(true);
    expect(isCardAvailableInWeek(card, 26)).toBe(true);
    expect(isCardAvailableInWeek(card, 52)).toBe(true);
  });

  it('returns true when week equals start', () => {
    const card = makeEventCard({ availableWeekStart: 10, availableWeekEnd: 20 });
    expect(isCardAvailableInWeek(card, 10)).toBe(true);
  });

  it('returns true when week equals end', () => {
    const card = makeEventCard({ availableWeekStart: 10, availableWeekEnd: 20 });
    expect(isCardAvailableInWeek(card, 20)).toBe(true);
  });

  it('returns true when week is strictly between start and end', () => {
    const card = makeEventCard({ availableWeekStart: 10, availableWeekEnd: 20 });
    expect(isCardAvailableInWeek(card, 15)).toBe(true);
  });

  it('returns false when week is before start', () => {
    const card = makeEventCard({ availableWeekStart: 10, availableWeekEnd: 20 });
    expect(isCardAvailableInWeek(card, 9)).toBe(false);
  });

  it('returns false when week is after end', () => {
    const card = makeEventCard({ availableWeekStart: 10, availableWeekEnd: 20 });
    expect(isCardAvailableInWeek(card, 21)).toBe(false);
  });

  it('handles a single-week window (start === end)', () => {
    const card = makeEventCard({ availableWeekStart: 18, availableWeekEnd: 18 });
    expect(isCardAvailableInWeek(card, 18)).toBe(true);
    expect(isCardAvailableInWeek(card, 17)).toBe(false);
    expect(isCardAvailableInWeek(card, 19)).toBe(false);
  });

  it('handles a full-year window (1–52)', () => {
    const card = makeEventCard({ availableWeekStart: 1, availableWeekEnd: 52 });
    expect(isCardAvailableInWeek(card, 1)).toBe(true);
    expect(isCardAvailableInWeek(card, 26)).toBe(true);
    expect(isCardAvailableInWeek(card, 52)).toBe(true);
  });

  it('handles end-of-year window without wrapping', () => {
    const card = makeEventCard({ availableWeekStart: 50, availableWeekEnd: 52 });
    expect(isCardAvailableInWeek(card, 50)).toBe(true);
    expect(isCardAvailableInWeek(card, 52)).toBe(true);
    expect(isCardAvailableInWeek(card, 1)).toBe(false); // does not wrap
  });
});

// ── DurationEventCard tests ─────────────────────────────────

describe('DurationEventCard week-window', () => {
  it('isCardAvailableInWeek works on DurationEventCard', () => {
    const card = makeDurationEventCard({ availableWeekStart: 23, availableWeekEnd: 35 });
    expect(isCardAvailableInWeek(card, 23)).toBe(true);
    expect(isCardAvailableInWeek(card, 28)).toBe(true);
    expect(isCardAvailableInWeek(card, 35)).toBe(true);
    expect(isCardAvailableInWeek(card, 22)).toBe(false);
    expect(isCardAvailableInWeek(card, 36)).toBe(false);
  });

  it('DurationEventCard with no window is year-round', () => {
    const card = makeDurationEventCard();
    expect(isCardAvailableInWeek(card, 1)).toBe(true);
    expect(isCardAvailableInWeek(card, 52)).toBe(true);
  });
});

// ── CSV parsing tests ───────────────────────────────────────

describe('CSV parsing: availableWeekStart / availableWeekEnd', () => {
  // The CSV header has 34 columns. We'll append two more for our new fields.
  const csvWithWindows = `family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,newDisplayName,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn,art_notes,availableWeekStart,availableWeekEnd
event,evt-windowed,Festival Event,300,,,,,,,,,1,Investment,+2 coins,SpecificSynergy,Culture,200,100,,,,,,,,,,,,,,,Festival art,18,35
event,evt-year-round,All Year Event,100,,,,,,,,,2,Incident,-1 coin,All,,-100,0,,,,,,,,,,,,,,,Year-round art,,,
event,evt-single-week,Single Week Event,0,,,,,,,,,3,Incident,+1 rep,All,,0,100,,,,,,,,,,,,,,,Single week art,12,12`;

  afterEach(() => {
    // Restore original templates
    resetTemplatesToDefault();
  });

  it('parses windowed event card with start/end', () => {
    loadTemplatesFromCsv(csvWithWindows);
    const templates = getEventTemplates();
    const windowed = templates.find((c: EventCard) => c.id === 'evt-windowed');
    expect(windowed).toBeDefined();
    expect((windowed as any).availableWeekStart).toBe(18);
    expect((windowed as any).availableWeekEnd).toBe(35);
    expect(isCardAvailableInWeek(windowed as EventCard, 18)).toBe(true);
    expect(isCardAvailableInWeek(windowed as EventCard, 26)).toBe(true);
    expect(isCardAvailableInWeek(windowed as EventCard, 35)).toBe(true);
    expect(isCardAvailableInWeek(windowed as EventCard, 17)).toBe(false);
    expect(isCardAvailableInWeek(windowed as EventCard, 36)).toBe(false);
  });

  it('parses year-round event card with empty window columns', () => {
    loadTemplatesFromCsv(csvWithWindows);
    const templates = getEventTemplates();
    const yearRound = templates.find((c: EventCard) => c.id === 'evt-year-round');
    expect(yearRound).toBeDefined();
    // Empty CSV columns → undefined → year-round
    expect((yearRound as any).availableWeekStart).toBeUndefined();
    expect((yearRound as any).availableWeekEnd).toBeUndefined();
    expect(isCardAvailableInWeek(yearRound as EventCard, 1)).toBe(true);
    expect(isCardAvailableInWeek(yearRound as EventCard, 52)).toBe(true);
  });

  it('parses single-week window card (start === end)', () => {
    loadTemplatesFromCsv(csvWithWindows);
    const templates = getEventTemplates();
    const single = templates.find((c: EventCard) => c.id === 'evt-single-week');
    expect(single).toBeDefined();
    expect((single as any).availableWeekStart).toBe(12);
    expect((single as any).availableWeekEnd).toBe(12);
    expect(isCardAvailableInWeek(single as EventCard, 12)).toBe(true);
    expect(isCardAvailableInWeek(single as EventCard, 11)).toBe(false);
    expect(isCardAvailableInWeek(single as EventCard, 13)).toBe(false);
  });

  it('isDurationEventCard type guard works correctly', () => {
    const regularCard = makeEventCard({ id: 'evt-regular', trigger: 'Incident' });
    const durationCard = makeDurationEventCard({ id: 'evt-duration' });

    expect(isDurationEventCard(regularCard)).toBe(false);
    expect(isDurationEventCard(durationCard)).toBe(true);
    expect(isDurationEventCard(null as any)).toBe(false);
    expect(isDurationEventCard('not a card' as any)).toBe(false);
  });
});
