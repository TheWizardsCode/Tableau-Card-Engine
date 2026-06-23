/**
 * ActiveEffect: Unit Tests
 *
 * Tests the ActiveEffect interface, factory, decay logic, and utility functions.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  type ActiveEffect,
  createActiveEffect,
  decayActiveEffects,
  applyActiveEffectMultiplier,
  hasActiveEffectOfType,
} from '../../src/core-engine/ActiveEffect';

describe('ActiveEffect', () => {
  describe('createActiveEffect', () => {
    it('creates an effect with the given properties', () => {
      const effect = createActiveEffect(
        'income-multiplier',
        0.8,
        5,
        'evt-flu-outbreak',
        'Flu outbreak: income reduced to 80%',
      );

      expect(effect.effectType).toBe('income-multiplier');
      expect(effect.multiplier).toBe(0.8);
      expect(effect.turnsRemaining).toBe(5);
      expect(effect.sourceEventId).toBe('evt-flu-outbreak');
      expect(effect.description).toBe('Flu outbreak: income reduced to 80%');
    });

    it('creates distinct effects that do not share references', () => {
      const effect1 = createActiveEffect('income-multiplier', 0.8, 5, 'evt-flu', 'desc');
      const effect2 = createActiveEffect('income-multiplier', 0.9, 3, 'evt-other', 'desc2');

      expect(effect1).not.toBe(effect2);
      expect(effect1.turnsRemaining).toBe(5);
      expect(effect2.turnsRemaining).toBe(3);
    });
  });

  describe('decayActiveEffects', () => {
    it('decrements turnsRemaining on all effects', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 3, 'evt-flu', 'Flu'),
        createActiveEffect('income-multiplier', 0.9, 1, 'evt-other', 'Other'),
      ];

      const result = decayActiveEffects(effects);

      // Decremented
      expect(result.effects[0].turnsRemaining).toBe(2);
      expect(result.effects[1].turnsRemaining).toBe(0);
    });

    it('returns expired effects (turnsRemaining <= 0 after decay)', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 1, 'evt-flu', 'Flu'),
        createActiveEffect('income-multiplier', 0.9, 3, 'evt-other', 'Other'),
      ];

      const result = decayActiveEffects(effects);

      // First effect should be expired (1 -> 0), second should still be active
      expect(result.expired).toHaveLength(1);
      expect(result.expired[0].sourceEventId).toBe('evt-flu');
      expect(result.active).toHaveLength(1);
      expect(result.active[0].sourceEventId).toBe('evt-other');
      expect(result.active[0].turnsRemaining).toBe(2);
    });

    it('removes expired effects from the active array', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 1, 'evt-flu', 'Flu'),
      ];

      const result = decayActiveEffects(effects);

      expect(result.active).toHaveLength(0);
      expect(result.expired).toHaveLength(1);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0]).toBe(result.expired[0]);
    });

    it('handles an empty effects array', () => {
      const result = decayActiveEffects([]);

      expect(result.active).toHaveLength(0);
      expect(result.expired).toHaveLength(0);
      expect(result.effects).toHaveLength(0);
    });

    it('handles effects that start with turnsRemaining of 0', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 0, 'evt-flu', 'Flu'),
      ];

      const result = decayActiveEffects(effects);

      expect(result.active).toHaveLength(0);
      expect(result.expired).toHaveLength(1);
      expect(result.expired[0].turnsRemaining).toBe(-1);
    });
  });

  describe('applyActiveEffectMultiplier', () => {
    it('applies a single multiplier effect', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 5, 'evt-flu', 'Flu'),
      ];

      const result = applyActiveEffectMultiplier(effects, 'income-multiplier', 100);

      expect(result).toBe(80); // 100 * 0.8
    });

    it('composes multiple effects of the same type (0.8 × 0.8 = 0.64)', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 5, 'evt-flu-1', 'Flu'),
        createActiveEffect('income-multiplier', 0.8, 3, 'evt-flu-2', 'Second flu'),
      ];

      const result = applyActiveEffectMultiplier(effects, 'income-multiplier', 100);

      expect(result).toBe(64); // 100 * 0.8 * 0.8
    });

    it('does not apply effects of a different type', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 5, 'evt-flu', 'Flu'),
        createActiveEffect('rep-multiplier', 0.5, 3, 'evt-other', 'Other'),
      ];

      const result = applyActiveEffectMultiplier(effects, 'income-multiplier', 100);

      expect(result).toBe(80); // Only income-multiplier applied
    });

    it('returns the base value when no matching effects exist', () => {
      const result = applyActiveEffectMultiplier([], 'income-multiplier', 100);

      expect(result).toBe(100);
    });

    it('rounds to nearest integer', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 5, 'evt-flu', 'Flu'),
      ];

      const result = applyActiveEffectMultiplier(effects, 'income-multiplier', 3);

      expect(result).toBe(2); // 3 * 0.8 = 2.4 -> 2
    });

    it('handles base value of 0', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 5, 'evt-flu', 'Flu'),
      ];

      const result = applyActiveEffectMultiplier(effects, 'income-multiplier', 0);

      expect(result).toBe(0);
    });
  });

  describe('hasActiveEffectOfType', () => {
    it('returns true when an effect of the given type exists', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 5, 'evt-flu', 'Flu'),
      ];

      expect(hasActiveEffectOfType(effects, 'income-multiplier')).toBe(true);
    });

    it('returns false when no effect of the given type exists', () => {
      const effects: ActiveEffect[] = [
        createActiveEffect('income-multiplier', 0.8, 5, 'evt-flu', 'Flu'),
      ];

      expect(hasActiveEffectOfType(effects, 'rep-multiplier')).toBe(false);
    });

    it('returns false for an empty effects array', () => {
      expect(hasActiveEffectOfType([], 'income-multiplier')).toBe(false);
    });
  });

  describe('full lifecycle', () => {
    it('creation → decay → expiration', () => {
      // Create an effect with 2 turns remaining
      const effect = createActiveEffect('income-multiplier', 0.8, 2, 'evt-flu', 'Flu');

      // Turn 1 decay
      let result = decayActiveEffects([effect]);
      expect(result.active[0].turnsRemaining).toBe(1);
      expect(result.expired).toHaveLength(0);

      // Turn 2 decay - should expire now
      result = decayActiveEffects(result.active);
      expect(result.expired).toHaveLength(1);
      expect(result.expired[0].sourceEventId).toBe('evt-flu');
      expect(result.expired[0].turnsRemaining).toBe(0);
      expect(result.active).toHaveLength(0);
    });

    it('income is affected during active turns and returns to normal after expiry', () => {
      const income = 100;

      // Create effect with 3 turns remaining
      const effect = createActiveEffect('income-multiplier', 0.8, 3, 'evt-flu', 'Flu');

      // During active effect: income reduced
      const reducedIncome = applyActiveEffectMultiplier([effect], 'income-multiplier', income);
      expect(reducedIncome).toBe(80);

      // Decay turn 1: 3 -> 2, still active
      let r1 = decayActiveEffects([effect]);
      expect(r1.active).toHaveLength(1);
      expect(r1.expired).toHaveLength(0);
      expect(applyActiveEffectMultiplier(r1.active, 'income-multiplier', income)).toBe(80);

      // Decay turn 2: 2 -> 1, still active
      let r2 = decayActiveEffects(r1.active);
      expect(r2.active).toHaveLength(1);
      expect(r2.expired).toHaveLength(0);
      expect(applyActiveEffectMultiplier(r2.active, 'income-multiplier', income)).toBe(80);

      // Decay turn 3: 1 -> 0, expires
      let r3 = decayActiveEffects(r2.active);
      expect(r3.active).toHaveLength(0);
      expect(r3.expired).toHaveLength(1);
      expect(r3.expired[0].sourceEventId).toBe('evt-flu');

      // After expiry: income returns to normal (no active effects)
      const finalIncome = applyActiveEffectMultiplier(r3.active, 'income-multiplier', income);
      expect(finalIncome).toBe(100);
    });
  });
});
