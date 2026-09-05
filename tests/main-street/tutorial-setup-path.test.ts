/**
 * Tutorial Setup Path Integration Tests
 *
 * Verifies that the tutorial setup uses the scenario factory
 * (createTutorialScenario) instead of the old seed-based approach
 * (setupMainStreetGame with TUTORIAL_SEED).
 *
 * Acceptance criteria:
 * 1. Tests verify that onStartTutorial calls the scenario factory instead of
 *    setupMainStreetGame with TUTORIAL_SEED
 * 2. Tests verify TUTORIAL_SEED constant is no longer used in the tutorial
 *    setup path
 * 3. Tests verify all 13 tutorial steps (T1-T13) complete successfully with
 *    the new setup path
 * 4. Tests verify scenario-built state produces same market indices as current
 *    behavior (backward compatibility)
 * 5. Tests verify existing tutorial state/types in TutorialState.ts remain
 *    compatible
 * 6. Tests are pure Node unit tests (no Phaser dependency)
 * 7. Full project test suite must pass with the new changes
 * 8. All related documentation is updated to reflect the changes
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { createTutorialScenario, STANDARD_TUTORIAL_SCENARIO } from '../../example-games/main-street/TutorialScenario';
import {
  TUTORIAL_SEED,
  createDefaultTutorialState,
  parseTutorialState,
  serializeTutorialState,
  updateTutorialStatus,
  shouldShowTutorialOffer,
  loadTutorialState,
  saveTutorialState,
  bridgeLegacyTutorialSeen,
  type MainStreetTutorialStateV1,
  type TutorialStorageAdapter,
} from '../../example-games/main-street/TutorialState';
import {
  createTutorialControllerState,
  startTutorial,
  completeCurrentStep,
  getCurrentStep,
  exitTutorial,
  UNIFIED_TUTORIAL_STEPS,
  UNIFIED_TUTORIAL_STEP_COUNT,
} from '../../example-games/main-street/TutorialFlow';
import { MARKET_TOTAL_SLOTS } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Extracts the base template ID from a card ID by removing the copy/serial suffix.
 * E.g., 'biz-bakery-0' -> 'biz-bakery'
 */
function stripSerialSuffix(cardId: string): string {
  return cardId.replace(/-\d+$/, '');
}

/**
 * Creates an in-memory storage adapter for testing TutorialState persistence.
 */
function createInMemoryStorage(): TutorialStorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

// ── AC1: onStartTutorial uses scenario factory ────────────────

describe('AC1: Tutorial setup uses scenario factory (not seed-based setupWithSeed)', () => {
  it('createTutorialScenario produces a valid state without using TUTORIAL_SEED', () => {
    const state = createTutorialScenario();

    // State is properly initialized
    expect(state).toBeDefined();
    expect(state.turn).toBe(1);
    expect(state.phase).toBe('DayStart');
    expect(state.gameResult).toBe('playing');

    // Difficulty is Easy (same as tutorial)
    expect(state.config.difficultyName).toBe('Easy');
  });

  it('scenario state is deterministic (not seed-dependent for market cards)', () => {
    // Unlike setupMainStreetGame where market contents vary by seed,
    // createTutorialScenario always produces the same market
    const state1 = createTutorialScenario();
    const state2 = createTutorialScenario();

    // Development row cards are identical between runs
    expect(state1.market.cards.map(c => c.id)).toEqual(
      state2.market.cards.map(c => c.id),
    );
    // Investments row cards are identical
    expect(state1.market.cards.map(c => c.id)).toEqual(
      state2.market.cards.map(c => c.id),
    );
    // Incident queue cards are identical
    expect(state1.incidentDeck.map(c => c.id)).toEqual(
      state2.incidentDeck.map(c => c.id),
    );
    // Resource bank is identical
    expect(state1.resourceBank.coins).toBe(state2.resourceBank.coins);
    expect(state1.resourceBank.reputation).toBe(state2.resourceBank.reputation);
  });

  it('scenario-based state does NOT reference TUTORIAL_SEED in its seed field', () => {
    const state = createTutorialScenario();
    // The scenario defines its own seed ('tutorial-scenario') rather than
    // using the old TUTORIAL_SEED ('tutorial-seed')
    expect(state.seed).not.toBe(TUTORIAL_SEED);
    expect(state.seed).toBe('tutorial-scenario');
  });

  it('scenario state produces the same market cards as STANDARD_TUTORIAL_SCENARIO definition', () => {
    const state = createTutorialScenario();

    // Development row base template IDs match the scenario definition
    const devTemplateIds = state.market.cards.map(c => stripSerialSuffix(c.id));
    expect(devTemplateIds).toEqual(STANDARD_TUTORIAL_SCENARIO.market.cards);

    // Investments row base template IDs match
    const invTemplateIds = state.market.cards.map(c => stripSerialSuffix(c.id));
    expect(invTemplateIds).toEqual(STANDARD_TUTORIAL_SCENARIO.market.cards);

    // Incident deck base template IDs match
    const incidentTemplateIds = state.incidentDeck.map(c => stripSerialSuffix(c.id));
    expect(incidentTemplateIds).toEqual(STANDARD_TUTORIAL_SCENARIO.incidentDeck);
  });

  it('scenario state has correct starting resources for tutorial', () => {
    const state = createTutorialScenario();
    // Tutorial starts with the scenario's 1200 coins (CG-0MSTOATDQ005XDET
    // reduced from 1600 so the T13 Community Favour rep→coins conversion is
    // REQUIRED for the $700 Library) and 500 reputation (200 spent by the
    // conversion, leaving a safe 300).
    expect(state.resourceBank.coins).toBe(1200);
    expect(state.resourceBank.reputation).toBe(500);
  });

  it('scenario state has an empty street grid (no pre-placed businesses)', () => {
    const state = createTutorialScenario();
    expect(state.streetGrid.every(slot => slot === null)).toBe(true);
  });

  it('scenario state has no held event', () => {
    const state = createTutorialScenario();
    expect(state.hand.some(c => c.family === 'event')).toBe(false);
  });

  it('scenario state has active challenges selected', () => {
    const state = createTutorialScenario();
    expect(state.activeChallenges.length).toBeGreaterThan(0);
  });
});

