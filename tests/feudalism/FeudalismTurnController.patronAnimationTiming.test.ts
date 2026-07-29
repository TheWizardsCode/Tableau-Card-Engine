/**
 * Tests for FeudalismTurnController patron animation timing fix.
 *
 * Verifies that the celebration sound and toast are deferred to the
 * animation start in both executeAction() and executeAiTurn() when a
 * patron visit occurs.
 *
 * Related work item: CG-0MRDL6LSS001LPCG
 *
 * @module tests/feudalism/FeudalismTurnController.patronAnimationTiming
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SOURCE_PATH = 'example-games/feudalism/scenes/FeudalismTurnController.ts';

describe('FeudalismTurnController patron animation timing', () => {
  // ── executeAction() ──────────────────────────────────────

  describe('executeAction()', () => {
    it('should NOT call onPlaySound(PATRON_VISIT) directly after executeTurn', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');

      // Find the section where executeTurn is called
      const execTurnIndex = source.indexOf('const result = executeTurn(this.session, action);');
      expect(execTurnIndex).toBeGreaterThan(-1);

      // Find the section after executeTurn where patronVisit is checked
      const afterExecTurn = source.slice(execTurnIndex);

      // The old pattern had sound right after executeTurn. The new pattern
      // should have the sound INSIDE the animation block (sourcePos && card && ...)
      // and NOT right after executeTurn.

      // Check that onPlaySound(PATRON_VISIT) does NOT appear before
      // the animation section starts. The animation section is guarded by:
      // if (sourcePos && card && (action.type === 'purchase' || action.type === 'reserve'))
      const animationGuard = 'if (sourcePos && card && (action.type === \'purchase\' || action.type === \'reserve\'))';
      const guardIndex = afterExecTurn.indexOf(animationGuard);
      expect(guardIndex).toBeGreaterThan(-1);

      // Find the sound call in the afterExecTurn section
      const soundCall = 'this.callbacks.onPlaySound(SFX_KEYS.PATRON_VISIT)';
      const soundIndex = afterExecTurn.indexOf(soundCall);
      expect(soundIndex).toBeGreaterThan(-1);

      // The sound call should be AFTER (or at) the animation guard, not before it
      expect(soundIndex).toBeGreaterThan(guardIndex);
    });

    it('should NOT call onRefreshAll before playCardAnimation in the patron/animation block', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');

      // Find the animation block
      const animationGuard = 'if (sourcePos && card && (action.type === \'purchase\' || action.type === \'reserve\'))';
      const guardIndex = source.indexOf(animationGuard);
      expect(guardIndex).toBeGreaterThan(-1);

      // Extract the block contents (from guard to playCardAnimation call)
      const block = source.slice(guardIndex);

      // The block should contain playCardAnimation
      const animCallIndex = block.indexOf('this.animator.playCardAnimation(');
      expect(animCallIndex).toBeGreaterThan(-1);

      // Find all onRefreshAll occurrences within the block BEFORE playCardAnimation
      const beforeAnim = block.slice(0, animCallIndex);

      // The patron animation cache setup and pending refill setup should exist
      expect(beforeAnim).toContain('onSetPatronAnimationCache');
      expect(beforeAnim).toContain('onSetPendingRefillSlots');

      // There should be NO onRefreshAll() call between the animation guard
      // and playCardAnimation(). The old code had one, the fix removes it.
      // Note: onRefreshAll can appear AFTER playCardAnimation (in callbacks)
      // or in separate code paths (tokensOverLimit, non-animation path).
      // We just check there's none before playCardAnimation in this block.
      const refreshCallsBeforeAnim = (beforeAnim.match(/this\.callbacks\.onRefreshAll\(\)/g) || []).length;
      expect(refreshCallsBeforeAnim).toBe(0);
    });

    it('should call onPlaySound(PATRON_VISIT) and onShowToast in the animation block before playCardAnimation', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');

      const animationGuard = 'if (sourcePos && card && (action.type === \'purchase\' || action.type === \'reserve\'))';
      const guardIndex = source.indexOf(animationGuard);
      const block = source.slice(guardIndex);

      const animCallIndex = block.indexOf('this.animator.playCardAnimation(');
      expect(animCallIndex).toBeGreaterThan(-1);

      const beforeAnim = block.slice(0, animCallIndex);

      // The patron-visit sound and toast should be in the pre-animation section
      // (deferred from right-after-executeTurn to just-before-playCardAnimation)
      expect(beforeAnim).toContain('this.callbacks.onPlaySound(SFX_KEYS.PATRON_VISIT)');
      expect(beforeAnim).toContain('this.callbacks.onShowToast(');
    });

    it('should keep onSetPatronAnimationCache before the deferred sound call', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');

      const animationGuard = 'if (sourcePos && card && (action.type === \'purchase\' || action.type === \'reserve\'))';
      const guardIndex = source.indexOf(animationGuard);
      const block = source.slice(guardIndex);
      const animCallIndex = block.indexOf('this.animator.playCardAnimation(');
      const beforeAnim = block.slice(0, animCallIndex);

      // The patron cache should be set BEFORE the sound plays
      const cacheIndex = beforeAnim.indexOf('onSetPatronAnimationCache');
      const soundIndex = beforeAnim.indexOf('onPlaySound(SFX_KEYS.PATRON_VISIT)');
      expect(cacheIndex).toBeGreaterThan(-1);
      expect(soundIndex).toBeGreaterThan(-1);
      expect(cacheIndex).toBeLessThan(soundIndex);
    });
  });

  // ── executeAiTurn() ─────────────────────────────────────

  describe('executeAiTurn()', () => {
    it('should NOT call onShowToast for patron visit directly after executeTurn', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');

      // Find the AI turn method
      const aiTurnIndex = source.indexOf('executeAiTurn(): void');
      expect(aiTurnIndex).toBeGreaterThan(-1);

      // Find the executeTurn call within executeAiTurn
      const aiExecTurn = source.indexOf('const result = executeTurn(this.session, action);', aiTurnIndex);
      expect(aiExecTurn).toBeGreaterThan(-1);

      const afterAiExecTurn = source.slice(aiExecTurn);

      // Find the AI animation guard
      const aiAnimGuard = 'if (sourcePos && card && (action.type === \'purchase\' || action.type === \'reserve\'))';
      const aiGuardIndex = afterAiExecTurn.indexOf(aiAnimGuard);
      expect(aiGuardIndex).toBeGreaterThan(-1);

      // The patron toast should be AFTER the animation guard, not before it
      // The toast is now wrapped in a ternary expression, so find the unique substring
      const toastPattern = 'count === 1';
      const toastIndex = afterAiExecTurn.indexOf(toastPattern);
      expect(toastIndex).toBeGreaterThan(-1);
      expect(toastIndex).toBeGreaterThan(aiGuardIndex);
    });

    it('should NOT call onRefreshAll before playCardAnimation in the AI animation block', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');

      const aiTurnIndex = source.indexOf('executeAiTurn(): void');
      const afterAiTurn = source.slice(aiTurnIndex);

      const aiAnimGuard = 'if (sourcePos && card && (action.type === \'purchase\' || action.type === \'reserve\'))';
      const aiGuardIndex = afterAiTurn.indexOf(aiAnimGuard);
      expect(aiGuardIndex).toBeGreaterThan(-1);

      const block = afterAiTurn.slice(aiGuardIndex);
      const animCallIndex = block.indexOf('this.animator.playCardAnimation(');
      expect(animCallIndex).toBeGreaterThan(-1);

      const beforeAnim = block.slice(0, animCallIndex);

      // The patron animation cache setup and pending refill setup should exist
      expect(beforeAnim).toContain('onSetPatronAnimationCache');

      // There should be NO onRefreshAll() between the guard and playCardAnimation
      const refreshCallsBeforeAnim = (beforeAnim.match(/this\.callbacks\.onRefreshAll\(\)/g) || []).length;
      expect(refreshCallsBeforeAnim).toBe(0);
    });

    it('should call onShowToast for patron visit in the animation block before playCardAnimation', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');

      const aiTurnIndex = source.indexOf('executeAiTurn(): void');
      const afterAiTurn = source.slice(aiTurnIndex);

      const aiAnimGuard = 'if (sourcePos && card && (action.type === \'purchase\' || action.type === \'reserve\'))';
      const aiGuardIndex = afterAiTurn.indexOf(aiAnimGuard);
      const block = afterAiTurn.slice(aiGuardIndex);
      const animCallIndex = block.indexOf('this.animator.playCardAnimation(');
      expect(animCallIndex).toBeGreaterThan(-1);

      const beforeAnim = block.slice(0, animCallIndex);

      // The patron toast should be in the pre-animation section
      // The toast is now wrapped in a ternary; look for the unique close bracket pattern
      expect(beforeAnim).toContain('onShowToast(');
      expect(beforeAnim).toContain('AI earns a patron visit! +3 influence');
    });
  });

  // ── Source structure invariants ─────────────────────────

  describe('source invariants', () => {
    it('should only have one onPlaySound(PATRON_VISIT) call in executeAction', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');

      // Count occurrences of PATRON_VISIT sound calls in the file
      const matches = source.match(/SFX_KEYS\.PATRON_VISIT/g) || [];
      expect(matches.length).toBe(1);
    });

    it('should have patron visit toast calls for both human and AI paths', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');

      expect(source).toContain('Patron visits you! +3 influence');
      expect(source).toContain('AI earns a patron visit! +3 influence');
      expect(source).toContain('patrons visit you! +3 influence each');
      expect(source).toContain('AI earns ');
      expect(source).toContain('patron visits! +3 influence each');
    });

    it('should still have patron animation cache setup in executeAction animation block', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');
      // The patron cache infrastructure should remain intact
      expect(source).toContain('onSetPatronAnimationCache(firstPatron, patronSourceIndex)');
    });

    it('should still have pending refill slot setup in executeAction animation block', () => {
      const source = readFileSync(SOURCE_PATH, 'utf-8');
      // The pending refill infrastructure should remain intact
      expect(source).toContain('onSetPendingRefillSlots([marketSlot])');
    });
  });
});
