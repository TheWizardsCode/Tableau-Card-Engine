/**
 * Main Street: Staff underlay formatting tests
 * (CG-0MU3BTTCH001E7ZD, parent CG-0MTIOLY2A0092OT1 — "Staff for businesses").
 *
 * Unit coverage for the pure tooltip-enumeration helper used by the business
 * slot tooltip: each employed staff member's name, allowedBusinessTypes (or
 * "Generalist"), and effect description; null for empty slots (AC5).
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import { formatEmployedStaffSummary } from '../../example-games/main-street/MainStreetFormatting';
import { createStaffDeck, type StaffCard } from '../../example-games/main-street/MainStreetCards';

/** An employed staff fixture with a known name/types/description. */
function member(name: string, types?: string[]): StaffCard {
  const base = createStaffDeck(1)[0]!;
  return {
    ...base,
    id: `staff-${name.toLowerCase()}-0`,
    name,
    ...(types ? { allowedBusinessTypes: types } : { allowedBusinessTypes: undefined as never }),
    description: `${name} effect text.`,
  };
}

describe('formatEmployedStaffSummary (AC2/AC3/AC5)', () => {
  it('returns null when no staff are employed (AC5 empty state)', () => {
    expect(formatEmployedStaffSummary([])).toBeNull();
    expect(formatEmployedStaffSummary(null as never)).toBeNull();
  });

  it('enumerates each member with name, types and effect description', () => {
    const summary = formatEmployedStaffSummary([
      member('Chef', ['Cafe', 'Diner', 'Food', 'Delicatessen']),
      member('Barista', ['Cafe', 'Food']),
    ]);
    expect(summary).not.toBeNull();
    expect(summary!).toContain('Employed staff (2):');
    expect(summary!).toContain('• Chef (Cafe/Diner/Food/Delicatessen) — Chef effect text.');
    expect(summary!).toContain('• Barista (Cafe/Food) — Barista effect text.');
  });

  it('labels members without allowedBusinessTypes as Generalist (legacy)', () => {
    const summary = formatEmployedStaffSummary([member('Assistant')]);
    expect(summary!).toContain('• Assistant (Generalist) — Assistant effect text.');
  });

  it('aggregates alongside business info (the tooltip is one string)', () => {
    const summary = formatEmployedStaffSummary([member('Florist', ['Florist', 'Commerce', 'Culture'])]);
    // The renderer appends the summary to the business info line.
    const full = `Business: Florist Shop\nIncome: +10/turn${summary}`;
    expect(full).toContain('Business: Florist Shop');
    expect(full).toContain('Employed staff (1):');
    expect(full).toContain('• Florist (Florist/Commerce/Culture) — Florist effect text.');
  });
});