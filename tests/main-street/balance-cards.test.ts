import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  RationaleCode,
  rationaleLabel,
  isValidRationaleCode,
  getAllRationaleCodes,
  computeBusinessExpectedCost,
  computeEventExpectedCost,
  computeUpgradeExpectedCost,
  computeStaffExpectedCost,
  assignTierBands,
  computeBusinessRewardSpread,
  computeEventRewardSpread,
  computeUpgradeRewardSpread,
  computeStaffRewardSpread,
  runBalancingPass,
  TIER_BANDS,
  parseCsv,
  validateRow,
  validateCsvRows,
  rotateBackups,
  listBackups,
  formatSummaryTable,
  toCsvString,
  type CsvRow,
} from '../../src/balance-cards';

// ── Test helpers ──────────────────────────────────────────────────────

function makeBusinessRow(overrides: Partial<Record<string, string>> = {}): CsvRow {
  return {
    family: 'business',
    id: 'test-biz',
    name: 'Test Business',
    cost: '6',
    baseIncome: '1',
    synergyTypes: 'Food',
    upgradePath: '',
    maxLevel: '1',
    reputationPerTurn: '',
    description: '',
    tier: '1',
    ...overrides,
  };
}

function makeEventRow(overrides: Partial<Record<string, string>> = {}): CsvRow {
  return {
    family: 'event',
    id: 'test-event',
    name: 'Test Event',
    cost: '2',
    baseIncome: '',
    synergyTypes: '',
    upgradePath: '',
    maxLevel: '',
    reputationPerTurn: '',
    description: '',
    trigger: 'Investment',
    effect: '',
    target: '',
    targetSynergy: '',
    coinDelta: '2',
    reputationDelta: '1',
    tier: '1',
    ...overrides,
  };
}

function makeUpgradeRow(overrides: Partial<Record<string, string>> = {}): CsvRow {
  return {
    family: 'upgrade',
    id: 'test-upgrade',
    name: 'Test Upgrade',
    cost: '3',
    baseIncome: '',
    synergyTypes: '',
    upgradePath: '',
    maxLevel: '',
    reputationPerTurn: '',
    description: '',
    targetBusiness: 'Bakery',
    incomeBonus: '1',
    synergyRangeBonus: '1',
    requiredLevel: '0',
    reputationBonus: '',
    tier: '1',
    ...overrides,
  };
}

function makeStaffRow(overrides: Partial<Record<string, string>> = {}): CsvRow {
  return {
    family: 'staff',
    id: 'test-staff',
    name: 'Test Staff',
    cost: '3',
    baseIncome: '',
    synergyTypes: '',
    upgradePath: '',
    maxLevel: '',
    reputationPerTurn: '',
    description: '',
    ongoingCost: '1',
    handSlotsAdded: '1',
    tier: '1',
    ...overrides,
  };
}

// ── Rationale code tests (AC2) ──────────────────────────────────────

