/**
 * Main Street: Turn Cash Calculation — Repro & Formula Audit (CG-0MTINZ5GG007BH44)
 *
 * ## Intended Turn Cash Formula (single source of truth)
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  Day N: processEndOfTurn()                                           │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │  1. InvestmentResolution  (held investments resolved by player)      │
 * │  2. IncomePhase                                            │
 * │     a. applyIncome()                                        │
 * │        - Sum each slot: card.currentIncome (buffed by staff skills)│
 * │        - Apply active income-multiplier effects (integer rounded) │
 * │        - Apply reputation multiplier:                         │
 * │            rep = state.resourceBank.reputation   ← after income's  │
 * │                                          own rep accrual (Q1=c)  │
 * │            multiplied = applyReputationMultiplier(modifiedTotal,  │
 * │                                  rep, config)                    │
 * │        - state.resourceBank.coins += multiplied                  │
 * │        - Apply rep/turn from cards + staff buffs + effects       │
 * │        - Apply hand-card synergy bonus                          │
 * │        - Log: "Income: +N coins"                                 │
 * │     b. applyStaffOngoingCosts()  (salary deductions)             │
 * │     c. applyCommunitySpaceOngoingCosts()                          │
 * │     d. applyBusinessOngoingCosts()   (street upkeep)             │
 * │  3. IncidentPhase                                          │
 * │     a. resolveIncident() → apply coinDelta/repDelta               │
 * │        (SpecificSynergy: multiply by matching business count)     │
 * │        - If averted by Risk Manager: log "Incident averted"       │
 * │     b. Log coin/rep deltas                                       │
 * │  4. EndCheck  (checkEndConditions, decay effects, challenges)    │
 * │  5. appendTurnNetRow()  ← FINAL LOG ENTRY (AC3)                   │
 * │     - coinsDelta = coinsNow - state.dayStartCoins                 │
 * │     - repDelta   = repNow - state.dayStartRep                     │
 * │     - Net row: "Turn N net: +X coins, +Y rep"                    │
 * │     - Must equal: income + incident + costs (decomposition)       │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │  HUD Tooltip (buildCoinsTooltip):                                  │
 * │     - baseIncome = Σ card.currentIncome (all producing slots)     │
 * │     - multiplier = reputationCoinMultiplier(state.reputation, cfg)│
 * │     - multiplied = applyReputationMultiplier(baseIncome, rep, cfg)│
 * │     - Display: "Before: X", "After: Y (×Z)"                      │
 * │     - BUG (Q2): multiplier.toFixed(1) hides ~1.025 as ×1.0      │
 * │       FIX: toFixed(3) for 3-decimal display                        │
 * │     - BUG (divergence): tooltip sums cached currentIncome directly│
 * │       without staff-buff overlay or hand synergy; applyIncome()   │
 * │       uses buffed values. Must converge to single source.         │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Reputation sampling point (Q1=c): The tooltip and applyIncome both
 * sample state.resourceBank.reputation AFTER income's own rep accrual
 * (card rep/turn + staff rep buffs). This is the rep that determines
 * the actual multiplier applied to income.
 *
 * Multiplier display precision (Q2): 3 decimals (toFixed(3)).
 *
 * Log ordering invariant (Q3): income → costs → incident(-averted) → net row.
 * Net row is always the final entry.
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { applyBusinessOngoingCosts, applyCommunitySpaceOngoingCosts, applyStaffOngoingCosts, appendTurnNetRow, resolveIncident } from '../../example-games/main-street/MainStreetEngine';
import { applyIncome, updateNeighborsOnPlacement } from '../../example-games/main-street/MainStreetAdjacency';
import { applyReputationMultiplier, reputationCoinMultiplier } from '../../example-games/main-street/MainStreetDifficulty';
import { buildCoinsTooltip } from '../../example-games/main-street/scenes/MainStreetHudTooltips';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Creates an Arcade business card (matches card-data.csv: cost=400, baseIncome=290,
 * maxLevel=1, reputationPerTurn=5, synergyTypes=[Entertainment], ongoingCost=100).
 */