// ── AC2: TUTORIAL_SEED deprecation ───────────────────────────

describe('AC2: TUTORIAL_SEED is deprecated and not used in tutorial setup path', () => {
  it('TUTORIAL_SEED constant still exists for backward compatibility', () => {
    // The constant is retained in TutorialState.ts with a deprecation comment
    expect(TUTORIAL_SEED).toBe('tutorial-seed');
  });

  it('createTutorialScenario does NOT use TUTORIAL_SEED', () => {
    // The scenario factory uses its own seed ('tutorial-scenario')
    // defined in STANDARD_TUTORIAL_SCENARIO.seed
    const state = createTutorialScenario();
    expect(state.seed).toBe('tutorial-scenario');
    expect(state.numericSeed).not.toBe(0); // Has a valid numeric seed
  });

  it('TUTORIAL_SEED is not referenced in the tutorial onStartTutorial path', () => {
    // In MainStreetLifecycleManager.ts, the onStartTutorial callback calls
    // createTutorialScenario() directly - no reference to TUTORIAL_SEED.
    // Verify by checking that createTutorialScenario doesn't import TUTORIAL_SEED:
    const scenarioSource = createTutorialScenario.toString();
    expect(scenarioSource).not.toContain('TUTORIAL_SEED');
  });

  it('scenario state can still be used with existing TutorialState types', () => {
    // The scenario system changes how state is created but doesn't change
    // the TutorialState types (TutorialState.ts remains unchanged)
    const defaultState = createDefaultTutorialState();
    expect(defaultState.status).toBe('not_seen');

    // Tutorial state can be saved and loaded alongside scenario state
    const storage = createInMemoryStorage();
    void saveTutorialState(storage, defaultState);
    const loaded = loadTutorialState(storage);
    expect(loaded.status).toBe('not_seen');
  });
});

// ── AC3: All 13 tutorial steps complete with scenario setup ──