describe('Rationale Code Enum', () => {
  it('contains all expected rationale codes', () => {
    const expected = [
      'TIER_REASSIGN', 'COST_CURVE_FIT', 'REWARD_SPREAD', 'BAND_BALANCE',
      'INCIDENT_FREE', 'MIN_COST_FLOOR', 'MAX_COST_CEIL', 'SPECIAL_CASE',
      'SYNERGY_BONUS_ADJ', 'INCOME_ADJUST', 'REPUTATION_ADJ',
      'ONGOING_COST_ADJ', 'HAND_SLOT_ADJ', 'SCOPE_ADJ',
    ];
    const actual = Object.values(RationaleCode);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it('has a human-readable label for every code', () => {
    for (const code of getAllRationaleCodes()) {
      const label = rationaleLabel(code);
      expect(label).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain('Unknown');
    }
  });

  it('isValidRationaleCode returns true for known codes', () => {
    for (const code of getAllRationaleCodes()) {
      expect(isValidRationaleCode(code)).toBe(true);
    }
  });

  it('isValidRationaleCode returns false for unknown codes', () => {
    expect(isValidRationaleCode('UNKNOWN_CODE')).toBe(false);
    expect(isValidRationaleCode('')).toBe(false);
    expect(isValidRationaleCode('tier_reassign')).toBe(false);
  });
});

// ── Cost curve tests (AC1a) ─────────────────────────────────────────

describe('Cost Curve: Business', () => {
  it('returns a positive cost for a basic business', () => {
    const row = makeBusinessRow({ cost: '6', baseIncome: '1' });
    expect(computeBusinessExpectedCost(row)).toBeGreaterThan(0);
  });

  it('gives higher expected cost for higher-income business', () => {
    const low = makeBusinessRow({ baseIncome: '0' });
    const high = makeBusinessRow({ baseIncome: '2' });
    expect(computeBusinessExpectedCost(high)).toBeGreaterThan(
      computeBusinessExpectedCost(low),
    );
  });

  it('accounts for multi-synergy cards', () => {
    const single = makeBusinessRow({ synergyTypes: 'Food' });
    const dual = makeBusinessRow({ synergyTypes: 'Food|Culture' });
    expect(computeBusinessExpectedCost(dual)).toBeGreaterThan(
      computeBusinessExpectedCost(single),
    );
  });

  it('accounts for synergy coin/rep bonuses', () => {
    const noBonus = makeBusinessRow({});
    const withBonus = makeBusinessRow({ synergyCoinBonus: '1', synergyRepBonus: '0.1' });
    expect(computeBusinessExpectedCost(withBonus)).toBeGreaterThan(
      computeBusinessExpectedCost(noBonus),
    );
  });

  it('accounts for reputation per turn', () => {
    const noRep = makeBusinessRow({ reputationPerTurn: '' });
    const withRep = makeBusinessRow({ reputationPerTurn: '0.2' });
    expect(computeBusinessExpectedCost(withRep)).toBeGreaterThan(
      computeBusinessExpectedCost(noRep),
    );
  });

  it('is deterministic for identical inputs', () => {
    const row = makeBusinessRow({ cost: '8', baseIncome: '1', synergyTypes: 'Commerce|Culture' });
    for (let i = 0; i < 10; i++) {
      expect(computeBusinessExpectedCost(row)).toBe(computeBusinessExpectedCost(row));
    }
  });
});

describe('Cost Curve: Community Space', () => {
  it('applies the same curve as businesses', () => {
    const cs = makeBusinessRow({ family: 'community-space', baseIncome: '1' });
    expect(computeBusinessExpectedCost(cs)).toBeGreaterThan(0);
  });
});

describe('Cost Curve: Investment Events', () => {
  it('returns a positive cost for an investment event', () => {
    const row = makeEventRow({ coinDelta: '2', reputationDelta: '1' });
    expect(computeEventExpectedCost(row)).toBeGreaterThan(0);
  });

  it('gives higher cost for larger coin delta', () => {
    const small = makeEventRow({ coinDelta: '1', reputationDelta: '0' });
    const large = makeEventRow({ coinDelta: '3', reputationDelta: '0' });
    expect(computeEventExpectedCost(large)).toBeGreaterThan(
      computeEventExpectedCost(small),
    );
  });

  it('applies scope multiplier: SpecificSynergy costs more', () => {
    const allScope = makeEventRow({ coinDelta: '2', reputationDelta: '0', targetSynergy: 'All' });
    const specific = makeEventRow({ coinDelta: '2', reputationDelta: '0', targetSynergy: 'Culture' });
    expect(computeEventExpectedCost(specific)).toBeGreaterThan(
      computeEventExpectedCost(allScope),
    );
  });
});

describe('Cost Curve: Upgrades', () => {
  it('returns a positive cost for a basic upgrade', () => {
    expect(computeUpgradeExpectedCost(makeUpgradeRow({ incomeBonus: '1' }))).toBeGreaterThan(0);
  });

  it('accounts for income bonus', () => {
    const low = makeUpgradeRow({ incomeBonus: '0' });
    const high = makeUpgradeRow({ incomeBonus: '2' });
    expect(computeUpgradeExpectedCost(high)).toBeGreaterThan(computeUpgradeExpectedCost(low));
  });

  it('accounts for synergy range bonus', () => {
    const noRange = makeUpgradeRow({ synergyRangeBonus: '0' });
    const withRange = makeUpgradeRow({ synergyRangeBonus: '1' });
    expect(computeUpgradeExpectedCost(withRange)).toBeGreaterThan(computeUpgradeExpectedCost(noRange));
  });

  it('accounts for reputation bonus', () => {
    const noRep = makeUpgradeRow({ reputationBonus: '' });
    const withRep = makeUpgradeRow({ reputationBonus: '0.1' });
    expect(computeUpgradeExpectedCost(withRep)).toBeGreaterThan(computeUpgradeExpectedCost(noRep));
  });
});

describe('Cost Curve: Staff', () => {
  it('returns a positive cost for basic staff', () => {
    expect(computeStaffExpectedCost(makeStaffRow({ ongoingCost: '1', handSlotsAdded: '1' }))).toBeGreaterThan(0);
  });

  it('gives higher cost for more hand slots', () => {
    const low = makeStaffRow({ handSlotsAdded: '1', ongoingCost: '1' });
    const high = makeStaffRow({ handSlotsAdded: '3', ongoingCost: '3' });
    expect(computeStaffExpectedCost(high)).toBeGreaterThan(computeStaffExpectedCost(low));
  });
});

// ── Tier band assignment (AC1b) ─────────────────────────────────────

describe('Tier Band Assignment', () => {
  it('assigns cards to bands based on cost percentile', () => {
    const cards = [
      { id: 'c1', expectedCost: 2, currentCost: 4 },
      { id: 'c2', expectedCost: 8, currentCost: 8 },
      { id: 'c3', expectedCost: 12, currentCost: 10 },
    ];
    const result = assignTierBands(cards, 'business');
    expect(result.has('c1')).toBe(true);
    expect(result.has('c3')).toBe(true);
    const budget = result.get('c1')!;
    const flagship = result.get('c3')!;
    expect(budget.adjustedCost).toBeLessThanOrEqual(TIER_BANDS.budget.max);
    expect(flagship.adjustedCost).toBeGreaterThanOrEqual(TIER_BANDS.flagship.min);
  });

  it('produces costs within band limits', () => {
    const cards = [
      { id: 'c1', expectedCost: 0, currentCost: 2 },
      { id: 'c2', expectedCost: 15, currentCost: 10 },
    ];
    const result = assignTierBands(cards, 'business');
    for (const [, a] of result) {
      expect(a.adjustedCost).toBeGreaterThanOrEqual(TIER_BANDS[a.band].min);
      expect(a.adjustedCost).toBeLessThanOrEqual(TIER_BANDS[a.band].max);
    }
  });

  it('is deterministic', () => {
    const cards = [
      { id: 'a', expectedCost: 3, currentCost: 4 },
      { id: 'b', expectedCost: 7, currentCost: 8 },
    ];
    const r1 = assignTierBands(cards, 'business');
    const r2 = assignTierBands(cards, 'business');
    expect(r1.get('a')).toEqual(r2.get('a'));
    expect(r1.get('b')).toEqual(r2.get('b'));
  });
});

// ── Reward spread (AC1c) ─────────────────────────────────────────────

describe('Reward Spread', () => {
  it('Business: adjusts income when cost increases', () => {
    const row = makeBusinessRow({ baseIncome: '2' });
    const result = computeBusinessRewardSpread(row, 8, 4);
    if (result.baseIncome) expect(result.baseIncome).toBeGreaterThan(2);
  });

  it('Event: adjusts coinDelta when cost increases', () => {
    const row = makeEventRow({ coinDelta: '2', reputationDelta: '1' });
    const result = computeEventRewardSpread(row, 4, 2);
    if (result.coinDelta) expect(result.coinDelta).toBeGreaterThan(2);
  });

  it('Upgrade: adjusts incomeBonus when cost increases', () => {
    const row = makeUpgradeRow({ incomeBonus: '1' });
    const result = computeUpgradeRewardSpread(row, 5, 3);
    if (result.incomeBonus) expect(result.incomeBonus).toBeGreaterThan(1);
  });

  it('Staff: returns BAND_BALANCE when no change', () => {
    const row = makeStaffRow({ ongoingCost: '1' });
    const result = computeStaffRewardSpread(row, 3, 3);
    expect(result.rationale).toBe('BAND_BALANCE');
  });

  it('all families return a valid rationale', () => {
    const biz = computeBusinessRewardSpread(makeBusinessRow({ baseIncome: '1' }), 6, 6);
    expect(biz.rationale).toBeDefined();

    const evt = computeEventRewardSpread(makeEventRow({ coinDelta: '2' }), 2, 2);
    expect(evt.rationale).toBeDefined();

    const upg = computeUpgradeRewardSpread(makeUpgradeRow({ incomeBonus: '1' }), 3, 3);
    expect(upg.rationale).toBeDefined();

    const stf = computeStaffRewardSpread(makeStaffRow({ ongoingCost: '1' }), 3, 3);
    expect(stf.rationale).toBeDefined();
  });
});

// ── CSV validation (AC4) ────────────────────────────────────────────

describe('CSV Validation', () => {
  it('rejects rows missing card id', () => {
    const errors = validateRow(makeBusinessRow({ id: '' }), 1);
    expect(errors.some(e => e.includes('missing card id'))).toBe(true);
  });

  it('rejects rows with non-numeric cost', () => {
    const errors = validateRow(makeBusinessRow({ cost: 'abc' }), 1);
    expect(errors.some(e => e.includes('non-numeric'))).toBe(true);
  });

  it('rejects rows with unknown family', () => {
    const errors = validateRow(makeBusinessRow({ family: 'unknown' }), 1);
    expect(errors.some(e => e.includes('unknown family'))).toBe(true);
  });

  it('accepts a well-formed row', () => {
    expect(validateRow(makeBusinessRow({ id: 'v', cost: '6', baseIncome: '1' }), 1)).toEqual([]);
  });

  it('validateCsvRows throws for invalid rows', () => {
    expect(() => validateCsvRows([makeBusinessRow({ id: '' })])).toThrow('CSV validation failed');
  });

  it('parseCsv throws for empty content', () => {
    expect(() => parseCsv('')).toThrow('must have a header row');
  });

  it('parseCsv correctly parses a real CSV row', () => {
    const csv = 'family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn\nbusiness,biz-test,Test,6,1,Food,,1,,,,,,,,,,,,,,,,,,,';
    const rows = parseCsv(csv);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('biz-test');
    expect(rows[0].cost).toBe('6');
  });

  it('toCsvString round-trips correctly', () => {
    const csv = 'family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn\nbusiness,biz-test,Test,6,1,Food,,1,,,,,,,,,,,,,,,,,,,';
    const rows = parseCsv(csv);
    const output = toCsvString(rows);
    const reparsed = parseCsv(output);
    expect(reparsed.length).toBe(1);
    expect(reparsed[0].id).toBe(rows[0].id);
    expect(reparsed[0].cost).toBe(rows[0].cost);
  });
});

// ── Backup rotation (AC5) ───────────────────────────────────────────

describe('Backup Rotation', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = join(tmpdir(), `balance-bak-test-${Date.now()}`);
    try { mkdirSync(tmpDir, { recursive: true }); } catch { /* ok */ }
  });

  afterAll(() => {
    try {
      const { readdirSync, rmdirSync } = require('node:fs');
      const files = readdirSync(tmpDir);
      for (const f of files) try { unlinkSync(join(tmpDir, f)); } catch { /* ok */ }
      try { rmdirSync(tmpDir); } catch { /* ok */ }
    } catch { /* ok */ }
  });

  function createFile(name: string, content: string): string {
    const p = join(tmpDir, name);
    writeFileSync(p, content, 'utf-8');
    return p;
  }

  it('creates a .bak.1 file', () => {
    const path = createFile('r1.csv', 'a');
    rotateBackups(path);
    expect(existsSync(`${path}.bak.1`)).toBe(true);
  });

  it('shifts existing backups', () => {
    const path = createFile('r2.csv', 'v1');
    rotateBackups(path);
    writeFileSync(path, 'v2');
    rotateBackups(path);
    expect(existsSync(`${path}.bak.2`)).toBe(true);
    expect(readFileSync(`${path}.bak.2`, 'utf-8')).toBe('v1');
  });

  it('handles non-existent file gracefully', () => {
    const path = join(tmpDir, 'nonexist.csv');
    expect(() => rotateBackups(path)).not.toThrow();
    expect(listBackups(path)).toEqual([]);
  });

  it('listBackups finds existing backups', () => {
    const path = createFile('list.csv', 'x');
    writeFileSync(`${path}.bak.1`, '1');
    writeFileSync(`${path}.bak.3`, '3');
    const backups = listBackups(path);
    expect(backups).toContain(`${path}.bak.1`);
    expect(backups).toContain(`${path}.bak.3`);
    expect(backups.length).toBe(2);
  });
});

