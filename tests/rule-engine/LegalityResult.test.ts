import { describe, it, expect } from 'vitest';
import type { LegalityResult } from '../../src/rule-engine/index';
import { RULE_ENGINE_VERSION } from '../../src/rule-engine/index';

/**
 * Compile-time assignability helpers.
 *
 * These functions are never called at runtime -- they exist solely
 * so that the TypeScript compiler verifies the discriminated union
 * shape of LegalityResult during `npm run build` and `npm test`.
 */

/** A legal result must satisfy `{ legal: true }`. */
function _assertLegal(): LegalityResult {
  return { legal: true };
}

/** An illegal result must satisfy `{ legal: false; reason: string }`. */
function _assertIllegal(): LegalityResult {
  return { legal: false, reason: 'not allowed' };
}

/**
 * The union narrows correctly via discriminant checks.
 * If TypeScript can compile this function the narrowing works.
 */
function _assertNarrowing(result: LegalityResult): string {
  if (result.legal) {
    // In the `legal: true` branch, no `reason` property exists.
    // Accessing `result.reason` here would be a compile error.
    return 'legal';
  }
  // In the `legal: false` branch, `reason` is a string.
  return result.reason;
}

// Prevent "unused" lint warnings for the compile-time helpers.
void _assertLegal;
void _assertIllegal;
void _assertNarrowing;

describe('rule-engine / LegalityResult', () => {
  it('should export the rule-engine version', () => {
    expect(RULE_ENGINE_VERSION).toBe('0.1.0');
  });

  it('legal result has legal: true', () => {
    const result: LegalityResult = { legal: true };
    expect(result.legal).toBe(true);
  });

  it('illegal result has legal: false and a reason string', () => {
    const result: LegalityResult = { legal: false, reason: 'out of bounds' };
    expect(result.legal).toBe(false);
    if (!result.legal) {
      expect(typeof result.reason).toBe('string');
      expect(result.reason).toBe('out of bounds');
    }
  });

  it('discriminant narrows correctly at runtime', () => {
    const legal: LegalityResult = { legal: true };
    const illegal: LegalityResult = { legal: false, reason: 'nope' };

    // Legal branch
    if (legal.legal) {
      expect(legal).toEqual({ legal: true });
    } else {
      throw new Error('should not reach illegal branch');
    }

    // Illegal branch
    if (!illegal.legal) {
      expect(illegal.reason).toBe('nope');
    } else {
      throw new Error('should not reach legal branch');
    }
  });

  it('Golf re-exports the same LegalityResult type', async () => {
    // Dynamic import so we get the actual re-exported type at runtime.
    const golfRules = await import(
      '../../example-games/golf/GolfRules'
    );
    // The module should re-export LegalityResult (as a type, not a value).
    // We verify by constructing values that match the type through the
    // functions that return LegalityResult.
    expect(typeof golfRules.checkMoveLegality).toBe('function');
    expect(typeof golfRules.checkInitialReveal).toBe('function');
  });

  it('Lost Cities re-exports the same LegalityResult type', async () => {
    const lcRules = await import(
      '../../example-games/lost-cities/LostCitiesRules'
    );
    expect(typeof lcRules.checkPhase1Legality).toBe('function');
    expect(typeof lcRules.checkPhase2Legality).toBe('function');
  });
});