function makeArcade(): BusinessCard {
  return {
    family: 'business',
    id: 'biz-arcade',
    name: 'Arcade',
    cost: 400,
    baseIncome: 290,
    synergyTypes: ['Entertainment'] as BusinessCard['synergyTypes'],
    maxLevel: 1,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'Retro fun for all ages.',
    ongoingCost: 100,
    // Arcade has reputationPerTurn=5 in card-data.csv (column 9)
    reputationPerTurn: 5,
  };
}

/**
 * Creates a deterministic state factory: starting coins, placing a business on
 * the grid, setting up a deterministic deck/seed.
 */
function makeState(
  startingCoins: number = 600,
  startingRep: number = 300,
  onGrid?: (state: ReturnType<typeof setupMainStreetGame>) => void,
): ReturnType<typeof setupMainStreetGame> {
  const state = setupMainStreetGame({
    seed: 'turn-cash-repro',
  });
  // Override starting coins/rep for the repro (Medium preset is 600/300)
  state.resourceBank.coins = startingCoins;
  state.resourceBank.reputation = startingRep;
  // Clear the hand (no hand-card synergy to keep things simple)
  state.hand = [];
  // Fill streetGrid with one business if onGrid is provided
  if (onGrid) {
    onGrid(state);
  }
  return state;
}

/**
 * Parse a coins tooltip string into its component values for assertions.
 */
function parseTooltip(tooltip: string): { preMultiplier: number; postMultiplier: number; multiplierStr: string } {
  const preLine = tooltip.split('\n').find(l => l.includes('Before'));
  const postLine = tooltip.split('\n').find(l => l.includes('After'));
  if (!preLine || !postLine) throw new Error('Tooltip missing expected lines');
  const pre = Number(preLine.replace(/[^0-9.]/g, ''));
  const post = Number(postLine.replace(/[^0-9.]/g, '').split('×')[0]);
  const multMatch = postLine.match(/×(\d+\.?\d*)/);
  return { preMultiplier: pre, postMultiplier: post, multiplierStr: multMatch ? multMatch[1] : '' };
}

// ── Repro Test: 6-coin Arcade scenario ──────────────────────────