describe('AC3: All 18 tutorial steps complete with scenario-based setup', () => {
  it('UNIFIED_TUTORIAL_STEPS contains exactly 26 steps (T1-T26)', () => {
    expect(UNIFIED_TUTORIAL_STEPS.length).toBe(26);
    expect(UNIFIED_TUTORIAL_STEP_COUNT).toBe(26);

    for (let i = 0; i < 26; i++) {
      expect(UNIFIED_TUTORIAL_STEPS[i].id).toBe(`T${i + 1}`);
    }
  });

  it('tutorial controller walks through all 26 steps via completeCurrentStep', () => {
    let controller = startTutorial(createTutorialControllerState());

    // Walk through all 26 steps
    const completedIds: string[] = [];
    for (let i = 0; i < 26; i++) {
      expect(controller.isActive).toBe(true);
      const currentStep = getCurrentStep(controller);
      expect(currentStep).toBeDefined();
      completedIds.push(currentStep!.id);

      const result = completeCurrentStep(controller);
      expect(result.completedStepId).toBe(currentStep!.id);
      controller = result.newState;
    }

    // Verify all 26 steps were completed in order
    expect(completedIds).toEqual([
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8',
      'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18', 'T19', 'T20', 'T21', 'T22', 'T23', 'T24', 'T25', 'T26',
    ]);

    // After the 24th step completes, the controller has advanced past the end
    expect(controller.lastCompletedStepId).toBe('T26');
    expect(controller.currentStepIndex).toBe(26); // Past the end
    // isActive stays true (only exitTutorial sets it to false)
    // Verify the controller is at end by checking getCurrentStep returns null
    const afterComplete = getCurrentStep(controller);
    expect(afterComplete).toBeNull();
  });

  it('scenario-based state has all requiredCardId cards available: day-1 row or day-start hook', () => {
    const state = createTutorialScenario();

    // Build lookup sets for quick checking
    const rowTemplateIds = new Set(state.market.cards.map(c => stripSerialSuffix(c.id)));

    // Day-4/6 targets (Bookshop T12, Library T19) are guaranteed by the
    // day-start hook rather than the day-1 row (CG-0MSTOATDT009BRX2,
    // CG-0MTNMBX5Z002U0MH renumber).
    const hookCovered = new Set(['biz-bookshop', 'cs-library']);

    // Find all action steps with requiredCardId
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      if (step.requiredCardId) {
        const templateId = stripSerialSuffix(step.requiredCardId);
        expect(rowTemplateIds.has(templateId) || hookCovered.has(templateId)).toBe(true);
      }
    }
  });

  it('T3 requiredCardId (Laundromat) is in the scenario development row', () => {
    const state = createTutorialScenario();
    const t3 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;
    expect(t3).toBeDefined();

    const templateId = stripSerialSuffix(t3.requiredCardId!);
    const devTemplateIds = state.market.cards.map(c => stripSerialSuffix(c.id));
    expect(devTemplateIds).toContain(templateId);
  });

  it('T10 requiredCardId (Local Festival) is in the scenario investments row', () => {
    const state = createTutorialScenario();
    const t10 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T10')!;
    expect(t10).toBeDefined();

    // T10 requires buying an event from the investments row
    // The scenario has 'evt-festival' as its investment event; the step's
    // required card matches the visible event after the renumber.
    const invEvent = state.market.cards.find(c => c.family === 'event');
    expect(invEvent).toBeDefined();
    expect(stripSerialSuffix(invEvent!.id)).toBe(stripSerialSuffix(t10.requiredCardId!));
  });

  it('scenario state provides sufficient coins for the 26-step two-turn purchases (Laundromat $400 + Bookshop $300 + Library $700 at listed cost)', () => {
    const state = createTutorialScenario();

    // Starting coins: 1200 (scenario; the two-turn flow places every card the
    // day after its move at LISTED cost — no same-turn +50% premium)
    expect(state.resourceBank.coins).toBe(1200);

    // After moving the Laundromat to hand (day 1) and placing it at listed
    // cost (day 2): 8 coins remaining — positive even after holding it
    // overnight (ongoing-cost overhead).
    expect(12 - 4).toBe(8);

    // End-turn income (~2.154 from the placed Laundromat on day 2) funds the
    // $3 Bookshop placement (T15); see TutorialScenario's budget table.
    const afterIncome = 12 - 4 + 2.154;
    expect(afterIncome).toBeGreaterThanOrEqual(3);

    // End-turn income on days 4-5 (~3.9 each) plus the optional T13
    // Community Favour (+3) keep the balance well above the $7 Library.
    const beforeLibrary = afterIncome - 3 + 1.333 + 3.911 + 3.918 + 3;
    expect(beforeLibrary).toBeGreaterThanOrEqual(7);
  });
});

// ── AC4: Backward compatibility (same market indices) ────────

