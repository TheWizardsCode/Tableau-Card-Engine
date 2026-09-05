/**
 * Tutorial action-economy audit (CG-0MTNMBX5Z002U0MH).
 *
 * Root cause for the gap: the previous 23-step flow put two action-consuming
 * steps on Day 2 (T7 place-business and T9 buy-event) under a single daily
 * action budget (base 1 on Easy, no prior bank). Both `executeAction` paths
 * call `consumeAction` — `buy-event` and `community-favour` are NOT free —
 * so the second gated step would throw `No actions remaining today` when run
 * outside the scripted overlay. The fix inserts T8 end-turn before More than
 * Businesses so each day has at most one consumer.
 *
 * Why the gap wasn't caught:
 * - `tutorial-flow.test.ts` and `tutorial-setup-path.test.ts` assert shape
 *   (step count, sequential IDs, i18n keys, highlight zones) but never
 *   simulate per-day `actionsRemaining` / `bankedActions`.
 * - Browser E2Es (`tests/e2e/main-street-tutorial-e2e-part*.browser.test.ts`
 *   and `tests/main-street/*.browser.test.ts`) advance the tutorial via
 *   `maybeAdvanceFromRequiredAction` / overlay clicks without asserting that
 *   the engine had an available action for the gated step. A full headless
 *   playthrough that routes each action step through `executeAction` would
 *   have thrown on Day 2.
 *
 * This file is the regression guard: it partitions the unified flow into
 * days delimited by `end-turn` steps (mirroring how `MainStreetTurnController`
 * banks and resets `actionsRemaining`) and asserts no day overbooks its
 * budget. A future step that adds a second consumer to any day — or changes
 * which action types are free — will fail here before reaching the scene.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { UNIFIED_TUTORIAL_STEPS } from '../../example-games/main-street/TutorialFlow';

/**
 * Action types that consume one daily action when executed through
 * `MainStreetEngine.executeAction` / `executeCommunityFavour` /
 * `peekIncidentDeck`. Kept as the engine's single enforcement point
 * `consumeAction` — premium placements replace the cost with coins and do
 * not call it; end-turn and confirm never consume.
 *
 * Tutorial maps:
 *  - select-business  → move-to-hand (consume)
 *  - place-business   → play-business-from-hand (consume unless same-day
 *                       composite; the tutorial's two-turn plan-ahead never
 *                       hits the free composite path)
 *  - buy-event        → purchaseEvent (consume, CG-0MTH5C7FK002PDP5)
 *  - play-event       → playEventFromHand (consume unless same-day; the
 *                       T21 festival was bought on T10 / day 3, so not same-day)
 *  - community-favour → executeCommunityFavour (consume)
 *  - peek-incident-deck → peekIncidentDeck (consume)
 */
const CONSUMING_ACTIONS = new Set([
  'select-business',
  'place-business',
  'buy-business',
  'buy-and-place',
  'hire-staff',
  'buy-upgrade',
  'buy-event',
  'play-event',
  'play-event-from-hand',
  'play-upgrade-from-hand',
  'buy-and-place-upgrade',
  'move-to-hand',
  'community-favour',
  'peek-incident-deck',
]);

function consumesAction(requiredAction: string | undefined): boolean {
  if (!requiredAction) return false;
  if (requiredAction === 'end-turn') return false;
  return CONSUMING_ACTIONS.has(requiredAction);
}

/** Partition the flow into days delimited by `end-turn` steps (inclusive). */
function partitionIntoDays() {
  const days: { index: number; steps: typeof UNIFIED_TUTORIAL_STEPS[number][] }[] = [];
  let current: typeof UNIFIED_TUTORIAL_STEPS[number][] = [];
  let dayIndex = 1;
  for (const step of UNIFIED_TUTORIAL_STEPS) {
    current.push(step);
    if (step.requiredAction === 'end-turn') {
      days.push({ index: dayIndex, steps: current });
      current = [];
      dayIndex += 1;
    }
  }
  if (current.length > 0) days.push({ index: dayIndex, steps: current });
  return days;
}

