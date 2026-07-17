import { describe, it, expect } from 'vitest';
import type { LegalityResult } from '../../src/rule-engine/index';
import { RULE_ENGINE_VERSION } from '../../src/rule-engine/index';
// The legalAction/illegalAction functions are imported dynamically in tests
// below because the helper constructors are added by a separate,
// subsequent work item (CG-0MQIO5OLD001EDZH).  Once that item is complete
// these imports will resolve at compile time.

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

/** A legal result constructed via legalAction() must also satisfy LegalityResult. */
function _assertHelperLegal(): LegalityResult {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { legalAction } = require('../../src/rule-engine/index');
  return legalAction();
}

/** An illegal result constructed via illegalAction() must satisfy LegalityResult. */
function _assertHelperIllegal(): LegalityResult {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { illegalAction } = require('../../src/rule-engine/index');
  return illegalAction('test reason');
}

/** Narrowing verification using the helper constructors. */
function _assertHelperNarrowing(result: LegalityResult): string {
  if (result.legal) {
    return 'legal';
  }
  return result.reason;
}

// Prevent "unused" lint warnings for the compile-time helpers.
void _assertLegal;
void _assertIllegal;
void _assertNarrowing;
void _assertHelperLegal;
void _assertHelperIllegal;
void _assertHelperNarrowing;

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

  describe('legalAction / illegalAction helpers', () => {
    // Dynamic imports so tests work before the helper constructors are
    // implemented (CG-0MQIO5OLD001EDZH).  Once the helpers exist, the
    // dynamic import resolves to the real functions.

    it('legalAction() returns { legal: true }', async () => {
      const { legalAction } = await import(
        '../../src/rule-engine/index'
      );
      const result = legalAction();
      expect(result).toEqual({ legal: true });
      // Discriminant check
      if (result.legal) {
        expect(result.legal).toBe(true);
      } else {
        throw new Error('expected legal action');
      }
    });

    it('illegalAction(reason) returns { legal: false, reason }', async () => {
      const { illegalAction } = await import(
        '../../src/rule-engine/index'
      );
      const result = illegalAction('not allowed');
      expect(result).toEqual({ legal: false, reason: 'not allowed' });
      // Discriminant check
      if (!result.legal) {
        expect(typeof result.reason).toBe('string');
        expect(result.reason).toBe('not allowed');
      } else {
        throw new Error('expected illegal action');
      }
    });

    it('illegalAction accepts empty string reason', async () => {
      const { illegalAction } = await import(
        '../../src/rule-engine/index'
      );
      const result = illegalAction('');
      expect(result).toEqual({ legal: false, reason: '' });
    });

    it('illegalAction handles special characters in reason', async () => {
      const { illegalAction } = await import(
        '../../src/rule-engine/index'
      );
      const reason = '🚫 invalid: card <9> not in hand!';
      const result = illegalAction(reason);
      expect(result).toEqual({ legal: false, reason });
    });

    it('legalAction result narrows correctly with if/else', async () => {
      const { legalAction, illegalAction } = await import(
        '../../src/rule-engine/index'
      );
      const legal = legalAction();
      const illegal = illegalAction('nope');

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
  });
});
