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
import { STANDARD_TUTORIAL_SCENARIO } from '../../example-games/main-street/TutorialScenario';

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
  for (const templateId of STANDARD_TUTORIAL_SCENARIO.market.development) {
    ids.add(templateId);
  }
  for (const templateId of STANDARD_TUTORIAL_SCENARIO.market.investments) {
    ids.add(templateId);
  }
  return ids;
}

describe('Scenario Validation: requiredCardId references', () => {
  it('every requiredCardId in UNIFIED_TUTORIAL_STEPS is present in the tutorial scenario market', () => {
    const marketIds = buildScenarioMarketTemplateIds();
    const stepsWithRequiredCardId = UNIFIED_TUTORIAL_STEPS.filter(
      (step) => step.requiredCardId !== undefined,
    );

    // There must be at least one step with a requiredCardId
    expect(stepsWithRequiredCardId.length).toBeGreaterThan(0);

    const missing: { stepId: string; requiredCardId: string; templateId: string }[] = [];

    for (const step of stepsWithRequiredCardId) {
      const templateId = stripSerialSuffix(step.requiredCardId!);
      if (!marketIds.has(templateId)) {
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
        `Scenario market development row: [${STANDARD_TUTORIAL_SCENARIO.market.development.join(', ')}]\n` +
        `Scenario market investments row: [${STANDARD_TUTORIAL_SCENARIO.market.investments.join(', ')}]`,
      );
    }
  });

  it('no confirm-gate step has a requiredCardId (consistency check)', () => {
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      if (step.gate === 'confirm') {
        expect(step.requiredCardId).toBeUndefined();
      }
    }
  });

  it('T3 is the only action step with a requiredCardId (current invariant)', () => {
    const actionStepsWithRequiredCardId = UNIFIED_TUTORIAL_STEPS.filter(
      (step) => step.gate === 'action' && step.requiredCardId !== undefined,
    );
    // Currently only T3 has a requiredCardId
    expect(actionStepsWithRequiredCardId.length).toBe(1);
    expect(actionStepsWithRequiredCardId[0].id).toBe('T3');
  });
});