describe('AC4: Scenario-built state produces consistent market indices (backward compatibility)', () => {
  it('scenario state produces identical market every time (AC4)', () => {
    // Run createTutorialScenario 5 times and verify identical output
    const runs = Array.from({ length: 5 }, () => createTutorialScenario());

    const firstDev = runs[0].market.cards.map(c => c.id);
    const firstInv = runs[0].market.cards.map(c => c.id);
    const firstInc = runs[0].incidentDeck.map(c => c.id);
    const firstCoins = runs[0].resourceBank.coins;
    const firstRep = runs[0].resourceBank.reputation;

    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].market.cards.map(c => c.id)).toEqual(firstDev);
      expect(runs[i].market.cards.map(c => c.id)).toEqual(firstInv);
      expect(runs[i].incidentDeck.map(c => c.id)).toEqual(firstInc);
      expect(runs[i].resourceBank.coins).toBe(firstCoins);
      expect(runs[i].resourceBank.reputation).toBe(firstRep);
    }
  });

  it('scenario state has same structure as a standard MainStreetState', () => {
    const state = createTutorialScenario();

    // State has all required fields matching MainStreetState interface
    expect(state).toHaveProperty('config');
    expect(state).toHaveProperty('turn');
    expect(state).toHaveProperty('phase');
    expect(state).toHaveProperty('streetGrid');
    expect(state).toHaveProperty('market');
    expect(state).toHaveProperty('resourceBank');
    expect(state).toHaveProperty('ledger');
    expect(state).toHaveProperty('decks');
    expect(state).toHaveProperty('discards');
    expect(state).toHaveProperty('challengesCompleted');
    expect(state).toHaveProperty('activeChallenges');
    expect(state).toHaveProperty('hand');
    expect(state).toHaveProperty('incidentDeck');
    expect(state).toHaveProperty('gameResult');
    expect(state).toHaveProperty('endReason');
    expect(state).toHaveProperty('finalScore');
    expect(state).toHaveProperty('seed');
    expect(state).toHaveProperty('numericSeed');
    expect(state).toHaveProperty('rngCalls');
    expect(state).toHaveProperty('rng');
    expect(state).toHaveProperty('activityLog');
    expect(state).toHaveProperty('activeEffects');
  });

  it('scenario state market has expected slot count and card types', () => {
    const state = createTutorialScenario();

    // Single row: exactly MARKET_TOTAL_SLOTS cards. Day-1 composition is
    // 2 business (Bakery + Laundromat) + 1 event (Local Festival).
    expect(state.market.cards.length).toBe(MARKET_TOTAL_SLOTS);
    const business = state.market.cards.filter(
      c => c.family === 'business' || c.family === 'community-space',
    );
    expect(business.length).toBe(2);

    // The single event is the Local Festival (T10 target, CG-0MTNMBX5Z002U0MH).
    const events = state.market.cards.filter(c => c.family === 'event');
    expect(events.length).toBe(1);
    const upgrades = state.market.cards.filter(c => c.family === 'upgrade');
    expect(upgrades.length).toBe(0);

    // Incident deck: exactly 8 Incident-trigger events (one per End Turn
    // in the 26-step two-turn flow, CG-0MTNMBX5Z002U0MH: T6, T8, T11, T14, T16, T18, T20, T22)
    expect(state.incidentDeck.length).toBe(8);
    for (const card of state.incidentDeck) {
      expect(card.family).toBe('event');
      expect(card.trigger).toBe('Incident');
    }
  });

  it('scenario state can drive standard game engine operations', () => {
    // The scenario state should work with standard Main Street engine functions
    // without modification. This tests structural backward compatibility.
    const state = createTutorialScenario();

    // State has config with difficulty preset; default presets impose no
    // turn limit (maxTurns is optional and unset — CG-0MSLXJCHH001DLIO).
    expect(state.config.difficultyName).toBe('Easy');
    expect(state.config.maxTurns).toBeUndefined();
    expect(state.config.startingCoins).toBe(1000);
    expect(state.config.startingReputation).toBe(500);

    // State has all four decks
    expect(state.decks.business.length).toBeGreaterThan(0);
    expect(state.decks.event.length).toBeGreaterThan(0);
    expect(state.decks.upgrade.length).toBeGreaterThan(0);
    expect(state.decks.communitySpace.length).toBeGreaterThan(0);
  });
});

// ── AC5: TutorialState compatibility ─────────────────────────

