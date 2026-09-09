/**
 * Tutorial: Choice Events Excluded (CG-0MTT7FO7I009295E / parent
 * CG-0MTSHG8RP008E128)
 *
 * Verifies that the tutorial never surfaces dual-choice incidents:
 *
 * 1. The standard tutorial scenario's incident deck contains only non-choice
 *    templates (no `hasChoices`) — the tutorial deck is scripted from the
 *    event pool, so any hasChoices card added to content is structurally
 *    excluded from the tutorial path (producer decision 2026-09-08 Q2 — no
 *    choice events in the tutorial; no teaching step is added).
 * 2. Building a tutorial scenario that pins a hasChoices incident fails fast
 *    (regression guard): the scenario builder throws instead of silently
 *    shipping a pending choice into the step flow.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  createTutorialScenario,
  STANDARD_TUTORIAL_SCENARIO,
} from '../../example-games/main-street/TutorialScenario';
import {
  getEventTemplates,
  resetTemplatesToDefault,
} from '../../example-games/main-street/MainStreetCards';

afterEach(() => {
  resetTemplatesToDefault();
});

describe('AC1 — tutorial incident deck excludes choice events', () => {
  it('every incident pinned by the standard tutorial scenario is non-choice', () => {
    const templates = new Map(getEventTemplates().map((t) => [t.id, t]));
    for (const templateId of STANDARD_TUTORIAL_SCENARIO.incidentDeck) {
      const template = templates.get(templateId);
      expect(template, `template ${templateId} must exist`).toBeDefined();
      expect(template!.hasChoices, `tutorial incident ${templateId} must not have hasChoices`).toBeFalsy();
    }
    // The scenario actually builds (guard sanity).
    const state = createTutorialScenario();
    expect(state.pendingEventChoice).toBeNull();
  });

  it('bundled tutorial-pinned event templates carry no choice links', () => {
    const pinned = new Set(STANDARD_TUTORIAL_SCENARIO.incidentDeck);
    for (const t of getEventTemplates()) {
      if (!pinned.has(t.id)) continue;
      expect(t.acceptNextCardId ?? null).toBeNull();
      expect(t.rejectNextCardId ?? null).toBeNull();
    }
  });
});

describe('AC2 — regression guard: a choice event in the tutorial deck fails fast', () => {
  it('createTutorialScenario throws when a pinned incident has hasChoices', () => {
    // Flip an existing tutorial-pinned template to a choice event in the live
    // registry (restored by afterEach → resetTemplatesToDefault). The scenario
    // builder must fail fast instead of shipping a pending choice into the
    // tutorial's scripted step flow.
    const award = getEventTemplates().find((t) => t.id === 'evt-award')!;
    (award as { hasChoices?: boolean }).hasChoices = true;

    const badScenario: typeof STANDARD_TUTORIAL_SCENARIO = {
      ...STANDARD_TUTORIAL_SCENARIO,
      incidentDeck: ['evt-award'],
    };
    expect(() => createTutorialScenario(badScenario)).toThrow(/hasChoices/);
  });
});
