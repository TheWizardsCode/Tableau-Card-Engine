import type { CsvRow } from './csv';
import type { RationaleCode } from './rationale';

/**
 * Safely get a string value from a CsvRow by key, defaulting to '' for missing/optional fields.
 */
function csvVal(row: CsvRow, field: string): string {
  return (row as unknown as Record<string, string>)[field] ?? '';
}

// ── Type definitions ──────────────────────────────────────────────────

export interface Adjustment {
  cardId: string;
  cardName: string;
  family: string;
  field: string;
  oldValue: number;
  newValue: number;
  rationale: RationaleCode;
}

export interface FamilySummary {
  family: string;
  cardsAdjusted: number;
  totalCards: number;
  oldCostMin: number;
  oldCostMax: number;
  newCostMin: number;
  newCostMax: number;
  oldRewardMin: number;
  oldRewardMax: number;
  newRewardMin: number;
  newRewardMax: number;
}

export interface BalancingResult {
  rows: CsvRow[];
  adjustments: Adjustment[];
  summaries: FamilySummary[];
}

// ── Tier band definitions ─────────────────────────────────────────────

export const TIER_BANDS: Record<string, { min: number; max: number; label: string }> = {
  budget: { min: 0, max: 3, label: 'Budget' },
  economy: { min: 4, max: 5, label: 'Economy' },
  standard: { min: 6, max: 7, label: 'Standard' },
  premium: { min: 8, max: 9, label: 'Premium' },
  flagship: { min: 10, max: 14, label: 'Flagship' },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundHalf(value: number): number {
  return Math.round(value);
}

function countSynergyTypes(synergyTypes: string): number {
  if (!synergyTypes) return 0;
  return synergyTypes.split('|').filter(Boolean).length;
}

// ── Curve-fitting: Business/Community Space ───────────────────────────

export function computeBusinessExpectedCost(row: CsvRow): number {
  const baseIncome = parseFloat(csvVal(row, 'baseIncome')) || 0;
  const synergyCount = countSynergyTypes(row.synergyTypes);
  const synergyCoinBonus = parseFloat(csvVal(row, 'synergyCoinBonus')) || 0;
  const synergyRepBonus = parseFloat(csvVal(row, 'synergyRepBonus')) || 0;
  const reputationPerTurn = parseFloat(csvVal(row, 'reputationPerTurn')) || 0;
  const incomeBonus = parseFloat(csvVal(row, 'incomeBonus')) || 0;
  const tier = parseInt(csvVal(row, 'tier'), 10) || 1;

  // Base cost from tier: 1→4, 2→5.5, 3→7, 4→9, 5→11
  // This ensures the existing tier assignments drive the cost spread
  let cost = tier * 2 + 2;

  // Modifiers from card stats
  cost += baseIncome * 4;
  cost += synergyCount * 3;
  cost += synergyCoinBonus * 2;
  cost += synergyRepBonus * 2;
  cost += reputationPerTurn * 30;
  cost += incomeBonus * 3;

  // Pawn Shop special case: no synergy bonuses, reduce cost slightly
  if (baseIncome === 0 && synergyCoinBonus === 0 && synergyRepBonus === 0 && reputationPerTurn === 0) {
    cost -= 2;
  }

  cost = Math.max(cost, 4);
  return cost;
}

// ── Curve-fitting: Investment Events ──────────────────────────────────

export function computeEventExpectedCost(row: CsvRow): number {
  const coinDelta = parseFloat(csvVal(row, 'coinDelta')) || 0;
  const reputationDelta = parseFloat(csvVal(row, 'reputationDelta')) || 0;
  const tier = parseInt(csvVal(row, 'tier'), 10) || 1;

  let cost = tier * 1.5 + 0.5;

  // Add modifiers from event deltas
  cost += coinDelta * 1.5;
  cost += reputationDelta * 2;

  // Scope multiplier: SpecificSynergy is worth 1.2x
  const targetScopeMultiplier = (csvVal(row, 'targetSynergy') === 'All') ? 1.0 : 1.2;
  cost *= targetScopeMultiplier;

  cost = Math.max(cost, 2);
  return cost;
}

// ── Curve-fitting: Upgrades ───────────────────────────────────────────

export function computeUpgradeExpectedCost(row: CsvRow): number {
  const incomeBonus = parseFloat(csvVal(row, 'incomeBonus')) || 0;
  const synergyRangeBonus = parseFloat(csvVal(row, 'synergyRangeBonus')) || 0;
  const requiredLevel = parseFloat(csvVal(row, 'requiredLevel')) || 0;
  const reputationBonus = parseFloat(csvVal(row, 'reputationBonus')) || 0;
  const tier = parseInt(csvVal(row, 'tier'), 10) || 1;

  let cost = tier * 1.5 + 1;
  cost += incomeBonus * 3;
  cost += synergyRangeBonus * 3;
  cost += requiredLevel * 1;
  cost += reputationBonus * 10;
  cost = Math.max(cost, 2);
  return cost;
}

// ── Curve-fitting: Staff ──────────────────────────────────────────────

export function computeStaffExpectedCost(row: CsvRow): number {
  const ongoingCost = parseFloat(csvVal(row, 'ongoingCost')) || 0;
  const handSlotsAdded = parseFloat(csvVal(row, 'handSlotsAdded')) || 0;
  return ongoingCost * 5 + handSlotsAdded * 5;
}

// ── Tier band assignment ──────────────────────────────────────────────

export function assignTierBands(
  cards: { id: string; expectedCost: number; currentCost: number }[],
  _family: string,
): Map<string, { adjustedCost: number; band: string; rationale: RationaleCode }> {
  const result = new Map<string, { adjustedCost: number; band: string; rationale: RationaleCode }>();
  const sorted = [...cards].sort((a, b) => a.expectedCost - b.expectedCost);
  const minCost = sorted.length > 0 ? Math.min(...sorted.map(c => c.expectedCost)) : 0;
  const maxCost = sorted.length > 0 ? Math.max(...sorted.map(c => c.expectedCost)) : 0;

  for (const card of sorted) {
    const percentile = maxCost === minCost ? 0 : (card.expectedCost - minCost) / (maxCost - minCost);
    let band: string;
    let adjustedCost: number;
    let rationale: RationaleCode;

    if (percentile < 0.2) {
      band = 'budget';
      adjustedCost = roundHalf(clamp(card.expectedCost, TIER_BANDS.budget.min, TIER_BANDS.budget.max));
    } else if (percentile < 0.4) {
      band = 'economy';
      adjustedCost = roundHalf(clamp(card.expectedCost, TIER_BANDS.economy.min, TIER_BANDS.economy.max));
    } else if (percentile < 0.6) {
      band = 'standard';
      adjustedCost = roundHalf(clamp(card.expectedCost, TIER_BANDS.standard.min, TIER_BANDS.standard.max));
    } else if (percentile < 0.8) {
      band = 'premium';
      adjustedCost = roundHalf(clamp(card.expectedCost, TIER_BANDS.premium.min, TIER_BANDS.premium.max));
    } else {
      band = 'flagship';
      adjustedCost = roundHalf(clamp(card.expectedCost, TIER_BANDS.flagship.min, TIER_BANDS.flagship.max));
    }

    rationale = card.currentCost !== adjustedCost ? 'TIER_REASSIGN' as RationaleCode : 'BAND_BALANCE' as RationaleCode;
    result.set(card.id, { adjustedCost, band, rationale });
  }

  return result;
}

// ── Cost spread enforcement ────────────────────────────────────────────
// Ensures no single cost value exceeds 1/3 of cards in a family.
// Incident-trigger events are excluded: they are free (cost 0) by design
// (CG-0MSL0OP040043KKZ / Group D, CG-0MSQJ7QLM0076FTD) — spreading their
// costs would make them purchasable and break the incident-balance system.

function enforceCostSpread(
  rows: CsvRow[],
  family: string,
  adjustments: Adjustment[],
): void {
  const familyRows = rows.filter(r => r.family === family);
  if (familyRows.length === 0) return;

  const threshold = Math.ceil(familyRows.length / 3);

  // Count cost frequencies (incident events never count toward the spread).
  const freq = new Map<number, CsvRow[]>();
  for (const row of familyRows) {
    if (row.family === 'event' && csvVal(row, 'trigger') === 'Incident') continue;
    const cost = parseFloat(csvVal(row, 'cost')) || 0;
    if (!freq.has(cost)) freq.set(cost, []);
    freq.get(cost)!.push(row);
  }

  // Find costs exceeding threshold, sorted by cost ascending
  const overThreshold = [...freq.entries()]
    .filter(([_, cards]) => cards.length > threshold)
    .sort(([a], [b]) => a - b);

  for (const [clusteredCost, clusteredCards] of overThreshold) {
    // Move excess cards to adjacent cost values (±1, ±2)
    const excess = clusteredCards.slice(threshold);
    for (const card of excess) {
      // Try spreading upward first, then downward
      for (const delta of [1, -1, 2, -2]) {
        const newCost = Math.max(1, clusteredCost + delta);
        const currentCount = [...freq.entries()]
          .filter(([c]) => c === newCost)
          .reduce((sum, [_, cards]) => sum + cards.length, 0);
        if (currentCount < threshold || newCost >= clusteredCost + 2) {
          const oldVal = parseFloat(csvVal(card, 'cost')) || 0;
          (card as unknown as Record<string, string>)['cost'] = String(newCost);
          adjustments.push({
            cardId: card.id, cardName: card.name, family,
            field: 'cost', oldValue: oldVal, newValue: newCost,
            rationale: 'BAND_BALANCE' as RationaleCode,
          });
          // Update frequency for subsequent iterations
          if (!freq.has(newCost)) freq.set(newCost, []);
          freq.get(newCost)!.push(card);
          break;
        }
      }
    }
  }
}

// ── Reward spread: Business/Community Space ───────────────────────────

export function computeBusinessRewardSpread(
  row: CsvRow,
  adjustedCost: number,
  previousCost: number,
): { baseIncome?: number; synergyCoinBonus?: number; synergyRepBonus?: number; rationale: RationaleCode } {
  const costRatio = adjustedCost / Math.max(previousCost, 1);
  const baseIncome = parseFloat(csvVal(row, 'baseIncome')) || 0;

  const result: { baseIncome?: number; synergyCoinBonus?: number; synergyRepBonus?: number; rationale: RationaleCode } = { rationale: 'BAND_BALANCE' as RationaleCode };

  if (costRatio > 1.1 && baseIncome > 0) {
    result.baseIncome = roundHalf(baseIncome * costRatio * 0.7);
    result.rationale = 'INCOME_ADJUST' as RationaleCode;
  } else if (costRatio < 0.9 && baseIncome > 0) {
    result.baseIncome = Math.max(0, roundHalf(baseIncome * costRatio));
    result.rationale = 'INCOME_ADJUST' as RationaleCode;
  }

  const synergyCoin = parseFloat(csvVal(row, 'synergyCoinBonus')) || 0;
  const synergyRep = parseFloat(csvVal(row, 'synergyRepBonus')) || 0;

  if (adjustedCost >= 8) {
    if (synergyCoin === 0) {
      result.synergyCoinBonus = 1;
      result.rationale = 'SYNERGY_BONUS_ADJ' as RationaleCode;
    }
    if (synergyRep === 0) {
      result.synergyRepBonus = 0.1;
      result.rationale = 'REPUTATION_ADJ' as RationaleCode;
    }
  }

  return result;
}

// ── Reward spread: Investment Events ──────────────────────────────────

export function computeEventRewardSpread(
  row: CsvRow,
  adjustedCost: number,
  previousCost: number,
): { coinDelta?: number; reputationDelta?: number; rationale: RationaleCode } {
  const costRatio = adjustedCost / Math.max(previousCost, 1);
  const coinDelta = parseFloat(csvVal(row, 'coinDelta')) || 0;
  const reputationDelta = parseFloat(csvVal(row, 'reputationDelta')) || 0;

  const result: { coinDelta?: number; reputationDelta?: number; rationale: RationaleCode } = { rationale: 'BAND_BALANCE' as RationaleCode };

  if (costRatio > 1.1 && coinDelta > 0) {
    result.coinDelta = roundHalf(coinDelta * costRatio);
    result.rationale = 'REWARD_SPREAD' as RationaleCode;
  }
  if (costRatio > 1.1 && reputationDelta > 0) {
    result.reputationDelta = roundHalf(reputationDelta * costRatio);
    result.rationale = 'REWARD_SPREAD' as RationaleCode;
  }
  if (costRatio < 0.9 && coinDelta > 0) {
    result.coinDelta = Math.max(0, roundHalf(coinDelta * costRatio));
    result.rationale = 'REWARD_SPREAD' as RationaleCode;
  }

  return result;
}

// ── Reward spread: Upgrades ───────────────────────────────────────────

export function computeUpgradeRewardSpread(
  row: CsvRow,
  adjustedCost: number,
  previousCost: number,
): { incomeBonus?: number; synergyRangeBonus?: number; reputationBonus?: number; rationale: RationaleCode } {
  const costRatio = adjustedCost / Math.max(previousCost, 1);
  const incomeBonus = parseFloat(csvVal(row, 'incomeBonus')) || 0;

  const result: { incomeBonus?: number; synergyRangeBonus?: number; reputationBonus?: number; rationale: RationaleCode } = { rationale: 'BAND_BALANCE' as RationaleCode };

  if (costRatio > 1.1) {
    if (incomeBonus > 0) {
      result.incomeBonus = roundHalf(incomeBonus * costRatio);
      result.rationale = 'REWARD_SPREAD' as RationaleCode;
    }
    if (adjustedCost >= 5) {
      const synergyRB = parseFloat(csvVal(row, 'synergyRangeBonus')) || 0;
      const repB = parseFloat(csvVal(row, 'reputationBonus')) || 0;
      if (synergyRB === 0) { result.synergyRangeBonus = 1; result.rationale = 'SYNERGY_BONUS_ADJ' as RationaleCode; }
      if (repB === 0) { result.reputationBonus = 1; result.rationale = 'REPUTATION_ADJ' as RationaleCode; }
    }
  }

  return result;
}

// ── Reward spread: Staff ──────────────────────────────────────────────

export function computeStaffRewardSpread(
  _row: CsvRow,
  adjustedCost: number,
  previousCost: number,
): { ongoingCost?: number; handSlotsAdded?: number; rationale: RationaleCode } {
  const costRatio = adjustedCost / Math.max(previousCost, 1);
  const result: { ongoingCost?: number; handSlotsAdded?: number; rationale: RationaleCode } = { rationale: 'BAND_BALANCE' as RationaleCode };

  // Staff: cost vs ongoingCost direct relationship
  if (costRatio > 1.1 || costRatio < 0.9) {
    const ongoingCost = parseFloat(csvVal(_row, 'ongoingCost')) || 0;
    const newOngoing = roundHalf(ongoingCost * costRatio);
    if (newOngoing !== ongoingCost && newOngoing >= 0) {
      result.ongoingCost = newOngoing;
      result.rationale = 'ONGOING_COST_ADJ' as RationaleCode;
    }
  }

  return result;
}

// ── Helper to push an Adjustment ──────────────────────────────────────

function pushAdj(
  adjustments: Adjustment[],
  cardId: string, cardName: string, family: string,
  field: string, oldValue: number, newValue: number,
  rationale: RationaleCode,
): void {
  if (oldValue !== newValue) {
    adjustments.push({ cardId, cardName, family, field, oldValue, newValue, rationale });
  }
}

// ── Family configs ────────────────────────────────────────────────────

interface FamilyConfig {
  computeExpectedCost: (row: CsvRow) => number;
  computeRewardSpread: (row: CsvRow, adjCost: number, prevCost: number) => Record<string, unknown>;
  isExcluded: (row: CsvRow) => boolean;
}

const FAMILY_CONFIGS: Record<string, FamilyConfig> = {
  business: {
    computeExpectedCost: computeBusinessExpectedCost,
    computeRewardSpread: computeBusinessRewardSpread,
    isExcluded: () => false,
  },
  'community-space': {
    computeExpectedCost: computeBusinessExpectedCost,
    computeRewardSpread: computeBusinessRewardSpread,
    isExcluded: () => false,
  },
  event: {
    computeExpectedCost: computeEventExpectedCost,
    computeRewardSpread: computeEventRewardSpread,
    isExcluded: (row: CsvRow) => csvVal(row, 'trigger') === 'Incident',
  },
  upgrade: {
    computeExpectedCost: computeUpgradeExpectedCost,
    computeRewardSpread: computeUpgradeRewardSpread,
    isExcluded: () => false,
  },
  staff: {
    computeExpectedCost: computeStaffExpectedCost,
    computeRewardSpread: computeStaffRewardSpread,
    isExcluded: () => false,
  },
};

// ── Reward field groups ───────────────────────────────────────────────

const REWARD_FIELDS: Record<string, string[]> = {
  business: ['baseIncome', 'synergyCoinBonus', 'synergyRepBonus'],
  'community-space': ['baseIncome', 'synergyCoinBonus', 'synergyRepBonus'],
  event: ['coinDelta', 'reputationDelta'],
  upgrade: ['incomeBonus', 'synergyRangeBonus', 'reputationBonus'],
  staff: ['ongoingCost', 'handSlotsAdded'],
};

// ── Main balancing pipeline ───────────────────────────────────────────

export function runBalancingPass(rows: CsvRow[]): BalancingResult {
  const adjustments: Adjustment[] = [];
  const resultRows: CsvRow[] = [];

  const families = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const fam = row.family;
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam)!.push(row);
  }

  const summaries: FamilySummary[] = [];

  for (const [family, familyRows] of families) {
    const config = FAMILY_CONFIGS[family];
    if (!config) {
      resultRows.push(...familyRows);
      continue;
    }

    const familyAdjustments: Adjustment[] = [];
    const adjustedRows: CsvRow[] = [];

    // Phase 1: Compute expected costs
    const costCards = familyRows
      .filter(row => !config.isExcluded(row))
      .map(row => ({
        id: row.id,
        expectedCost: config.computeExpectedCost(row),
        currentCost: parseFloat(row.cost) || 0,
      }));

    // Phase 2: Assign tier bands
    const bandAssignments = assignTierBands(costCards, family);

    // Phase 3: Apply adjustments
    for (const row of familyRows) {
      const isExcluded = config.isExcluded(row);
      const originalCost = parseFloat(csvVal(row, 'cost')) || 0;
      let adjustedCost = originalCost;
      let bandRationale: RationaleCode | undefined;

      if (!isExcluded && bandAssignments.has(row.id)) {
        const assignment = bandAssignments.get(row.id)!;
        adjustedCost = assignment.adjustedCost;
        bandRationale = assignment.rationale;
      }

      const newRow = { ...row } as CsvRow;
      newRow.cost = String(adjustedCost);

      // Record cost adjustment
      if (adjustedCost !== originalCost) {
        pushAdj(familyAdjustments, row.id, row.name, family,
          'cost', originalCost, adjustedCost, bandRationale ?? 'COST_CURVE_FIT' as RationaleCode);
      }

      // Phase 4: Apply reward spread
      if (!isExcluded) {
        const rewardSpread = config.computeRewardSpread(row, adjustedCost, originalCost);
        const rewardKeys = REWARD_FIELDS[family] ?? [];

        for (const key of rewardKeys) {
          const rawVal = (rewardSpread as Record<string, unknown>)[key];
          if (typeof rawVal === 'number') {
            const oldNum = parseFloat(csvVal(row, key)) || 0;
            (newRow as unknown as Record<string, string>)[key] = String(rawVal);
            const rationale = (typeof rewardSpread.rationale === 'string' ? rewardSpread.rationale : 'BAND_BALANCE') as RationaleCode;
            pushAdj(familyAdjustments, row.id, row.name, family, key, oldNum, rawVal, rationale);
          }
        }
      }

      // Record exclusion for incidents
      if (isExcluded) {
        familyAdjustments.push({
          cardId: row.id, cardName: row.name, family,
          field: 'cost',
          oldValue: originalCost,
          newValue: originalCost,
          rationale: 'INCIDENT_FREE' as RationaleCode,
        });
      }

      adjustedRows.push(newRow);
    }

    // Compute summary
    const oldCosts = familyRows.map(r => parseFloat(r.cost) || 0);
    const newCosts = adjustedRows.map(r => parseFloat(csvVal(r, 'cost')) || 0);
    const rewardFields = REWARD_FIELDS[family] ?? [];

    const oldRewardVals = familyRows.flatMap(r => rewardFields.map(f => parseFloat(csvVal(r, f)) || 0));
    const newRewardVals = adjustedRows.flatMap(r => rewardFields.map(f => parseFloat(csvVal(r, f)) || 0));

    const oldRewardMin = oldRewardVals.length > 0 ? Math.min(...oldRewardVals) : 0;
    const oldRewardMax = oldRewardVals.length > 0 ? Math.max(...oldRewardVals) : 0;
    const newRewardMin = newRewardVals.length > 0 ? Math.min(...newRewardVals) : 0;
    const newRewardMax = newRewardVals.length > 0 ? Math.max(...newRewardVals) : 0;

    summaries.push({
      family,
      cardsAdjusted: familyAdjustments.filter(a => a.oldValue !== a.newValue && a.rationale !== 'INCIDENT_FREE').length,
      totalCards: familyRows.length,
      oldCostMin: Math.min(...oldCosts),
      oldCostMax: Math.max(...oldCosts),
      newCostMin: Math.min(...newCosts),
      newCostMax: Math.max(...newCosts),
      oldRewardMin,
      oldRewardMax,
      newRewardMin,
      newRewardMax,
    });

    adjustments.push(...familyAdjustments);
    resultRows.push(...adjustedRows);
  }

  // Enforce cost spread for business and community-space families
  // to prevent >1/3 of cards sharing the same cost
  for (const fam of ['business', 'community-space', 'upgrade', 'event', 'staff'] as const) {
    enforceCostSpread(resultRows, fam, adjustments);
  }

  // Recompute summaries after spread enforcement
  for (const summary of summaries) {
    const famRows = resultRows.filter(r => r.family === summary.family);
    const costs = famRows.map(r => parseFloat(csvVal(r, 'cost')) || 0);
    summary.newCostMin = Math.min(...costs);
    summary.newCostMax = Math.max(...costs);
    summary.cardsAdjusted = adjustments.filter(
      a => a.family === summary.family && a.oldValue !== a.newValue && a.rationale !== 'INCIDENT_FREE'
    ).length;
  }

  return { rows: resultRows, adjustments, summaries };
}