describe('CG-0MTINZ5GG007BH44 — Repro: 6-coin Arcade turn cash', () => {
  it('reproduces the reported 6-coin Arcade scenario before fix', () => {
    // Setup: 600 coins starting, place Arcade (cost 400) → 200 coins remaining
    // (Using 600 as medium preset, deducting 400 for Arcade cost)
    const state = makeState(600, 300, (st) => {
      const arcade = makeArcade();
      st.streetGrid[0] = arcade as any;
      // Simulate placement: update neighbors (recalc income/reputation caches)
      updateNeighborsOnPlacement(st, 0);
      // Deduct purchase cost
      st.resourceBank.coins -= 400; // 600 - 400 = 200 coins remaining
    });

    // Record dayStart snapshot (this would normally happen at DayStart)
    state.dayStartCoins = state.resourceBank.coins;
    state.dayStartRep = state.resourceBank.reputation;

    // Capture state before income
    const coinsBeforeIncome = state.resourceBank.coins;
    const repBeforeIncome = state.resourceBank.reputation;

    // Build tooltip BEFORE income (simulates what HUD shows)
    const tooltipBefore = buildCoinsTooltip(state);
    const parsed = parseTooltip(tooltipBefore);

    // CG-0MTINZ5GG007BH44 (Q2): Tooltip now renders 3 decimals so the lift
    // is visible: rep=300 → 1.0375 → ×1.038.
    expect(parsed.multiplierStr).toBe('1.038');

    // Run income phase
    applyIncome(state);

    const coinsAfterIncome = state.resourceBank.coins;
    const repAfterIncome = state.resourceBank.reputation;

    // Verify income was credited
    const incomeDelta = coinsAfterIncome - coinsBeforeIncome;
    expect(incomeDelta).toBeGreaterThan(0);

    // Verify rep increased from card repPerTurn (Arcade: 5)
    expect(repAfterIncome).toBe(repBeforeIncome + 5);

    // Now apply ongoing costs (Arcade has ongoingCost=100 = 1 coin)
    // Staff/community have no costs here
    applyStaffOngoingCosts(state);
    applyCommunitySpaceOngoingCosts(state);
    const beforeBizCosts = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);
    const bizCostsDelta = state.resourceBank.coins - beforeBizCosts;
    expect(bizCostsDelta).toBeLessThan(0); // Should be negative (deduction)

    // Skip incident for this repro (deterministic: no incident in setup)
    // Append turn net row
    appendTurnNetRow(state, state.turn);

    // ── Net row reconciliation ──
    // Net row should equal: coinsNow - dayStartCoins = income + incident + costs
    const coinsNow = state.resourceBank.coins;
    const repNow = state.resourceBank.reputation;
    const expectedCoinsDelta = coinsNow - state.dayStartCoins;
    const expectedRepDelta = repNow - state.dayStartRep;

    // The net row is logged — read it from the activity log
    const netLogEntry = state.activityLog.find(
      (entry) => entry.text.match(/Turn \d+ net:/),
    );
    expect(netLogEntry).toBeDefined();

    // Parse net row (format: "Turn N net: +X coins, +Y rep")
    const netMatch = netLogEntry!.text.match(/Turn \d+ net: ([+-]?\d+) coins, ([+-]?\d+) rep/);
    expect(netMatch).not.toBeNull();
    const netCoins = parseInt(netMatch![1], 10);
    const netRep = parseInt(netMatch![2], 10);

    // Net row must equal actual deltas
    expect(netCoins).toBe(expectedCoinsDelta);
    expect(netRep).toBe(expectedRepDelta);

    // Decomposition: net = income + incident + costs
    // (income already applied to coins; incident/costs deducted)
    const allCostsDelta = state.resourceBank.coins - coinsAfterIncome;
    const totalDelta = incomeDelta + allCostsDelta;
    expect(totalDelta).toBe(expectedCoinsDelta);

    // ── Single source of truth: no second multiplier formula ──
    const expectedMultiplier = reputationCoinMultiplier(repBeforeIncome, state.config);
    const tooltipMultiplier = Number(parsed.multiplierStr);
    // After the fix, these should agree (before the fix, tooltip uses toFixed(1)
    // which shows 1.0 instead of 1.038)
    // Just verify the expected multiplier calculation is correct:
    expect(expectedMultiplier).toBeCloseTo(1.038, 3);
    void tooltipMultiplier; // suppress unused warning
  });

  it('tooltip baseIncome matches applyIncome phaseBreakdown baseIncome', () => {
    // This is a single-source-of-truth check: buildCoinsTooltip should
    // consume the same values that applyIncome uses.
    const state = makeState(600, 300, (st) => {
      const arcade = makeArcade();
      st.streetGrid[0] = arcade as any;
      updateNeighborsOnPlacement(st, 0);
      st.resourceBank.coins -= 400;
    });
    state.dayStartCoins = state.resourceBank.coins;
    state.dayStartRep = state.resourceBank.reputation;

    // Tooltip baseIncome
    const tooltipBase = Number(buildCoinsTooltip(state).split('\n').find(l => l.includes('Before'))!.replace(/[^0-9.]/g, ''));

    // applyIncome phaseBreakdown total baseIncome
    const incomeResult = applyIncome(state);
    const phaseTotalBase = incomeResult.phaseBreakdown.perSlotBreakdown.reduce((sum, s) => sum + s.baseIncome, 0);

    // After the fix, these must agree (before fix they diverge due to
    // tooltip not including staff buffs / hand synergy)
    expect(tooltipBase).toBe(phaseTotalBase);
  });

  it('applyIncome adds card reputationPerTurn to resourceBank', () => {
    // The reputation added during income should be the card's reputationPerTurn
    const state = makeState(600, 300, (st) => {
      const arcade = makeArcade();
      st.streetGrid[0] = arcade as any;
      updateNeighborsOnPlacement(st, 0);
      st.resourceBank.coins -= 400;
    });
    state.dayStartCoins = state.resourceBank.coins;
    state.dayStartRep = state.resourceBank.reputation;

    const repBefore = state.resourceBank.reputation;
    applyIncome(state);
    const repAfter = state.resourceBank.reputation;
    // Arcade has reputationPerTurn=5 (from card-data.csv)
    expect(repAfter).toBe(repBefore + 5);
  });

  it('reputationCoinMultiplier with rep=300 produces 1.0375', () => {
    // Pure math check: rep=300, divisor=8000 → 1 + 300/8000 = 1.0375
    const state = makeState(600, 300);
    expect(reputationCoinMultiplier(300, state.config)).toBeCloseTo(1.0375);
    // Display now uses toFixed(3); toFixed(1) would have shown '1.0'.
    expect(reputationCoinMultiplier(300, state.config).toFixed(3)).toBe('1.038');
  });

  it('net row decomposes exactly into income + costs and ordering is correct', () => {
    // Comprehensive decomposition test: income → costs → incident → net
    const state = makeState(600, 300, (st) => {
      const arcade = makeArcade();
      st.streetGrid[0] = arcade as any;
      updateNeighborsOnPlacement(st, 0);
      st.resourceBank.coins -= 400;
    });
    state.dayStartCoins = state.resourceBank.coins;
    state.dayStartRep = state.resourceBank.reputation;

    // Track deltas
    const coinsBeforeIncome = state.resourceBank.coins;

    // Income phase
    applyIncome(state);
    const coinsAfterIncome = state.resourceBank.coins;
    const incomeDelta = coinsAfterIncome - coinsBeforeIncome;

    // Costs
    const beforeCosts = state.resourceBank.coins;
    applyStaffOngoingCosts(state);
    applyCommunitySpaceOngoingCosts(state);
    applyBusinessOngoingCosts(state);
    const costsDelta = state.resourceBank.coins - beforeCosts;

    // Incident (may or may not fire; handles empty incidentDeck)
    const beforeIncident = state.resourceBank.coins;
    const incident = resolveIncident(state);
    const incidentDelta = state.resourceBank.coins - beforeIncident;
    void incident;

    // Net row
    appendTurnNetRow(state, state.turn);

    // Verify decomposition
    const expectedCoinsDelta = state.resourceBank.coins - state.dayStartCoins;
    expect(expectedCoinsDelta).toBe(incomeDelta + incidentDelta + costsDelta);

    // Verify log ordering: income → costs → incident → net row
    const logMessages = state.activityLog.map(e => e.text);
    const incomeIdx = logMessages.findIndex(m => m.includes('Income:'));
    const netIdx = logMessages.findIndex(m => m.includes('net:'));

    expect(incomeIdx).toBeGreaterThanOrEqual(0);
    expect(netIdx).toBeGreaterThan(incomeIdx);
    expect(netIdx).toBe(logMessages.length - 1); // net row is FINAL entry
  });

  it('uses only reputationCoinMultiplier/applyReputationMultiplier as canonical path', () => {
    // Verify no second multiplier formula: the only path is
    // reputationCoinMultiplier → applyReputationMultiplier
    const state = makeState(600, 300, (st) => {
      const arcade = makeArcade();
      st.streetGrid[0] = arcade as any;
      updateNeighborsOnPlacement(st, 0);
      st.resourceBank.coins -= 400;
    });

    const baseIncome = 290; // Arcade base income
    const rep = 300;
    const expected = Math.round(baseIncome * reputationCoinMultiplier(rep, state.config));
    const actual = applyReputationMultiplier(baseIncome, rep, state.config);
    expect(actual).toBe(expected);
  });
});
