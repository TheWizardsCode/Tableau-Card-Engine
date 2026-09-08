/**
 * Unit tests for scripts/generate-main-street-card-svgs.mjs — the Node.js
 * CLI that generates static card SVGs from card-data.csv.
 *
 * These tests verify:
 * - Staff cards retain baked `-X/turn` cost text (CG-0MTDMOYOL008IQVO: AC-4)
 * - Business/community-space cards do NOT have baked cost text (AC-1)
 * - Staff card details (hand slots, peek) are rendered correctly
 *
 * @module
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateCardSvgFromCsvRow } from '../../example-games/main-street/scenes/MainStreetCardSvgGenerator';
// @ts-ignore: no declaration file for .mjs script — intentional
import {
  generateCardSvg as generateCardSvgMjs,
  regenerateCardSvgs,
  // @ts-ignore: no declaration file for .mjs script — intentional
} from '../../scripts/generate-main-street-card-svgs.mjs';

// ---------------------------------------------------------------------------
// MJS generator — staff card baked cost text (AC-4: fix for previous regression)
// ---------------------------------------------------------------------------

describe('MJS SVG generator — staff card baked cost text', () => {
  it('should include -X/turn text for staff cards (CG-0MTDMOYOL008IQVO)', () => {
    const svg = generateCardSvgMjs({
      id: 'staff-test',
      name: 'Test Staff',
      family: 'staff',
      cost: 3,
      synergies: [],
      trigger: null,
      ongoingCost: 100,
      handSlotsAdded: 1,
      peekOncePerTurn: null,
    });
    expect(svg).toContain('-100/turn');
    expect(svg).toContain('#ff8844'); // orange cost colour
  });

  it('should include hand slots text for staff cards', () => {
    const svg = generateCardSvgMjs({
      id: 'staff-test',
      name: 'Test Staff',
      family: 'staff',
      cost: 3,
      synergies: [],
      trigger: null,
      ongoingCost: 100,
      handSlotsAdded: 2,
      peekOncePerTurn: null,
    });
    expect(svg).toContain('+2 slots');
    expect(svg).toContain('#88bbff'); // blue slots colour
  });

  it('should include peek text for staff cards with peekOncePerTurn', () => {
    const svg = generateCardSvgMjs({
      id: 'staff-test',
      name: 'Test Staff',
      family: 'staff',
      cost: 3,
      synergies: [],
      trigger: null,
      ongoingCost: 100,
      handSlotsAdded: 1,
      peekOncePerTurn: 1,
    });
    expect(svg).toContain('peek 1/turn');
    expect(svg).toContain('#ffcc66'); // gold peek colour
  });

  it('should NOT include ongoing-cost text for business cards', () => {
    const svg = generateCardSvgMjs({
      id: 'biz-test',
      name: 'Test Business',
      family: 'business',
      cost: 6,
      synergies: ['Food'],
      trigger: null,
      ongoingCost: 50,
      handSlotsAdded: 0,
      peekOncePerTurn: null,
    });
    expect(svg).not.toContain('-50/turn');
    expect(svg).not.toContain('#ff8844');
  });

  it('should NOT include ongoing-cost text for community-space cards', () => {
    const svg = generateCardSvgMjs({
      id: 'cs-test',
      name: 'Test Space',
      family: 'community-space',
      cost: 4,
      synergies: ['Culture'],
      trigger: null,
      ongoingCost: 25,
      handSlotsAdded: 0,
      peekOncePerTurn: null,
    });
    expect(svg).not.toContain('-25/turn');
    expect(svg).not.toContain('#ff8844');
  });

  it('should NOT include staff text for event cards', () => {
    const svg = generateCardSvgMjs({
      id: 'evt-test',
      name: 'Test Event',
      family: 'event',
      cost: 5,
      synergies: [],
      trigger: 'Incident',
      ongoingCost: null,
      handSlotsAdded: null,
      peekOncePerTurn: null,
    });
    expect(svg).not.toContain('/turn');
  });
});

// ---------------------------------------------------------------------------
// MJS generator — static SVG files contain staff cost text (regression guard)
// ---------------------------------------------------------------------------

describe('MJS SVG generator — shipped static SVGs retain staff cost text', () => {
  it('should regenerate SVGs and verify staff-*.svg contain -X/turn text (CG-0MTDMOYOL008IQVO)', () => {
    regenerateCardSvgs();

    const svgDir = resolve(
      process.cwd(),
      'public/assets/games/main-street/svg/cards',
    );
    const staffSvgs = readdirSync(svgDir)
      .filter(name => name.startsWith('staff-') && name.endsWith('.svg'));

    expect(staffSvgs.length).toBeGreaterThan(0);

    for (const svgName of staffSvgs) {
      const svgContent = readFileSync(resolve(svgDir, svgName), 'utf8');
      // All staff cards should have ongoing cost text in the static SVGs
      expect(svgContent).toMatch(/-[0-9]+\/turn/);
      expect(svgContent).toContain('#ff8844');
    }
  });

  it('should NOT have -X/turn text in business/community-space static SVGs', () => {
    regenerateCardSvgs();

    const svgDir = resolve(
      process.cwd(),
      'public/assets/games/main-street/svg/cards',
    );

    const bizSvgs = readdirSync(svgDir)
      .filter(name => name.startsWith('biz-') && name.endsWith('.svg'));
    const csSvgs = readdirSync(svgDir)
      .filter(name => name.startsWith('cs-') && name.endsWith('.svg'));

    for (const svgName of [...bizSvgs, ...csSvgs]) {
      const svgContent = readFileSync(resolve(svgDir, svgName), 'utf8');
      expect(svgContent).not.toMatch(/-[0-9.]+\/turn/);
      expect(svgContent).not.toContain('#ff8844');
    }
  });
});

// ---------------------------------------------------------------------------
// CSV-row generator — staff baked cost text (TS fallback path)
// ---------------------------------------------------------------------------

describe('TS CSV-row SVG generator — staff baked cost text', () => {
  it('should include -X/turn text for staff cards from CSV row (CG-0MTDMOYOL008IQVO)', () => {
    const row: Record<string, string> = {
      id: 'staff-test-csv',
      name: 'Test Staff',
      family: 'staff',
      cost: '3',
      ongoingCost: '1',
    };
    const svg = generateCardSvgFromCsvRow(row);
    expect(svg).toContain('-1/turn');
    expect(svg).toContain('#ff8844');
  });

  it('should include hand slots text for staff cards from CSV row', () => {
    const row: Record<string, string> = {
      id: 'staff-test-csv',
      name: 'Test Staff',
      family: 'staff',
      cost: '3',
      ongoingCost: '1',
      handSlotsAdded: '2',
    };
    const svg = generateCardSvgFromCsvRow(row);
    expect(svg).toContain('+2 slots');
  });
});
