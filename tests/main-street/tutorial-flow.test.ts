import { describe, it, expect, beforeEach } from 'vitest';
import {
  UNIFIED_TUTORIAL_STEPS, UNIFIED_TUTORIAL_STEP_COUNT,
  INVALID_ACTION_MESSAGE,
  createTutorialControllerState, advanceTutorialStep, startTutorial,
  exitTutorial, completeCurrentStep, isOnStep, getCurrentStep,
  isRequiredAction, shouldAllowAction,
  resolveTutorialStepText,
} from '../../example-games/main-street/TutorialFlow';
import { resetI18n, registerLocale } from '../../src/core-engine/I18n';
import { TUTORIAL_EN_BUNDLE } from '../../example-games/main-street/i18n/tutorial-en';

function findStep(id: string) { const s = UNIFIED_TUTORIAL_STEPS.find((s) => s.id === id); if (!s) throw new Error(`Step ${id} not found`); return s; }

describe('UNIFIED_TUTORIAL_STEPS', () => {
  beforeEach(() => {
    resetI18n();
    registerLocale('en', TUTORIAL_EN_BUNDLE);
  });

  it('defines exactly 16 steps', () => { expect(UNIFIED_TUTORIAL_STEPS.length).toBe(16); expect(UNIFIED_TUTORIAL_STEP_COUNT).toBe(16); });
  it('steps have sequential T1-T16 IDs', () => { for(let i=0;i<16;i++) expect(UNIFIED_TUTORIAL_STEPS[i].id).toBe(`T${i+1}`); });
  it('each step has non-empty titleKey and bodyKey', () => { for(const step of UNIFIED_TUTORIAL_STEPS){ expect(step.titleKey.length).toBeGreaterThan(0); expect(step.bodyKey.length).toBeGreaterThan(0); } });
  it('each step resolves to non-empty text via i18n', () => {
    for(const step of UNIFIED_TUTORIAL_STEPS){
      const { title, body } = resolveTutorialStepText(step);
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
    }
  });
  it('each step has valid highlightZone', () => { for(const step of UNIFIED_TUTORIAL_STEPS) expect(['centerModal','hud','marketBusinessRow','developmentRow','streetGrid','endTurnButton','incidentQueue','investmentsRow','challengePanel','helpButton','completionModal','hand','laundromatCard','festivalCard']).toContain(step.highlightZone); });
  it('each step has gate confirm or action', () => { for(const step of UNIFIED_TUTORIAL_STEPS) expect(['confirm','action']).toContain(step.gate); });
  it('has correct distribution: 8 confirm + 8 action', () => { expect(UNIFIED_TUTORIAL_STEPS.filter(s=>s.gate==='confirm').length).toBe(8); expect(UNIFIED_TUTORIAL_STEPS.filter(s=>s.gate==='action').length).toBe(8); });
  it('confirm steps do not have requiredAction', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='confirm') expect(step.requiredAction).toBeUndefined(); });
  it('confirm steps do not have requiredCardId', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='confirm') expect(step.requiredCardId).toBeUndefined(); });
  it('action steps have requiredAction', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='action') expect(step.requiredAction).toBeDefined(); });

  // ── Confirm-step mapping ────────────────────────────────────
  it('T1 is confirm gate with centerModal highlight', () => { expect(findStep('T1').gate).toBe('confirm'); expect(findStep('T1').highlightZone).toBe('centerModal'); });
  it('T2 is confirm gate with developmentRow highlight (informative Dev Row)', () => { const t=findStep('T2'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('developmentRow'); });
  it('T4 is confirm gate with hand highlight (Your Hand)', () => { const t=findStep('T4'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('hand'); });
  it('T6 is confirm gate with incidentQueue highlight', () => { expect(findStep('T6').gate).toBe('confirm'); expect(findStep('T6').highlightZone).toBe('incidentQueue'); });
  it('T8 is confirm gate with investmentsRow highlight', () => { expect(findStep('T8').gate).toBe('confirm'); expect(findStep('T8').highlightZone).toBe('investmentsRow'); });
  it('T14 is confirm gate with hud highlight (scoring bar)', () => { const t=findStep('T14'); expect(t.gate).toBe('confirm'); expect(t.highlightZone).toBe('hud'); });
  it('T15 is confirm gate with challengePanel highlight', () => { expect(findStep('T15').gate).toBe('confirm'); expect(findStep('T15').highlightZone).toBe('challengePanel'); });
  it('T16 is confirm gate with completionModal highlight', () => { expect(findStep('T16').gate).toBe('confirm'); expect(findStep('T16').highlightZone).toBe('completionModal'); });

  // ── Action-step mapping ─────────────────────────────────────
  it('T3 is action gate with select-business, laundromatCard highlight and requiredCardId', () => { const t=findStep('T3'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('select-business'); expect(t.requiredCardId).toBe('biz-laundromat-0'); expect(t.highlightZone).toBe('laundromatCard'); });
  it('T5 is action gate with place-business and streetGrid highlight', () => { const t=findStep('T5'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('place-business'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('streetGrid'); });
  it('T7 is action gate with end-turn and endTurnButton highlight', () => { const t=findStep('T7'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T9 is action gate with buy-event, festivalCard highlight and requiredCardId', () => { const t=findStep('T9'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('buy-event'); expect(t.requiredCardId).toBe('evt-festival-0'); expect(t.highlightZone).toBe('festivalCard'); });
  it('T10 is action gate with buy-and-place, developmentRow highlight and requiredCardId', () => { const t=findStep('T10'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('buy-and-place'); expect(t.requiredCardId).toBe('biz-bookshop-0'); expect(t.highlightZone).toBe('developmentRow'); });
  it('T11 is action gate with end-turn and endTurnButton highlight', () => { const t=findStep('T11'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T12 is action gate with select-business, developmentRow highlight and cs-library requiredCardId', () => { const t=findStep('T12'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('select-business'); expect(t.requiredCardId).toBe('cs-library'); expect(t.highlightZone).toBe('developmentRow'); expect(t.synergyCardId).toBe('biz-bookshop-0'); });
  it('T13 is action gate with play-event and hand highlight', () => { const t=findStep('T13'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('play-event'); expect(t.highlightZone).toBe('hand'); });

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
  it('advances through all 16 steps to index 16', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<16;i++) s=advanceTutorialStep(s); expect(s.currentStepIndex).toBe(16); });
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
  it('returns null completedStepId when past end (index 16)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<16;i++) s=advanceTutorialStep(s); const {completedStepId}=completeCurrentStep(s); expect(completedStepId).toBeNull(); });
  it('completes all 16 steps sequentially', () => { let s=startTutorial(createTutorialControllerState()); const ids=[]; for(let i=0;i<16;i++){ const r=completeCurrentStep(s); ids.push(r.completedStepId); s=r.newState; }; expect(ids).toEqual(['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12','T13','T14','T15','T16']); expect(s.currentStepIndex).toBe(16); expect(s.lastCompletedStepId).toBe('T16'); });
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
  it('returns null when past end (index 16)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<16;i++) s=advanceTutorialStep(s); expect(getCurrentStep(s)).toBeNull(); });
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
  it('returns true for play-event on T13', () => {
    let s=startTutorial(createTutorialControllerState());
    for(let i=0;i<12;i++) s=advanceTutorialStep(s); // now on T13
    expect(getCurrentStep(s)!.id).toBe('T13');
    expect(isRequiredAction(s,'play-event')).toBe(true);
  });
  it('returns false when tutorial is not active', () => { const s=createTutorialControllerState(); expect(isRequiredAction(s,'confirm')).toBe(false); });
});

describe('shouldAllowAction', () => {
  it('allows the required action during action step T5', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<4;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'place-business')).toBe(true); });
  it('blocks non-required actions during action step', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<4;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'end-turn')).toBe(false); });
  it('allows all actions when tutorial is not active', () => { const s=createTutorialControllerState(); expect(shouldAllowAction(s,'end-turn')).toBe(true); expect(shouldAllowAction(s,'place-business')).toBe(true); });
  it('allows end-turn on T7 (step index 6)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<6;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'end-turn')).toBe(true); expect(shouldAllowAction(s,'confirm')).toBe(false); });
});
