/**
 * Event Choice Data Model (CG-0MTT7DUJE002HPPM / parent CG-0MTSHG8RP008E128)
 *
 * Tests for the three choice-event fields added to EventCard:
 * - hasChoices      boolean  (true => intercepts at resolution)
 * - acceptNextCardId string | null (added to incident deck on Accept)
 * - rejectNextCardId string | null (added to incident deck on Reject)
 *
 * DurationEventCard inherits them via EventCard.
 * Backward compat: missing fields => non-choice behavior (hasChoices falsy).
 *
 * CSV parsing: new columns are present in header; existing rows default to
 * empty / falsy; hasChoices==='true' is parsed as true else absent.
 *
 * @module
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  type EventCard,
  type DurationEventCard,
  isDurationEventCard,
  getEventTemplates,
  loadTemplatesFromCsv,
  resetTemplatesToDefault,
} from '../../example-games/main-street/MainStreetCards';

// ── Factories ───────────────────────────────────────────────

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

// ── Interface presence / backward compat ────────────────────

describe('EventCard choice fields — interface & backward compat', () => {
  it('card without hasChoices is treated as non-choice (falsy)', () => {
    const card = makeEventCard();
    // must not have truthy hasChoices when absent
    expect(Boolean((card as EventCard).hasChoices)).toBe(false);
  });

  it('card with hasChoices: true is a choice event', () => {
    const card = makeEventCard({ hasChoices: true });
    expect(card.hasChoices).toBe(true);
  });

  it('card with hasChoices: false explicitly is not a choice event', () => {
    const card = makeEventCard({ hasChoices: false });
    expect(card.hasChoices).toBe(false);
    expect(Boolean(card.hasChoices)).toBe(false);
  });

  it('acceptNextCardId null ends the chain (no card added)', () => {
    const card = makeEventCard({ hasChoices: true, acceptNextCardId: null });
    expect(card.acceptNextCardId).toBeNull();
  });

  it('rejectNextCardId null ends the chain (no card added)', () => {
    const card = makeEventCard({ hasChoices: true, rejectNextCardId: null });
    expect(card.rejectNextCardId).toBeNull();
  });

  it('acceptNextCardId with a card id links the chain', () => {
    const card = makeEventCard({ hasChoices: true, acceptNextCardId: 'evt-next' });
    expect(card.acceptNextCardId).toBe('evt-next');
  });

  it('rejectNextCardId with a card id links the chain', () => {
    const card = makeEventCard({ hasChoices: true, rejectNextCardId: 'evt-worse' });
    expect(card.rejectNextCardId).toBe('evt-worse');
  });

  it('omitting acceptNextCardId and rejectNextCardId ends both paths', () => {
    const card = makeEventCard({ hasChoices: true });
    expect(card.acceptNextCardId).toBeUndefined();
    expect(card.rejectNextCardId).toBeUndefined();
  });

  it('choice fields can differ per path (accept null, reject set)', () => {
    const card = makeEventCard({
      hasChoices: true,
      acceptNextCardId: null,
      rejectNextCardId: 'evt-escalation',
    });
    expect(card.acceptNextCardId).toBeNull();
    expect(card.rejectNextCardId).toBe('evt-escalation');
  });
});

// ── DurationEventCard inherits ─────────────────────────────

describe('DurationEventCard inherits choice fields', () => {
  it('DurationEventCard can carry hasChoices + next-card ids', () => {
    const card = makeDurationEventCard({
      hasChoices: true,
      acceptNextCardId: null,
      rejectNextCardId: 'evt-recession-worse',
    });
    expect(card.hasChoices).toBe(true);
    expect(card.acceptNextCardId).toBeNull();
    expect(card.rejectNextCardId).toBe('evt-recession-worse');
    expect(isDurationEventCard(card)).toBe(true);
  });

  it('DurationEventCard without choice fields is non-choice', () => {
    const card = makeDurationEventCard();
    expect(Boolean(card.hasChoices)).toBe(false);
    expect(card.acceptNextCardId).toBeUndefined();
    expect(card.rejectNextCardId).toBeUndefined();
  });

  it('CSV-built DurationEventCard preserves choice fields', () => {
    // Covered in the CSV suite below, but smoke-check the type layer here:
    const d: DurationEventCard = makeDurationEventCard({
      hasChoices: true,
      rejectNextCardId: 'evt-depression',
    });
    const asEvent: EventCard = d; // must be assignable
    expect(asEvent.hasChoices).toBe(true);
  });
});

// ── CSV parsing ─────────────────────────────────────────────

describe('CSV parsing: hasChoices / acceptNextCardId / rejectNextCardId', () => {
  const csvWithChoices =
    `family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,newDisplayName,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn,art_notes,hasChoices,acceptNextCardId,rejectNextCardId
event,evt-choice-yes,Choice Yes,0,,,,,,,,,1,Incident,Test incident,All,,-300,0,,,,,,,,,,,,,,,,true,evt-next-accept,evt-next-reject
event,evt-choice-no,Choice No,0,,,,,,,,,1,Incident,Test incident 2,All,,0,0,,,,,,,,,,,,,,,,false,,
event,evt-plain,Plain Event,0,,,,,,,,,1,Incident,Plain incident,All,,-100,0,,,,,,,,,,,,,,,,,,,
event,evt-duration-choice,Duration Choice,100,,,,,,,,,1,Incident,Duration incident,All,,0,0,5,income-multiplier,0.8,,,,,,,,,,,,,true,,evt-depression
event,evt-accept-only,Accept Only,0,,,,,,,,,1,Incident,Accept only,All,,-300,0,,,,,,,,,,,,,,,,true,,
event,evt-reject-only,Reject Only,0,,,,,,,,,1,Incident,Reject only,All,,-300,0,,,,,,,,,,,,,,,,true,,evt-worse`;

  afterEach(() => {
    resetTemplatesToDefault();
  });

  it('parses a choice event with both next-card ids', () => {
    loadTemplatesFromCsv(csvWithChoices);
    const t = getEventTemplates().find(c => c.id === 'evt-choice-yes') as EventCard;
    expect(t).toBeDefined();
    expect(t.hasChoices).toBe(true);
    expect(t.acceptNextCardId).toBe('evt-next-accept');
    expect(t.rejectNextCardId).toBe('evt-next-reject');
  });

  it("treats hasChoices=false as non-choice (falsy)", () => {
    loadTemplatesFromCsv(csvWithChoices);
    const t = getEventTemplates().find(c => c.id === 'evt-choice-no') as EventCard;
    expect(t).toBeDefined();
    expect(t.hasChoices).toBeUndefined(); // parser omits hasChoices when not true
    expect(Boolean(t.hasChoices)).toBe(false);
  });

  it('plain event with empty choice columns is non-choice with undefined next ids', () => {
    loadTemplatesFromCsv(csvWithChoices);
    const t = getEventTemplates().find(c => c.id === 'evt-plain') as EventCard;
    expect(t).toBeDefined();
    expect(t.hasChoices).toBeUndefined();
    expect(t.acceptNextCardId).toBeUndefined();
    expect(t.rejectNextCardId).toBeUndefined();
  });

  it('DurationEventCard from CSV carries choice fields', () => {
    loadTemplatesFromCsv(csvWithChoices);
    const t = getEventTemplates().find(c => c.id === 'evt-duration-choice') as EventCard;
    expect(t).toBeDefined();
    expect(isDurationEventCard(t)).toBe(true);
    expect((t as EventCard).hasChoices).toBe(true);
    expect((t as EventCard).rejectNextCardId).toBe('evt-depression');
    // accept was empty -> omitted
    expect((t as EventCard).acceptNextCardId).toBeUndefined();
  });

  it('choice event with both next ids blank has undefined next ids', () => {
    loadTemplatesFromCsv(csvWithChoices);
    const t = getEventTemplates().find(c => c.id === 'evt-accept-only') as EventCard;
    expect(t).toBeDefined();
    expect(t.hasChoices).toBe(true);
    expect(t.acceptNextCardId).toBeUndefined();
    expect(t.rejectNextCardId).toBeUndefined();
  });

  it('choice event with only reject next id has rejectNextCardId set', () => {
    loadTemplatesFromCsv(csvWithChoices);
    const t = getEventTemplates().find(c => c.id === 'evt-reject-only') as EventCard;
    expect(t).toBeDefined();
    expect(t.hasChoices).toBe(true);
    expect(t.rejectNextCardId).toBe('evt-worse');
    expect(t.acceptNextCardId).toBeUndefined();
  });

  it('original bundled CSV still parses (existing 155 rows without choice values remain non-choice)', () => {
    // No reload — bundled CSV is active; every incident card must still parse
    // and be non-choice by default.
    const all = getEventTemplates();
    for (const c of all) {
      // No incident in the shipped data should accidentally be flagged
      expect(Boolean(c.hasChoices)).toBe(false);
    }
  });
});

// ── hasChoices boolean semantics (strict 'true') ────────────

describe('CSV hasChoices is strict: only literal "true" is accepted', () => {
  const csvMixedCase =
    `family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,newDisplayName,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn,art_notes,hasChoices,acceptNextCardId,rejectNextCardId
event,evt-yes-lower,Yes Lower,0,,,,,,,,,1,Incident,event,All,,0,0,,,,,,,,,,,,,,,,true,,
event,evt-yes-upper,Yes Upper,0,,,,,,,,,1,Incident,event,All,,0,0,,,,,,,,,,,,,,,,TRUE,,
event,evt-yes-one,Yes One,0,,,,,,,,,1,Incident,event,All,,0,0,,,,,,,,,,,,,,,,1,,
event,evt-no,No,0,,,,,,,,,1,Incident,event,All,,0,0,,,,,,,,,,,,,,,,false,,`;

  afterEach(() => resetTemplatesToDefault());

  it('only "true" (case-insensitive) is treated as hasChoices=true; others are falsy', () => {
    loadTemplatesFromCsv(csvMixedCase);
    const lower = getEventTemplates().find(c => c.id === 'evt-yes-lower') as EventCard;
    const upper = getEventTemplates().find(c => c.id === 'evt-yes-upper') as EventCard;
    const one = getEventTemplates().find(c => c.id === 'evt-yes-one') as EventCard;
    const no = getEventTemplates().find(c => c.id === 'evt-no') as EventCard;
    expect(lower?.hasChoices).toBe(true);
    expect(upper?.hasChoices).toBe(true); // TRUE normalized to lowercase
    expect(one?.hasChoices).toBeUndefined(); // "1" !== "true"
    expect(no?.hasChoices).toBeUndefined();
  });
});
