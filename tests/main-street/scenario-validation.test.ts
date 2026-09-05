/**
 * Scenario Validation Test
 *
 * Validates that every `requiredCardId` in UNIFIED_TUTORIAL_STEPS references
 * a card ID present in the current tutorial scenario's market. This ensures
 * that if a referenced card is removed from or renamed in the scenario market,
 * CI fails rather than silently breaking the tutorial at runtime.
 *
 * This is a pure Node unit test (no Phaser required) and runs as part of
 * `npm test`.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { UNIFIED_TUTORIAL_STEPS } from '../../example-games/main-street/TutorialFlow';
import {
  STANDARD_TUTORIAL_SCENARIO,
  ensureTutorialMarketForUpcomingSteps,
} from '../../example-games/main-street/TutorialScenario';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import type { TutorialControllerState } from '../../example-games/main-street/TutorialFlow';

/**
 * Strips the copy/serial suffix from a card ID to obtain the base template ID.
 *
 * E.g., `'biz-laundromat-0'` → `'biz-laundromat'`
 *       `'evt-grand-opening-15'` → `'evt-grand-opening'`
 *
 * The suffix is the final `-\d+` segment. Cards without a numeric suffix
 * (e.g., already a template ID like `'biz-bakery'`) are returned unchanged.
 */
function stripSerialSuffix(cardId: string): string {
  return cardId.replace(/-\d+$/, '');
}

/**
 * Builds a Set of all base template IDs present in the standard tutorial
 * scenario's market (both development and investments rows).
 */
function buildScenarioMarketTemplateIds(): Set<string> {
  const ids = new Set<string>();
  for (const templateId of STANDARD_TUTORIAL_SCENARIO.market.cards) {
    ids.add(templateId);
  }
  for (const templateId of STANDARD_TUTORIAL_SCENARIO.market.cards) {
    ids.add(templateId);
  }
  return ids;
}

describe('Scenario Validation: requiredCardId references', () => {
  it('every requiredCardId in UNIFIED_TUTORIAL_STEPS is either in the day-1 scenario market or guaranteed by the day-start hook', () => {
    const marketIds = buildScenarioMarketTemplateIds();
    const stepsWithRequiredCardId = UNIFIED_TUTORIAL_STEPS.filter(
      (step) => step.requiredCardId !== undefined,
    );

    // There must be at least one step with a requiredCardId
    expect(stepsWithRequiredCardId.length).toBeGreaterThan(0);

    // The single-row market (CG-0MSTOATDT009BRX2) holds only 3 cards. The
    // two-turn tutorial (CG-0MTNMBX5Z002U0MH, 26 steps) places each card the
    // day after its move: day-1/3 targets (T3 Laundromat, T10 Local Festival)
    // are scenario-placed / market-refillable; the Bookshop (T12) and Library
    // (T19) move-to-hand targets are forced into the visible line at day
    // start by
    // ensureTutorialMarketForUpcomingSteps. Both paths are valid.
    const hookCovered = new Set(['biz-bookshop', 'cs-library']);

    const missing: { stepId: string; requiredCardId: string; templateId: string }[] = [];

    for (const step of stepsWithRequiredCardId) {
      const templateId = stripSerialSuffix(step.requiredCardId!);
      if (!marketIds.has(templateId) && !hookCovered.has(templateId)) {
        missing.push({
          stepId: step.id,
          requiredCardId: step.requiredCardId!,
          templateId,
        });
      }
    }

    // Provide a clear failure message listing all missing references
    if (missing.length > 0) {
      const details = missing
        .map(
          (m) =>
            `  Step ${m.stepId}: requiredCardId "${m.requiredCardId}" ` +
            `(template "${m.templateId}") not found in scenario market.`,
        )
        .join('\n');
      expect.fail(
        `The following requiredCardId references are not present in the tutorial scenario market:\n${details}\n\n` +
        'Expected all requiredCardId values to reference cards defined in the scenario market. ' +
        'If a card has been renamed or removed, update both the TutorialFlow step definition and the scenario market.\n' +
        `Scenario market row: [${STANDARD_TUTORIAL_SCENARIO.market.cards.join(', ')}]`,
      );
    }
  });

  it('the day-start hook actually guarantees the hook-covered targets appear in the row', () => {
    // Day-7 start: T19 (Library move-to-hand) is upcoming; the hook must put
    // cs-library into the visible row (CG-0MTNMBX5Z002U0MH: T18→T19).
    const t18Index = UNIFIED_TUTORIAL_STEPS.findIndex(s => s.id === 'T19');
    const controller: TutorialControllerState = {
      isActive: true,
      currentStepIndex: t18Index,
      lastCompletedStepId: 'T18',
      exited: false,
    };
    const state = setupMainStreetGame({ seed: 'scenario-hook-validation' });
    ensureTutorialMarketForUpcomingSteps(state, controller);
    expect(state.market.cards.some(c => stripSerialSuffix(c.id) === 'cs-library')).toBe(true);
    expect(state.market.cards).toHaveLength(3);
  });

  it('no confirm-gate step has a requiredCardId (consistency check)', () => {
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      if (step.gate === 'confirm') {
        expect(step.requiredCardId).toBeUndefined();
      }
    }
  });

  it('T3/T10/T12/T19 are the action steps with a requiredCardId (current invariant)', () => {
    const actionStepsWithRequiredCardId = UNIFIED_TUTORIAL_STEPS.filter(
      (step) => step.gate === 'action' && step.requiredCardId !== undefined,
    );
    // Two-turn 26-step flow (CG-0MTNMBX5Z002U0MH): T3 (Laundromat), T10 (Local
    // Festival), T12 (Bookshop move-to-hand), T19 (Library move-to-hand).
    expect(actionStepsWithRequiredCardId.length).toBe(4);
    expect(actionStepsWithRequiredCardId.map(s => s.id)).toEqual(['T3', 'T10', 'T12', 'T19']);
    expect(actionStepsWithRequiredCardId[0].requiredCardId).toBe('biz-laundromat-0');
    expect(actionStepsWithRequiredCardId[1].requiredCardId).toBe('evt-festival-0');
    expect(actionStepsWithRequiredCardId[2].requiredCardId).toBe('biz-bookshop-0');
    expect(actionStepsWithRequiredCardId[3].requiredCardId).toBe('cs-library');
  });
});
