/**
 * Unit tests for the replay adapter pattern: ReplayAdapter implementations
 * and AdapterRegistry.
 *
 * Tests adapter detection (`canHandle`), validation, transcript introspection,
 * registry resolution, and edge cases for both GolfReplayAdapter and
 * BeleagueredCastleReplayAdapter.
 *
 * These are pure unit tests (no Playwright, no subprocess) and run fast.
 *
 * See CG-0MLTFUL061DWDGA2.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { adapterRegistry } from '../../scripts/adapters/AdapterRegistry';
import {
  createFakeAdapter,
  makeTranscriptFor,
  makeUnknownTranscript,
} from '../helpers/FakeReplayAdapter';

// ── Fixtures ────────────────────────────────────────────────



// ── AdapterRegistry Tests ───────────────────────────────────
//
// The registry is core-owned framework, so these tests use local adapter
// doubles — the real per-game adapters now live with their games.

describe('AdapterRegistry', () => {
  beforeEach(() => {
    adapterRegistry.clear();
  });

  afterEach(() => {
    adapterRegistry.clear();
  });

  describe('register', () => {
    it('registers an adapter', () => {
      adapterRegistry.register(createFakeAdapter('fake-a'));
      expect(adapterRegistry.getRegisteredTypes()).toContain('fake-a');
    });

    it('throws on duplicate gameType', () => {
      adapterRegistry.register(createFakeAdapter('fake-a'));
      expect(() => adapterRegistry.register(createFakeAdapter('fake-a'))).toThrow(
        'already registered',
      );
    });

    it('preserves registration order (priority)', () => {
      adapterRegistry.register(createFakeAdapter('first'));
      adapterRegistry.register(createFakeAdapter('second'));
      expect(adapterRegistry.getRegisteredTypes()).toEqual(['first', 'second']);
    });
  });

  describe('getByType', () => {
    it('returns the adapter for a known type', () => {
      adapterRegistry.register(createFakeAdapter('fake-a'));
      expect(adapterRegistry.getByType('fake-a')?.gameType).toBe('fake-a');
    });

    it('returns undefined for an unknown type', () => {
      expect(adapterRegistry.getByType('nonexistent')).toBeUndefined();
    });
  });

  describe('detect', () => {
    it('detects a matching transcript', () => {
      adapterRegistry.register(createFakeAdapter('fake-a'));
      expect(adapterRegistry.detect(makeTranscriptFor('fake-a'))?.gameType).toBe('fake-a');
    });

    it('returns undefined when no adapter matches', () => {
      adapterRegistry.register(createFakeAdapter('fake-a'));
      expect(adapterRegistry.detect(makeUnknownTranscript())).toBeUndefined();
    });

    it('returns the first matching adapter in registration order', () => {
      adapterRegistry.register(createFakeAdapter('first'));
      adapterRegistry.register(createFakeAdapter('second'));
      const detected = adapterRegistry.detect(makeTranscriptFor('second'));
      expect(detected?.gameType).toBe('second');
    });
  });

  describe('resolve', () => {
    beforeEach(() => {
      adapterRegistry.register(createFakeAdapter('fake-a'));
      adapterRegistry.register(createFakeAdapter('fake-b'));
    });

    it('auto-detects from transcript shape', () => {
      expect(adapterRegistry.resolve(makeTranscriptFor('fake-b')).gameType).toBe('fake-b');
    });

    it('uses an explicit override when provided', () => {
      expect(adapterRegistry.resolve(makeTranscriptFor('fake-a'), 'fake-b').gameType).toBe(
        'fake-b',
      );
    });

    it('throws for an unknown explicit game type, naming it', () => {
      expect(() => adapterRegistry.resolve(makeTranscriptFor('fake-a'), 'nope')).toThrow(
        'Unknown game type',
      );
      expect(() => adapterRegistry.resolve(makeTranscriptFor('fake-a'), 'nope')).toThrow('nope');
    });

    it('throws when no adapter matches auto-detection', () => {
      expect(() => adapterRegistry.resolve(makeUnknownTranscript())).toThrow(
        'Could not auto-detect',
      );
    });

    it('lists registered types in the auto-detect error message', () => {
      let message = '';
      try {
        adapterRegistry.resolve(makeUnknownTranscript());
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain('fake-a');
      expect(message).toContain('fake-b');
    });
  });
});