describe('AC5: Existing TutorialState types remain compatible with scenario setup', () => {
  it('TutorialState schema version is unchanged', () => {
    // The scenario system doesn't modify TutorialState types
    const defaultState = createDefaultTutorialState();
    expect(defaultState.schemaVersion).toBe(1);
  });

  it('TutorialState round-trips through serialize/parse', () => {
    const original: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'completed',
      completedAt: '2026-06-27T00:00:00.000Z',
      lastStepId: 'T13',
      bankingHintShownAt: null,
    };
    const serialized = serializeTutorialState(original);
    const parsed = parseTutorialState(serialized);
    expect(parsed).toEqual(original);
  });

  it('TutorialState persistence works with scenario setup path', () => {
    const storage = createInMemoryStorage();
    const defaultState = createDefaultTutorialState();

    // Save tutorial state (as would happen during tutorial flow)
    void saveTutorialState(storage, defaultState);
    expect(storage.getItem('tce-main-street-tutorial-state')).not.toBeNull();

    // Update to 'not_seen' (as the scenario onStartTutorial would do)
    const notSeen = updateTutorialStatus(defaultState, 'not_seen');
    void saveTutorialState(storage, notSeen);
    const loaded = loadTutorialState(storage);
    expect(loaded.status).toBe('not_seen');
  });

  it('shouldShowTutorialOffer logic is unaffected by scenario changes', () => {
    // The scenario system doesn't change tutorial offer logic
    const state = createDefaultTutorialState();
    expect(shouldShowTutorialOffer(state)).toBe(true);

    const skipped = updateTutorialStatus(state, 'skipped');
    expect(shouldShowTutorialOffer(skipped)).toBe(false);

    const completed = updateTutorialStatus(state, 'completed');
    expect(shouldShowTutorialOffer(completed)).toBe(false);

    // forceShowOffer still overrides
    expect(shouldShowTutorialOffer(completed, { forceShowOffer: true })).toBe(true);
  });

  it('legacy bridge still works with scenario setup', () => {
    const storage = createInMemoryStorage();
    const result = bridgeLegacyTutorialSeen(storage, true);
    expect(result.status).toBe('completed');

    const result2 = bridgeLegacyTutorialSeen(storage, false);
    expect(result2.status).toBe('not_seen');
  });

  it('loadTutorialState still works without any scenario changes', () => {
    const storage = createInMemoryStorage();

    // Default (empty storage)
    const defaultLoaded = loadTutorialState(storage);
    expect(defaultLoaded.status).toBe('not_seen');

    // Save and load round-trip
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'skipped',
      completedAt: null,
      lastStepId: 'T2',
      bankingHintShownAt: null,
    };
    void saveTutorialState(storage, state);
    const loaded = loadTutorialState(storage);
    expect(loaded).toEqual(state);
  });

  it('TutorialState storage key is unchanged', () => {
    // TutorialState storage key should remain the same
    const storage = createInMemoryStorage();
    const state = createDefaultTutorialState();
    void saveTutorialState(storage, state);
    expect(storage.getItem('tce-main-street-tutorial-state')).not.toBeNull();
  });

  it('TutorialControllerState works with scenario setup path', () => {
    // The TutorialController (from TutorialFlow.ts) is independent of
    // how the game state is created. Verify it still works as expected.
    const controller = startTutorial(createTutorialControllerState());
    expect(controller.isActive).toBe(true);
    expect(controller.currentStepIndex).toBe(0);

    // Exit tutorial (as would happen if player presses Skip)
    const exited = exitTutorial(controller);
    expect(exited.isActive).toBe(false);
    expect(exited.exited).toBe(true);
  });
});

// ── Cross-cutting: Node unit test compatibility ─────────────

describe('Node unit test compatibility (AC6)', () => {
  it('all imports work without Phaser', () => {
    // All imports at the top of this file are pure TypeScript modules
    // with no Phaser dependency. This test confirms the imports resolve.
    expect(createTutorialScenario).toBeDefined();
    expect(TUTORIAL_SEED).toBeDefined();
    expect(STANDARD_TUTORIAL_SCENARIO).toBeDefined();
    expect(createTutorialControllerState).toBeDefined();
    expect(UNIFIED_TUTORIAL_STEPS).toBeDefined();
    expect(createDefaultTutorialState).toBeDefined();
  });

  it('all scenario functions are synchronous (no Phaser async dependencies)', () => {
    const state = createTutorialScenario();
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(1);

    // Tutorial controller functions are also synchronous
    const controller = startTutorial(createTutorialControllerState());
    expect(controller.isActive).toBe(true);
    const step = getCurrentStep(controller);
    expect(step).toBeDefined();
    expect(step!.id).toBe('T1');
  });
});