describe('Tutorial action economy (CG-0MTNMBX5Z002U0MH)', () => {
  it('has exactly 26 unified steps after the Day 2/4/8 fixes', () => {
    expect(UNIFIED_TUTORIAL_STEPS.length).toBe(26);
  });

  it('no day requires more than one action-consuming step (Easy base = 1, no prior bank)', () => {
    const days = partitionIntoDays();
    const violations: string[] = [];
    for (const day of days) {
      const consumers = day.steps.filter(
        (s) => s.gate === 'action' && consumesAction(s.requiredAction),
      );
      if (consumers.length > 1) {
        violations.push(
          `Day ${day.index} (${day.steps.map((s) => s.id).join(', ')}): ` +
            `${consumers.length} consumers — ${consumers.map((s) => `${s.id}:${s.requiredAction}`).join(', ')}`,
        );
      }
    }
    expect(
      violations,
      violations.length
        ? `Days overbooked (at most 1 consumer per day on Easy):\n${violations.join('\n')}`
        : undefined,
    ).toEqual([]);
  });

  it('simulated run with banking (cap 2) never exceeds available actions', () => {
    // Mirrors MainStreetEngine.consumeAction + MainStreetTurnController end-turn
    // banking: bankable = min(actionsRemaining,1), cap 2, and next day starts
    // at 1 + banked (+ GM bonus, which the tutorial never uses).
    let actionsRemaining = 1;
    let bankedActions = 0;
    let day = 1;

    for (const step of UNIFIED_TUTORIAL_STEPS) {
      if (step.requiredAction === 'end-turn') {
        const bankable = Math.min(actionsRemaining, 1);
        bankedActions = Math.min(2, bankedActions + bankable);
        day += 1;
        actionsRemaining = 1 + bankedActions;
        continue;
      }
      if (step.gate === 'action' && consumesAction(step.requiredAction)) {
        expect(
          actionsRemaining,
          `Day ${day} step ${step.id} (${step.requiredAction}) requires an action but actionsRemaining is 0 (banked ${bankedActions})`,
        ).toBeGreaterThan(0);
        actionsRemaining -= 1;
        bankedActions = Math.max(0, bankedActions - 1);
      }
    }
  });

  it('all buy-event and community-favour action steps are counted as consuming (root cause check)', () => {
    const buyEventSteps = UNIFIED_TUTORIAL_STEPS.filter((s) => s.requiredAction === 'buy-event');
    const favourSteps = UNIFIED_TUTORIAL_STEPS.filter((s) => s.requiredAction === 'community-favour');
    expect(buyEventSteps.length).toBeGreaterThan(0);
    expect(favourSteps.length).toBeGreaterThan(0);
    for (const s of [...buyEventSteps, ...favourSteps]) {
      expect(consumesAction(s.requiredAction), `${s.id} ${s.requiredAction} should consume an action`).toBe(true);
    }
  });

  it('documents the fixed Day 2 gap: T7 and T10 (buy-event) are on different days', () => {
    const days = partitionIntoDays();
    const dayOf = (stepId: string) => days.find((d) => d.steps.some((s) => s.id === stepId))!.index;
    expect(dayOf('T7')).not.toBe(dayOf('T10'));
    // T7 (place) on day 2, T10 (Local Festival buy) on day 3 — the inserted
    // T8 end-turn is between them.
    expect(dayOf('T7')).toBe(2);
    expect(dayOf('T8')).toBe(2); // T8 is the end-turn that closes day 2
    expect(dayOf('T9')).toBe(3);
    expect(dayOf('T10')).toBe(3);
  });

  it('eight End Turns delimit nine days (T6, T8, T11, T14, T16, T18, T20, T22)', () => {
    const endTurnIds = UNIFIED_TUTORIAL_STEPS.filter((s) => s.requiredAction === 'end-turn').map((s) => s.id);
    expect(endTurnIds).toEqual(['T6', 'T8', 'T11', 'T14', 'T16', 'T18', 'T20', 'T22']);
    expect(partitionIntoDays()).toHaveLength(9);
  });
});
