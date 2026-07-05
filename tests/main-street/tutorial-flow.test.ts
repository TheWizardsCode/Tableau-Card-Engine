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

  it('defines exactly 13 steps', () => { expect(UNIFIED_TUTORIAL_STEPS.length).toBe(13); expect(UNIFIED_TUTORIAL_STEP_COUNT).toBe(13); });
  it('steps have sequential T1-T13 IDs', () => { for(let i=0;i<13;i++) expect(UNIFIED_TUTORIAL_STEPS[i].id).toBe(`T${i+1}`); });
  it('each step has non-empty titleKey and bodyKey', () => { for(const step of UNIFIED_TUTORIAL_STEPS){ expect(step.titleKey.length).toBeGreaterThan(0); expect(step.bodyKey.length).toBeGreaterThan(0); } });
  it('each step resolves to non-empty text via i18n', () => {
    for(const step of UNIFIED_TUTORIAL_STEPS){
      const { title, body } = resolveTutorialStepText(step);
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
    }
  });
  it('each step has valid highlightZone', () => { for(const step of UNIFIED_TUTORIAL_STEPS) expect(['centerModal','hud','marketBusinessRow','streetGrid','endTurnButton','incidentQueue','investmentsRow','challengePanel','helpButton','completionModal']).toContain(step.highlightZone); });
  it('each step has gate confirm or action', () => { for(const step of UNIFIED_TUTORIAL_STEPS) expect(['confirm','action']).toContain(step.gate); });
  it('has correct distribution: 9 confirm + 4 action', () => { expect(UNIFIED_TUTORIAL_STEPS.filter(s=>s.gate==='confirm').length).toBe(9); expect(UNIFIED_TUTORIAL_STEPS.filter(s=>s.gate==='action').length).toBe(4); });
  it('confirm steps do not have requiredAction', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='confirm') expect(step.requiredAction).toBeUndefined(); });
  it('confirm steps do not have requiredCardId', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='confirm') expect(step.requiredCardId).toBeUndefined(); });
  it('action steps have requiredAction', () => { for(const step of UNIFIED_TUTORIAL_STEPS) if(step.gate==='action') expect(step.requiredAction).toBeDefined(); });
  it('T1 is confirm gate with centerModal highlight', () => { expect(findStep('T1').gate).toBe('confirm'); expect(findStep('T1').highlightZone).toBe('centerModal'); });
  it('T2 is confirm gate with hud highlight', () => { expect(findStep('T2').gate).toBe('confirm'); expect(findStep('T2').highlightZone).toBe('hud'); });
  it('T5 is confirm gate with incidentQueue highlight', () => { expect(findStep('T5').gate).toBe('confirm'); expect(findStep('T5').highlightZone).toBe('incidentQueue'); });
  it('T9 is confirm gate with centerModal highlight', () => { expect(findStep('T9').gate).toBe('confirm'); expect(findStep('T9').highlightZone).toBe('centerModal'); });
  it('T10 is confirm gate with endTurnButton highlight', () => { expect(findStep('T10').gate).toBe('confirm'); expect(findStep('T10').highlightZone).toBe('endTurnButton'); });
  it('T11 is confirm gate with challengePanel highlight', () => { expect(findStep('T11').gate).toBe('confirm'); expect(findStep('T11').highlightZone).toBe('challengePanel'); });
  it('T12 is confirm gate with hud highlight (score)', () => { expect(findStep('T12').gate).toBe('confirm'); expect(findStep('T12').highlightZone).toBe('hud'); });
  it('T3 is action gate with select-business requiredAction and requiredCardId', () => { const t=findStep('T3'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('select-business'); expect(t.requiredCardId).toBe('biz-laundromat-0'); expect(t.highlightZone).toBe('marketBusinessRow'); });
  it('T4 is action gate with place-business requiredAction and no requiredCardId', () => { const t=findStep('T4'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('place-business'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('streetGrid'); });
  it('T6 is action gate with end-turn requiredAction and no requiredCardId', () => { const t=findStep('T6'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('end-turn'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('endTurnButton'); });
  it('T7 is action gate with buy-event requiredAction and no requiredCardId', () => { const t=findStep('T7'); expect(t.gate).toBe('action'); expect(t.requiredAction).toBe('buy-event'); expect(t.requiredCardId).toBeUndefined(); expect(t.highlightZone).toBe('investmentsRow'); });
  it('T8 is confirm gate (upgrade concept reference, not action-gated)', () => { const t=findStep('T8'); expect(t.gate).toBe('confirm'); expect(t.requiredAction).toBeUndefined(); expect(t.highlightZone).toBe('investmentsRow'); });
  it('T13 is confirm gate with completionModal highlight', () => { expect(findStep('T13').gate).toBe('confirm'); expect(findStep('T13').highlightZone).toBe('completionModal'); });
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
  it('advances through all 13 steps to index 13', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<13;i++) s=advanceTutorialStep(s); expect(s.currentStepIndex).toBe(13); });
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
  it('returns null completedStepId when past end (index 13)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<13;i++) s=advanceTutorialStep(s); const {completedStepId}=completeCurrentStep(s); expect(completedStepId).toBeNull(); });
  it('completes all 13 steps sequentially', () => { let s=startTutorial(createTutorialControllerState()); const ids=[]; for(let i=0;i<13;i++){ const r=completeCurrentStep(s); ids.push(r.completedStepId); s=r.newState; }; expect(ids).toEqual(['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12','T13']); expect(s.currentStepIndex).toBe(13); expect(s.lastCompletedStepId).toBe('T13'); });
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
  it('returns null when past end (index 13)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<13;i++) s=advanceTutorialStep(s); expect(getCurrentStep(s)).toBeNull(); });
});

describe('isRequiredAction', () => {
  it('returns false for action on confirm step T1', () => { const s=startTutorial(createTutorialControllerState()); expect(isRequiredAction(s,'confirm')).toBe(false); });
  it('returns true for place-business on T4', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<3;i++) s=advanceTutorialStep(s); expect(isRequiredAction(s,'place-business')).toBe(true); });
  it('returns false when tutorial is not active', () => { const s=createTutorialControllerState(); expect(isRequiredAction(s,'confirm')).toBe(false); });
});

describe('shouldAllowAction', () => {
  it('allows the required action during action step T4', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<3;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'place-business')).toBe(true); });
  it('blocks non-required actions during action step', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<7;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'end-turn')).toBe(false); });
  it('allows all actions when tutorial is not active', () => { const s=createTutorialControllerState(); expect(shouldAllowAction(s,'end-turn')).toBe(true); expect(shouldAllowAction(s,'place-business')).toBe(true); });
  it('allows end-turn on T6 (step index 5)', () => { let s=startTutorial(createTutorialControllerState()); for(let i=0;i<5;i++) s=advanceTutorialStep(s); expect(shouldAllowAction(s,'end-turn')).toBe(true); expect(shouldAllowAction(s,'confirm')).toBe(false); });
});
