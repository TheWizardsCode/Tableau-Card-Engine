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

  it('defines exactly 18 steps', () => { expect(UNIFIED_TUTORIAL_STEPS.length).toBe(18); expect(UNIFIED_TUTORIAL_STEP_COUNT).toBe(18); });
  it('steps have sequential T1-T18 IDs', () => { for(let i=0;i<18;i++) expect(UNIFIED_TUTORIAL_STEPS[i].id).toBe(`T${i+1}`); });
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
  it('has correct distribution: 9 confirm + 9 action', () => { expect(UNIFIED_TUTORIAL_STEPS.filter(s=>s.gate==='confirm').length).toBe(9); expect(UNIFIED_TUTORIAL_STEPS.filter(s=>s.gate==='action').length).toBe(9); });
  it('confirm steps do not have requiredAction', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='confirm') expect(step.requiredAction).toBeUndefined(); });
  it('confirm steps do not have requiredCardId', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='confirm') expect(step.requiredCardId).toBeUndefined(); });
  it('action steps have requiredAction', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='action') expect(step.requiredAction).toBeDefined(); });

  // ── Confirm-step mapping ────────────────────────────────────
  it('T1 is confirm gate with centerModal highlight', () => { expect(findStep('T1').gate).toBe('confirm'); expect(findStep('T1').highlightZone).toBe('centerModal'); });
  it('T2 is confirm gate with developmentRow highlight (informative Dev Row)', () => { const t=findStep('T2'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('developmentRow'); });
  it('T4 is confirm gate with hand highlight (Your Hand)', () => { const t=findStep('T4'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('hand'); });
  it('T6 is confirm gate with incidentQueue highlight', () => { expect(findStep('T6').gate).toBe('confirm'); expect(findStep('T6').highlightZone).toBe('incidentQueue'); });
  it('T8 is confirm gate with investmentsRow highlight', () => { expect(findStep('T8').gate).toBe('confirm'); expect(findStep('T8').highlightZone).toBe('investmentsRow'); });
  it('T12 is confirm gate with developmentRow highlight (informative Costs and Reputation)', () => { const t=findStep('T12'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('developmentRow'); expect(t.referencedCardId).toBe('cs-library'); expect(t.requiredCardId).toBeUndefined(); expect(t.requiredAction).toBeUndefined(); expect(t.synergyCardId).toBeUndefined(); });
  it('T16 is confirm gate with hud highlight (scoring bar)', () => { const t=findStep('T16'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('hud'); });
  it('T17 is confirm gate with challengePanel highlight', () => { expect(findStep('T17').gate).toBe('confirm'); expect(findStep('T17').highlightZone).toBe('challengePanel'); });
  it('T18 is confirm gate with completionModal highlight', () => { expect(findStep('T18').gate).toBe('confirm'); expect(findStep('T18').highlightZone).toBe('completionModal'); });

  // ── Action-step mapping ─────────────────────────────────────
  it('T3 is action gate with select-business, laundromatCard highlight and requiredCardId', () => { const t=findStep('T3'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('select-business'); expect(t.requiredCardId).toBe('biz-laundromat-0'); expect(t.highlightZone).toBe('laundromatCard'); });
  it('T5 is action gate with place-business and streetGrid highlight', () => { const t=findStep('T5'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('place-business'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('streetGrid'); });
  it('T7 is action gate with end-turn and endTurnButton highlight', () => { const t=findStep('T7'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T9 is action gate with buy-event, festivalCard highlight and requiredCardId', () => { const t=findStep('T9'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('buy-event'); expect(t.requiredCardId).toBe('evt-festival-0'); expect(t.highlightZone).toBe('festivalCard'); });
  it('T10 is action gate with buy-and-place, developmentRow highlight and requiredCardId', () => { const t=findStep('T10'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('buy-and-place'); expect(t.requiredCardId).toBe('biz-bookshop-0'); expect(t.highlightZone).toBe('developmentRow'); });
  it('T11 is action gate with end-turn and endTurnButton highlight', () => { const t=findStep('T11'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T12 is confirm gate with buy-and-place moved off it — no action, no synergy (split from old T12)', () => { const t=findStep('T12'); expect(t.gate).toBe('confirm'); expect(t.requiredAction).toBeUndefined(); expect(t.requiredCardId).toBeUndefined(); expect(t.synergyCardId).toBeUndefined(); });
  it('T13 is action gate with community-favour and actionButtons highlight', () => { const t=findStep('T13'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('community-favour'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('actionButtons'); });
  it('T14 is action gate with buy-and-place, developmentRow highlight, cs-library requiredCardId and synergyCardId', () => { const t=findStep('T14'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('buy-and-place'); expect(t.requiredCardId).toBe('cs-library'); expect(t.highlightZone).toBe('developmentRow'); expect(t.synergyCardId).toBe('biz-bookshop-0'); });
  it('T15 is action gate with play-event and hand highlight', () => { const t=findStep('T15'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('play-event'); expect(t.highlightZone).toBe('hand'); });

  // ── No stale gates ──────────────────────────────────────────
  it('does not use the removed held-event-card buy gate on T7 (was buy-event)', () => { expect(findStep('T7').requiredAction).toBe('end-turn'); });
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
  it('advances through all 18 steps to index 18', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<18;i++) s=advanceTutorialStep(s); expect(s.currentStepIndex).toBe(18); });
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
  it('returns null completedStepId when past end (index 18)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<18;i++) s=advanceTutorialStep(s); const {completedStepId}=completeCurrentStep(s); expect(completedStepId).toBeNull(); });
  it('completes all 18 steps sequentially', () => { let s=startTutorial(createTutorialControllerState()); const ids=[]; for(let i=0;i<18;i++){ const r=completeCurrentStep(s); ids.push(r.completedStepId); s=r.newState; }; expect(ids).toEqual(['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12','T13','T14','T15','T16','T17','T18']); expect(s.currentStepIndex).toBe(18); expect(s.lastCompletedStepId).toBe('T18'); });
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
  it('returns null when past end (index 18)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<18;i++) s=advanceTutorialStep(s); expect(getCurrentStep(s)).toBeNull(); });
});

describe('isRequiredAction', () => {
  it('returns false for action on confirm step T1', () => { const s=startTutorial(createTutorialControllerState()); expect(isRequiredAction(s,'confirm')).toBe(false); });
  it('returns true for place-business on T5', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<4;i++) s=advanceTutorialStep(s); expect(isRequiredAction(s,'place-business')).toBe(true); });
  it('returns true for buy-and-place composite (select-business AND place-business) on T10', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<9;i++) s=advanceTutorialStep(s); // now on T10
    const step=getCurrentStep(s); expect(step!.id).toBe('T10');
    expect(isRequiredAction(s,'select-business')).toBe(true);
    expect(isRequiredAction(s,'place-business')).toBe(true);
    expect(isRequiredAction(s,'end-turn')).toBe(false);
  });
  it('returns true for buy-and-place composite (select-business AND place-business) on T14', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<13;i++) s=advanceTutorialStep(s); // now on T14
    const step=getCurrentStep(s); expect(step!.id).toBe('T14');
    expect(isRequiredAction(s,'select-business')).toBe(true);
    expect(isRequiredAction(s,'place-business')).toBe(true);
    expect(isRequiredAction(s,'end-turn')).toBe(false);
  });
  it('returns true for community-favour on T13', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<12;i++) s=advanceTutorialStep(s); // now on T13
    expect(getCurrentStep(s)!.id).toBe('T13');
    expect(isRequiredAction(s,'community-favour')).toBe(true);
    expect(isRequiredAction(s,'end-turn')).toBe(false);
  });
  it('returns false for actions on the informative T12 confirm step', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<11;i++) s=advanceTutorialStep(s); // now on T12
    expect(getCurrentStep(s)!.id).toBe('T12');
    expect(isRequiredAction(s,'select-business')).toBe(false);
    expect(isRequiredAction(s,'place-business')).toBe(false);
  });
  it('returns true for play-event on T15', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<14;i++) s=advanceTutorialStep(s); // now on T15
    expect(getCurrentStep(s)!.id).toBe('T15');
    expect(isRequiredAction(s,'play-event')).toBe(true);
  });
  it('returns false when tutorial is not active', () => { const s=createTutorialControllerState(); expect(isRequiredAction(s,'confirm')).toBe(false); });
});

describe('isSynergyAdjacentPlacement', () => {
  const t13 = findStep('T14');
  const t10 = findStep('T10');

  /** Build a 10-slot grid where the given slot→id pairs are occupied. */
  const gridWith = (cards: Record<number, string>): (BusinessCard | CommunitySpaceCard | null)[] => {
    const grid: Array<{ id: string } | null> = new Array(10).fill(null);
    for (const [slot, id] of Object.entries(cards)) grid[Number(slot)] = { id };
    return grid as unknown as (BusinessCard | CommunitySpaceCard | null)[];
  };

  it('returns true when the target slot is an 8-way neighbor of the synergy card', () => {
    // Bookshop (T14 synergyCardId) on slot 1. 8-way neighbors: 0, 2 (same row),
    // 5 (diagonal), 6, 7 (below) — CG-0MSP1HCAS00785MP Chebyshev adjacency.
    const grid = gridWith({ 1: 'biz-bookshop-0' });
    expect(isSynergyAdjacentPlacement(t13, grid, 2)).toBe(true);
    expect(isSynergyAdjacentPlacement(t13, grid, 6)).toBe(true);
    expect(isSynergyAdjacentPlacement(t13, grid, 5)).toBe(true); // diagonal
    expect(isSynergyAdjacentPlacement(t13, grid, 7)).toBe(true); // diagonal
  });

  it('rejects non-adjacent target slots', () => {
    const grid = gridWith({ 1: 'biz-bookshop-0' });
    expect(isSynergyAdjacentPlacement(t13, grid, 3)).toBe(false); // same row, distance 2
    expect(isSynergyAdjacentPlacement(t13, grid, 8)).toBe(false); // Chebyshev distance 2
    expect(isSynergyAdjacentPlacement(t13, grid, 1)).toBe(false); // the synergy slot itself
  });

  it('returns true for composite buy-and-place steps without a synergy card (T10)', () => {
    const grid = gridWith({ 1: 'biz-bookshop-0' });
    expect(isSynergyAdjacentPlacement(t10, grid, 3)).toBe(true);
  });

  it('returns true when the synergy card is not on the street (cannot enforce an absent partner)', () => {
    const grid = gridWith({ 0: 'biz-laundromat-0' });
    expect(isSynergyAdjacentPlacement(t13, grid, 3)).toBe(true);
  });

  it('returns true for non-composite steps even with a synergyCardId (synthetic step)', () => {
    const synthetic = { ...t13, requiredAction: 'select-business' as const };
    const grid = gridWith({ 1: 'biz-bookshop-0' });
    expect(isSynergyAdjacentPlacement(synthetic, grid, 3)).toBe(true);
  });
});

describe('shouldAllowAction', () => {
  it('allows the required action during action step T5', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<4;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'place-business')).toBe(true); });
  it('blocks non-required actions during action step', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<4;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'end-turn')).toBe(false); });
  it('allows all actions when tutorial is not active', () => { const s=createTutorialControllerState(); expect(shouldAllowAction(s,'end-turn')).toBe(true); expect(shouldAllowAction(s,'place-business')).toBe(true); });
  it('allows end-turn on T7 (step index 6)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<6;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'end-turn')).toBe(true); expect(shouldAllowAction(s,'confirm')).toBe(false); });
});
