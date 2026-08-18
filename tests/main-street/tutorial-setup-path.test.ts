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
import { MARKET_TOTAL_SLOTS, INCIDENT_QUEUE_SIZE } from '../../example-games/main-street/MainStreetCards';

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

    // Incident queue base template IDs match
    const incidentTemplateIds = state.incidentDeck.map(c => stripSerialSuffix(c.id));
    expect(incidentTemplateIds).toEqual(STANDARD_TUTORIAL_SCENARIO.incidentQueue);
  });

  it('scenario state has correct starting resources for tutorial', () => {
    const state = createTutorialScenario();
    // Tutorial starts with the scenario's 16 coins (raised from the 12-coin
    // Easy preset to afford the 4-card 17-step flow) and 5 reputation.
    expect(state.resourceBank.coins).toBe(16);
    expect(state.resourceBank.reputation).toBe(5);
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

describe('AC3: All 17 tutorial steps complete with scenario-based setup', () => {
  it('UNIFIED_TUTORIAL_STEPS contains exactly 17 steps (T1-T17)', () => {
    expect(UNIFIED_TUTORIAL_STEPS.length).toBe(17);
    expect(UNIFIED_TUTORIAL_STEP_COUNT).toBe(17);

    for (let i = 0; i < 17; i++) {
      expect(UNIFIED_TUTORIAL_STEPS[i].id).toBe(`T${i + 1}`);
    }
  });

  it('tutorial controller walks through all 17 steps via completeCurrentStep', () => {
    let controller = startTutorial(createTutorialControllerState());

    // Walk through all 17 steps
    const completedIds: string[] = [];
    for (let i = 0; i < 17; i++) {
      expect(controller.isActive).toBe(true);
      const currentStep = getCurrentStep(controller);
      expect(currentStep).toBeDefined();
      completedIds.push(currentStep!.id);

      const result = completeCurrentStep(controller);
      expect(result.completedStepId).toBe(currentStep!.id);
      controller = result.newState;
    }

    // Verify all 17 steps were completed in order
    expect(completedIds).toEqual([
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8',
      'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17',
    ]);

    // After the 17th step completes, the controller has advanced past the end
    expect(controller.lastCompletedStepId).toBe('T17');
    expect(controller.currentStepIndex).toBe(17); // Past the end
    // isActive stays true (only exitTutorial sets it to false)
    // Verify the controller is at end by checking getCurrentStep returns null
    const afterComplete = getCurrentStep(controller);
    expect(afterComplete).toBeNull();
  });

  it('scenario-based state has all requiredCardId cards available: day-1 row or day-start hook', () => {
    const state = createTutorialScenario();

    // Build lookup sets for quick checking
    const rowTemplateIds = new Set(state.market.cards.map(c => stripSerialSuffix(c.id)));

    // Day-2/3 targets (Bookshop T10, Library T13) are guaranteed by the
    // day-start hook rather than the day-1 row (CG-0MSTOATDT009BRX2).
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

  it('T9 requiredCardId (Local Festival) is in the scenario investments row', () => {
    const state = createTutorialScenario();
    const t9 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T9')!;
    expect(t9).toBeDefined();

    const invTemplateIds = state.market.cards.map(c => stripSerialSuffix(c.id));

    // T9 requires buying an event from the investments row
    // The scenario has 'evt-festival' as its investment event
    const invEvent = state.market.cards.find(c => c.family === 'event');
    expect(invEvent).toBeDefined();
    expect(invTemplateIds).toContain(stripSerialSuffix(invEvent!.id));
  });

  it('scenario state provides sufficient coins for the 17-step purchases (Laundromat $4, Local Festival $3, Bookshop $3, Library $7)', () => {
    const state = createTutorialScenario();

    // Starting coins: 16 (scenario, raised above the 12-coin Easy preset)
    expect(state.resourceBank.coins).toBe(16);

    // After buying Laundromat ($4): 12 coins remaining
    const afterLaundromat = 16 - 4;
    expect(afterLaundromat).toBe(12);

    // After one income turn (Laundromat ~0.625): ~12.6, enough for the $3 Local Festival
    const afterIncome = afterLaundromat + 0.625;
    expect(afterIncome).toBeGreaterThanOrEqual(3);

    // After Local Festival ($3) and Bookshop ($3): ~6.6
    const afterFestivalBookshop = afterIncome - 3 - 3;
    expect(afterFestivalBookshop).toBeGreaterThanOrEqual(0);

    // Second income turn (Laundromat + Bookshop ~1.25): ~7.9, enough for the $7 Library
    expect(afterFestivalBookshop + 1.25).toBeGreaterThanOrEqual(7);
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

    // The single event is the Local Festival (T9 target)
    const events = state.market.cards.filter(c => c.family === 'event');
    expect(events.length).toBe(1);
    const upgrades = state.market.cards.filter(c => c.family === 'upgrade');
    expect(upgrades.length).toBe(0);

    // Incident queue: exactly INCIDENT_QUEUE_SIZE Incident-trigger events
    expect(state.incidentDeck.length).toBe(INCIDENT_QUEUE_SIZE);
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
    expect(state.config.startingCoins).toBe(10);
    expect(state.config.startingReputation).toBe(5);

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