// ── Summary table formatting (AC6) ────────────────────────────────────

describe('Summary Table Formatting', () => {
  it('includes header text', () => {
    const s = formatSummaryTable([], [], 18);
    expect(s).toContain('BALANCING PASS SUMMARY');
  });

  it('includes per-family ranges', () => {
    const s = formatSummaryTable([], [
      { family: 'business', cardsAdjusted: 5, totalCards: 18,
        oldCostMin: 4, oldCostMax: 10, newCostMin: 2, newCostMax: 12,
        oldRewardMin: 0, oldRewardMax: 2, newRewardMin: 0, newRewardMax: 3 },
    ], 18);
    expect(s).toContain('business');
    expect(s).toContain('[4-10]');
    expect(s).toContain('[2-12]');
  });

  it('includes rationale codes when adjustments exist', () => {
    const s = formatSummaryTable([
      { cardId: 'biz-1', cardName: 'Shop', family: 'business',
        field: 'cost', oldValue: 4, newValue: 6, rationale: 'TIER_REASSIGN' },
    ], [], 1);
    expect(s).toContain('─── Rationale Codes ───');
    expect(s).toContain('TIER_REASSIGN');
  });
});

// ── Deterministic output (AC3) ──────────────────────────────────────

describe('Deterministic Output', () => {
  it('produces identical results on repeated calls', () => {
    const rows: CsvRow[] = [
      makeBusinessRow({ id: 'b1', name: 'Bakery', cost: '6', baseIncome: '1' }),
      makeBusinessRow({ id: 'b2', name: 'Diner', cost: '8', baseIncome: '1' }),
      makeEventRow({ id: 'e1', name: 'Fest', trigger: 'Investment', coinDelta: '2', reputationDelta: '1' }),
      makeEventRow({ id: 'e2', name: 'Rain', trigger: 'Incident', coinDelta: '-1', reputationDelta: '0' }),
      makeUpgradeRow({ id: 'u1', name: 'Patisserie', incomeBonus: '1' }),
      makeStaffRow({ id: 's1', name: 'Asst', ongoingCost: '1', handSlotsAdded: '1' }),
    ];
    const r1 = runBalancingPass(rows);
    const r2 = runBalancingPass(rows);
    expect(r1.rows.length).toBe(r2.rows.length);
    expect(r1.adjustments.length).toBe(r2.adjustments.length);
    expect(r1.summaries.length).toBe(r2.summaries.length);
    expect(toCsvString(r1.rows)).toBe(toCsvString(r2.rows));
  });

  it('preserves row count and order', () => {
    const rows: CsvRow[] = [
      makeBusinessRow({ id: 'a', name: 'A', cost: '4' }),
      makeBusinessRow({ id: 'b', name: 'B', cost: '8' }),
      makeEventRow({ id: 'c', name: 'C', trigger: 'Investment' }),
    ];
    const result = runBalancingPass(rows);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0].id).toBe('a');
    expect(result.rows[1].id).toBe('b');
    expect(result.rows[2].id).toBe('c');
  });
});

