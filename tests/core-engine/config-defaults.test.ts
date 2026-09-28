import { describe, it, expect } from 'vitest';
import {
  applyDefaults,
  DEFAULT_MOVE_SFX_INTERVAL_MS,
  type OptionDefaults,
} from '../../src/core-engine/index';

interface SampleOptions {
  /** Required runtime value — must be supplied by the caller. */
  required: number;
  /** Optional, defaultable. */
  duration?: number;
  /** Optional, defaultable. */
  ease?: string;
  /** Optional, intentionally not defaulted. */
  passthrough?: string;
}

const REQUIRED = 42;

/** Typed options, as production call sites pass them. */
function makeOptions(overrides: Partial<SampleOptions> = {}): SampleOptions {
  return { required: REQUIRED, ...overrides };
}

describe('applyDefaults', () => {
  it('applies every default when options is undefined', () => {
    const resolved = applyDefaults<
      SampleOptions,
      { duration: number; ease: string }
    >(undefined, { duration: 350, ease: 'Back.easeOut' });

    expect(resolved.duration).toBe(350);
    expect(resolved.ease).toBe('Back.easeOut');
  });

  it('applies every default when options is an empty object', () => {
    const resolved = applyDefaults(makeOptions(), {
      duration: 350,
      ease: 'Back.easeOut',
    });

    expect(resolved.duration).toBe(350);
    expect(resolved.ease).toBe('Back.easeOut');
    expect(resolved.required).toBe(REQUIRED);
  });

  it('lets caller-supplied values win (partial merge)', () => {
    const resolved = applyDefaults(makeOptions({ duration: 999 }), {
      duration: 350,
      ease: 'Back.easeOut',
    });

    expect(resolved.duration).toBe(999);
    expect(resolved.ease).toBe('Back.easeOut');
  });

  it('treats an explicit undefined option as absent (matches ?? semantics)', () => {
    const resolved = applyDefaults(makeOptions({ duration: undefined }), {
      duration: 350,
    });

    expect(resolved.duration).toBe(350);
  });

  it('preserves caller keys that have no default', () => {
    const resolved = applyDefaults(makeOptions({ passthrough: 'keep-me' }), {
      duration: 350,
    });

    expect(resolved.passthrough).toBe('keep-me');
    expect(resolved.required).toBe(REQUIRED);
  });

  it('does not mutate options or defaults', () => {
    const options = makeOptions();
    const defaults = { duration: 350 };

    const resolved = applyDefaults(options, defaults);

    expect(options).toEqual({ required: REQUIRED });
    expect(defaults).toEqual({ duration: 350 });
    expect(resolved).not.toBe(options);
    expect(resolved).not.toBe(defaults);
  });

  it('accepts a named defaults constant validated by OptionDefaults', () => {
    const defaults = {
      duration: 350,
      ease: 'Back.easeOut',
    } satisfies OptionDefaults<SampleOptions>;

    const resolved = applyDefaults(makeOptions(), defaults);
    expect(resolved.duration).toBe(350);
    expect(resolved.ease).toBe('Back.easeOut');
  });

  it('exports the shared move-SFX interval default', () => {
    expect(DEFAULT_MOVE_SFX_INTERVAL_MS).toBe(120);
  });

  describe('type safety', () => {
    it('marks defaulted keys as non-undefined in the result', () => {
      const resolved = applyDefaults(makeOptions(), { duration: 350 });

      // Compile-time proof: `duration` is `number`, not `number | undefined`.
      const duration: number = resolved.duration;
      expect(duration).toBe(350);
    });

    it('keeps the declared value type of a nullable default', () => {
      interface NullableOptions {
        required: number;
        handler?: (() => void) | null;
      }
      const options: NullableOptions = { required: REQUIRED };

      const resolved = applyDefaults(options, { handler: null });

      // `handler` is `(() => void) | null`, not narrowed to `null`.
      const handler: (() => void) | null = resolved.handler;
      expect(handler).toBeNull();
    });

    it('rejects a default whose value type does not match the option', () => {
      const options = makeOptions();

      // @ts-expect-error - `duration` is a number option; a string is invalid.
      applyDefaults(options, { duration: 'fast' });
    });
  });
});
