import { describe, it, expect, beforeEach } from 'vitest';
import {
  UNIFIED_TUTORIAL_STEPS, UNIFIED_TUTORIAL_STEP_COUNT,
  INVALID_ACTION_MESSAGE,
  createTutorialControllerState, advanceTutorialStep, startTutorial,
  exitTutorial, completeCurrentStep, isOnStep, getCurrentStep,
  isRequiredAction, shouldAllowAction,
  resolveTutorialStepText, isSynergyAdjacentPlacement,
} from '../../example-games/main-street/TutorialFlow';
import type { BusinessCard, CommunitySpaceCard } from '../../example-games/main-street/MainStreetCards';
import { resetI18n, registerLocale } from '../../src/core-engine/I18n';
import { TUTORIAL_EN_BUNDLE } from '../../example-games/main-street/i18n/tutorial-en';

function findStep(id: string) { const s = UNIFIED_TUTORIAL_STEPS.find((s) => s.id === id); if (!s) throw new Error(`Step ${id} not found`); return s; }

describe('UNIFIED_TUTORIAL_STEPS', () => {
  beforeEach(() => {
    resetI18n();
    registerLocale('en', TUTORIAL_EN_BUNDLE);
  });

  it('defines exactly 26 steps', () => { expect(UNIFIED_TUTORIAL_STEPS.length).toBe(26); expect(UNIFIED_TUTORIAL_STEP_COUNT).toBe(26); });
  it('steps have sequential T1-T26 IDs', () => { for(let i=0;i<26;i++) expect(UNIFIED_TUTORIAL_STEPS[i].id).toBe(`T${i+1}`); });
  it('each step has non-empty titleKey and bodyKey', () => { for(const step of UNIFIED_TUTORIAL_STEPS){ expect(step.titleKey.length).toBeGreaterThan(0); expect(step.bodyKey.length).toBeGreaterThan(0); } });
  it('each step resolves to non-empty text via i18n', () => {
    for(const step of UNIFIED_TUTORIAL_STEPS){
      const { title, body } = resolveTutorialStepText(step);
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
    }
  });
  it('each step has valid highlightZone', () => { for(const step of UNIFIED_TUTORIAL_STEPS) expect(['centerModal','hud','marketBusinessRow','developmentRow','streetGrid','endTurnButton','incidentQueue','investmentsRow','challengePanel','helpButton','completionModal','hand','actionButtons','laundromatCard','festivalCard']).toContain(step.highlightZone); });
  it('each step has gate confirm or action', () => { for(const step of UNIFIED_TUTORIAL_STEPS) expect(['confirm','action']).toContain(step.gate); });
  // CG-0MTNMBX5Z002U0MH: 9 confirm + 17 action (inserted T8/T14/T22 end-turns).
  // Distribution is enforced independently by `tutorial-action-economy.test.ts` per-day audit.
  it('has correct distribution: 9 confirm + 17 action', () => { expect(UNIFIED_TUTORIAL_STEPS.filter(s=>s.gate==='confirm').length).toBe(9); expect(UNIFIED_TUTORIAL_STEPS.filter(s=>s.gate==='action').length).toBe(17); });
  it('confirm steps do not have requiredAction', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='confirm') expect(step.requiredAction).toBeUndefined(); });
  it('confirm steps do not have requiredCardId', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='confirm') expect(step.requiredCardId).toBeUndefined(); });
  it('action steps have requiredAction', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='action') expect(step.requiredAction).toBeDefined(); });

  // ── Confirm-step mapping ────────────────────────────────────
  it('T1 is confirm gate with centerModal highlight', () => { expect(findStep('T1').gate).toBe('confirm'); expect(findStep('T1').highlightZone).toBe('centerModal'); });
  it('T2 is confirm gate with developmentRow highlight (informative Dev Row)', () => { const t=findStep('T2'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('developmentRow'); });
  it('T4 is confirm gate with hand highlight (Your Hand)', () => { const t=findStep('T4'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('hand'); });
  it('T5 is confirm gate with incidentQueue highlight (moved before first End Turn)', () => { expect(findStep('T5').gate).toBe('confirm'); expect(findStep('T5').highlightZone).toBe('incidentQueue'); });
  it('T8 is action gate with end-turn and endTurnButton highlight (CG-0MTNMBX5Z002U0MH day 2 end)', () => { const t=findStep('T8'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T9 is confirm gate with investmentsRow highlight (More than Businesses)', () => { expect(findStep('T9').gate).toBe('confirm'); expect(findStep('T9').highlightZone).toBe('investmentsRow'); });
  it('T13 is confirm gate with developmentRow highlight (informative Costs and Reputation)', () => { const t=findStep('T13'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('developmentRow'); expect(t.referencedCardId).toBe('cs-library'); expect(t.requiredCardId).toBeUndefined(); expect(t.requiredAction).toBeUndefined(); expect(t.synergyCardId).toBeUndefined(); });
  it('T24 is confirm gate with hud highlight (scoring bar)', () => { const t=findStep('T24'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('hud'); });
  it('T25 is confirm gate with challengePanel highlight', () => { expect(findStep('T25').gate).toBe('confirm'); expect(findStep('T25').highlightZone).toBe('challengePanel'); });
  it('T26 is confirm gate with completionModal highlight', () => { expect(findStep('T26').gate).toBe('confirm'); expect(findStep('T26').highlightZone).toBe('completionModal'); });

  // ── Action-step mapping ─────────────────────────────────────
  it('T3 is action gate with select-business, laundromatCard highlight and requiredCardId', () => { const t=findStep('T3'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('select-business'); expect(t.requiredCardId).toBe('biz-laundromat-0'); expect(t.highlightZone).toBe('laundromatCard'); });
  it('T6 is action gate with end-turn and endTurnButton highlight (day 1 End Turn)', () => { const t=findStep('T6'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T7 is action gate with place-business and streetGrid highlight (Laundromat, day 2)', () => { const t=findStep('T7'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('place-business'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('streetGrid'); });
  it('T10 is action gate with buy-event, festivalCard highlight and requiredCardId', () => { const t=findStep('T10'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('buy-event'); expect(t.requiredCardId).toBe('evt-festival-0'); expect(t.highlightZone).toBe('festivalCard'); });
  it('T11 is action gate with end-turn and endTurnButton highlight (day 3 End Turn)', () => { const t=findStep('T11'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T12 is action gate with select-business, developmentRow highlight and Bookshop requiredCardId (move-to-hand split 1/2)', () => { const t=findStep('T12'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('select-business'); expect(t.requiredCardId).toBe('biz-bookshop-0'); expect(t.highlightZone).toBe('developmentRow'); });
  it('T15 is action gate with community-favour and actionButtons highlight', () => { const t=findStep('T15'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('community-favour'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('actionButtons'); });
  it('T16 is action gate with end-turn and endTurnButton highlight (day 5 End Turn)', () => { const t=findStep('T16'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T17 is action gate with place-business and streetGrid highlight (Bookshop, split 2/2)', () => { const t=findStep('T17'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('place-business'); expect(t.highlightZone).toBe('streetGrid'); });
  it('T18 is action gate with end-turn and endTurnButton highlight (day 6 End Turn)', () => { const t=findStep('T18'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T19 is action gate with select-business, developmentRow highlight and cs-library requiredCardId (move-to-hand split 1/2)', () => { const t=findStep('T19'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('select-business'); expect(t.requiredCardId).toBe('cs-library'); expect(t.highlightZone).toBe('developmentRow'); });
  it('T20 is action gate with end-turn and endTurnButton highlight (day 7 End Turn)', () => { const t=findStep('T20'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T21 is action gate with place-business, streetGrid highlight, cs-library referencedCardId and Bookshop synergyCardId (split 2/2)', () => { const t=findStep('T21'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('place-business'); expect(t.referencedCardId).toBe('cs-library'); expect(t.highlightZone).toBe('streetGrid'); expect(t.synergyCardId).toBe('biz-bookshop-0'); });
  it('T23 is action gate with play-event and hand highlight', () => { const t=findStep('T23'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('play-event'); expect(t.highlightZone).toBe('hand'); });

  // ── No composite steps (two-turn plan-ahead) ────────────────
  it('has no buy-and-place composite steps', () => {
    for (const step of UNIFIED_TUTORIAL_STEPS) {
      expect(step.requiredAction).not.toBe('buy-and-place');
    }
  });
});

describe('INVALID_ACTION_MESSAGE', () => {
  it('matches expected message', () => { expect(INVALID_ACTION_MESSAGE).toBe('Complete the highlighted step first.'); });
});

describe('createTutorialControllerState', () => {
  it('returns a fresh inactive state', () => { const s=createTutorialControllerState(); expect(s.isActive).toBe(false); expect(s.currentStepIndex).toBe(-1); expect(s.lastCompletedStepId).toBeNull(); expect(s.exited).toBe(false); });
});

describe('startTutorial', () => {
  it('starts at step 0', () => { const s=startTutorial(createTutorialControllerState()); expect(s.isActive).toBe(true); expect(s.currentStepIndex).toBe(0); expect(s.lastCompletedStepId).toBeNull(); expect(s.exited).toBe(false); });
  it('resets an exited tutorial back to step 0', () => { const e=exitTutorial(startTutorial(createTutorialControllerState())); const r=startTutorial(e); expect(r.isActive).toBe(true); expect(r.currentStepIndex).toBe(0); });
  it('returns a new state (does not mutate)', () => { const s=createTutorialControllerState(); const started=startTutorial(s); expect(started).not.toBe(s); expect(s.isActive).toBe(false); });
});

describe('advanceTutorialStep', () => {
  it('advances from step 0 to step 1', () => { const s=startTutorial(createTutorialControllerState()); expect(advanceTutorialStep(s).currentStepIndex).toBe(1); });
  it('returns same state if not active', () => { const s=createTutorialControllerState(); const adv=advanceTutorialStep(s); expect(adv.currentStepIndex).toBe(-1); expect(adv.isActive).toBe(false); });
  it('advances through all 26 steps to index 26', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<26;i++) s=advanceTutorialStep(s); expect(s.currentStepIndex).toBe(26); });
  it('returns a new state (does not mutate)', () => { const s=startTutorial(createTutorialControllerState()); expect(advanceTutorialStep(s)).not.toBe(s); });
});

describe('exitTutorial', () => {
  it('marks tutorial as inactive and exited', () => { const e=exitTutorial(startTutorial(createTutorialControllerState())); expect(e.isActive).toBe(false); expect(e.exited).toBe(true); });
  it('preserves lastCompletedStepId', () => { let s=startTutorial(createTutorialControllerState()); s=completeCurrentStep(s).newState; const e=exitTutorial(s); expect(e.lastCompletedStepId).toBe('T1'); });
  it('returns a new state (does not mutate)', () => { const s=startTutorial(createTutorialControllerState()); expect(exitTutorial(s)).not.toBe(s); });
});

describe('completeCurrentStep', () => {
  it('completes T1 and advances to step 1', () => { const s=startTutorial(createTutorialControllerState()); const {newState,completedStepId}=completeCurrentStep(s); expect(completedStepId).toBe('T1'); expect(newState.currentStepIndex).toBe(1); expect(newState.lastCompletedStepId).toBe('T1'); });
  it('returns null completedStepId when not active', () => { const {completedStepId}=completeCurrentStep(createTutorialControllerState()); expect(completedStepId).toBeNull(); });
  it('returns null completedStepId when past end (index 26)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<26;i++) s=advanceTutorialStep(s); const {completedStepId}=completeCurrentStep(s); expect(completedStepId).toBeNull(); });
  it('completes all 26 steps sequentially', () => { let s=startTutorial(createTutorialControllerState()); const ids=[]; for(let i=0;i<26;i++){ const r=completeCurrentStep(s); ids.push(r.completedStepId); s=r.newState; }; expect(ids).toEqual(['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12','T13','T14','T15','T16','T17','T18','T19','T20','T21','T22','T23','T24','T25','T26']); expect(s.currentStepIndex).toBe(26); expect(s.lastCompletedStepId).toBe('T26'); });
  it('returns a new state (does not mutate)', () => { const s=startTutorial(createTutorialControllerState()); const r=completeCurrentStep(s); expect(r.newState).not.toBe(s); });
});

describe('isOnStep', () => {
  it('returns true when on the correct step', () => { const s=startTutorial(createTutorialControllerState()); expect(isOnStep(s,'T1')).toBe(true); });
  it('returns false when on a different step', () => { const s=startTutorial(createTutorialControllerState()); expect(isOnStep(s,'T2')).toBe(false); });
  it('returns false when tutorial is not active', () => { const s=createTutorialControllerState(); expect(isOnStep(s,'T1')).toBe(false); });
  it('returns false for invalid step ID', () => { const s=startTutorial(createTutorialControllerState()); expect(isOnStep(s,'T99')).toBe(false); });
});

describe('getCurrentStep', () => {
  it('returns the first step when just started', () => { const s=startTutorial(createTutorialControllerState()); const step=getCurrentStep(s); expect(step).not.toBeNull(); expect(step!.id).toBe('T1'); });
  it('returns null when tutorial is not active', () => { expect(getCurrentStep(createTutorialControllerState())).toBeNull(); });
  it('returns null when past end (index 26)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<26;i++) s=advanceTutorialStep(s); expect(getCurrentStep(s)).toBeNull(); });
});

describe('isRequiredAction', () => {
  it('returns false for action on confirm step T1', () => { const s=startTutorial(createTutorialControllerState()); expect(isRequiredAction(s,'confirm')).toBe(false); });
  it('returns true for end-turn on T6 (day 1 End Turn)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<5;i++) s=advanceTutorialStep(s); expect(getCurrentStep(s)!.id).toBe('T6'); expect(isRequiredAction(s,'end-turn')).toBe(true); });
  it('returns true for place-business on T7 (Laundromat, day 2)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<6;i++) s=advanceTutorialStep(s); expect(getCurrentStep(s)!.id).toBe('T7'); expect(isRequiredAction(s,'place-business')).toBe(true); expect(isRequiredAction(s,'select-hand-card')).toBe(true); });
  it('returns true for select-business on T12 (Bookshop move-to-hand, split 1/2)', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<11;i++) s=advanceTutorialStep(s); // now on T12 (CG-0MTNMBX5Z002U0MH: +1 vs pre-fix)
    expect(getCurrentStep(s)!.id).toBe('T12');
    expect(isRequiredAction(s,'select-business')).toBe(true);
    expect(isRequiredAction(s,'place-business')).toBe(false);
  });
  it('returns true for community-favour on T15', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<14;i++) s=advanceTutorialStep(s); // now on T15 (CG-0MTNMBX5Z002U0MH)
    expect(getCurrentStep(s)!.id).toBe('T15');
    expect(isRequiredAction(s,'community-favour')).toBe(true);
    expect(isRequiredAction(s,'end-turn')).toBe(false);
  });
  it('returns true for place-business on T17 (Bookshop split 2/2)', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<16;i++) s=advanceTutorialStep(s); // now on T17 (CG-0MTNMBX5Z002U0MH)
    expect(getCurrentStep(s)!.id).toBe('T17');
    expect(isRequiredAction(s,'place-business')).toBe(true);
    expect(isRequiredAction(s,'select-hand-card')).toBe(true);
  });
  it('returns false for actions on the informative T13 confirm step', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<12;i++) s=advanceTutorialStep(s); // now on T13 (CG-0MTNMBX5Z002U0MH)
    expect(getCurrentStep(s)!.id).toBe('T13');
    expect(isRequiredAction(s,'select-business')).toBe(false);
    expect(isRequiredAction(s,'place-business')).toBe(false);
  });
  it('returns true for select-business on T19 (Library move-to-hand, split 1/2)', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<18;i++) s=advanceTutorialStep(s); // now on T19 (CG-0MTNMBX5Z002U0MH)
    expect(getCurrentStep(s)!.id).toBe('T19');
    expect(isRequiredAction(s,'select-business')).toBe(true);
  });
  it('returns true for place-business on T21 (Library placement, split 2/2)', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<20;i++) s=advanceTutorialStep(s); // now on T21 (CG-0MTNMBX5Z002U0MH)
    expect(getCurrentStep(s)!.id).toBe('T21');
    expect(isRequiredAction(s,'place-business')).toBe(true);
    expect(isRequiredAction(s,'select-hand-card')).toBe(true);
  });
  it('returns true for play-event on T23', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<22;i++) s=advanceTutorialStep(s); // now on T23 (CG-0MTNMBX5Z002U0MH)
    expect(getCurrentStep(s)!.id).toBe('T23');
    expect(isRequiredAction(s,'play-event')).toBe(true);
  });
  it('returns false when tutorial is not active', () => { const s=createTutorialControllerState(); expect(isRequiredAction(s,'confirm')).toBe(false); });
});

describe('isSynergyAdjacentPlacement', () => {
  const t20 = findStep('T21');   // Library placed next to Bookshop
  const t16 = findStep('T17');   // Bookshop placement (no synergy)

  /** Build a 10-slot grid where the given slot→id pairs are occupied. */
  const gridWith = (cards: Record<number, string>): (BusinessCard | CommunitySpaceCard | null)[] => {
    const grid: Array<{ id: string } | null> = new Array(10).fill(null);
    for (const [slot, id] of Object.entries(cards)) grid[Number(slot)] = { id };
    return grid as unknown as (BusinessCard | CommunitySpaceCard | null)[];
  };

  it('returns true when the target slot is an 8-way neighbor of the synergy card', () => {
    // Bookshop (T20 synergyCardId) on slot 1. 8-way neighbors: 0, 2 (same row),
    // 5 (diagonal), 6, 7 (below) — CG-0MSP1HCAS00785MP Chebyshev adjacency.
    const grid = gridWith({ 1: 'biz-bookshop-0' });
    expect(isSynergyAdjacentPlacement(t20, grid, 2)).toBe(true);
    expect(isSynergyAdjacentPlacement(t20, grid, 6)).toBe(true);
    expect(isSynergyAdjacentPlacement(t20, grid, 5)).toBe(true); // diagonal
    expect(isSynergyAdjacentPlacement(t20, grid, 7)).toBe(true); // diagonal
  });

  it('rejects non-adjacent target slots', () => {
    const grid = gridWith({ 1: 'biz-bookshop-0' });
    expect(isSynergyAdjacentPlacement(t20, grid, 3)).toBe(false); // same row, distance 2
    expect(isSynergyAdjacentPlacement(t20, grid, 8)).toBe(false); // Chebyshev distance 2
    expect(isSynergyAdjacentPlacement(t20, grid, 1)).toBe(false); // the synergy slot itself
  });

  it('returns true for placement steps without a synergy card (T16 Bookshop)', () => {
    const grid = gridWith({ 1: 'biz-bookshop-0' });
    expect(isSynergyAdjacentPlacement(t16, grid, 3)).toBe(true);
  });

  it('returns true when the synergy card is not on the street (cannot enforce an absent partner)', () => {
    const grid = gridWith({ 0: 'biz-laundromat-0' });
    expect(isSynergyAdjacentPlacement(t20, grid, 3)).toBe(true);
  });

  it('still enforces adjacency on any step that declares synergyCardId (placement rule is partner-driven)', () => {
    // The rule keys off synergyCardId (not the action type) so the Library's
    // "next to the Bookshop" placement survives on the dedicated place step.
    const grid = gridWith({ 1: 'biz-bookshop-0' });
    expect(isSynergyAdjacentPlacement(t20, grid, 3)).toBe(false);
    expect(isSynergyAdjacentPlacement(t20, grid, 6)).toBe(true);
  });
});

describe('shouldAllowAction', () => {
  it('allows the required action during action step T7', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<6;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'place-business')).toBe(true); });
  it('blocks non-required actions during action step', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<6;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'end-turn')).toBe(false); });
  it('allows all actions when tutorial is not active', () => { const s=createTutorialControllerState(); expect(shouldAllowAction(s,'end-turn')).toBe(true); expect(shouldAllowAction(s,'place-business')).toBe(true); });
  it('allows end-turn on T6 (step index 5)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<5;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'end-turn')).toBe(true); expect(shouldAllowAction(s,'confirm')).toBe(false); });
});