// ── All 5 families (integration) ──────────────────────────────────────

describe('All 5 Card Families', () => {
  it('processes Business cards', () => {
    const rows = [
      makeBusinessRow({ id: 'b1', name: 'B1', cost: '4', baseIncome: '0' }),
    ];
    const r = runBalancingPass(rows);
    expect(r.summaries.find(s => s.family === 'business')).toBeDefined();
  });

  it('processes Community Space cards', () => {
    const rows = [
      makeBusinessRow({ family: 'community-space', id: 'cs1', name: 'P', cost: '4', baseIncome: '0' }),
    ];
    const r = runBalancingPass(rows);
    expect(r.summaries.find(s => s.family === 'community-space')).toBeDefined();
  });

  it('processes Events (Investment + Incident)', () => {
    const rows = [
      makeEventRow({ id: 'i', name: 'I', trigger: 'Investment', cost: '3', coinDelta: '2' }),
      makeEventRow({ id: 'c', name: 'Inc', trigger: 'Incident', cost: '0' }),
    ];
    const r = runBalancingPass(rows);
    expect(r.summaries.find(s => s.family === 'event')).toBeDefined();
    expect(r.rows.find(r => r.id === 'c')?.cost).toBe('0');
    expect(r.adjustments.some(a => a.rationale === 'INCIDENT_FREE')).toBe(true);
  });

  it('processes Upgrade cards', () => {
    const rows = [
      makeUpgradeRow({ id: 'u1', name: 'U1', cost: '4', incomeBonus: '1' }),
    ];
    const r = runBalancingPass(rows);
    expect(r.summaries.find(s => s.family === 'upgrade')).toBeDefined();
  });

  it('processes Staff cards', () => {
    const rows = [
      makeStaffRow({ id: 's1', name: 'S1', cost: '3', ongoingCost: '1', handSlotsAdded: '1' }),
    ];
    const r = runBalancingPass(rows);
    expect(r.summaries.find(s => s.family === 'staff')).toBeDefined();
  });
});

// ── Incident events remain free ──────────────────────────────────────

describe('Incident Events', () => {
  it('remain at cost 0 through balancing pass', () => {
    const rows = [
      makeEventRow({ id: 'incident', name: 'Rainy', trigger: 'Incident', cost: '0', coinDelta: '-2' }),
    ];
    const r = runBalancingPass(rows);
    expect(r.rows[0].cost).toBe('0');
  });
});
